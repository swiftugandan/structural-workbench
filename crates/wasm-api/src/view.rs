use serde_json::{Value, json};
use std::collections::BTreeMap;
use workbench_model::{Project, Result, err};
type Point = [f64; 3];
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
pub struct Index {
    pub key: String,
    nodes: Vec<(String, Point)>,
    members: Vec<(String, String, String, Point, Point)>,
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
        Ok(Self {
            key,
            nodes,
            members,
            tree,
            boxes,
            crossings: None,
        })
    }
    pub fn pick(&self, q: &Value) -> Result<Value> {
        let point: [f64; 2] = serde_json::from_value(q["point"].clone())
            .map_err(|_| err("INVALID_SCHEMA", "Screen point"))?;
        if point.iter().any(|x| !x.is_finite()) {
            return Err(err("INVALID_SCHEMA", "Invalid screen point"));
        }
        let tolerance = 8.;
        let mut hits = vec![];
        for (id, p) in &self.nodes {
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
        hits.sort_by(|a, b| {
            a.0.cmp(&b.0)
                .then_with(|| a.1.total_cmp(&b.1))
                .then_with(|| a.2.total_cmp(&b.2))
                .then_with(|| a.3.cmp(b.3))
        });
        Ok(
            json!({"entityId":hits.first().map(|x|x.3),"kind":hits.first().map(|x|if x.0==0 {"node"} else {"member"})}),
        )
    }
    pub fn select(&self, q: &Value) -> Result<Value> {
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
            .filter(|(_, p)| contains(*p))
            .map(|(id, _)| id)
            .collect();
        ids.extend(
            self.members
                .iter()
                .filter(|m| contains(m.3) && contains(m.4))
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
            let mut found = vec![];
            self.tree.query(&self.boxes[i], &mut found);
            for j in found {
                if j <= i || !self.boxes[i].overlaps(&self.boxes[j]) {
                    continue;
                }
                let n = &self.members[j];
                let (a, b, c, d) = (m.3, m.4, n.3, n.4);
                let u = [b[0] - a[0], b[1] - a[1]];
                let v = [d[0] - c[0], d[1] - c[1]];
                let w = [c[0] - a[0], c[1] - a[1]];
                let cross = |a: [f64; 2], b: [f64; 2]| a[0] * b[1] - a[1] * b[0];
                let den = cross(u, v);
                if den.abs() < 1e-10 {
                    continue;
                }
                let t = cross(w, v) / den;
                let s = cross(w, u) / den;
                if !(0. ..=1.).contains(&t) || !(0. ..=1.).contains(&s) {
                    continue;
                }
                let endpoints = |t: f64, start: &String, end: &String| {
                    if t.abs() < 1e-8 {
                        Some(start.clone())
                    } else if (t - 1.).abs() < 1e-8 {
                        Some(end.clone())
                    } else {
                        None
                    }
                };
                if let (Some(a), Some(b)) = (endpoints(t, &m.1, &m.2), endpoints(s, &n.1, &n.2)) {
                    if a == b {
                        continue;
                    }
                }
                crossings.push(json!({"point":[a[0]+t*u[0],a[1]+t*u[1]],"memberIds":[m.0,n.0],"depthSeparation":(a[2]+t*(b[2]-a[2])-c[2]-s*(d[2]-c[2])).abs()}));
            }
        }
        let value = json!({"crossings":crossings});
        self.crossings = Some(value.clone());
        value
    }
}
