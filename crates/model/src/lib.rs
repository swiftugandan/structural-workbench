use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;

mod migrate;
pub use migrate::{
    CURRENT_SCHEMA, LEGACY_SCHEMA_0_9, MigrationReport, import_project,
};
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diagnostic {
    pub code: String,
    pub message: String,
    pub severity: String,
    #[serde(rename = "entityIds")]
    pub entity_ids: Vec<String>,
    pub details: Value,
}
pub type Result<T> = std::result::Result<T, Diagnostic>;
pub fn err(code: &str, message: impl Into<String>) -> Diagnostic {
    Diagnostic {
        code: code.into(),
        message: message.into(),
        severity: "error".into(),
        entity_ids: vec![],
        details: json!({}),
    }
}
macro_rules! record { ($n:ident {$($f:ident:$t:ty),* $(,)?}) => {#[derive(Clone,Debug,Serialize,Deserialize)] #[serde(rename_all="camelCase",deny_unknown_fields)] pub struct $n {$(pub $f:$t),*}}; }
record!(Node {
    id: String,
    position: [f64; 3]
});

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Material {
    pub id: String,
    pub name: String,
    #[serde(rename = "E")]
    pub e: f64,
    pub nu: f64,
    pub density: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Section {
    pub id: String,
    pub name: String,
    #[serde(rename = "A")]
    pub a: f64,
    #[serde(rename = "Iy")]
    pub iy: f64,
    #[serde(rename = "Iz")]
    pub iz: f64,
    #[serde(rename = "J")]
    pub j: f64,
    pub cy: f64,
    pub cz: f64,
    pub provenance: String,
}
record!(Release { my: bool, mz: bool });
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Member {
    pub id: String,
    pub start: String,
    pub end: String,
    pub material: String,
    pub section: String,
    pub local_y: [f64; 3],
    pub release_start: Release,
    pub release_end: Release,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_member_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub station_range: Option<[f64; 2]>,
}
record!(Support {
    id: String,
    node: String,
    fixed: [bool; 6],
    prescribed: [f64; 6]
});
record!(LoadCase {
    id: String,
    name: String,
    category: String
});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum Load {
    #[serde(rename = "nodal")]
    Nodal {
        id: String,
        case: String,
        node: String,
        values: [f64; 6],
    },
    #[serde(rename = "uniform")]
    Uniform {
        id: String,
        case: String,
        member: String,
        axes: String,
        #[serde(rename = "forcePerLength")]
        force_per_length: [f64; 3],
    },
    #[serde(rename = "point")]
    Point {
        id: String,
        case: String,
        member: String,
        axes: String,
        station: f64,
        values: [f64; 6],
    },
    #[serde(rename = "selfWeight")]
    SelfWeight {
        id: String,
        case: String,
        members: Vec<String>,
        factor: f64,
    },
}
impl Load {
    pub fn id(&self) -> &str {
        match self {
            Self::Nodal { id, .. }
            | Self::Uniform { id, .. }
            | Self::Point { id, .. }
            | Self::SelfWeight { id, .. } => id,
        }
    }
    pub fn case(&self) -> &str {
        match self {
            Self::Nodal { case, .. }
            | Self::Uniform { case, .. }
            | Self::Point { case, .. }
            | Self::SelfWeight { case, .. } => case,
        }
    }
}
record!(Term {
    case: String,
    factor: f64
});
record!(Combination{id:String,name:String,purpose:String,terms:Vec<Term>});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    #[serde(rename = "type")]
    pub kind: String,
    pub formulation: String,
    pub merge_tolerance: f64,
    pub timeout_ms: u32,
    pub memory_limit_mi_b: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Metadata {
    pub description: String,
    pub created_by: String,
    #[serde(default)]
    pub entity_labels: std::collections::BTreeMap<String, String>,
}
record!(Project{schema_version:String,id:String,name:String,revision:u64,display_units:String,analysis_mode:String,gravity:[f64;3],materials:Vec<Material>,sections:Vec<Section>,nodes:Vec<Node>,members:Vec<Member>,supports:Vec<Support>,load_cases:Vec<LoadCase>,loads:Vec<Load>,combinations:Vec<Combination>,analysis_settings:Settings,metadata:Metadata});
impl Project {
    pub fn parse(s: &str) -> Result<Self> {
        Ok(import_project(s)?.0)
    }
    pub fn canonicalise(&mut self) {
        // Labels are presentation metadata. Internal IDs and references never change.
        let groups: Vec<(&str, Vec<String>)> = vec![
            ("n", self.nodes.iter().map(|x| x.id.clone()).collect()),
            ("m", self.members.iter().map(|x| x.id.clone()).collect()),
            ("s", self.supports.iter().map(|x| x.id.clone()).collect()),
            ("l", self.loads.iter().map(|x| x.id().to_string()).collect()),
            ("mat", self.materials.iter().map(|x| x.id.clone()).collect()),
            ("sec", self.sections.iter().map(|x| x.id.clone()).collect()),
            ("lc", self.load_cases.iter().map(|x| x.id.clone()).collect()),
            (
                "c",
                self.combinations.iter().map(|x| x.id.clone()).collect(),
            ),
        ];
        let mut used = BTreeSet::new();
        for (prefix, ids) in groups {
            let mut next = self
                .metadata
                .entity_labels
                .values()
                .filter_map(|v| v.strip_prefix(prefix)?.parse::<u32>().ok().map(u64::from))
                .max()
                .unwrap_or(0)
                .saturating_add(1);
            for id in ids {
                let valid = self.metadata.entity_labels.get(&id).is_some_and(|label| {
                    label
                        .strip_prefix(prefix)
                        .and_then(|n| n.parse::<u32>().ok().map(u64::from))
                        .is_some_and(|n| n > 0 && label == &format!("{prefix}{n}"))
                        && used.insert(label.clone())
                });
                if !valid {
                    let label = format!("{prefix}{next}");
                    next += 1;
                    used.insert(label.clone());
                    self.metadata.entity_labels.insert(id, label);
                }
            }
        }

        self.nodes.sort_by(|a, b| a.id.cmp(&b.id));
        self.members.sort_by(|a, b| a.id.cmp(&b.id));
        self.materials.sort_by(|a, b| a.id.cmp(&b.id));
        self.sections.sort_by(|a, b| a.id.cmp(&b.id));
        self.supports.sort_by(|a, b| a.id.cmp(&b.id));
        self.load_cases.sort_by(|a, b| a.id.cmp(&b.id));
        self.loads.sort_by(|a, b| a.id().cmp(b.id()));
        self.combinations.sort_by(|a, b| a.id.cmp(&b.id));
        for c in &mut self.combinations {
            c.terms.sort_by(|a, b| a.case.cmp(&b.case));
        }
    }
    pub fn hash(&self) -> String {
        let mut p = self.clone();
        p.canonicalise();
        let mut v = serde_json::to_value(p).unwrap();
        for k in ["id", "name", "revision", "displayUnits", "metadata"] {
            v.as_object_mut().unwrap().remove(k);
        }
        fn clean(v: &mut Value) {
            match v {
                Value::Object(o) => {
                    o.remove("name");
                    o.remove("provenance");
                    for x in o.values_mut() {
                        clean(x)
                    }
                }
                Value::Array(a) => {
                    for x in a {
                        clean(x)
                    }
                }
                Value::Number(n) => {
                    if n.as_f64() == Some(0.) {
                        *v = json!(0.0)
                    }
                }
                _ => {}
            }
        }
        clean(&mut v);
        digest(&serde_json::to_vec(&v).unwrap())
    }
    pub fn validate(&self) -> Result<()> {
        if self.schema_version != CURRENT_SCHEMA {
            return Err(err(
                "UNSUPPORTED_SCHEMA",
                format!("Only project schema {CURRENT_SCHEMA} is supported"),
            ));
        }
        if !["spatial", "planarXZ"].contains(&self.analysis_mode.as_str())
            || self.analysis_settings.kind != "linearStatic"
            || self.analysis_settings.formulation != "eulerBernoulli3D"
        {
            return Err(err(
                "UNSUPPORTED_FEATURE",
                "Only linear Euler Bernoulli frame analysis is available",
            ));
        }
        if !["SI", "engineeringMetric"].contains(&self.display_units.as_str())
            || self.analysis_settings.merge_tolerance != 1e-6
            || !(1000..=30000).contains(&self.analysis_settings.timeout_ms)
            || !(64..=512).contains(&self.analysis_settings.memory_limit_mi_b)
        {
            return Err(err("INVALID_SCHEMA", "Invalid units or analysis settings"));
        }
        if self.nodes.is_empty()
            || self.members.is_empty()
            || self.materials.is_empty()
            || self.sections.is_empty()
            || self.load_cases.is_empty()
        {
            return Err(err(
                "INVALID_SCHEMA",
                "Model needs nodes, members, materials, sections and a load case",
            ));
        }
        if self.nodes.len() > 5000
            || self.members.len() > 10000
            || self.loads.len() > 100000
            || self.load_cases.len() > 100
            || self.combinations.len() > 500
            || self.sections.len() > 10000
            || self.materials.len() > 1000
            || self.supports.len() > 5000
        {
            return Err(err(
                "MEMORY_LIMIT",
                "Entity count exceeds supported contract",
            ));
        }
        let mut all = BTreeSet::new();
        for id in self
            .nodes
            .iter()
            .map(|x| &x.id)
            .chain(self.members.iter().map(|x| &x.id))
            .chain(self.materials.iter().map(|x| &x.id))
            .chain(self.sections.iter().map(|x| &x.id))
            .chain(self.supports.iter().map(|x| &x.id))
            .chain(self.load_cases.iter().map(|x| &x.id))
            .chain(self.combinations.iter().map(|x| &x.id))
        {
            check_id(id)?;
            if !all.insert(id.as_str()) {
                return Err(err("DUPLICATE_ID", format!("Duplicate ID {id}")));
            }
        }
        for l in &self.loads {
            check_id(l.id())?;
            if !all.insert(l.id()) {
                return Err(err("DUPLICATE_ID", l.id()));
            }
        }
        check_id(&self.id)?;
        for name in [&self.name, &self.metadata.created_by]
            .into_iter()
            .chain(self.materials.iter().map(|x| &x.name))
            .chain(self.sections.iter().map(|x| &x.name))
            .chain(self.sections.iter().map(|x| &x.provenance))
            .chain(self.load_cases.iter().map(|x| &x.name))
            .chain(self.combinations.iter().map(|x| &x.name))
        {
            if name.chars().count() > 256 {
                return Err(err("INVALID_SCHEMA", "Label exceeds 256 characters"));
            }
        }
        if self.metadata.description.len() > 4096 {
            return Err(err("INVALID_SCHEMA", "Metadata too long"));
        }
        for n in &self.nodes {
            if n.position.iter().any(|x| !x.is_finite() || x.abs() > 1e7) {
                return Err(err(
                    "INVALID_SCHEMA",
                    format!("Invalid coordinate at {}", n.id),
                ));
            }
        }
        for a in 0..3 {
            let lo = self
                .nodes
                .iter()
                .map(|n| n.position[a])
                .fold(f64::INFINITY, f64::min);
            let hi = self
                .nodes
                .iter()
                .map(|n| n.position[a])
                .fold(f64::NEG_INFINITY, f64::max);
            if hi - lo > 1e6 {
                return Err(err("INVALID_SCHEMA", "Model extent exceeds 1e6 m"));
            }
        }
        for m in &self.materials {
            if !m.e.is_finite()
                || m.e <= 0.
                || !m.nu.is_finite()
                || m.nu <= -1.
                || m.nu >= 0.5
                || !m.density.is_finite()
                || m.density < 0.
            {
                return Err(err("INVALID_MATERIAL", m.id.clone()));
            }
        }
        for s in &self.sections {
            if [s.a, s.iy, s.iz, s.j, s.cy, s.cz]
                .iter()
                .any(|v| !v.is_finite() || *v <= 0.)
            {
                return Err(err("INVALID_SECTION", s.id.clone()));
            }
        }
        for m in &self.members {
            match (&m.parent_member_id, m.station_range) {
                (Some(parent), Some([a, b]))
                    if a.is_finite() && b.is_finite() && a >= 0. && b <= 1. && a < b =>
                {
                    check_id(parent)?;
                }
                (None, None) => {}
                _ => {
                    return Err(err(
                        "INVALID_SCHEMA",
                        "Member provenance needs parent ID and increasing station range within [0,1]",
                    ));
                }
            }
            let a = self
                .nodes
                .iter()
                .find(|n| n.id == m.start)
                .ok_or_else(|| err("DANGLING_REFERENCE", &m.start))?;
            let b = self
                .nodes
                .iter()
                .find(|n| n.id == m.end)
                .ok_or_else(|| err("DANGLING_REFERENCE", &m.end))?;
            if !self.materials.iter().any(|x| x.id == m.material)
                || !self.sections.iter().any(|x| x.id == m.section)
            {
                return Err(err("DANGLING_REFERENCE", &m.id));
            }
            let d: [f64; 3] = std::array::from_fn(|i| b.position[i] - a.position[i]);
            let l = dot(d, d).sqrt();
            if l < 1e-6 {
                return Err(err("ZERO_LENGTH_MEMBER", &m.id));
            }
            let yy = dot(m.local_y, m.local_y);
            let proj = dot(d, m.local_y) / l;
            if !yy.is_finite() || yy <= 0. || (yy - proj * proj).max(0.).sqrt() < 1e-8 * yy.sqrt() {
                return Err(err("INVALID_LOCAL_AXIS", &m.id));
            }
        }
        let mut supported = BTreeSet::new();
        for s in &self.supports {
            if !self.nodes.iter().any(|n| n.id == s.node) {
                return Err(err("DANGLING_REFERENCE", &s.node));
            }
            if !supported.insert(&s.node) {
                return Err(err("INVALID_RESTRAINT", "Multiple supports at one node"));
            }
            for i in 0..6 {
                if !s.prescribed[i].is_finite() || (!s.fixed[i] && s.prescribed[i] != 0.) {
                    return Err(err("INVALID_RESTRAINT", &s.id));
                }
                if self.analysis_mode == "planarXZ"
                    && [1, 3, 5].contains(&i)
                    && s.prescribed[i] != 0.
                {
                    return Err(err(
                        "INVALID_RESTRAINT",
                        "Prescribed motion conflicts with planar constraint",
                    ));
                }
            }
        }
        let mut weights = BTreeSet::new();
        for l in &self.loads {
            if !self.load_cases.iter().any(|c| c.id == l.case()) {
                return Err(err("DANGLING_REFERENCE", l.case()));
            }
            match l {
                Load::Nodal { node, values, .. } => {
                    if !self.nodes.iter().any(|n| n.id == *node) {
                        return Err(err("DANGLING_REFERENCE", node));
                    }
                    finite(values)?
                }
                Load::Uniform {
                    member,
                    axes,
                    force_per_length,
                    ..
                } => {
                    if !self.members.iter().any(|m| m.id == *member) {
                        return Err(err("DANGLING_REFERENCE", member));
                    }
                    if !["local", "global"].contains(&axes.as_str()) {
                        return Err(err("INVALID_LOAD", "Unknown load axes"));
                    }
                    finite(force_per_length)?
                }
                Load::Point {
                    member,
                    axes,
                    station,
                    values,
                    ..
                } => {
                    if !self.members.iter().any(|m| m.id == *member) {
                        return Err(err("DANGLING_REFERENCE", member));
                    }
                    if !["local", "global"].contains(&axes.as_str()) {
                        return Err(err("INVALID_LOAD", "Unknown load axes"));
                    }
                    if !station.is_finite() || *station <= 0.0 || *station >= 1.0 {
                        return Err(err(
                            "INVALID_LOAD",
                            "Interior point station must be strictly between 0 and 1; use a nodal load at an end",
                        ));
                    }
                    finite(values)?
                }
                Load::SelfWeight {
                    members,
                    factor,
                    case,
                    ..
                } => {
                    finite(&[*factor])?;
                    for id in members {
                        if !self.members.iter().any(|m| m.id == *id) {
                            return Err(err("DANGLING_REFERENCE", id));
                        }
                        if !weights.insert((case, id)) {
                            return Err(err("DUPLICATE_SELF_WEIGHT", id));
                        }
                    }
                }
            }
        }
        for c in &self.load_cases {
            if !["dead", "live", "wind", "other"].contains(&c.category.as_str()) {
                return Err(err("INVALID_SCHEMA", "Unknown load category"));
            }
        }
        for c in &self.combinations {
            let mut ids = BTreeSet::new();
            if c.terms.is_empty()
                || c.terms.len() > 100
                || !["analysis", "service", "strength"].contains(&c.purpose.as_str())
            {
                return Err(err("INVALID_LOAD", "Invalid combination"));
            }
            for t in &c.terms {
                if !ids.insert(&t.case) {
                    return Err(err("INVALID_LOAD", "Duplicate combination term"));
                }
                if !self.load_cases.iter().any(|x| x.id == t.case) {
                    return Err(err("DANGLING_REFERENCE", &t.case));
                }
                finite(&[t.factor])?
            }
        }
        finite(&self.gravity)?;
        Ok(())
    }
}
pub fn finite(v: &[f64]) -> Result<()> {
    if v.iter().all(|x| x.is_finite()) {
        Ok(())
    } else {
        Err(err("NONFINITE_RESULT", "Non-finite value"))
    }
}
pub fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    (0..3).map(|i| a[i] * b[i]).sum()
}
pub fn digest(b: &[u8]) -> String {
    format!("{:x}", Sha256::digest(b))
}
fn check_id(s: &str) -> Result<()> {
    if s.is_empty()
        || s.len() > 64
        || !s.as_bytes()[0].is_ascii_alphabetic()
        || !s
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err(err("INVALID_SCHEMA", "Invalid entity ID"));
    }
    Ok(())
}
