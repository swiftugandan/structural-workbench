//! Authoritative structure editing and atomic analytical/physical reconciliation.
use serde_json::{Value, json};
use workbench_model::{
    Project, Result, err,
    structure::{PhysicalMember, structure_id},
};

pub fn edit(v: &mut Value, c: &Value) -> Result<()> {
    let a = &c["args"];
    let key = a["collection"].as_str().unwrap_or("");
    if ![
        "storeys",
        "physicalMembers",
        "grids",
        "layers",
        "groups",
        "joints",
        "supportDetails",
        "designObjects",
    ]
    .contains(&key)
    {
        return Err(err("INVALID_SCHEMA", "Unknown structure collection"));
    }
    let items = v["structure"][key].as_array_mut().unwrap();
    let id = if c["type"] == "DeleteStructureEntity" {
        &a["id"]
    } else {
        &a["entity"]["id"]
    };
    let found = items.iter().position(|x| &x["id"] == id);
    if c["type"] == "DeleteStructureEntity" {
        if !["storeys", "grids", "layers", "groups"].contains(&key) {
            return Err(err(
                "INVALID_SCHEMA",
                "Delete bound entities through their analytical geometry or design draft",
            ));
        }
        items.remove(found.ok_or_else(|| err("DANGLING_REFERENCE", "Unknown structure entity"))?);
    } else {
        let mut entity = a["entity"].clone();
        if key == "storeys" {
            super::quantity(&mut entity["elevation"], "length")?;
        }
        if key == "grids" {
            for axis in ["start", "end"] {
                for x in entity[axis]
                    .as_array_mut()
                    .ok_or_else(|| err("INVALID_SCHEMA", "Grid endpoints required"))?
                {
                    super::quantity(x, "length")?;
                }
            }
        }
        let mode = a["existence"].as_str().unwrap_or("");
        if !["create", "update"].contains(&mode) || (mode == "create") != found.is_none() {
            return Err(err(
                "REVISION_CONFLICT",
                "Structure entity existence changed",
            ));
        }
        if let Some(i) = found {
            let immutable: &[&str] = match key {
                "physicalMembers" => &["analyticalMemberIds"],
                "joints" => &["nodeId", "detailStatus"],
                "supportDetails" => &["supportId", "detailStatus"],
                "designObjects" => &[
                    "previewId",
                    "kind",
                    "physicalMemberId",
                    "supportId",
                    "analysisStatus",
                ],
                _ => &[],
            };
            for field in immutable {
                if items[i][*field] != entity[*field] {
                    return Err(err(
                        "INVALID_SCHEMA",
                        format!("{field} is controlled by its source entity"),
                    ));
                }
            }
            items[i] = entity;
        } else {
            if !["storeys", "grids", "layers", "groups"].contains(&key) {
                return Err(err(
                    "INVALID_SCHEMA",
                    "Create bound entities through geometry or a design draft",
                ));
            }
            items.push(entity);
        }
    }
    // No automatic repair of authored changes: dangling references reject atomically.
    Project::parse(&v.to_string())?;
    Ok(())
}

pub fn reconcile(v: &mut Value, _old: &Project) -> Result<()> {
    let mut p: Project =
        serde_json::from_value(v.clone()).map_err(|e| err("INVALID_SCHEMA", e.to_string()))?;
    let mut s = p.structure.clone();
    for m in &p.members {
        if s.physical_members
            .iter()
            .any(|x| x.analytical_member_ids.contains(&m.id))
        {
            continue;
        }
        s.physical_members.push(PhysicalMember {
            id: structure_id("pm", &m.id),
            name: m.id.clone(),
            role: "unassigned".into(),
            stair_risers: None,
            storey_id: None,
            analytical_member_ids: vec![m.id.clone()],
        });
    }
    for x in &mut s.physical_members {
        x.analytical_member_ids
            .retain(|id| p.members.iter().any(|m| &m.id == id));
    }
    s.physical_members
        .retain(|x| !x.analytical_member_ids.is_empty());
    for d in &mut p.design_previews {
        let exists = d.target_id.as_ref().is_none_or(|id| {
            if d.kind == "rcBeam" {
                p.members.iter().any(|m| &m.id == id)
            } else {
                p.supports.iter().any(|s| &s.id == id)
            }
        });
        if !exists {
            d.target_id = None;
        }
    }
    for d in &mut s.design_objects {
        if d.physical_member_id
            .as_ref()
            .is_some_and(|id| !s.physical_members.iter().any(|m| &m.id == id))
        {
            d.physical_member_id = None;
        }
    }
    s.sync_records(&p);
    let valid = s.refs(&p);
    for x in s.layers.iter_mut().chain(s.groups.iter_mut()) {
        x.members.retain(|r| valid.contains(r));
    }
    p.structure = s;
    *v = serde_json::to_value(p).unwrap();
    Ok(())
}

// Called with the exact source→copy mapping; never infer copies from coordinates.
pub fn copy_member(v: &mut Value, p: &Project, source: &str, target: &str, generation: &str) {
    let Some(owner) = p
        .structure
        .physical_members
        .iter()
        .find(|x| x.analytical_member_ids.iter().any(|id| id == source))
    else {
        return;
    };
    let id = structure_id("pm", &format!("{}:{generation}", owner.id));
    let list = v["structure"]["physicalMembers"].as_array_mut().unwrap();
    if let Some(x) = list.iter_mut().find(|x| x["id"] == id) {
        x["analyticalMemberIds"]
            .as_array_mut()
            .unwrap()
            .push(json!(target));
    } else {
        let mut x = serde_json::to_value(owner).unwrap();
        x["id"] = json!(id);
        x["name"] = json!(format!("{} copy", owner.name));
        x["analyticalMemberIds"] = json!([target]);
        list.push(x);
    }
    // Copy membership as explicit relationships as well as the authored role/storey.
    for key in ["layers", "groups"] {
        for collection in v["structure"][key].as_array_mut().unwrap() {
            let members = collection["members"].as_array_mut().unwrap();
            if members
                .iter()
                .any(|r| r["kind"] == "physicalMember" && r["id"] == owner.id)
                && !members.iter().any(|r| r["id"] == id)
            {
                members.push(json!({"kind":"physicalMember","id":id}));
            }
        }
    }
}

pub fn merge_joints(v: &mut Value, sources: &[String], target: &str) -> Result<()> {
    let joints = v["structure"]["joints"].as_array().unwrap();
    let survivor = joints
        .iter()
        .find(|j| j["nodeId"] == target)
        .cloned()
        .ok_or_else(|| err("DANGLING_REFERENCE", "Target joint missing"))?;
    let removed: Vec<_> = joints
        .iter()
        .filter(|j| sources.iter().any(|id| j["nodeId"] == *id))
        .cloned()
        .collect();
    for j in &removed {
        if j["storeyId"] != survivor["storeyId"]
            || j["name"] != json!(format!("Joint {}", j["nodeId"].as_str().unwrap()))
        {
            return Err(err(
                "INVALID_SCHEMA",
                "Merge would discard authored joint properties; align storeys and reset source joint names first",
            ));
        }
    }
    for key in ["layers", "groups"] {
        for c in v["structure"][key].as_array_mut().unwrap() {
            let refs = c["members"].as_array_mut().unwrap();
            for r in refs.iter_mut() {
                if r["kind"] == "joint" && removed.iter().any(|j| j["id"] == r["id"]) {
                    r["id"] = survivor["id"].clone();
                }
            }
            let mut unique = Vec::new();
            refs.retain(|r| {
                if unique.contains(r) {
                    false
                } else {
                    unique.push(r.clone());
                    true
                }
            });
        }
    }
    Ok(())
}

/// Preserve authored joint/support organization with an explicit copy mapping.
pub fn copy_attachment(v: &mut Value, p: &Project, source: &str, target: &str, joint: bool) {
    let (key, field, kind, prefix, title) = if joint {
        ("joints", "nodeId", "joint", "jt", "Joint")
    } else {
        ("supportDetails", "supportId", "support", "sd", "Support")
    };
    let original = if joint {
        p.structure
            .joints
            .iter()
            .find(|x| x.node_id == source)
            .map(|x| serde_json::to_value(x).unwrap())
    } else {
        p.structure
            .support_details
            .iter()
            .find(|x| x.support_id == source)
            .map(|x| serde_json::to_value(x).unwrap())
    };
    let Some(mut x) = original else {
        return;
    };
    let old_ref = if joint {
        x["id"].clone()
    } else {
        json!(source)
    };
    let id = structure_id(prefix, target);
    x["id"] = json!(id);
    x[field] = json!(target);
    x["name"] = if x["name"] == json!(format!("{title} {source}")) {
        json!(format!("{title} {target}"))
    } else {
        json!(format!("{} copy", x["name"].as_str().unwrap()))
    };
    v["structure"][key].as_array_mut().unwrap().push(x);
    for collection in ["layers", "groups"] {
        for c in v["structure"][collection].as_array_mut().unwrap() {
            let refs = c["members"].as_array_mut().unwrap();
            if refs.iter().any(|r| r["kind"] == kind && r["id"] == old_ref) {
                refs.push(json!({"kind":kind,"id":if joint{id.as_str()}else{target}}));
            }
        }
    }
}
