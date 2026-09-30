//! IFC4 structural analysis model reader (exchange-v1, ADR 0025,
//! `docs/formulations/exchange.md`). Interpretation is split in two: `plan`
//! reads the file and states every decision it needs; `build` applies the
//! answers and produces a project. Both are pure functions of the file.
use crate::guid;
use crate::review::*;
use crate::step::{Instance, Param, StepFile};
use crate::units::{Quantity, base_choices, si_name, si_power, si_prefix};
use std::collections::{BTreeMap, BTreeSet};
use workbench_model::{Diagnostic, Result, err};

pub const IDENTITY_PSET: &str = "Workbench_Identity";
pub const PROJECT_PSET: &str = "Workbench_Project";
pub const SECTION_PSET: &str = "Workbench_Section";
/// Coincidence tolerance for positions, in metres: the project merge
/// tolerance.
pub const TOL: f64 = 1e-6;

/// A raw number with the quantity it measures and, when the file states one
/// for this value, its own SI factor.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Q {
    pub v: f64,
    pub q: Quantity,
    pub factor: Option<f64>,
}

type V3 = [f64; 3];

#[derive(Clone, Copy, Debug)]
struct Frame {
    r: [V3; 3], // rows: x, y, z axes in world
    o: V3,
}

impl Frame {
    const IDENTITY: Frame = Frame {
        r: [[1., 0., 0.], [0., 1., 0.], [0., 0., 1.]],
        o: [0., 0., 0.],
    };
    /// World vector of a local vector.
    fn dir(&self, v: V3) -> V3 {
        std::array::from_fn(|i| (0..3).map(|k| self.r[k][i] * v[k]).sum())
    }
    fn point(&self, p: V3) -> V3 {
        let d = self.dir(p);
        std::array::from_fn(|i| d[i] + self.o[i])
    }
    fn then(&self, parent: &Frame) -> Frame {
        Frame {
            r: std::array::from_fn(|k| parent.dir(self.r[k])),
            o: parent.point(self.o),
        }
    }
    fn is_identity(&self) -> bool {
        let e = Frame::IDENTITY;
        (0..3).all(|i| {
            (0..3).all(|j| (self.r[i][j] - e.r[i][j]).abs() < 1e-12) && self.o[i].abs() < 1e-12
        })
    }
}

fn sub(a: V3, b: V3) -> V3 {
    std::array::from_fn(|i| a[i] - b[i])
}
fn dot(a: V3, b: V3) -> f64 {
    (0..3).map(|i| a[i] * b[i]).sum()
}
fn cross(a: V3, b: V3) -> V3 {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
fn norm(a: V3) -> f64 {
    dot(a, a).sqrt()
}
fn unit(a: V3) -> Option<V3> {
    let n = norm(a);
    (n.is_finite() && n > 1e-12).then(|| a.map(|x| x / n))
}
fn scale(a: V3, s: f64) -> V3 {
    a.map(|x| x * s)
}

/// One degree of freedom of a boundary condition as the file states it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Dof {
    Rigid,
    Free,
    Unset,
    /// A finite stiffness other than zero.
    Elastic(Q),
}

#[derive(Clone, Debug)]
pub struct Condition {
    pub step: u64,
    pub dofs: [Dof; 6],
}

#[derive(Clone, Debug)]
pub struct PointItem {
    pub step: u64,
    pub guid: String,
    pub name: String,
    pub identity: Option<String>,
    pub label: Option<String>,
    pub support_identity: Option<String>,
    pub support_label: Option<String>,
    /// Raw coordinates (length) in the item's placement, and that placement.
    pub coords: [Q; 3],
    frame: Frame,
    pub condition: Option<Condition>,
}

#[derive(Clone, Debug)]
pub struct EndCondition {
    pub rel: u64,
    pub connection: u64,
    pub condition: Option<Condition>,
}

#[derive(Clone, Debug)]
pub struct CurveItem {
    pub step: u64,
    pub guid: String,
    pub name: String,
    pub identity: Option<String>,
    pub label: Option<String>,
    pub parent: Option<(String, f64, f64)>,
    /// The authored local-y vector from the workbench identity set.
    pub local_y: Option<V3>,
    pub start: [Q; 3],
    pub end: [Q; 3],
    frame: Frame,
    pub axis: Option<V3>,
    pub material: Option<u64>,
    pub profile: Option<u64>,
    pub ends: Vec<EndCondition>,
}

#[derive(Clone, Debug)]
pub struct MaterialFound {
    pub step: u64,
    pub name: String,
    pub identity: Option<String>,
    pub label: Option<String>,
    pub e: Option<Q>,
    pub g: Option<Q>,
    pub nu: Option<f64>,
    pub density: Option<Q>,
}

#[derive(Clone, Debug)]
pub struct ProfileFound {
    pub step: u64,
    pub name: String,
    pub identity: Option<String>,
    pub label: Option<String>,
    pub provenance: Option<String>,
    pub area: Option<Q>,
    pub iy: Option<Q>,
    pub iz: Option<Q>,
    pub j: Option<Q>,
    pub wy: Option<Q>,
    pub wz: Option<Q>,
    pub cy: Option<Q>,
    pub cz: Option<Q>,
    /// A parametric shape the properties can be computed from.
    pub shape: Option<Shape>,
}

#[derive(Clone, Debug)]
pub enum Shape {
    /// XDim along local y, YDim along local z.
    Rectangle(Q, Q),
    Circle(Q),
    CircleHollow(Q, Q),
}

#[derive(Clone, Debug)]
pub enum ActionKind {
    /// Single force on a point connection (global directions).
    Nodal { connection: u64, values: [Q; 6] },
    /// Constant linear force on a member.
    Linear {
        member: u64,
        local: bool,
        projected: bool,
        values: [Q; 3],
    },
    /// Single force at a position on a member.
    Point {
        member: u64,
        local: bool,
        at: [Q; 3],
        frame_step: u64,
        values: [Q; 6],
    },
    /// Several single forces at distances along a member.
    Discrete {
        member: u64,
        local: bool,
        items: Vec<(Q, [Q; 6])>,
    },
}

#[derive(Clone, Debug)]
pub struct Action {
    pub step: u64,
    pub guid: String,
    pub name: String,
    pub identity: Option<String>,
    pub label: Option<String>,
    pub kind: ActionKind,
}

#[derive(Clone, Debug)]
pub struct CaseFound {
    pub step: u64,
    pub guid: String,
    pub name: String,
    pub identity: Option<String>,
    pub label: Option<String>,
    pub category: String,
    pub self_weight_identity: Option<String>,
    pub self_weight_label: Option<String>,
    /// (action step, factor from coefficients and grouping)
    pub actions: Vec<(u64, f64)>,
    pub self_weight: Option<V3>,
}

#[derive(Clone, Debug)]
pub struct CombinationFound {
    pub step: u64,
    pub guid: String,
    pub name: String,
    pub identity: Option<String>,
    pub label: Option<String>,
    pub purpose: String,
    pub terms: Vec<(u64, f64)>,
}

/// Everything read from the file, still in file units.
pub struct Plan {
    pub report: ReadReport,
    project_guid: String,
    project_name: String,
    project_identity: BTreeMap<String, String>,
    planar: bool,
    model_frame: Frame,
    assigned: BTreeMap<Quantity, f64>,
    points: Vec<PointItem>,
    curves: Vec<CurveItem>,
    materials: BTreeMap<u64, MaterialFound>,
    profiles: BTreeMap<u64, ProfileFound>,
    actions: BTreeMap<u64, Action>,
    cases: Vec<CaseFound>,
    combinations: Vec<CombinationFound>,
    frames: BTreeMap<u64, Frame>,
}

struct Reader<'a> {
    f: &'a StepFile,
    ledger: Ledger,
    blocking: Vec<Diagnostic>,
    used: BTreeSet<Quantity>,
    frames: BTreeMap<u64, Frame>,
}

fn block(code: &str, message: impl Into<String>, entities: Vec<String>) -> Diagnostic {
    with_entities(err(code, message), entities)
}

fn text(p: &Param) -> String {
    p.as_str().unwrap_or("").to_string()
}

impl<'a> Reader<'a> {
    fn q(&mut self, p: &Param, q: Quantity) -> Option<Q> {
        let v = p.as_f64()?;
        self.used.insert(q);
        Some(Q { v, q, factor: None })
    }
    fn coords(&mut self, point: &Param) -> Result<[Q; 3]> {
        let (_, pt) = self.f.deref(point, &["IFCCARTESIANPOINT"])?;
        let c = pt.get(0).as_list().unwrap_or(&[]);
        if !(2..=3).contains(&c.len()) {
            return Err(err(
                "INVALID_EXCHANGE_FILE",
                "A Cartesian point needs 2 or 3 coordinates",
            ));
        }
        let mut out = [Q {
            v: 0.,
            q: Quantity::Length,
            factor: None,
        }; 3];
        for (k, x) in c.iter().enumerate() {
            out[k] = self
                .q(x, Quantity::Length)
                .ok_or_else(|| err("INVALID_EXCHANGE_FILE", "Non-numeric coordinate"))?;
        }
        Ok(out)
    }
    fn direction(&self, p: &Param) -> Result<Option<V3>> {
        if p.is_null() {
            return Ok(None);
        }
        let (_, d) = self.f.deref(p, &["IFCDIRECTION"])?;
        let r: Vec<f64> = d
            .get(0)
            .as_list()
            .unwrap_or(&[])
            .iter()
            .filter_map(Param::as_f64)
            .collect();
        let v = match r.len() {
            2 => [r[0], r[1], 0.],
            3 => [r[0], r[1], r[2]],
            _ => {
                return Err(err(
                    "INVALID_EXCHANGE_FILE",
                    "A direction needs 2 or 3 ratios",
                ));
            }
        };
        unit(v)
            .map(Some)
            .ok_or_else(|| err("INVALID_EXCHANGE_FILE", "Zero-length direction"))
    }
    /// Axis placement: rotation is dimensionless; the location is a length
    /// that is scaled later, so it is returned raw.
    fn axis_placement(&mut self, p: &Param) -> Result<(Frame, [Q; 3])> {
        let (_, a) = self
            .f
            .deref(p, &["IFCAXIS2PLACEMENT3D", "IFCAXIS2PLACEMENT2D"])?;
        let a = a.clone();
        let loc = self.coords(a.get(0))?;
        let (z, xref) = if a.name == "IFCAXIS2PLACEMENT3D" {
            (
                self.direction(a.get(1))?.unwrap_or([0., 0., 1.]),
                self.direction(a.get(2))?,
            )
        } else {
            ([0., 0., 1.], self.direction(a.get(1))?)
        };
        let xref = xref.unwrap_or([1., 0., 0.]);
        let x = unit(sub(xref, scale(z, dot(xref, z)))).ok_or_else(|| {
            err(
                "INVALID_EXCHANGE_FILE",
                "Placement RefDirection is parallel to its Axis",
            )
        })?;
        Ok((
            Frame {
                r: [x, cross(z, x), z],
                o: [0.; 3],
            },
            loc,
        ))
    }
    /// The world frame of a placement, with its origin in raw length units.
    fn placement(&mut self, p: &Param, depth: usize) -> Result<Frame> {
        if p.is_null() {
            return Ok(Frame::IDENTITY);
        }
        let (id, inst) = self.f.deref(
            p,
            &[
                "IFCLOCALPLACEMENT",
                "IFCGRIDPLACEMENT",
                "IFCLINEARPLACEMENT",
            ],
        )?;
        if let Some(f) = self.frames.get(&id) {
            return Ok(*f);
        }
        if inst.name != "IFCLOCALPLACEMENT" {
            return Err(block(
                "UNSUPPORTED_FEATURE",
                format!("#{id}: only local placements are supported"),
                vec![format!("#{id}")],
            ));
        }
        if depth > 64 {
            return Err(err(
                "INVALID_EXCHANGE_FILE",
                "Placement chain too deep or cyclic",
            ));
        }
        let inst = inst.clone();
        let parent = self.placement(inst.get(0), depth + 1)?;
        let (mut local, loc) = self.axis_placement(inst.get(1))?;
        // Raw length units throughout; the SI factor applies to origins and
        // coordinates alike, so frames compose before scaling.
        local.o = [loc[0].v, loc[1].v, loc[2].v];
        let world = local.then(&parent);
        self.frames.insert(id, world);
        Ok(world)
    }
    fn is_true(p: &Param) -> Option<bool> {
        match p {
            Param::Enum(e) if e == "T" => Some(true),
            Param::Enum(e) if e == "F" => Some(false),
            Param::Typed(_, v) => Reader::is_true(v),
            _ => None,
        }
    }
    fn condition(&mut self, p: &Param) -> Result<Option<Condition>> {
        if p.is_null() {
            return Ok(None);
        }
        let (id, c) = self.f.deref(p, &[])?;
        if !matches!(
            c.name.as_str(),
            "IFCBOUNDARYNODECONDITION" | "IFCBOUNDARYNODECONDITIONWARPING"
        ) {
            return Err(block(
                "UNSUPPORTED_FEATURE",
                format!("#{id}: {} is not a point boundary condition", c.name),
                vec![format!("#{id}")],
            ));
        }
        if c.name == "IFCBOUNDARYNODECONDITIONWARPING" {
            self.ledger.add(
                "converted",
                "IfcBoundaryNodeConditionWarping",
                "warping stiffness is not modelled (Saint-Venant torsion)",
                format!("#{id}"),
            );
        }
        let c = c.clone();
        let mut dofs = [Dof::Unset; 6];
        for k in 0..6 {
            let v = c.get(k + 1);
            dofs[k] = match v {
                Param::Null => Dof::Unset,
                _ if Reader::is_true(v) == Some(true) => Dof::Rigid,
                _ if Reader::is_true(v) == Some(false) => Dof::Free,
                Param::Typed(name, inner) => {
                    let q = if k < 3 {
                        Quantity::LinearStiffness
                    } else {
                        Quantity::RotationalStiffness
                    };
                    let x = inner.as_f64().ok_or_else(|| {
                        err("INVALID_EXCHANGE_FILE", format!("#{id}: invalid stiffness"))
                    })?;
                    if !name.ends_with("STIFFNESSMEASURE") || !x.is_finite() {
                        return Err(err(
                            "INVALID_EXCHANGE_FILE",
                            format!("#{id}: invalid stiffness"),
                        ));
                    }
                    if x == 0. {
                        Dof::Free
                    } else {
                        self.used.insert(q);
                        Dof::Elastic(Q {
                            v: x,
                            q,
                            factor: None,
                        })
                    }
                }
                _ => {
                    return Err(err(
                        "INVALID_EXCHANGE_FILE",
                        format!("#{id}: invalid boundary condition value"),
                    ));
                }
            };
        }
        Ok(Some(Condition { step: id, dofs }))
    }
    /// The single edge of a curve item's 'Reference' topology representation.
    fn edge(&mut self, rep: &Param, id: u64) -> Result<([Q; 3], [Q; 3])> {
        let loc = |m: &str| {
            block(
                "UNSUPPORTED_FEATURE",
                format!("#{id}: {m}"),
                vec![format!("#{id}")],
            )
        };
        let (_, shape) = self.f.deref(rep, &["IFCPRODUCTDEFINITIONSHAPE"])?;
        let reps = shape.get(2).as_list().unwrap_or(&[]).to_vec();
        for r in &reps {
            let (_, r) = self.f.deref(r, &[])?;
            if r.name != "IFCTOPOLOGYREPRESENTATION" {
                continue;
            }
            let items = r.get(3).as_list().unwrap_or(&[]).to_vec();
            if items.len() != 1 {
                return Err(loc(
                    "a curve item's topology representation needs exactly one edge",
                ));
            }
            let (eid, e) = self.f.deref(&items[0], &[])?;
            let e = e.clone();
            let (s, t, geometry) = match e.name.as_str() {
                "IFCEDGE" => (e.get(0).clone(), e.get(1).clone(), None),
                "IFCEDGECURVE" => (
                    e.get(0).clone(),
                    e.get(1).clone(),
                    Some((e.get(2).clone(), Reader::is_true(e.get(3)).unwrap_or(true))),
                ),
                "IFCORIENTEDEDGE" => {
                    let (_, inner) = self.f.deref(e.get(2), &["IFCEDGE", "IFCEDGECURVE"])?;
                    let (a, b) = (inner.get(0).clone(), inner.get(1).clone());
                    if inner.name == "IFCEDGECURVE" {
                        self.straight(inner.get(2), eid)?;
                    }
                    if Reader::is_true(e.get(3)) == Some(false) {
                        (b, a, None)
                    } else {
                        (a, b, None)
                    }
                }
                other => return Err(loc(&format!("{other} is not a supported edge"))),
            };
            if let Some((g, _)) = geometry {
                self.straight(&g, eid)?;
            }
            let point = |me: &mut Self, v: &Param| -> Result<[Q; 3]> {
                let (_, vp) = me.f.deref(v, &["IFCVERTEXPOINT"])?;
                let g = vp.get(0).clone();
                me.coords(&g)
            };
            return Ok((point(self, &s)?, point(self, &t)?));
        }
        Err(loc("no topology representation"))
    }
    fn straight(&self, curve: &Param, edge: u64) -> Result<()> {
        let (_, c) = self.f.deref(curve, &[])?;
        let ok = c.name == "IFCLINE"
            || (c.name == "IFCPOLYLINE" && c.get(0).as_list().is_some_and(|l| l.len() == 2));
        if ok {
            Ok(())
        } else {
            Err(block(
                "UNSUPPORTED_FEATURE",
                format!("#{edge}: curved members ({}) are not supported", c.name),
                vec![format!("#{edge}")],
            ))
        }
    }
    fn vertex(&mut self, rep: &Param, id: u64) -> Result<[Q; 3]> {
        let (_, shape) = self.f.deref(rep, &["IFCPRODUCTDEFINITIONSHAPE"])?;
        for r in shape.get(2).as_list().unwrap_or(&[]).to_vec() {
            let (_, r) = self.f.deref(&r, &[])?;
            if r.name != "IFCTOPOLOGYREPRESENTATION" {
                continue;
            }
            let items = r.get(3).as_list().unwrap_or(&[]).to_vec();
            if items.len() == 1 {
                let (_, v) = self.f.deref(&items[0], &["IFCVERTEXPOINT"])?;
                let g = v.get(0).clone();
                return self.coords(&g);
            }
        }
        Err(block(
            "INVALID_EXCHANGE_FILE",
            format!("#{id}: a point item needs a vertex topology representation"),
            vec![format!("#{id}")],
        ))
    }
}

/// Property sets by related object, and single values by property set.
struct Props {
    /// object step id → [(pset name, properties)]
    by_object: BTreeMap<u64, Vec<(String, Vec<u64>)>>,
    material: BTreeMap<u64, Vec<(String, Vec<u64>)>>,
    profile: BTreeMap<u64, Vec<(String, Vec<u64>)>>,
}

fn refs(p: &Param) -> Vec<u64> {
    p.as_list()
        .unwrap_or(&[])
        .iter()
        .filter_map(Param::as_ref)
        .collect()
}

impl Props {
    fn index(f: &StepFile) -> Props {
        let mut p = Props {
            by_object: BTreeMap::new(),
            material: BTreeMap::new(),
            profile: BTreeMap::new(),
        };
        for (_, r) in f.of_type("IFCRELDEFINESBYPROPERTIES") {
            let Some(Ok((_, set))) = r.get(5).as_ref().map(|id| f.get(id).map(|i| (id, i))) else {
                continue;
            };
            if set.name != "IFCPROPERTYSET" {
                continue;
            }
            for o in refs(r.get(4)) {
                p.by_object
                    .entry(o)
                    .or_default()
                    .push((text(set.get(2)), refs(set.get(4))));
            }
        }
        for (_, m) in f.of_type("IFCMATERIALPROPERTIES") {
            if let Some(id) = m.get(3).as_ref() {
                p.material
                    .entry(id)
                    .or_default()
                    .push((text(m.get(0)), refs(m.get(2))));
            }
        }
        for (_, m) in f.of_type("IFCPROFILEPROPERTIES") {
            if let Some(id) = m.get(3).as_ref() {
                p.profile
                    .entry(id)
                    .or_default()
                    .push((text(m.get(0)), refs(m.get(2))));
            }
        }
        p
    }
}

/// A named single value from a list of property sets.
fn prop<'f>(
    f: &'f StepFile,
    sets: Option<&Vec<(String, Vec<u64>)>>,
    pset: &str,
    name: &str,
) -> Option<(&'f Param, &'f Param)> {
    for (n, props) in sets? {
        if n != pset {
            continue;
        }
        for id in props {
            let Ok(p) = f.get(*id) else { continue };
            if p.name == "IFCPROPERTYSINGLEVALUE" && p.get(0).as_str() == Some(name) {
                return Some((p.get(2), p.get(3)));
            }
        }
    }
    None
}

fn prop_text(
    f: &StepFile,
    sets: Option<&Vec<(String, Vec<u64>)>>,
    pset: &str,
    name: &str,
) -> Option<String> {
    let (v, _) = prop(f, sets, pset, name)?;
    match v {
        Param::Typed(_, inner) => inner.as_str().map(str::to_string),
        _ => None,
    }
}

fn prop_num(
    f: &StepFile,
    sets: Option<&Vec<(String, Vec<u64>)>>,
    pset: &str,
    name: &str,
) -> Option<f64> {
    prop(f, sets, pset, name).and_then(|(v, _)| v.as_f64())
}

/// Read the file. With several analysis models, `model_guid` selects one
/// (the answer to the `model` decision); planning otherwise uses the first.
pub fn plan(file: &StepFile, source: Source, model_guid: Option<&str>) -> Result<Plan> {
    match file.schemas.as_slice() {
        [s] if s == "IFC4" => {}
        [s] => {
            return Err(err(
                "UNSUPPORTED_FEATURE",
                format!(
                    "IFC schema {s} is not supported; exchange-v1 reads IFC4 (ISO 16739-1:2018)"
                ),
            ));
        }
        _ => {
            return Err(err(
                "INVALID_EXCHANGE_FILE",
                "FILE_SCHEMA must name exactly one schema",
            ));
        }
    }
    let mut r = Reader {
        f: file,
        ledger: Ledger::default(),
        blocking: vec![],
        used: BTreeSet::new(),
        frames: BTreeMap::new(),
    };
    let props = Props::index(file);
    let identity =
        |id: u64, name: &str| prop_text(file, props.by_object.get(&id), IDENTITY_PSET, name);

    // Project, units and the model context.
    let projects: Vec<_> = file.of_type("IFCPROJECT").collect();
    let [(project_step, project)] = projects.as_slice() else {
        return Err(err(
            "INVALID_EXCHANGE_FILE",
            "An IFC file needs exactly one IfcProject",
        ));
    };
    let assigned = unit_assignment(file, project.get(8))?;
    for c in refs(project.get(7)) {
        let ctx = file.get(c)?;
        if ctx.name == "IFCGEOMETRICREPRESENTATIONCONTEXT" && !ctx.get(4).is_null() {
            let (frame, loc) = r.axis_placement(ctx.get(4))?;
            if !(frame.is_identity() && loc.iter().all(|q| q.v == 0.)) {
                r.blocking.push(block(
                    "UNSUPPORTED_FEATURE",
                    format!("#{c}: a non-identity world coordinate system is not supported"),
                    vec![format!("#{c}")],
                ));
            }
        }
    }

    // Groups: members of each group, with factors.
    let mut grouped: BTreeMap<u64, Vec<(u64, f64)>> = BTreeMap::new();
    for name in ["IFCRELASSIGNSTOGROUP", "IFCRELASSIGNSTOGROUPBYFACTOR"] {
        for (_, rel) in file.of_type(name) {
            let factor = if name == "IFCRELASSIGNSTOGROUPBYFACTOR" {
                rel.get(7).as_f64().unwrap_or(1.)
            } else {
                1.
            };
            if let Some(g) = rel.get(6).as_ref() {
                for o in refs(rel.get(4)) {
                    grouped.entry(g).or_default().push((o, factor));
                }
            }
        }
    }

    // The analysis model.
    let models: Vec<_> = file.of_type("IFCSTRUCTURALANALYSISMODEL").collect();
    let mut decisions = vec![];
    let model = match models.as_slice() {
        [] => {
            return Err(err(
                "NOTHING_TO_IMPORT",
                "The file has no IfcStructuralAnalysisModel; exchange-v1 imports structural analysis models only",
            ));
        }
        [m] => m.0,
        many => {
            decisions.push(Decision {
                id: "model".into(),
                kind: "model".into(),
                question: "The file holds several structural analysis models. Which one should be imported?".into(),
                choices: many
                    .iter()
                    .map(|(_, m)| Choice { value: text(m.get(0)), label: format!("{} ({})", text(m.get(2)), text(m.get(0))) })
                    .collect(),
                fields: vec![],
                entities: many.iter().map(|(id, _)| format!("#{id}")).collect(),
            });
            match model_guid {
                Some(g) => {
                    many.iter()
                        .find(|(_, m)| m.get(0).as_str() == Some(g))
                        .ok_or_else(|| {
                            err(
                                "INVALID_MAPPING",
                                "The chosen analysis model is not in the file",
                            )
                        })?
                        .0
                }
                None => many[0].0,
            }
        }
    };
    plan_model(
        file,
        source,
        &mut r,
        &props,
        &grouped,
        decisions,
        *project_step,
        project,
        model,
        assigned,
        &identity,
    )
}

#[allow(clippy::too_many_arguments)]
fn plan_model(
    file: &StepFile,
    source: Source,
    r: &mut Reader,
    props: &Props,
    grouped: &BTreeMap<u64, Vec<(u64, f64)>>,
    mut decisions: Vec<Decision>,
    project_step: u64,
    project: &Instance,
    model: u64,
    assigned: BTreeMap<Quantity, f64>,
    identity: &dyn Fn(u64, &str) -> Option<String>,
) -> Result<Plan> {
    let m = file.get(model)?.clone();
    let model_frame = r.placement(m.get(9), 0)?;
    let planar = match m.get(5).as_enum() {
        Some("OUT_PLANE_LOADING_2D") => {
            decisions.push(Decision::choose(
                "planar",
                "planar",
                "This is a 2D model loaded out of its plane (a grillage). The workbench's planar mode is in-plane (XZ) only.",
                &[("spatial", "Import it as a spatial (3D) model")],
                vec![format!("#{model}")],
            ));
            false
        }
        Some("IN_PLANE_LOADING_2D") => {
            let ok = !m.get(6).is_null() && {
                let (fr, loc) = r.axis_placement(m.get(6))?;
                let _ = loc;
                // The 2D plane's normal must be ±Y in world: the XZ plane.
                let n = model_frame.dir(fr.r[2]);
                n[0].abs() < 1e-9 && n[2].abs() < 1e-9
            };
            if !ok {
                decisions.push(Decision::choose(
                    "planar",
                    "planar",
                    "This 2D analysis model is not in the global XZ plane. The workbench's planar mode is XZ only.",
                    &[("spatial", "Import it as a spatial (3D) model")],
                    vec![format!("#{model}")],
                ));
            }
            ok
        }
        _ => false,
    };

    // Items grouped into the model.
    let in_model: BTreeSet<u64> = grouped
        .get(&model)
        .map(|v| v.iter().map(|x| x.0).collect())
        .unwrap_or_default();
    let mut points = vec![];
    let mut curves = vec![];
    let mut skip_surfaces = vec![];
    for &id in &in_model {
        let inst = file.get(id)?.clone();
        let guid = text(inst.get(0));
        match inst.name.as_str() {
            "IFCSTRUCTURALPOINTCONNECTION" => {
                let frame = r.placement(inst.get(5), 0)?;
                let coords = r.vertex(inst.get(6), id)?;
                let condition = match r.condition(inst.get(7)) {
                    Ok(c) => c,
                    Err(d) if d.code == "UNSUPPORTED_FEATURE" => {
                        r.blocking.push(d);
                        None
                    }
                    Err(d) => return Err(d),
                };
                if !inst.get(8).is_null() {
                    let (fr, _) = r.axis_placement(inst.get(8))?;
                    let isotropic = condition.as_ref().is_none_or(|c| {
                        c.dofs[..3].iter().all(|d| *d == c.dofs[0])
                            && c.dofs[3..].iter().all(|d| *d == c.dofs[3])
                    });
                    if !fr.is_identity() && !isotropic {
                        r.blocking.push(block(
                            "UNSUPPORTED_FEATURE",
                            format!("{guid}: skewed support conditions are not supported"),
                            vec![guid.clone()],
                        ));
                    }
                }
                points.push(PointItem {
                    step: id,
                    name: text(inst.get(2)),
                    identity: identity(id, "EntityId"),
                    label: identity(id, "Label"),
                    support_identity: identity(id, "SupportId"),
                    support_label: identity(id, "SupportLabel"),
                    guid,
                    coords,
                    frame,
                    condition,
                });
            }
            "IFCSTRUCTURALCURVEMEMBER" => {
                let frame = r.placement(inst.get(5), 0)?;
                let (start, end) = match r.edge(inst.get(6), id) {
                    Ok(e) => e,
                    Err(d) if d.code == "UNSUPPORTED_FEATURE" => {
                        r.blocking.push(d);
                        continue;
                    }
                    Err(d) => return Err(d),
                };
                let axis = r.direction(inst.get(8))?;
                let parent = identity(id, "ParentMemberId").and_then(|p| {
                    let a = prop_num(
                        file,
                        props.by_object.get(&id),
                        IDENTITY_PSET,
                        "StationStart",
                    )?;
                    let b = prop_num(file, props.by_object.get(&id), IDENTITY_PSET, "StationEnd")?;
                    Some((p, a, b))
                });
                curves.push(CurveItem {
                    step: id,
                    name: text(inst.get(2)),
                    identity: identity(id, "EntityId"),
                    label: identity(id, "Label"),
                    guid,
                    parent,
                    local_y: (|| {
                        let g =
                            |k: &str| prop_num(file, props.by_object.get(&id), IDENTITY_PSET, k);
                        Some([g("LocalYX")?, g("LocalYY")?, g("LocalYZ")?])
                    })(),
                    start,
                    end,
                    frame,
                    axis,
                    material: None,
                    profile: None,
                    ends: vec![],
                });
            }
            "IFCSTRUCTURALCURVEMEMBERVARYING" => r.blocking.push(block(
                "UNSUPPORTED_FEATURE",
                format!("{guid}: curve members with varying sections are not supported"),
                vec![guid],
            )),
            "IFCSTRUCTURALSURFACEMEMBER"
            | "IFCSTRUCTURALSURFACEMEMBERVARYING"
            | "IFCSTRUCTURALSURFACECONNECTION"
            | "IFCSTRUCTURALCURVECONNECTION" => {
                skip_surfaces.push((inst.name.clone(), guid));
            }
            other => r.ledger.add(
                "notImported",
                &ifc_label(other),
                "not a frame analysis item",
                guid,
            ),
        }
    }
    if !skip_surfaces.is_empty() {
        let mut d = Decision::choose(
            "skip:surfaces",
            "skip",
            "The model has surface members or curve/surface connections, which a frame model cannot hold. Import the frame without them?",
            &[("skip", "Import without them (recorded as not imported)")],
            skip_surfaces.iter().map(|x| x.1.clone()).collect(),
        );
        d.entities.truncate(50);
        decisions.push(d);
        for (name, guid) in &skip_surfaces {
            r.ledger.add(
                "skipped",
                &ifc_label(name),
                "surface items and curve/surface connections are outside a frame model",
                guid.clone(),
            );
        }
    }

    // Member-end conditions.
    let curve_index: BTreeMap<u64, usize> = curves
        .iter()
        .enumerate()
        .map(|(k, c)| (c.step, k))
        .collect();
    for name in [
        "IFCRELCONNECTSSTRUCTURALMEMBER",
        "IFCRELCONNECTSWITHECCENTRICITY",
    ] {
        for (rel, inst) in file.of_type(name) {
            let (Some(member), Some(conn)) = (inst.get(4).as_ref(), inst.get(5).as_ref()) else {
                continue;
            };
            let Some(&k) = curve_index.get(&member) else {
                continue;
            };
            if name == "IFCRELCONNECTSWITHECCENTRICITY" {
                r.blocking.push(block(
                    "UNSUPPORTED_FEATURE",
                    format!(
                        "{}: eccentric connections are not supported",
                        curves[k].guid
                    ),
                    vec![curves[k].guid.clone()],
                ));
                continue;
            }
            if !inst.get(9).is_null() {
                let (fr, _) = r.axis_placement(inst.get(9))?;
                if !fr.is_identity() {
                    r.blocking.push(block("UNSUPPORTED_FEATURE", format!("#{rel}: rotated member-end condition coordinate systems are not supported"), vec![format!("#{rel}")]));
                }
            }
            let condition = match r.condition(inst.get(6)) {
                Ok(c) => c,
                Err(d) if d.code == "UNSUPPORTED_FEATURE" => {
                    r.blocking.push(d);
                    None
                }
                Err(d) => return Err(d),
            };
            curves[k].ends.push(EndCondition {
                rel,
                connection: conn,
                condition,
            });
        }
    }

    // Materials and profiles.
    let mut materials = BTreeMap::new();
    let mut profiles = BTreeMap::new();
    for (_, rel) in file.of_type("IFCRELASSOCIATESMATERIAL") {
        let targets: Vec<usize> = refs(rel.get(4))
            .iter()
            .filter_map(|o| curve_index.get(o).copied())
            .collect();
        if targets.is_empty() {
            continue;
        }
        let Some(mat_ref) = rel.get(5).as_ref() else {
            continue;
        };
        let (material, profile) = material_profile(file, r, mat_ref)?;
        for k in targets {
            curves[k].material = material;
            curves[k].profile = profile;
        }
        if let Some(mid) = material {
            if let std::collections::btree_map::Entry::Vacant(e) = materials.entry(mid) {
                e.insert(read_material(file, r, props, mid)?);
            }
        }
        if let Some(pid) = profile {
            if let std::collections::btree_map::Entry::Vacant(e) = profiles.entry(pid) {
                e.insert(read_profile(file, r, props, pid)?);
            }
        }
    }

    // Structural actions and the items they act on.
    let mut acts_on: BTreeMap<u64, u64> = BTreeMap::new();
    for (_, rel) in file.of_type("IFCRELCONNECTSSTRUCTURALACTIVITY") {
        if let (Some(item), Some(activity)) = (rel.get(4).as_ref(), rel.get(5).as_ref()) {
            acts_on.insert(activity, item);
        }
    }
    let point_steps: BTreeSet<u64> = points.iter().map(|p| p.step).collect();
    let curve_steps: BTreeSet<u64> = curve_index.keys().copied().collect();
    let mut actions = BTreeMap::new();
    let mut skipped_actions = BTreeSet::new();
    let mut unsupported_loads = vec![];
    for (id, inst) in file.instances.iter() {
        let name = inst.name.as_str();
        let is_action = matches!(
            name,
            "IFCSTRUCTURALPOINTACTION"
                | "IFCSTRUCTURALLINEARACTION"
                | "IFCSTRUCTURALCURVEACTION"
                | "IFCSTRUCTURALSURFACEACTION"
                | "IFCSTRUCTURALPLANARACTION"
        );
        if name.starts_with("IFCSTRUCTURAL") && name.ends_with("REACTION") {
            r.ledger.add(
                "notImported",
                &ifc_label(name),
                "analysis results are recomputed, not imported",
                text(inst.get(0)),
            );
            continue;
        }
        if !is_action {
            continue;
        }
        let guid = text(inst.get(0));
        let Some(&item) = acts_on.get(id) else {
            r.ledger.add(
                "notImported",
                &ifc_label(name),
                "the action is not connected to a structural item",
                guid,
            );
            continue;
        };
        if !point_steps.contains(&item) && !curve_steps.contains(&item) {
            r.ledger.add(
                "notImported",
                &ifc_label(name),
                "the action acts on an item outside the imported model",
                guid,
            );
            continue;
        }
        match read_action(file, r, *id, inst, item, &point_steps) {
            Ok(Some(kind)) => {
                if inst.get(9).as_enum() == Some("T") {
                    r.ledger.add(
                        "converted",
                        "destabilising load flag",
                        "linear analysis has no destabilising-load treatment",
                        guid.clone(),
                    );
                }
                actions.insert(
                    *id,
                    Action {
                        step: *id,
                        name: text(inst.get(2)),
                        identity: identity(*id, "EntityId"),
                        label: identity(*id, "Label"),
                        guid,
                        kind,
                    },
                );
            }
            Ok(None) => {
                skipped_actions.insert(*id);
                unsupported_loads.push(guid.clone());
                r.ledger.add("skipped", &ifc_label(name), "the load type or distribution cannot be represented (constant linear forces and single forces only)", guid);
            }
            Err(d) => return Err(d),
        }
    }
    if !unsupported_loads.is_empty() {
        let mut d = Decision::choose(
            "skip:loads",
            "skip",
            format!(
                "{} load(s) cannot be represented: moments along members, varying distributions, temperatures, displacements or surface loads. Import without them?",
                unsupported_loads.len()
            ),
            &[("skip", "Import without them (recorded as skipped)")],
            unsupported_loads,
        );
        d.entities.truncate(50);
        decisions.push(d);
    }

    // Load cases and combinations.
    let groups: BTreeSet<u64> = file
        .instances
        .iter()
        .filter(|(_, i)| i.name == "IFCSTRUCTURALLOADGROUP" || i.name == "IFCSTRUCTURALLOADCASE")
        .map(|(k, _)| *k)
        .collect();
    let mut cases = vec![];
    let mut combinations = vec![];
    let mut in_case = BTreeSet::new();
    for &g in &groups {
        let inst = file.get(g)?;
        let kind = inst.get(5).as_enum().unwrap_or("");
        let guid = text(inst.get(0));
        let coefficient = inst.get(8).as_f64().unwrap_or(1.);
        match kind {
            "LOAD_CASE" => {
                let mut acts = vec![];
                collect_actions(file, grouped, g, coefficient, &groups, &mut acts, 0)?;
                acts.retain(|(a, _)| actions.contains_key(a) || skipped_actions.contains(a));
                in_case.extend(acts.iter().map(|x| x.0));
                let sw = if inst.name == "IFCSTRUCTURALLOADCASE" && !inst.get(10).is_null() {
                    let c: Vec<f64> = inst
                        .get(10)
                        .as_list()
                        .unwrap_or(&[])
                        .iter()
                        .filter_map(Param::as_f64)
                        .collect();
                    (c.len() == 3 && c.iter().any(|x| *x != 0.))
                        .then(|| model_frame.dir([c[0], c[1], c[2]]))
                } else {
                    None
                };
                if let Some(v) = sw {
                    if v[0].abs() > 1e-12 || v[1].abs() > 1e-12 || v[2] > 0. {
                        r.blocking.push(block(
                            "UNSUPPORTED_FEATURE",
                            format!("{guid}: self weight must act downwards (global −Z)"),
                            vec![guid.clone()],
                        ));
                    }
                }
                let category = match inst.get(7).as_enum() {
                    Some("DEAD_LOAD_G") => "dead",
                    Some("LIVE_LOAD_Q") => "live",
                    Some("WIND_W") => "wind",
                    Some("NOTDEFINED") | None => "other",
                    Some(other) => {
                        r.ledger.add(
                            "converted",
                            "load case action source",
                            &format!("{other} is recorded as category 'other'"),
                            guid.clone(),
                        );
                        "other"
                    }
                };
                if acts.is_empty()
                    && sw.is_none()
                    && !grouped.values().flatten().any(|(o, _)| *o == g)
                {
                    // An empty, unreferenced case still becomes a case.
                }
                cases.push(CaseFound {
                    step: g,
                    name: text(inst.get(2)),
                    identity: identity(g, "EntityId"),
                    label: identity(g, "Label"),
                    guid,
                    category: category.into(),
                    self_weight_identity: identity(g, "SelfWeightId"),
                    self_weight_label: identity(g, "SelfWeightLabel"),
                    actions: acts,
                    self_weight: sw,
                });
            }
            "LOAD_COMBINATION" => {
                let mut terms = vec![];
                for (o, f) in grouped.get(&g).cloned().unwrap_or_default() {
                    let child = file.get(o)?;
                    if matches!(
                        child.name.as_str(),
                        "IFCSTRUCTURALLOADCASE" | "IFCSTRUCTURALLOADGROUP"
                    ) && child.get(5).as_enum() == Some("LOAD_CASE")
                    {
                        terms.push((o, f * coefficient));
                    } else {
                        r.ledger.add(
                            "notImported",
                            "load combination member",
                            "only load cases can be combined",
                            text(child.get(0)),
                        );
                    }
                }
                combinations.push(CombinationFound {
                    step: g,
                    name: text(inst.get(2)),
                    identity: identity(g, "EntityId"),
                    label: identity(g, "Label"),
                    guid,
                    purpose: inst.get(9).as_str().unwrap_or("").to_string(),
                    terms,
                });
            }
            "LOAD_GROUP" => {}
            _ => r.ledger.add(
                "notImported",
                "IfcStructuralLoadGroup",
                "only LOAD_CASE, LOAD_COMBINATION and LOAD_GROUP groups are read",
                guid,
            ),
        }
    }
    for a in actions.keys().chain(skipped_actions.iter()) {
        if !in_case.contains(a) {
            r.ledger.add(
                "notImported",
                "structural action",
                "the action belongs to no load case",
                text(file.get(*a)?.get(0)),
            );
        }
    }
    actions.retain(|k, _| in_case.contains(k));
    for c in combinations.iter_mut() {
        c.terms.retain(|(t, _)| cases.iter().any(|x| x.step == *t));
    }
    let empty: Vec<String> = combinations
        .iter()
        .filter(|c| c.terms.is_empty())
        .map(|c| c.guid.clone())
        .collect();
    for g in &empty {
        r.ledger.add(
            "notImported",
            "load combination",
            "the combination has no load case",
            g.clone(),
        );
    }
    combinations.retain(|c| !c.terms.is_empty());
    let mut purposes: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for c in &combinations {
        if !["analysis", "service", "strength"].contains(&c.purpose.as_str()) {
            purposes
                .entry(c.purpose.clone())
                .or_default()
                .push(c.guid.clone());
        }
    }
    for (purpose, guids) in purposes {
        decisions.push(Decision::choose(
            format!("purpose:{purpose}"),
            "purpose",
            format!("Combinations with purpose '{purpose}' are used for:"),
            &[
                ("strength", "Strength (ultimate)"),
                ("service", "Serviceability"),
                ("analysis", "Analysis only"),
            ],
            guids,
        ));
    }

    // Everything else rooted in the file that is not part of the model.
    let handled: BTreeSet<u64> = in_model
        .iter()
        .copied()
        .chain(groups.iter().copied())
        .chain(actions.keys().copied())
        .chain(skipped_actions.iter().copied())
        .chain([project_step, model])
        .collect();
    for (id, inst) in &file.instances {
        if handled.contains(id) || !is_rooted_product(inst) {
            continue;
        }
        if inst.name.starts_with("IFCSTRUCTURAL")
            && (inst.name.ends_with("ACTION") || inst.name.ends_with("REACTION"))
        {
            continue;
        }
        let reason = if inst.name.starts_with("IFCSTRUCTURAL") {
            "not grouped into the imported analysis model"
        } else {
            "not part of the structural analysis model (physical or other elements are not imported)"
        };
        r.ledger.add(
            "notImported",
            &ifc_label(&inst.name),
            reason,
            text(inst.get(0)),
        );
    }

    // Conditions that need decisions.
    let mut elastic_supports = vec![];
    let mut unset_supports = vec![];
    for p in &points {
        if let Some(c) = &p.condition {
            if c.dofs.iter().any(|d| matches!(d, Dof::Elastic(_))) {
                elastic_supports.push(p.guid.clone());
            }
            if c.dofs.iter().any(|d| *d == Dof::Unset) {
                unset_supports.push(p.guid.clone());
            }
        }
    }
    if !elastic_supports.is_empty() {
        decisions.push(Decision::choose(
            "supports:elastic",
            "elastic",
            "Some supports are elastic (springs), which the frame model cannot hold. Their elastic directions should be:",
            &[("fixed", "Fixed (rigid)"), ("free", "Free (no restraint)")],
            elastic_supports,
        ));
    }
    if !unset_supports.is_empty() {
        decisions.push(Decision::choose(
            "supports:unset",
            "unset",
            "Some support conditions leave directions unset. Those directions are:",
            &[("fixed", "Fixed"), ("free", "Free")],
            unset_supports,
        ));
    }
    let mut unset_ends = vec![];
    let mut elastic_ends = vec![];
    for c in &curves {
        let points_at = |raw: &[Q; 3], frame: &Frame| frame.point(raw.map(|q| q.v));
        let (a, b) = (points_at(&c.start, &c.frame), points_at(&c.end, &c.frame));
        let at_end = |pos: V3| {
            c.ends.iter().any(|e| {
                points.iter().any(|p| {
                    p.step == e.connection
                        && norm(sub(points_at(&p.coords, &p.frame), pos)) <= 1e-9 * (1. + norm(pos))
                })
            })
        };
        let complete = |e: &EndCondition| {
            e.condition
                .as_ref()
                .is_some_and(|x| x.dofs.iter().all(|d| *d != Dof::Unset))
        };
        if !at_end(a) || !at_end(b) || !c.ends.iter().all(complete) {
            unset_ends.push(c.guid.clone());
        }
        if c.ends.iter().any(|e| {
            e.condition
                .as_ref()
                .is_some_and(|x| x.dofs.iter().any(|d| matches!(d, Dof::Elastic(_))))
        }) {
            elastic_ends.push(c.guid.clone());
        }
        for e in &c.ends {
            // A connection must sit at one of the member's ends.
            if let Some(conn) = points.iter().find(|p| p.step == e.connection) {
                let pos = points_at(&conn.coords, &conn.frame);
                let near = |q: V3| norm(sub(pos, q)) <= 1e-9 * (1. + norm(q));
                if !near(a) && !near(b) {
                    r.blocking.push(block(
                        "UNSUPPORTED_FEATURE",
                        format!("{}: connects to {} between its ends; split the member at the connection", c.guid, conn.guid),
                        vec![c.guid.clone(), conn.guid.clone()],
                    ));
                }
            }
            if let Some(cond) = &e.condition {
                let bad = cond.dofs[..4].iter().any(|d| *d == Dof::Free);
                if bad {
                    r.blocking.push(block(
                        "UNSUPPORTED_FEATURE",
                        format!("{}: released translations or torsion at a member end are not supported (bending releases only)", c.guid),
                        vec![c.guid.clone()],
                    ));
                }
            }
        }
    }
    if !unset_ends.is_empty() {
        decisions.push(Decision::choose(
            "connections:unset",
            "unset",
            "Some member ends have no stated connection condition, or leave directions unset. Unstated bending restraint at those ends is:",
            &[("rigid", "Rigid (moment connection)"), ("pinned", "Pinned (bending released)")],
            unset_ends,
        ));
    }
    if !elastic_ends.is_empty() {
        decisions.push(Decision::choose(
            "connections:elastic",
            "elastic",
            "Some member ends have semi-rigid (elastic) connections, which the frame model cannot hold. Their elastic directions should be:",
            &[("rigid", "Rigid"), ("pinned", "Released")],
            elastic_ends,
        ));
    }

    // Materials and sections without complete properties.
    let unassigned: Vec<String> = curves
        .iter()
        .filter(|c| c.material.is_none())
        .map(|c| c.guid.clone())
        .collect();
    if !unassigned.is_empty() {
        let mut d = Decision::choose(
            "material:none",
            "material",
            "Members without a material need one:",
            &[("values", "Enter the material properties")],
            unassigned,
        );
        d.fields = material_fields(None, None, None);
        decisions.push(d);
    }
    let no_profile: Vec<String> = curves
        .iter()
        .filter(|c| c.profile.is_none())
        .map(|c| c.guid.clone())
        .collect();
    if !no_profile.is_empty() {
        let mut d = Decision::choose(
            "section:none",
            "section",
            "Members without a profile need section properties:",
            &[("values", "Enter the section properties")],
            no_profile,
        );
        d.fields = section_fields([None; 6]);
        decisions.push(d);
    }
    let si = |q: &Option<Q>| {
        q.and_then(|q| {
            q.factor
                .or_else(|| assigned.get(&q.q).copied())
                .map(|f| q.v * f)
        })
    };
    for m in materials.values() {
        let nu = m.nu.or_else(|| poisson_from_moduli(m.e, m.g, &assigned));
        if m.e.is_none() || nu.is_none() || m.density.is_none() {
            let mut d = Decision::choose(
                format!("material:#{}", m.step),
                "material",
                format!(
                    "Material '{}' lacks {}. Enter its properties:",
                    m.name,
                    missing(&[
                        ("E", m.e.is_none()),
                        ("ν", nu.is_none()),
                        ("ρ", m.density.is_none())
                    ])
                ),
                &[("values", "Enter the material properties")],
                curves
                    .iter()
                    .filter(|c| c.material == Some(m.step))
                    .map(|c| c.guid.clone())
                    .take(50)
                    .collect(),
            );
            d.fields = material_fields(si(&m.e), nu, si(&m.density));
            decisions.push(d);
        }
    }
    for p in profiles.values() {
        // Completeness is a matter of presence; units are resolved at build.
        if section_from_profile(p, &|q| Some(q.v)).is_none() {
            let mut d = Decision::choose(
                format!("section:#{}", p.step),
                "section",
                format!(
                    "Profile '{}' lacks complete analysis properties. Enter them:",
                    p.name
                ),
                &[("values", "Enter the section properties")],
                curves
                    .iter()
                    .filter(|c| c.profile == Some(p.step))
                    .map(|c| c.guid.clone())
                    .take(50)
                    .collect(),
            );
            d.fields = section_fields([
                si(&p.area),
                si(&p.iy),
                si(&p.iz),
                si(&p.j),
                si(&p.cy),
                si(&p.cz),
            ]);
            decisions.push(d);
        }
    }

    // Units: every quantity the file uses must be defined, or decided.
    let mut unit_records = vec![];
    for q in Quantity::ALL {
        if !r.used.contains(&q) && !assigned.contains_key(&q) {
            continue;
        }
        let record = match assigned.get(&q) {
            Some(f) => UnitRecord {
                quantity: q,
                factor: Some(*f),
                source: "assigned".into(),
                label: if *f == 1. {
                    format!("SI ({})", q.si_symbol())
                } else {
                    format!("1 file unit = {f} {}", q.si_symbol())
                },
            },
            None => UnitRecord {
                quantity: q,
                factor: None,
                source: "undefined".into(),
                label: "not assigned by the file".into(),
            },
        };
        if record.factor.is_none() && r.used.contains(&q) {
            if let Some(d) = unit_decision(q, &assigned) {
                decisions.push(d);
            }
        }
        unit_records.push(record);
    }

    let counts = BTreeMap::from([
        ("nodes".to_string(), points.len()),
        ("members".to_string(), curves.len()),
        (
            "supports".to_string(),
            points.iter().filter(|p| p.condition.is_some()).count(),
        ),
        ("materials".to_string(), materials.len()),
        ("sections".to_string(), profiles.len()),
        ("loadCases".to_string(), cases.len()),
        ("combinations".to_string(), combinations.len()),
        ("loads".to_string(), actions.len()),
    ]);
    let mut project_identity = BTreeMap::new();
    for key in ["EntityId", "TimeoutMs", "MemoryLimitMiB", "DisplayUnits"] {
        if let Some(v) = prop_text(file, props.by_object.get(&model), PROJECT_PSET, key) {
            project_identity.insert(key.to_string(), v);
        } else if let Some(v) = prop_num(file, props.by_object.get(&model), PROJECT_PSET, key) {
            project_identity.insert(key.to_string(), format!("{v}"));
        }
    }
    let report = ReadReport {
        source,
        units: unit_records,
        counts,
        decisions,
        ledger: r.ledger.entries(),
        blocking: std::mem::take(&mut r.blocking),
    };
    Ok(Plan {
        report,
        project_guid: text(project.get(0)),
        project_name: text(project.get(2)),
        project_identity,
        planar,
        model_frame,
        assigned,
        points,
        curves,
        materials,
        profiles,
        actions,
        cases,
        combinations,
        frames: std::mem::take(&mut r.frames),
    })
}

/// ν = E / 2G − 1, when E and G are in the same unit (or both convertible).
fn poisson_from_moduli(
    e: Option<Q>,
    g: Option<Q>,
    assigned: &BTreeMap<Quantity, f64>,
) -> Option<f64> {
    let (e, g) = (e?, g?);
    let (fe, fg) = match (e.factor, g.factor) {
        (None, None) => (1., 1.),
        (a, b) => (
            a.or_else(|| assigned.get(&e.q).copied())?,
            b.or_else(|| assigned.get(&g.q).copied())?,
        ),
    };
    let nu = e.v * fe / (2. * g.v * fg) - 1.;
    nu.is_finite().then_some(nu)
}

fn missing(items: &[(&str, bool)]) -> String {
    items
        .iter()
        .filter(|x| x.1)
        .map(|x| x.0)
        .collect::<Vec<_>>()
        .join(", ")
}

fn fmt_factor(f: f64) -> String {
    format!("{f}")
}

fn unit_decision(q: Quantity, assigned: &BTreeMap<Quantity, f64>) -> Option<Decision> {
    let id = format!("units:{}", q.key());
    if q.is_base() {
        let choices: Vec<(String, String)> = base_choices(q)
            .iter()
            .map(|(k, l, _)| (k.to_string(), l.to_string()))
            .collect();
        return Some(Decision {
            id,
            kind: "units".into(),
            question: format!(
                "The file does not assign a {} unit. Its values are in:",
                q.ifc_unit_type().trim_end_matches("UNIT").to_lowercase()
            ),
            choices: choices
                .into_iter()
                .map(|(value, label)| Choice { value, label })
                .collect(),
            fields: vec![],
            entities: vec![q.ifc_unit_type().into()],
        });
    }
    let derived = derived_factor(q, assigned);
    if derived == Some(1.) {
        // SI and dimensional derivation agree: nothing to decide.
        return None;
    }
    let how = derived.map_or_else(
        || "from the base units decided above".to_string(),
        |d| format!("× {}", fmt_factor(d)),
    );
    Some(Decision {
        id,
        kind: "units".into(),
        question: format!(
            "The file does not assign a {} unit, and IFC defines no default.",
            q.ifc_unit_type()
        ),
        choices: vec![
            Choice {
                value: "derived".into(),
                label: format!("Derived from the file's base units ({how})"),
            },
            Choice {
                value: "si".into(),
                label: format!("SI ({})", q.si_symbol()),
            },
        ],
        fields: vec![],
        entities: vec![q.ifc_unit_type().into()],
    })
}

/// A quantity's factor from the assigned base units, if all are assigned.
pub fn derived_factor(q: Quantity, assigned: &BTreeMap<Quantity, f64>) -> Option<f64> {
    let (l, f, m) = q.dimensions();
    let pick = |base: Quantity, e: i32| {
        if e == 0 {
            Some(1.)
        } else {
            assigned.get(&base).map(|x| x.powi(e))
        }
    };
    Some(pick(Quantity::Length, l)? * pick(Quantity::Force, f)? * pick(Quantity::Mass, m)?)
}

/// The SI factor of each quantity the unit assignment defines.
fn unit_assignment(f: &StepFile, p: &Param) -> Result<BTreeMap<Quantity, f64>> {
    let mut out = BTreeMap::new();
    if p.is_null() {
        return Ok(out);
    }
    let (_, ua) = f.deref(p, &["IFCUNITASSIGNMENT"])?;
    for u in refs(ua.get(0)) {
        let inst = f.get(u)?;
        let t = match inst.name.as_str() {
            "IFCDERIVEDUNIT" => inst.get(1).as_enum(),
            "IFCMONETARYUNIT" => None,
            _ => inst.get(1).as_enum(),
        };
        let Some(q) = t.and_then(Quantity::from_ifc_unit_type) else {
            continue;
        };
        let factor = unit_factor(f, u, 0)?;
        if !(factor.is_finite() && factor > 0.) {
            return Err(err(
                "INVALID_EXCHANGE_FILE",
                format!("#{u}: invalid unit factor"),
            ));
        }
        if out.insert(q, factor).is_some() {
            return Err(err(
                "INVALID_EXCHANGE_FILE",
                format!("{} is assigned twice", q.ifc_unit_type()),
            ));
        }
    }
    Ok(out)
}

/// SI factor of a named, derived or conversion-based unit.
pub fn unit_factor(f: &StepFile, u: u64, depth: usize) -> Result<f64> {
    if depth > 16 {
        return Err(err(
            "INVALID_EXCHANGE_FILE",
            "Unit definitions nest too deeply",
        ));
    }
    let inst = f.get(u)?;
    let bad = || {
        err(
            "UNSUPPORTED_FEATURE",
            format!("#{u}: unit {} cannot be converted", inst.name),
        )
    };
    match inst.name.as_str() {
        "IFCSIUNIT" => {
            let name = inst.get(3).as_enum().ok_or_else(bad)?;
            let base = si_name(name).ok_or_else(bad)?;
            let prefix = match inst.get(2).as_enum() {
                None => 1.,
                Some(p) => si_prefix(p).ok_or_else(bad)?,
            };
            Ok(base * prefix.powi(si_power(name)))
        }
        "IFCCONVERSIONBASEDUNIT" => {
            let (_, mwu) = f.deref(inst.get(3), &["IFCMEASUREWITHUNIT"])?;
            let v = mwu.get(0).as_f64().ok_or_else(bad)?;
            let inner = mwu.get(1).as_ref().ok_or_else(bad)?;
            Ok(v * unit_factor(f, inner, depth + 1)?)
        }
        "IFCDERIVEDUNIT" => {
            let mut x = 1.;
            for e in refs(inst.get(0)) {
                let (_, el) = f.deref(&Param::Ref(e), &["IFCDERIVEDUNITELEMENT"])?;
                let unit = el.get(0).as_ref().ok_or_else(bad)?;
                let exp = el.get(1).as_f64().ok_or_else(bad)? as i32;
                x *= unit_factor(f, unit, depth + 1)?.powi(exp);
            }
            Ok(x)
        }
        _ => Err(bad()),
    }
}

fn ifc_label(upper: &str) -> String {
    // Upper-case STEP names back to IFC camel case for the ledger.
    const KNOWN: &[&str] = &[
        "IfcStructuralPointConnection",
        "IfcStructuralCurveMember",
        "IfcStructuralCurveMemberVarying",
        "IfcStructuralSurfaceMember",
        "IfcStructuralSurfaceMemberVarying",
        "IfcStructuralSurfaceConnection",
        "IfcStructuralCurveConnection",
        "IfcStructuralPointAction",
        "IfcStructuralLinearAction",
        "IfcStructuralCurveAction",
        "IfcStructuralSurfaceAction",
        "IfcStructuralPlanarAction",
        "IfcStructuralPointReaction",
        "IfcStructuralCurveReaction",
        "IfcStructuralSurfaceReaction",
        "IfcStructuralResultGroup",
        "IfcStructuralAnalysisModel",
        "IfcBeam",
        "IfcColumn",
        "IfcMember",
        "IfcSlab",
        "IfcWall",
        "IfcFooting",
        "IfcPlate",
        "IfcPile",
        "IfcBuildingElementProxy",
        "IfcSite",
        "IfcBuilding",
        "IfcBuildingStorey",
        "IfcSpace",
        "IfcOpeningElement",
        "IfcDoor",
        "IfcWindow",
        "IfcStair",
        "IfcRoof",
        "IfcRailing",
        "IfcCovering",
        "IfcElementAssembly",
        "IfcGrid",
        "IfcAnnotation",
        "IfcStructuralLoadGroup",
        "IfcStructuralLoadCase",
        "IfcGroup",
        "IfcSystem",
        "IfcZone",
    ];
    KNOWN
        .iter()
        .find(|k| k.to_ascii_uppercase() == upper)
        .map_or_else(|| upper.to_string(), |k| k.to_string())
}

/// Instances with a GlobalId that are objects (not relationships, property
/// definitions, types or the project), i.e. what a user would miss.
fn is_rooted_product(i: &Instance) -> bool {
    let n = i.name.as_str();
    i.get(0).as_str().is_some_and(guid::is_valid)
        && !n.starts_with("IFCREL")
        && !n.starts_with("IFCPROPERTY")
        && !n.ends_with("TYPE")
        && !n.ends_with("STYLE")
        && !matches!(
            n,
            "IFCPROJECT"
                | "IFCPROJECTLIBRARY"
                | "IFCELEMENTQUANTITY"
                | "IFCPERMIT"
                | "IFCACTOR"
                | "IFCWORKPLAN"
                | "IFCWORKSCHEDULE"
                | "IFCTASK"
        )
}

fn material_profile(
    f: &StepFile,
    r: &mut Reader,
    mat_ref: u64,
) -> Result<(Option<u64>, Option<u64>)> {
    let inst = f.get(mat_ref)?;
    let set = match inst.name.as_str() {
        "IFCMATERIAL" => return Ok((Some(mat_ref), None)),
        "IFCMATERIALPROFILESETUSAGE" => {
            let cp = inst.get(1).as_f64();
            if cp.is_some_and(|c| c != 10.) {
                r.ledger.add(
                    "converted",
                    "IfcMaterialProfileSetUsage",
                    "the profile is inserted at its centroid (cardinal point 10); eccentric insertion is not modelled",
                    format!("#{mat_ref}"),
                );
            }
            inst.get(0).as_ref()
        }
        "IFCMATERIALPROFILESET" => Some(mat_ref),
        "IFCMATERIALPROFILE" => {
            return Ok((inst.get(2).as_ref(), inst.get(3).as_ref()));
        }
        "IFCMATERIALPROFILESETUSAGETAPERING" => {
            return Err(block(
                "UNSUPPORTED_FEATURE",
                format!("#{mat_ref}: tapered profile sets are not supported"),
                vec![format!("#{mat_ref}")],
            ));
        }
        other => {
            r.ledger.add(
                "converted",
                &format!("material association {other}"),
                "only profile sets and materials are read",
                format!("#{mat_ref}"),
            );
            return Ok((None, None));
        }
    };
    let Some(set) = set else {
        return Ok((None, None));
    };
    let (_, s) = f.deref(&Param::Ref(set), &["IFCMATERIALPROFILESET"])?;
    let profiles = refs(s.get(2));
    if profiles.len() != 1 {
        return Err(block(
            "UNSUPPORTED_FEATURE",
            format!(
                "#{set}: composite profile sets ({} profiles) are not supported",
                profiles.len()
            ),
            vec![format!("#{set}")],
        ));
    }
    let (_, mp) = f.deref(&Param::Ref(profiles[0]), &["IFCMATERIALPROFILE"])?;
    Ok((mp.get(2).as_ref(), mp.get(3).as_ref()))
}

fn typed_q(f: &StepFile, r: &mut Reader, v: (&Param, &Param), q: Quantity) -> Result<Option<Q>> {
    let (value, unit) = v;
    let Some(x) = value.as_f64() else {
        return Ok(None);
    };
    let factor = match unit.as_ref() {
        Some(u) => Some(unit_factor(f, u, 0)?),
        None => {
            r.used.insert(q);
            None
        }
    };
    Ok(Some(Q { v: x, q, factor }))
}

fn read_material(f: &StepFile, r: &mut Reader, props: &Props, id: u64) -> Result<MaterialFound> {
    let inst = f.get(id)?;
    let sets = props.material.get(&id);
    let mut get = |pset: &str, name: &str, q: Quantity| -> Result<Option<Q>> {
        match prop(f, sets, pset, name) {
            Some(v) => typed_q(f, r, v, q),
            None => Ok(None),
        }
    };
    let e = get(
        "Pset_MaterialMechanical",
        "YoungModulus",
        Quantity::ModulusOfElasticity,
    )?;
    let g = get(
        "Pset_MaterialMechanical",
        "ShearModulus",
        Quantity::ModulusOfElasticity,
    )?;
    let density = get("Pset_MaterialCommon", "MassDensity", Quantity::MassDensity)?;
    let nu = prop_num(f, sets, "Pset_MaterialMechanical", "PoissonRatio");
    Ok(MaterialFound {
        step: id,
        name: text(inst.get(0)),
        identity: prop_text(f, sets, IDENTITY_PSET, "EntityId"),
        label: prop_text(f, sets, IDENTITY_PSET, "Label"),
        e,
        g,
        nu,
        density,
    })
}

fn read_profile(f: &StepFile, r: &mut Reader, props: &Props, id: u64) -> Result<ProfileFound> {
    let inst = f.get(id)?.clone();
    let sets = props.profile.get(&id);
    let mut get = |pset: &str, name: &str, q: Quantity| -> Result<Option<Q>> {
        match prop(f, sets, pset, name) {
            Some(v) => typed_q(f, r, v, q),
            None => Ok(None),
        }
    };
    let pm = "Pset_ProfileMechanical";
    let area = get(pm, "CrossSectionArea", Quantity::Area)?;
    let iy = get(pm, "MomentOfInertiaY", Quantity::MomentOfInertia)?;
    let iz = get(pm, "MomentOfInertiaZ", Quantity::MomentOfInertia)?;
    let j = get(pm, "TorsionalConstantX", Quantity::MomentOfInertia)?;
    let wy = get(pm, "MaximumSectionModulusY", Quantity::SectionModulus)?;
    let wz = get(pm, "MaximumSectionModulusZ", Quantity::SectionModulus)?;
    let cy = get(SECTION_PSET, "ExtremeFibreY", Quantity::Length)?;
    let cz = get(SECTION_PSET, "ExtremeFibreZ", Quantity::Length)?;
    if let Some((v, _)) = prop(f, sets, pm, "MomentOfInertiaYZ") {
        if v.as_f64().is_some_and(|x| x != 0.) {
            r.ledger.add(
                "converted",
                "product moment of area",
                "principal axes are assumed; the product moment IYZ is ignored",
                format!("#{id}"),
            );
        }
    }
    let centred = |r: &mut Reader, p: &Param| -> Result<Option<i32>> {
        // Quarter turns about the centroid only; returns the turn count.
        if p.is_null() {
            return Ok(Some(0));
        }
        let (fr, loc) = r.axis_placement(p)?;
        if loc.iter().any(|q| q.v != 0.) {
            return Ok(None);
        }
        let x = fr.r[0];
        Ok(match (x[0].round() as i32, x[1].round() as i32) {
            _ if (x[0].abs() - 1.).abs() > 1e-12 && (x[1].abs() - 1.).abs() > 1e-12 => None,
            (1, 0) => Some(0),
            (0, 1) => Some(1),
            (-1, 0) => Some(2),
            (0, -1) => Some(3),
            _ => None,
        })
    };
    let shape = match inst.name.as_str() {
        "IFCRECTANGLEPROFILEDEF" => match (
            centred(r, inst.get(2))?,
            r.q(inst.get(3), Quantity::Length),
            r.q(inst.get(4), Quantity::Length),
        ) {
            (Some(t), Some(x), Some(y)) => Some(if t % 2 == 0 {
                Shape::Rectangle(x, y)
            } else {
                Shape::Rectangle(y, x)
            }),
            _ => None,
        },
        "IFCCIRCLEPROFILEDEF" => {
            match (centred(r, inst.get(2))?, r.q(inst.get(3), Quantity::Length)) {
                (Some(_), Some(rad)) => Some(Shape::Circle(rad)),
                _ => None,
            }
        }
        "IFCCIRCLEHOLLOWPROFILEDEF" => match (
            centred(r, inst.get(2))?,
            r.q(inst.get(3), Quantity::Length),
            r.q(inst.get(4), Quantity::Length),
        ) {
            (Some(_), Some(rad), Some(t)) => Some(Shape::CircleHollow(rad, t)),
            _ => None,
        },
        _ => None,
    };
    let provenance = prop_text(f, sets, SECTION_PSET, "Provenance");
    Ok(ProfileFound {
        step: id,
        name: text(inst.get(1)),
        identity: prop_text(f, sets, SECTION_PSET, "EntityId"),
        label: prop_text(f, sets, SECTION_PSET, "Label"),
        provenance,
        area,
        iy,
        iz,
        j,
        wy,
        wz,
        cy,
        cz,
        shape,
    })
}

/// A, Iy, Iz, J, cy, cz in SI, when the profile states or implies them all.
/// Pset_ProfileMechanical wins; extreme fibres come from the workbench set,
/// the section moduli, or the parametric shape; otherwise the parametric
/// shape gives everything.
pub fn section_from_profile(
    p: &ProfileFound,
    si: &dyn Fn(Q) -> Option<f64>,
) -> Option<([f64; 6], &'static str)> {
    let get = |q: &Option<Q>| q.and_then(si);
    let geometry = p.shape.as_ref().and_then(|s| shape_section(s, si));
    if let (Some(a), Some(iy), Some(iz), Some(j)) =
        (get(&p.area), get(&p.iy), get(&p.iz), get(&p.j))
    {
        let cz = get(&p.cz)
            .or_else(|| get(&p.wy).map(|w| iy / w))
            .or_else(|| geometry.map(|g| g[5]));
        let cy = get(&p.cy)
            .or_else(|| get(&p.wz).map(|w| iz / w))
            .or_else(|| geometry.map(|g| g[4]));
        if let (Some(cy), Some(cz)) = (cy, cz) {
            return Some(([a, iy, iz, j, cy, cz], "Pset_ProfileMechanical"));
        }
    }
    geometry.map(|g| (g, "profile geometry"))
}

fn shape_section(s: &Shape, si: &dyn Fn(Q) -> Option<f64>) -> Option<[f64; 6]> {
    use std::f64::consts::PI;
    match s {
        Shape::Rectangle(x, y) => {
            let r = workbench_model::solid_rectangle(si(*x)?, si(*y)?, None).ok()?;
            Some([r.a, r.iy, r.iz, r.j, r.cy, r.cz])
        }
        Shape::Circle(rad) => {
            let r = si(*rad)?;
            let i = PI * r.powi(4) / 4.;
            (r > 0.).then(|| [PI * r * r, i, i, 2. * i, r, r])
        }
        Shape::CircleHollow(rad, t) => {
            let (ro, t) = (si(*rad)?, si(*t)?);
            let ri = ro - t;
            let i = PI * (ro.powi(4) - ri.powi(4)) / 4.;
            (ro > 0. && t > 0. && ri >= 0.)
                .then(|| [PI * (ro * ro - ri * ri), i, i, 2. * i, ro, ro])
        }
    }
}

fn collect_actions(
    f: &StepFile,
    grouped: &BTreeMap<u64, Vec<(u64, f64)>>,
    group: u64,
    factor: f64,
    groups: &BTreeSet<u64>,
    out: &mut Vec<(u64, f64)>,
    depth: usize,
) -> Result<()> {
    if depth > 16 {
        return Err(err(
            "INVALID_EXCHANGE_FILE",
            "Load groups nest too deeply or cyclically",
        ));
    }
    for (o, k) in grouped.get(&group).cloned().unwrap_or_default() {
        if groups.contains(&o) {
            let g = f.get(o)?;
            if g.get(5).as_enum() == Some("LOAD_GROUP") {
                let c = g.get(8).as_f64().unwrap_or(1.);
                collect_actions(f, grouped, o, factor * k * c, groups, out, depth + 1)?;
            }
        } else {
            out.push((o, factor * k));
        }
    }
    Ok(())
}

fn read_action(
    f: &StepFile,
    r: &mut Reader,
    id: u64,
    inst: &Instance,
    item: u64,
    point_steps: &BTreeSet<u64>,
) -> Result<Option<ActionKind>> {
    let local = inst.get(8).as_enum() == Some("LOCAL_COORDS");
    let Some(load_ref) = inst.get(7).as_ref() else {
        return Ok(None);
    };
    let load = f.get(load_ref)?.clone();
    let six = |r: &mut Reader, l: &Instance| -> [Q; 6] {
        std::array::from_fn(|k| {
            let q = if k < 3 {
                Quantity::Force
            } else {
                Quantity::Torque
            };
            r.q(l.get(k + 1), q).unwrap_or(Q {
                v: 0.,
                q,
                factor: None,
            })
        })
    };
    match inst.name.as_str() {
        "IFCSTRUCTURALPOINTACTION" => {
            if load.name != "IFCSTRUCTURALLOADSINGLEFORCE" {
                return Ok(None);
            }
            let values = six(r, &load);
            if point_steps.contains(&item) {
                Ok(Some(ActionKind::Nodal {
                    connection: item,
                    values,
                }))
            } else {
                let placement = inst.get(5).clone();
                r.placement(&placement, 0)?;
                let at = r.vertex(inst.get(6), id)?;
                let frame_step = placement.as_ref().unwrap_or(0);
                Ok(Some(ActionKind::Point {
                    member: item,
                    local,
                    at,
                    frame_step,
                    values,
                }))
            }
        }
        "IFCSTRUCTURALLINEARACTION" | "IFCSTRUCTURALCURVEACTION" => {
            if point_steps.contains(&item) {
                return Ok(None);
            }
            let predefined = inst.get(11).as_enum().unwrap_or("CONST");
            let projected = inst.get(10).as_enum() == Some("PROJECTED_LENGTH");
            match (predefined, load.name.as_str()) {
                ("CONST", "IFCSTRUCTURALLOADLINEARFORCE") => {
                    let moments = (4..7).any(|k| load.get(k).as_f64().is_some_and(|x| x != 0.));
                    if moments {
                        return Ok(None);
                    }
                    let values: [Q; 3] = std::array::from_fn(|k| {
                        r.q(load.get(k + 1), Quantity::LinearForce).unwrap_or(Q {
                            v: 0.,
                            q: Quantity::LinearForce,
                            factor: None,
                        })
                    });
                    Ok(Some(ActionKind::Linear {
                        member: item,
                        local,
                        projected: projected && !local,
                        values,
                    }))
                }
                ("DISCRETE", "IFCSTRUCTURALLOADCONFIGURATION") => {
                    let vals = refs(load.get(1));
                    let locs = load.get(2).as_list().unwrap_or(&[]).to_vec();
                    if vals.len() != locs.len() || vals.is_empty() {
                        return Err(err(
                            "INVALID_EXCHANGE_FILE",
                            format!("#{load_ref}: values and locations differ in number"),
                        ));
                    }
                    let mut items = vec![];
                    for (v, l) in vals.iter().zip(&locs) {
                        let single = f.get(*v)?.clone();
                        if single.name != "IFCSTRUCTURALLOADSINGLEFORCE" {
                            return Ok(None);
                        }
                        let x = l
                            .as_list()
                            .and_then(|l| l.first())
                            .and_then(|p| r.q(p, Quantity::Length));
                        let Some(x) = x else {
                            return Err(err(
                                "INVALID_EXCHANGE_FILE",
                                format!("#{load_ref}: invalid location"),
                            ));
                        };
                        items.push((x, six(r, &single)));
                    }
                    Ok(Some(ActionKind::Discrete {
                        member: item,
                        local,
                        items,
                    }))
                }
                _ => Ok(None),
            }
        }
        _ => Ok(None),
    }
}

/// The resolved SI factor of every quantity.
struct Units<'a> {
    assigned: &'a BTreeMap<Quantity, f64>,
    answers: &'a Answers<'a>,
}

impl Units<'_> {
    fn factor(&self, q: Quantity) -> Result<f64> {
        if let Some(f) = self.assigned.get(&q) {
            return Ok(*f);
        }
        let id = format!("units:{}", q.key());
        let derived = || -> Result<f64> {
            let (l, f, m) = q.dimensions();
            let pick = |base: Quantity, e: i32| -> Result<f64> {
                if e == 0 {
                    Ok(1.)
                } else {
                    Ok(self.factor(base)?.powi(e))
                }
            };
            Ok(pick(Quantity::Length, l)? * pick(Quantity::Force, f)? * pick(Quantity::Mass, m)?)
        };
        match self.answers.choice(&id) {
            Some("si") => Ok(1.),
            Some("derived") => derived(),
            Some(k) if q.is_base() => base_choices(q)
                .iter()
                .find(|c| c.0 == k)
                .map(|c| c.2)
                .ok_or_else(|| err("INVALID_MAPPING", format!("{id}: unknown unit {k}"))),
            // Undecided: SI and derivation agree (see unit_decision).
            _ if !q.is_base() => derived(),
            _ => Err(err("DECISION_REQUIRED", format!("{id} is undecided"))),
        }
    }
    fn si(&self, q: Q) -> Result<f64> {
        let x = q.v * q.factor.map_or_else(|| self.factor(q.q), Ok)?;
        if x.is_finite() {
            Ok(x)
        } else {
            Err(err("NONFINITE_RESULT", "A converted value is not finite"))
        }
    }
    fn point(&self, raw: &[Q; 3], frame: &Frame) -> Result<V3> {
        let l = self.factor(Quantity::Length)?;
        let local = [self.si(raw[0])?, self.si(raw[1])?, self.si(raw[2])?];
        let origin = frame.o.map(|x| x * l);
        let d = frame.dir(local);
        Ok(std::array::from_fn(|i| d[i] + origin[i]))
    }
}

pub struct Built {
    pub project: workbench_model::Project,
    pub ledger: Vec<LossEntry>,
}

pub fn build(plan: &Plan, answers: &Answers) -> Result<Built> {
    use workbench_model::*;
    let mut ledger = Ledger::default();
    for e in &plan.report.ledger {
        ledger.extend(e);
    }
    let units = Units {
        assigned: &plan.assigned,
        answers,
    };
    let mut used_ids: BTreeSet<String> = BTreeSet::new();
    let mut take_id = |preferred: Option<&String>, fallback: String| -> String {
        let valid = |s: &str| {
            !s.is_empty()
                && s.len() <= 64
                && s.as_bytes()[0].is_ascii_alphabetic()
                && s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        };
        let mut id = match preferred {
            Some(p) if valid(p) && !used_ids.contains(p) => p.clone(),
            _ => fallback,
        };
        let base = id.clone();
        let mut k = 2;
        while used_ids.contains(&id) {
            id = format!("{base}-{k}");
            k += 1;
        }
        used_ids.insert(id.clone());
        id
    };
    let mut labels = std::collections::BTreeMap::new();
    let label_ok = |prefix: &str, name: &str| {
        name.strip_prefix(prefix)
            .and_then(|n| n.parse::<u32>().ok())
            .is_some_and(|n| n > 0 && name == format!("{prefix}{n}"))
    };
    // The workbench label if carried, else a Name in label form.
    let mut set_label = |labels: &mut std::collections::BTreeMap<String, String>,
                         id: &str,
                         prefix: &str,
                         carried: &Option<String>,
                         name: &str| {
        let pick = carried
            .as_deref()
            .filter(|l| label_ok(prefix, l))
            .or(Some(name).filter(|n| label_ok(prefix, n)));
        if let Some(l) = pick {
            labels.insert(id.to_string(), l.to_string());
        }
    };

    // Nodes: point connections, then free member ends merged by position.
    let mut nodes: Vec<Node> = vec![];
    let mut node_of_step: BTreeMap<u64, String> = BTreeMap::new();
    let mut supports = vec![];
    let fix_answer = |id: &str| answers.choice(id);
    for p in &plan.points {
        let pos = units.point(&p.coords, &p.frame)?;
        if let Some(other) = nodes.iter().find(|n| norm(sub(n.position, pos)) <= TOL) {
            return Err(block(
                "INVALID_EXCHANGE_FILE",
                format!(
                    "{} coincides with another point connection ({})",
                    p.guid, other.id
                ),
                vec![p.guid.clone()],
            ));
        }
        let id = take_id(p.identity.as_ref(), guid::to_entity_id(&p.guid));
        set_label(&mut labels, &id, "n", &p.label, &p.name);
        node_of_step.insert(p.step, id.clone());
        nodes.push(Node {
            id: id.clone(),
            position: pos,
        });
        if let Some(c) = &p.condition {
            let mut fixed = [false; 6];
            for k in 0..6 {
                fixed[k] = match c.dofs[k] {
                    Dof::Rigid => true,
                    Dof::Free => false,
                    Dof::Unset => fix_answer("supports:unset") == Some("fixed"),
                    Dof::Elastic(_) => fix_answer("supports:elastic") == Some("fixed"),
                };
            }
            if c.dofs.iter().any(|d| matches!(d, Dof::Elastic(_))) {
                ledger.add(
                    "converted",
                    "elastic support",
                    &format!(
                        "elastic directions imported as {}",
                        fix_answer("supports:elastic").unwrap_or("?")
                    ),
                    p.guid.clone(),
                );
            }
            if fixed.iter().any(|x| *x) {
                let sid = take_id(p.support_identity.as_ref(), format!("s{}", id));
                set_label(&mut labels, &sid, "s", &p.support_label, "");
                supports.push(Support {
                    id: sid,
                    node: id.clone(),
                    fixed,
                    prescribed: [0.; 6],
                });
            }
        }
    }
    let mut free_count = 0;
    let mut node_at = |pos: V3,
                       nodes: &mut Vec<Node>,
                       take_id: &mut dyn FnMut(Option<&String>, String) -> String|
     -> String {
        if let Some(n) = nodes.iter().find(|n| norm(sub(n.position, pos)) <= TOL) {
            return n.id.clone();
        }
        free_count += 1;
        let id = take_id(None, format!("n{free_count}"));
        nodes.push(Node {
            id: id.clone(),
            position: pos,
        });
        id
    };

    // Materials and sections.
    let mut material_ids: BTreeMap<Option<u64>, String> = BTreeMap::new();
    let mut materials = vec![];
    let mut sections = vec![];
    let mut section_ids: BTreeMap<Option<u64>, String> = BTreeMap::new();
    let values = |id: &str| {
        answers
            .get(id)
            .filter(|a| a.choice == "values")
            .map(|a| a.values.clone())
    };
    let si_opt = |q: Q| units.si(q).ok();
    for (k, m) in plan.materials.values().enumerate() {
        let id = take_id(m.identity.as_ref(), format!("mat{}", k + 1));
        set_label(&mut labels, &id, "mat", &m.label, "");
        let (e, nu, density) = match values(&format!("material:#{}", m.step)) {
            Some(v) => (v["E"], v["nu"], v["density"]),
            None => {
                let e = units.si(m.e.unwrap())?;
                let nu = match m.nu {
                    Some(nu) => nu,
                    None => e / (2. * units.si(m.g.unwrap())?) - 1.,
                };
                (e, nu, units.si(m.density.unwrap())?)
            }
        };
        materials.push(Material {
            id: id.clone(),
            name: if m.name.is_empty() {
                id.clone()
            } else {
                m.name.clone()
            },
            e,
            nu,
            density,
        });
        material_ids.insert(Some(m.step), id);
    }
    if let Some(v) = values("material:none") {
        let id = take_id(None, "mat-unassigned".into());
        materials.push(Material {
            id: id.clone(),
            name: "Unassigned members".into(),
            e: v["E"],
            nu: v["nu"],
            density: v["density"],
        });
        material_ids.insert(None, id);
    }
    for (k, p) in plan.profiles.values().enumerate() {
        let id = take_id(p.identity.as_ref(), format!("sec{}", k + 1));
        set_label(&mut labels, &id, "sec", &p.label, "");
        let (props, source) = match values(&format!("section:#{}", p.step)) {
            Some(v) => (
                [v["A"], v["Iy"], v["Iz"], v["J"], v["cy"], v["cz"]],
                "entered at import",
            ),
            None => section_from_profile(p, &si_opt).ok_or_else(|| {
                err(
                    "DECISION_REQUIRED",
                    format!("section:#{} is undecided", p.step),
                )
            })?,
        };
        let provenance = p
            .provenance
            .clone()
            .unwrap_or_else(|| format!("IFC import: {source}"));
        sections.push(Section {
            id: id.clone(),
            name: if p.name.is_empty() {
                id.clone()
            } else {
                p.name.clone()
            },
            a: props[0],
            iy: props[1],
            iz: props[2],
            j: props[3],
            cy: props[4],
            cz: props[5],
            provenance,
        });
        section_ids.insert(Some(p.step), id);
    }
    if let Some(v) = values("section:none") {
        let id = take_id(None, "sec-unassigned".into());
        sections.push(Section {
            id: id.clone(),
            name: "Unassigned members".into(),
            a: v["A"],
            iy: v["Iy"],
            iz: v["Iz"],
            j: v["J"],
            cy: v["cy"],
            cz: v["cz"],
            provenance: "entered at import".into(),
        });
        section_ids.insert(None, id);
    }

    // Members.
    let mut members = vec![];
    let mut member_of_step: BTreeMap<u64, (String, V3, V3, [V3; 3])> = BTreeMap::new();
    for c in &plan.curves {
        let a = units.point(&c.start, &c.frame)?;
        let b = units.point(&c.end, &c.frame)?;
        let x = unit(sub(b, a)).ok_or_else(|| {
            block(
                "ZERO_LENGTH_MEMBER",
                format!("{} has zero length", c.guid),
                vec![c.guid.clone()],
            )
        })?;
        // IFC4: local z lies in the plane of x and Axis, directed like Axis;
        // y = z × x. Without Axis, IFC gives no default: the workbench's
        // default for new members is used and recorded as a conversion.
        let y = match c.axis {
            Some(ax) => {
                let axis = c.frame.dir(ax);
                let z = unit(sub(axis, scale(x, dot(axis, x)))).ok_or_else(|| {
                    block(
                        "INVALID_LOCAL_AXIS",
                        format!("{}: Axis is parallel to the member", c.guid),
                        vec![c.guid.clone()],
                    )
                })?;
                let y = cross(z, x);
                // The authored vector, when it still defines this frame.
                let authored = c.local_y.map(|v| c.frame.dir(v)).filter(|v| {
                    unit(sub(*v, scale(x, dot(*v, x)))).is_some_and(|u| norm(sub(u, y)) < 1e-9)
                });
                authored.unwrap_or(y)
            }
            None => {
                ledger.add("converted", "curve member without Axis", "local y taken as global Y (global −X for members along Y), the workbench default", c.guid.clone());
                crate::default_local_y(x)
            }
        };
        let start = node_at(a, &mut nodes, &mut take_id);
        let end = node_at(b, &mut nodes, &mut take_id);
        let id = take_id(c.identity.as_ref(), guid::to_entity_id(&c.guid));
        set_label(&mut labels, &id, "m", &c.label, &c.name);
        // End conditions by which end the connection sits at.
        let mut release = [
            Release {
                my: false,
                mz: false,
            },
            Release {
                my: false,
                mz: false,
            },
        ];
        let mut has_rel = [false, false];
        for e in &c.ends {
            let Some(conn) = plan.points.iter().find(|p| p.step == e.connection) else {
                continue;
            };
            let pos = units.point(&conn.coords, &conn.frame)?;
            let end_index = if norm(sub(pos, a)) <= TOL {
                0
            } else if norm(sub(pos, b)) <= TOL {
                1
            } else {
                return Err(block(
                    "UNSUPPORTED_FEATURE",
                    format!(
                        "{}: connects to {} between its ends; split the member at the connection",
                        c.guid, conn.guid
                    ),
                    vec![c.guid.clone(), conn.guid.clone()],
                ));
            };
            let dofs = e.condition.as_ref().map(|x| x.dofs);
            let resolve = |d: Dof| -> bool {
                // true = released
                match d {
                    Dof::Rigid => false,
                    Dof::Free => true,
                    Dof::Unset => answers.choice("connections:unset") == Some("pinned"),
                    Dof::Elastic(_) => answers.choice("connections:elastic") == Some("pinned"),
                }
            };
            has_rel[end_index] = true;
            release[end_index] = match dofs {
                Some(d) => Release {
                    my: resolve(d[4]),
                    mz: resolve(d[5]),
                },
                None => Release {
                    my: resolve(Dof::Unset),
                    mz: resolve(Dof::Unset),
                },
            };
        }
        for k in 0..2 {
            if !has_rel[k] {
                let pinned = answers.choice("connections:unset") == Some("pinned");
                release[k] = Release {
                    my: pinned,
                    mz: pinned,
                };
            }
        }
        let material = material_ids
            .get(&c.material)
            .cloned()
            .ok_or_else(|| err("DECISION_REQUIRED", "material:none is undecided"))?;
        let section = section_ids
            .get(&c.profile)
            .cloned()
            .ok_or_else(|| err("DECISION_REQUIRED", "section:none is undecided"))?;
        let (parent_member_id, station_range) = match &c.parent {
            Some((p, s, e)) => (Some(p.clone()), Some([*s, *e])),
            None => (None, None),
        };
        members.push(Member {
            id: id.clone(),
            start,
            end,
            material,
            section,
            local_y: y,
            release_start: release[0].clone(),
            release_end: release[1].clone(),
            parent_member_id,
            station_range,
            steel_design: None,
        });
        member_of_step.insert(c.step, (id, a, b, [x, y, cross(x, y)]));
    }

    // Load cases, loads and combinations.
    let mut load_cases = vec![];
    let mut loads = vec![];
    let mut case_of_step = BTreeMap::new();
    let world = |v: V3| plan.model_frame.dir(v);
    for c in &plan.cases {
        let id = take_id(c.identity.as_ref(), guid::to_entity_id(&c.guid));
        set_label(&mut labels, &id, "lc", &c.label, &c.name);
        case_of_step.insert(c.step, id.clone());
        load_cases.push(LoadCase {
            id: id.clone(),
            name: if c.name.is_empty() {
                id.clone()
            } else {
                c.name.clone()
            },
            category: c.category.clone(),
        });
        if let Some(sw) = c.self_weight {
            let lid = take_id(c.self_weight_identity.as_ref(), format!("{id}-sw"));
            set_label(&mut labels, &lid, "l", &c.self_weight_label, "");
            loads.push(Load::SelfWeight {
                id: lid,
                case: id.clone(),
                members: members.iter().map(|m| m.id.clone()).collect(),
                factor: -sw[2],
            });
        }
        for (step, factor) in &c.actions {
            let Some(action) = plan.actions.get(step) else {
                continue;
            };
            let fallback = guid::to_entity_id(&action.guid);
            // An action in several cases keeps its identity in the first.
            let lid = take_id(action.identity.as_ref(), fallback);
            set_label(&mut labels, &lid, "l", &action.label, &action.name);
            let six = |v: &[Q; 6]| -> Result<[f64; 6]> {
                let mut o = [0.; 6];
                for k in 0..6 {
                    o[k] = units.si(v[k])? * factor;
                }
                Ok(o)
            };
            let global6 = |o: [f64; 6]| {
                let f = world([o[0], o[1], o[2]]);
                let m = world([o[3], o[4], o[5]]);
                [f[0], f[1], f[2], m[0], m[1], m[2]]
            };
            let member_load = |member: u64,
                               local: bool,
                               at: f64,
                               v: [f64; 6],
                               lid: String,
                               loads: &mut Vec<Load>,
                               ledger: &mut Ledger|
             -> Result<()> {
                let (mid, a, b, axes) = &member_of_step[&member];
                let len = norm(sub(*b, *a));
                let t = at / len;
                if !(-1e-9..=1. + 1e-9).contains(&t) {
                    return Err(block(
                        "INVALID_EXCHANGE_FILE",
                        format!("{}: the load lies outside its member", action.guid),
                        vec![action.guid.clone()],
                    ));
                }
                let to_global = |v: [f64; 6]| -> [f64; 6] {
                    let f: V3 = std::array::from_fn(|i| (0..3).map(|k| axes[k][i] * v[k]).sum());
                    let m: V3 =
                        std::array::from_fn(|i| (0..3).map(|k| axes[k][i] * v[3 + k]).sum());
                    [f[0], f[1], f[2], m[0], m[1], m[2]]
                };
                if t <= 1e-9 || t >= 1. - 1e-9 {
                    let node = members
                        .iter()
                        .find(|m| &m.id == mid)
                        .map(|m| {
                            if t <= 0.5 {
                                m.start.clone()
                            } else {
                                m.end.clone()
                            }
                        })
                        .unwrap();
                    let values = if local { to_global(v) } else { global6(v) };
                    ledger.add(
                        "converted",
                        "point load at a member end",
                        "applied as a nodal load at the end node",
                        action.guid.clone(),
                    );
                    loads.push(Load::Nodal {
                        id: lid,
                        case: id.clone(),
                        node,
                        values,
                    });
                } else {
                    let values = if local { v } else { global6(v) };
                    loads.push(Load::Point {
                        id: lid,
                        case: id.clone(),
                        member: mid.clone(),
                        axes: if local {
                            "local".into()
                        } else {
                            "global".into()
                        },
                        station: t,
                        values,
                    });
                }
                Ok(())
            };
            match &action.kind {
                ActionKind::Nodal { connection, values } => {
                    let node = node_of_step[connection].clone();
                    loads.push(Load::Nodal {
                        id: lid,
                        case: id.clone(),
                        node,
                        values: global6(six(values)?),
                    });
                }
                ActionKind::Linear {
                    member,
                    local,
                    projected,
                    values,
                } => {
                    let (mid, a, b, _) = &member_of_step[member];
                    let mut q = [
                        units.si(values[0])? * factor,
                        units.si(values[1])? * factor,
                        units.si(values[2])? * factor,
                    ];
                    if !local {
                        q = world(q);
                    }
                    if *projected {
                        // Per projected length: a component along global
                        // direction k acts on L·sin(angle to k).
                        let x = unit(sub(*b, *a)).unwrap();
                        for (k, v) in q.iter_mut().enumerate() {
                            *v *= (1. - x[k] * x[k]).max(0.).sqrt();
                        }
                        ledger.add(
                            "converted",
                            "load per projected length",
                            "converted to load per true length",
                            action.guid.clone(),
                        );
                    }
                    loads.push(Load::Uniform {
                        id: lid,
                        case: id.clone(),
                        member: mid.clone(),
                        axes: if *local {
                            "local".into()
                        } else {
                            "global".into()
                        },
                        force_per_length: q,
                    });
                }
                ActionKind::Point {
                    member,
                    local,
                    at,
                    frame_step,
                    values,
                } => {
                    let frame = plan
                        .frames
                        .get(frame_step)
                        .copied()
                        .unwrap_or(Frame::IDENTITY);
                    let pos = units.point(at, &frame)?;
                    let (_, a, b, _) = &member_of_step[member];
                    let x = unit(sub(*b, *a)).unwrap();
                    let d = dot(sub(pos, *a), x);
                    let off = norm(sub(sub(pos, *a), scale(x, d)));
                    if off > TOL {
                        return Err(block(
                            "INVALID_EXCHANGE_FILE",
                            format!(
                                "{}: the point load is {off:.3e} m off its member",
                                action.guid
                            ),
                            vec![action.guid.clone()],
                        ));
                    }
                    member_load(
                        *member,
                        *local,
                        d,
                        six(values)?,
                        lid,
                        &mut loads,
                        &mut ledger,
                    )?;
                }
                ActionKind::Discrete {
                    member,
                    local,
                    items,
                } => {
                    for (k, (x, v)) in items.iter().enumerate() {
                        let item_id = if k == 0 {
                            lid.clone()
                        } else {
                            take_id(None, format!("{lid}-{}", k + 1))
                        };
                        member_load(
                            *member,
                            *local,
                            units.si(*x)?,
                            six(v)?,
                            item_id,
                            &mut loads,
                            &mut ledger,
                        )?;
                    }
                    if items.len() > 1 {
                        ledger.add(
                            "converted",
                            "discrete curve action",
                            "each load item becomes a point load",
                            action.guid.clone(),
                        );
                    }
                }
            }
        }
    }
    let mut combinations = vec![];
    for c in &plan.combinations {
        let id = take_id(c.identity.as_ref(), guid::to_entity_id(&c.guid));
        set_label(&mut labels, &id, "c", &c.label, &c.name);
        let purpose = match c.purpose.as_str() {
            p @ ("analysis" | "service" | "strength") => p.to_string(),
            p => answers
                .choice(&format!("purpose:{p}"))
                .unwrap_or("analysis")
                .to_string(),
        };
        let mut terms: Vec<Term> = vec![];
        for (step, f) in &c.terms {
            let case = case_of_step[step].clone();
            match terms.iter_mut().find(|t| t.case == case) {
                Some(t) => t.factor += f,
                None => terms.push(Term { case, factor: *f }),
            }
        }
        combinations.push(Combination {
            id,
            name: if c.name.is_empty() {
                "Combination".into()
            } else {
                c.name.clone()
            },
            purpose,
            terms,
        });
    }
    if load_cases.is_empty() {
        let id = take_id(None, "lc-imported".into());
        load_cases.push(LoadCase {
            id,
            name: "Imported (no load cases in file)".into(),
            category: "other".into(),
        });
        ledger.add(
            "converted",
            "load cases",
            "the file has none; an empty case was created because a project needs one",
            String::new(),
        );
    }

    let pid = plan.project_identity.get("EntityId").cloned();
    let project_id = take_id(pid.as_ref(), guid::to_entity_id(&plan.project_guid));
    let num = |k: &str| {
        plan.project_identity
            .get(k)
            .and_then(|v| v.parse::<f64>().ok())
    };
    let timeout = num("TimeoutMs")
        .filter(|t| (1000. ..=30000.).contains(t))
        .map_or(30000, |t| t as u32);
    let memory = num("MemoryLimitMiB")
        .filter(|t| (64. ..=512.).contains(t))
        .map_or(512, |t| t as u32);
    let display_units = plan
        .project_identity
        .get("DisplayUnits")
        .filter(|d| ["SI", "engineeringMetric"].contains(&d.as_str()))
        .cloned()
        .unwrap_or_else(|| "SI".into());
    let mut p = Project {
        schema_version: CURRENT_SCHEMA.into(),
        id: project_id,
        name: if plan.project_name.is_empty() {
            plan.report.source.file_name.clone()
        } else {
            plan.project_name.clone()
        },
        revision: 0,
        display_units,
        analysis_mode: if plan.planar {
            "planarXZ".into()
        } else {
            "spatial".into()
        },
        gravity: [0., 0., -9.80665],
        materials,
        sections,
        nodes,
        members,
        supports,
        load_cases,
        loads,
        combinations,
        analysis_settings: Settings {
            kind: "linearStatic".into(),
            formulation: "eulerBernoulli3D".into(),
            merge_tolerance: 1e-6,
            timeout_ms: timeout,
            memory_limit_mi_b: memory,
        },
        metadata: Metadata {
            description: format!(
                "Imported from {} ({}, SHA-256 {})",
                plan.report.source.file_name,
                plan.report.source.schema,
                &plan.report.source.sha256[..16]
            ),
            created_by: "exchange-v1 IFC import".into(),
            entity_labels: labels,
        },
        structure: Structure::default(),
        design_previews: vec![],
        mass_sources: vec![],
        response_spectra: vec![],
    };
    p.structure = Structure::initialise(&p);
    p.canonicalise();
    p.validate()?;
    Ok(Built {
        project: p,
        ledger: ledger.entries(),
    })
}
