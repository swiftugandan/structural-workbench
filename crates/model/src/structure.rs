use crate::{Project, Result, digest, err};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Structure {
    pub storeys: Vec<Storey>,
    pub physical_members: Vec<PhysicalMember>,
    pub grids: Vec<Grid>,
    pub layers: Vec<Collection>,
    pub groups: Vec<Collection>,
    pub joints: Vec<Joint>,
    pub support_details: Vec<SupportDetail>,
    pub design_objects: Vec<DesignObject>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Storey {
    pub id: String,
    pub name: String,
    pub elevation: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PhysicalMember {
    pub id: String,
    pub name: String,
    pub role: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stair_risers: Option<u32>,
    pub storey_id: Option<String>,
    pub analytical_member_ids: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Grid {
    pub id: String,
    pub name: String,
    pub start: [f64; 3],
    pub end: [f64; 3],
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntityRef {
    pub kind: String,
    pub id: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub members: Vec<EntityRef>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Joint {
    pub id: String,
    pub name: String,
    pub node_id: String,
    pub storey_id: Option<String>,
    pub detail_status: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SupportDetail {
    pub id: String,
    pub name: String,
    pub support_id: String,
    pub detail_status: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DesignObject {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub storey_id: Option<String>,
    pub preview_id: String,
    pub physical_member_id: Option<String>,
    pub support_id: Option<String>,
    pub analysis_status: String,
}
pub fn structure_id(prefix: &str, source: &str) -> String {
    format!("{}{}", prefix, &digest(source.as_bytes())[..20])
}
impl Structure {
    pub fn initialise(p: &Project) -> Self {
        let mut s = Self::default();
        let mut roots: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for m in &p.members {
            roots
                .entry(m.parent_member_id.as_ref().unwrap_or(&m.id).clone())
                .or_default()
                .push(m.id.clone());
        }
        for (root, ids) in roots {
            s.physical_members.push(PhysicalMember {
                id: structure_id("pm", &root),
                name: root,
                role: "unassigned".into(),
                stair_risers: None,
                storey_id: None,
                analytical_member_ids: ids,
            });
        }
        s.sync_records(p);
        s
    }
    pub fn canonicalise(&mut self) {
        self.storeys.sort_by(|a, b| a.id.cmp(&b.id));
        self.physical_members.sort_by(|a, b| a.id.cmp(&b.id));
        self.grids.sort_by(|a, b| a.id.cmp(&b.id));
        self.layers.sort_by(|a, b| a.id.cmp(&b.id));
        self.groups.sort_by(|a, b| a.id.cmp(&b.id));
        self.joints.sort_by(|a, b| a.id.cmp(&b.id));
        self.support_details.sort_by(|a, b| a.id.cmp(&b.id));
        self.design_objects.sort_by(|a, b| a.id.cmp(&b.id));
        for m in &mut self.physical_members {
            m.analytical_member_ids.sort();
        }
        for g in self.layers.iter_mut().chain(self.groups.iter_mut()) {
            g.members.sort();
        }
    }
    pub fn hash(&self) -> String {
        let mut s = self.clone();
        s.canonicalise();
        digest(&serde_json::to_vec(&s).unwrap())
    }
    pub fn sync_records(&mut self, p: &Project) {
        let node_ids: BTreeSet<_> = p.nodes.iter().map(|n| n.id.as_str()).collect();
        self.joints
            .retain(|j| node_ids.contains(j.node_id.as_str()));
        let mut joint_nodes: BTreeSet<_> = self.joints.iter().map(|j| j.node_id.clone()).collect();
        for n in &p.nodes {
            if joint_nodes.insert(n.id.clone()) {
                self.joints.push(Joint {
                    id: structure_id("jt", &n.id),
                    name: format!("Joint {}", n.id),
                    node_id: n.id.clone(),
                    storey_id: None,
                    detail_status: "notDesigned".into(),
                });
            }
        }
        let support_ids: BTreeSet<_> = p.supports.iter().map(|s| s.id.as_str()).collect();
        self.support_details
            .retain(|d| support_ids.contains(d.support_id.as_str()));
        let mut detailed_supports: BTreeSet<_> = self
            .support_details
            .iter()
            .map(|d| d.support_id.clone())
            .collect();
        for x in &p.supports {
            if detailed_supports.insert(x.id.clone()) {
                self.support_details.push(SupportDetail {
                    id: structure_id("sd", &x.id),
                    name: format!("Support {}", x.id),
                    support_id: x.id.clone(),
                    detail_status: "notDesigned".into(),
                });
            }
        }
        self.design_objects
            .retain(|d| p.design_previews.iter().any(|x| x.id == d.preview_id));
        for d in &p.design_previews {
            let owner = d
                .target_id
                .as_ref()
                .and_then(|id| {
                    self.physical_members
                        .iter()
                        .find(|m| m.analytical_member_ids.contains(id))
                })
                .map(|m| m.id.clone());
            let support = if d.kind == "padFooting" {
                d.target_id.clone()
            } else {
                None
            };
            if let Some(existing) = self
                .design_objects
                .iter_mut()
                .find(|x| x.preview_id == d.id)
            {
                if owner.is_some() {
                    existing.physical_member_id = owner;
                }
                existing.support_id = support;
            } else {
                self.design_objects.push(DesignObject {
                    id: structure_id("do", &d.id),
                    name: match d.kind.as_str() {
                        "rcBeam" => "RC beam",
                        "rcColumn" => "RC column",
                        "slab" => "Slab",
                        _ => "Foundation",
                    }
                    .into(),
                    kind: d.kind.clone(),
                    storey_id: None,
                    preview_id: d.id.clone(),
                    physical_member_id: owner,
                    support_id: support,
                    analysis_status: "unverified".into(),
                });
            }
        }
    }
    pub fn refs(&self, p: &Project) -> BTreeSet<EntityRef> {
        let mut refs = BTreeSet::new();
        for (kind, ids) in [
            (
                "physicalMember",
                self.physical_members
                    .iter()
                    .map(|x| x.id.clone())
                    .collect::<Vec<_>>(),
            ),
            (
                "designObject",
                self.design_objects.iter().map(|x| x.id.clone()).collect(),
            ),
            ("joint", self.joints.iter().map(|x| x.id.clone()).collect()),
            ("support", p.supports.iter().map(|x| x.id.clone()).collect()),
            ("grid", self.grids.iter().map(|x| x.id.clone()).collect()),
        ] {
            for id in ids {
                refs.insert(EntityRef {
                    kind: kind.into(),
                    id,
                });
            }
        }
        refs
    }
    pub fn validate(&self, p: &Project) -> Result<()> {
        let analytical_ids: BTreeSet<_> = p.members.iter().map(|m| m.id.as_str()).collect();
        let node_ids: BTreeSet<_> = p.nodes.iter().map(|n| n.id.as_str()).collect();
        let support_ids: BTreeSet<_> = p.supports.iter().map(|s| s.id.as_str()).collect();
        if [
            self.storeys.len(),
            self.physical_members.len(),
            self.grids.len(),
            self.layers.len(),
            self.groups.len(),
            self.joints.len(),
            self.support_details.len(),
            self.design_objects.len(),
        ]
        .iter()
        .any(|n| *n > 25000)
            || self
                .layers
                .iter()
                .chain(self.groups.iter())
                .any(|c| c.members.len() > 25000)
        {
            return Err(err("MEMORY_LIMIT", "Structure collection limit exceeded"));
        }
        let mut ids: BTreeSet<String> = p
            .nodes
            .iter()
            .map(|x| x.id.clone())
            .chain(p.members.iter().map(|x| x.id.clone()))
            .chain(p.supports.iter().map(|x| x.id.clone()))
            .chain(p.design_previews.iter().map(|x| x.id.clone()))
            .chain(p.materials.iter().map(|x| x.id.clone()))
            .chain(p.sections.iter().map(|x| x.id.clone()))
            .chain(p.loads.iter().map(|x| x.id().into()))
            .chain(p.load_cases.iter().map(|x| x.id.clone()))
            .chain(p.combinations.iter().map(|x| x.id.clone()))
            .collect();
        let mut check = |id: &str, name: &str| -> Result<()> {
            crate::check_id(id)?;
            if !ids.insert(id.into()) {
                return Err(err("DUPLICATE_ID", id));
            }
            if name.trim().is_empty() || name.len() > 256 {
                return Err(err(
                    "INVALID_SCHEMA",
                    "Structure name must contain 1–256 bytes",
                ));
            }
            Ok(())
        };
        for x in &self.storeys {
            check(&x.id, &x.name)?;
            if !x.elevation.is_finite() {
                return Err(err("NONFINITE_INPUT", "Storey elevation"));
            }
        }
        let level = |id: &Option<String>| -> Result<()> {
            if id
                .as_ref()
                .is_some_and(|id| !self.storeys.iter().any(|s| &s.id == id))
            {
                return Err(err("DANGLING_REFERENCE", "Unknown storey"));
            }
            Ok(())
        };
        let mut owned = BTreeSet::new();
        for x in &self.physical_members {
            check(&x.id, &x.name)?;
            level(&x.storey_id)?;
            if ![
                "unassigned",
                "beam",
                "column",
                "brace",
                "slab",
                "stair",
                "landing",
            ]
            .contains(&x.role.as_str())
                || x.analytical_member_ids.is_empty()
            {
                return Err(err(
                    "INVALID_SCHEMA",
                    "Physical member needs valid role and analytical members",
                ));
            }
            if x.stair_risers.is_some_and(|n| {
                !(2..=30).contains(&n) || x.role != "stair" || x.analytical_member_ids.len() != 1
            }) {
                return Err(err(
                    "UNSUPPORTED_FEATURE",
                    "Stair tread display needs one flight with 2 to 30 risers; clear tread metadata before splitting or reclassifying",
                ));
            }
            for id in &x.analytical_member_ids {
                if !analytical_ids.contains(id.as_str()) {
                    return Err(err("DANGLING_REFERENCE", "Unknown analytical member"));
                }
                if !owned.insert(id) {
                    return Err(err(
                        "INVALID_SCHEMA",
                        "Analytical member has multiple physical owners",
                    ));
                }
            }
        }
        if owned.len() != p.members.len() {
            return Err(err(
                "INVALID_SCHEMA",
                "Every analytical member needs one physical owner",
            ));
        }
        for x in &self.grids {
            check(&x.id, &x.name)?;
            if x.start.iter().chain(x.end.iter()).any(|v| !v.is_finite()) || x.start == x.end {
                return Err(err(
                    "INVALID_SCHEMA",
                    "Grid needs distinct finite endpoints",
                ));
            }
        }
        let refs = self.refs(p);
        for x in self.layers.iter().chain(self.groups.iter()) {
            check(&x.id, &x.name)?;
            let mut seen = BTreeSet::new();
            for r in &x.members {
                if !refs.contains(r) {
                    return Err(err("DANGLING_REFERENCE", "Unknown collection member"));
                }
                if !seen.insert(r) {
                    return Err(err("INVALID_SCHEMA", "Duplicate collection member"));
                }
            }
        }
        let mut nodes = BTreeSet::new();
        for x in &self.joints {
            check(&x.id, &x.name)?;
            level(&x.storey_id)?;
            if !node_ids.contains(x.node_id.as_str()) || !nodes.insert(&x.node_id) {
                return Err(err(
                    "DANGLING_REFERENCE",
                    "Joint must identify one unique node",
                ));
            }
            if x.detail_status != "notDesigned" {
                return Err(err(
                    "UNSUPPORTED_FEATURE",
                    "Connection design is unavailable",
                ));
            }
        }
        if nodes.len() != p.nodes.len() {
            return Err(err("INVALID_SCHEMA", "Every node needs one joint"));
        }
        let mut supports = BTreeSet::new();
        for x in &self.support_details {
            check(&x.id, &x.name)?;
            if !support_ids.contains(x.support_id.as_str()) || !supports.insert(&x.support_id) {
                return Err(err(
                    "DANGLING_REFERENCE",
                    "Support detail must identify one unique restraint",
                ));
            }
            if x.detail_status != "notDesigned" {
                return Err(err(
                    "UNSUPPORTED_FEATURE",
                    "Support hardware design is unavailable",
                ));
            }
        }
        if supports.len() != p.supports.len() {
            return Err(err(
                "INVALID_SCHEMA",
                "Every support needs one detail record",
            ));
        }
        let mut drafts = BTreeSet::new();
        for x in &self.design_objects {
            check(&x.id, &x.name)?;
            level(&x.storey_id)?;
            let d = p
                .design_previews
                .iter()
                .find(|d| d.id == x.preview_id)
                .ok_or_else(|| err("DANGLING_REFERENCE", "Design object draft missing"))?;
            if !drafts.insert(&x.preview_id)
                || x.kind != d.kind
                || x.analysis_status != "unverified"
            {
                return Err(err("INVALID_SCHEMA", "Design object kind/status mismatch"));
            }
            if x.physical_member_id.as_ref().is_some_and(|id| {
                !d.binds_member() || !self.physical_members.iter().any(|m| &m.id == id)
            }) {
                return Err(err("DANGLING_REFERENCE", "Invalid physical design binding"));
            }
            if d.binds_member() {
                if let Some(target) = &d.target_id {
                    let pm = self
                        .physical_members
                        .iter()
                        .find(|m| m.analytical_member_ids.contains(target))
                        .ok_or_else(|| err("DANGLING_REFERENCE", "RC target missing"))?;
                    if x.physical_member_id.as_ref() != Some(&pm.id) {
                        return Err(err(
                            "INVALID_SCHEMA",
                            "RC physical/analytical bindings disagree",
                        ));
                    }
                }
            }
            if x.support_id
                != if d.kind == "padFooting" {
                    d.target_id.clone()
                } else {
                    None
                }
            {
                return Err(err(
                    "INVALID_SCHEMA",
                    "Foundation support binding disagrees",
                ));
            }
        }
        if drafts.len() != p.design_previews.len() {
            return Err(err(
                "INVALID_SCHEMA",
                "Every design draft needs one physical object",
            ));
        }
        Ok(())
    }
}
