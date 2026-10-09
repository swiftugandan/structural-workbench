use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

pub fn excluded_ids(q: &Value) -> Result<BTreeSet<String>> {
    match q.get("excludedIds") {
        None => Ok(BTreeSet::new()),
        Some(value) => serde_json::from_value(value.clone()).map_err(|_| {
            err(
                "INVALID_SCHEMA",
                "excludedIds must be an array of entity IDs",
            )
        }),
    }
}
use workbench_model::{Project, Result, err};
type Point = [f64; 3];
/// A projected slab outline and its opening.
type Rings = ([Point; 4], Option<[Point; 4]>);
#[derive(Clone)]
struct Box2 {
    lo: [f64; 2],
    hi: [f64; 2],
}
impl Box2 {
    fn segment(a: Point, b: Point) -> Self {
        Self {
            lo: [a[0].min(b[0]), a[1].min(b[1])],
            hi: [a[0].max(b[0]), a[1].max(b[1])],
        }
    }
    fn overlaps(&self, other: &Self) -> bool {
        (0..2).all(|i| self.lo[i] <= other.hi[i] && other.lo[i] <= self.hi[i])
    }
}
struct Tree {
    bounds: Box2,
    items: Vec<usize>,
    children: Option<Box<[Tree; 2]>>,
}
impl Tree {
    fn build(boxes: &[Box2], mut items: Vec<usize>) -> Self {
        let bounds = Box2 {
            lo: std::array::from_fn(|i| {
                items
                    .iter()
                    .map(|j| boxes[*j].lo[i])
                    .fold(f64::INFINITY, f64::min)
            }),
            hi: std::array::from_fn(|i| {
                items
                    .iter()
                    .map(|j| boxes[*j].hi[i])
                    .fold(f64::NEG_INFINITY, f64::max)
            }),
        };
        if items.len() <= 8 {
            return Self {
                bounds,
                items,
                children: None,
            };
        }
        let axis = usize::from(bounds.hi[1] - bounds.lo[1] > bounds.hi[0] - bounds.lo[0]);
        items.sort_unstable_by(|a, b| {
            (boxes[*a].lo[axis] + boxes[*a].hi[axis])
                .total_cmp(&(boxes[*b].lo[axis] + boxes[*b].hi[axis]))
        });
        let other = items.split_off(items.len() / 2);
        Self {
            bounds,
            items: vec![],
            children: Some(Box::new([
                Self::build(boxes, items),
                Self::build(boxes, other),
            ])),
        }
    }
    fn query(&self, box2: &Box2, found: &mut Vec<usize>) {
        if !self.bounds.overlaps(box2) {
            return;
        }
        if let Some(children) = &self.children {
            for child in children.iter() {
                child.query(box2, found);
            }
        } else {
            found.extend(&self.items);
        }
    }
}
/// Depth at a screen point inside a projected rectangle, or None outside it.
/// A parallel projection maps the rectangle c0 c1 c2 c3 to a parallelogram,
/// so the point is c0 + u (c1 − c0) + v (c3 − c0) with 0 ≤ u, v ≤ 1.
fn parallelogram_depth(c: &[Point; 4], point: [f64; 2]) -> Option<f64> {
    let (a, b) = (
        [c[1][0] - c[0][0], c[1][1] - c[0][1]],
        [c[3][0] - c[0][0], c[3][1] - c[0][1]],
    );
    let det = a[0] * b[1] - a[1] * b[0];
    // Edge-on: the panel has no area on screen.
    if det.abs() <= 1e-9 * (a[0].hypot(a[1]) * b[0].hypot(b[1])).max(1e-300) {
        return None;
    }
    let (px, py) = (point[0] - c[0][0], point[1] - c[0][1]);
    let u = (px * b[1] - py * b[0]) / det;
    let v = (a[0] * py - a[1] * px) / det;
    ((0.0..=1.0).contains(&u) && (0.0..=1.0).contains(&v))
        .then(|| c[0][2] + u * (c[1][2] - c[0][2]) + v * (c[3][2] - c[0][2]))
}
pub struct Index {
    pub key: String,
    nodes: Vec<(String, Point)>,
    members: Vec<(String, String, String, Point, Point)>,
    world_members: Vec<(Point, Point)>,
    /// Placed slab panels, projected: id, then (outline, opening) at the
    /// support level (analytical) and at the drawn soffit and top (physical).
    slabs: Vec<(String, Rings, [Rings; 2])>,
    intersection_tolerance: f64,
    screen_tolerance: f64,
    tree: Tree,
    boxes: Vec<Box2>,
    crossings: Option<Value>,
}
impl Index {
    pub fn new(p: &Project, c: &Value, key: String) -> Result<Self> {
        let origin: Point = serde_json::from_value(c["origin"].clone())
            .map_err(|_| err("INVALID_SCHEMA", "Camera origin"))?;
        let basis: [Point; 3] = serde_json::from_value(c["basis"].clone())
            .map_err(|_| err("INVALID_SCHEMA", "Camera basis"))?;
        let center: [f64; 2] = serde_json::from_value(c["center"].clone())
            .map_err(|_| err("INVALID_SCHEMA", "Camera center"))?;
        let factor = c["factor"]
            .as_f64()
            .filter(|x| x.is_finite() && *x > 0.)
            .ok_or_else(|| err("INVALID_SCHEMA", "Camera scale"))?;
        if origin
            .iter()
            .chain(basis.iter().flatten())
            .chain(center.iter())
            .any(|x| !x.is_finite())
        {
            return Err(err("INVALID_SCHEMA", "Nonfinite camera"));
        }
        let project = |p: Point| {
            let d = std::array::from_fn(|i| p[i] - origin[i]);
            [
                center[0] + workbench_geometry::dot(d, basis[0]) * factor,
                center[1] - workbench_geometry::dot(d, basis[1]) * factor,
                workbench_geometry::dot(d, basis[2]),
            ]
        };
        let world_positions: BTreeMap<_, _> = p
            .nodes
            .iter()
            .map(|n| (n.id.as_str(), n.position))
            .collect();
        let world_members = p
            .members
            .iter()
            .map(|m| {
                (
                    world_positions[m.start.as_str()],
                    world_positions[m.end.as_str()],
                )
            })
            .collect();
        let positions: BTreeMap<_, _> = p
            .nodes
            .iter()
            .map(|n| (n.id.as_str(), project(n.position)))
            .collect();
        let nodes = p
            .nodes
            .iter()
            .map(|n| (n.id.clone(), positions[n.id.as_str()]))
            .collect();
        let members: Vec<_> = p
            .members
            .iter()
            .map(|m| {
                (
                    m.id.clone(),
                    m.start.clone(),
                    m.end.clone(),
                    positions[m.start.as_str()],
                    positions[m.end.as_str()],
                )
            })
            .collect();
        let boxes: Vec<_> = members.iter().map(|m| Box2::segment(m.3, m.4)).collect();
        let tree = Tree::build(&boxes, (0..boxes.len()).collect());
        let slabs = p
            .design_previews
            .iter()
            .filter_map(|d| {
                let panel = d.slab_panel()?;
                let (outline, opening) = panel.world_corners()?;
                let soffit = crate::slab_view::bearing(p, &panel)?.soffit;
                let at = |z: f64| -> Rings {
                    let lift = |q: Point| project([q[0], q[1], z]);
                    (outline.map(lift), opening.map(|o| o.map(lift)))
                };
                Some((
                    d.id.clone(),
                    at(outline[0][2]),
                    [at(soffit), at(soffit + panel.thickness)],
                ))
            })
            .collect();
        Ok(Self {
            key,
            nodes,
            members,
            world_members,
            slabs,
            intersection_tolerance: p.analysis_settings.merge_tolerance,
            screen_tolerance: p.analysis_settings.merge_tolerance * factor,
            tree,
            boxes,
            crossings: None,
        })
    }
    pub fn pick(&self, q: &Value) -> Result<Value> {
        let excluded = excluded_ids(q)?;
        let point: [f64; 2] = serde_json::from_value(q["point"].clone())
            .map_err(|_| err("INVALID_SCHEMA", "Screen point"))?;
        if point.iter().any(|x| !x.is_finite()) {
            return Err(err("INVALID_SCHEMA", "Invalid screen point"));
        }
        let tolerance = 8.;
        let mut hits = vec![];
        for (id, p) in &self.nodes {
            if excluded.contains(id) {
                continue;
            }
            let d = (p[0] - point[0]).hypot(p[1] - point[1]);
            if d <= tolerance {
                hits.push((0, p[2], d, id));
            }
        }
        let mut found = vec![];
        self.tree.query(
            &Box2 {
                lo: point.map(|x| x - tolerance),
                hi: point.map(|x| x + tolerance),
            },
            &mut found,
        );
        for i in found {
            let (id, _, _, a, b) = &self.members[i];
            if excluded.contains(id) {
                continue;
            }
            let dx = b[0] - a[0];
            let dy = b[1] - a[1];
            let l = dx * dx + dy * dy;
            let t = if l > 0. {
                (((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / l).clamp(0., 1.)
            } else {
                0.
            };
            let d = (a[0] + t * dx - point[0]).hypot(a[1] + t * dy - point[1]);
            if d <= tolerance {
                hits.push((1, a[2] + t * (b[2] - a[2]), d, id));
            }
        }
        // Surfaces are opt-in and lose to every node and member (ADR 0035):
        // "analytical" tests the support plane, "physical" the drawn faces.
        let physical = match &q["surfaces"] {
            Value::Null => None,
            Value::String(m) if m == "analytical" => Some(false),
            Value::String(m) if m == "physical" => Some(true),
            _ => {
                return Err(err(
                    "INVALID_SCHEMA",
                    "surfaces must be \"analytical\" or \"physical\"",
                ));
            }
        };
        if let Some(physical) = physical {
            for (id, analytical, faces) in &self.slabs {
                if excluded.contains(id) {
                    continue;
                }
                let tested = if physical {
                    &faces[..]
                } else {
                    std::slice::from_ref(analytical)
                };
                let depth = tested
                    .iter()
                    .filter_map(|(outline, opening)| {
                        let depth = parallelogram_depth(outline, point)?;
                        (!opening.is_some_and(|o| parallelogram_depth(&o, point).is_some()))
                            .then_some(depth)
                    })
                    .min_by(f64::total_cmp);
                if let Some(depth) = depth {
                    hits.push((2, depth, 0., id));
                }
            }
        }
        hits.sort_by(|a, b| {
            a.0.cmp(&b.0)
                .then_with(|| a.1.total_cmp(&b.1))
                .then_with(|| a.2.total_cmp(&b.2))
                .then_with(|| a.3.cmp(b.3))
        });
        Ok(
            json!({"entityId":hits.first().map(|x|x.3),"kind":hits.first().map(|x|match x.0 {0=>"node",1=>"member",_=>"designObject"})}),
        )
    }
    pub fn select(&self, q: &Value) -> Result<Value> {
        let excluded = excluded_ids(q)?;
        let rect: [f64; 4] = serde_json::from_value(q["rect"].clone())
            .map_err(|_| err("INVALID_SCHEMA", "Selection rectangle"))?;
        if rect.iter().any(|x| !x.is_finite()) {
            return Err(err("INVALID_SCHEMA", "Invalid selection rectangle"));
        }
        let contains = |p: Point| {
            p[0] >= rect[0].min(rect[2])
                && p[0] <= rect[0].max(rect[2])
                && p[1] >= rect[1].min(rect[3])
                && p[1] <= rect[1].max(rect[3])
        };
        let mut ids: Vec<_> = self
            .nodes
            .iter()
            .filter(|(id, p)| !excluded.contains(id) && contains(*p))
            .map(|(id, _)| id)
            .collect();
        ids.extend(
            self.members
                .iter()
                .filter(|m| !excluded.contains(&m.0) && contains(m.3) && contains(m.4))
                .map(|m| &m.0),
        );
        ids.sort();
        Ok(json!({"entityIds":ids}))
    }
    pub fn crossings(&mut self) -> Value {
        if let Some(v) = &self.crossings {
            return v.clone();
        }
        let mut crossings = vec![];
        for (i, m) in self.members.iter().enumerate() {
            // Projection is only a broad-phase accelerator. Camera depth is not
            // evidence that two members intersect in engineering space.
            let area = Box2 {
                lo: self.boxes[i].lo.map(|x| x - self.screen_tolerance),
                hi: self.boxes[i].hi.map(|x| x + self.screen_tolerance),
            };
            let mut found = vec![];
            self.tree.query(&area, &mut found);
            for j in found {
                if j <= i || !area.overlaps(&self.boxes[j]) {
                    continue;
                }
                let n = &self.members[j];
                if m.1 == n.1 || m.1 == n.2 || m.2 == n.1 || m.2 == n.2 {
                    continue;
                }
                let (a, b) = self.world_members[i];
                let (c, d) = self.world_members[j];
                let Some((t, s, separation)) =
                    segment_intersection(a, b, c, d, self.intersection_tolerance)
                else {
                    continue;
                };
                let first: Point = std::array::from_fn(|k| m.3[k] + t * (m.4[k] - m.3[k]));
                let second: Point = std::array::from_fn(|k| n.3[k] + s * (n.4[k] - n.3[k]));
                crossings.push(json!({"point":[(first[0]+second[0])*0.5,(first[1]+second[1])*0.5],"memberIds":[m.0,n.0],"depthSeparation":(first[2]-second[2]).abs(),"separation":separation,"tolerance":self.intersection_tolerance}));
            }
        }
        let value = json!({"crossings":crossings});
        self.crossings = Some(value.clone());
        value
    }
}

/// Closest points of nonparallel lines, bounded to their finite segments.
/// Parallel/collinear overlap is outside this crossing diagnostic's scope.
fn segment_intersection(
    a: Point,
    b: Point,
    c: Point,
    d: Point,
    tolerance: f64,
) -> Option<(f64, f64, f64)> {
    use workbench_geometry::{cross, dot};
    let u = std::array::from_fn(|i| b[i] - a[i]);
    let v = std::array::from_fn(|i| d[i] - c[i]);
    let w = std::array::from_fn(|i| c[i] - a[i]);
    let normal = cross(u, v);
    let denominator = dot(normal, normal);
    let uu = dot(u, u);
    let vv = dot(v, v);
    if denominator <= 1e-24 * uu * vv {
        return None;
    }
    let t = dot(cross(w, v), normal) / denominator;
    let s = dot(cross(w, u), normal) / denominator;
    if !(-tolerance / uu.sqrt()..=1. + tolerance / uu.sqrt()).contains(&t)
        || !(-tolerance / vv.sqrt()..=1. + tolerance / vv.sqrt()).contains(&s)
    {
        return None;
    }
    let t = t.clamp(0., 1.);
    let s = s.clamp(0., 1.);
    let gap = std::array::from_fn(|i| a[i] + t * u[i] - c[i] - s * v[i]);
    let separation = dot(gap, gap).sqrt();
    (separation <= tolerance).then_some((t, s, separation))
}
