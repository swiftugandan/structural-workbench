use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
use workbench_model::{Project, Result, err};

fn ids(v: &Value) -> Result<BTreeSet<String>> {
    let list: Vec<String> = serde_json::from_value(v.clone())
        .map_err(|_| err("INVALID_SCHEMA", "Entity IDs required"))?;
    if list.is_empty() {
        return Err(err("INVALID_SCHEMA", "Select at least one entity"));
    }
    Ok(list.into_iter().collect())
}

fn tie_local_y(axis: [f64; 3]) -> [f64; 3] {
    let len = workbench_geometry::dot(axis, axis).sqrt();
    let u = [axis[0] / len, axis[1] / len, axis[2] / len];
    for candidate in [[1.0, 0.0, 0.0], [0.0, 0.0, 1.0], [0.0, 1.0, 0.0]] {
        let proj = workbench_geometry::dot(u, candidate);
        let ortho = [
            candidate[0] - proj * u[0],
            candidate[1] - proj * u[1],
            candidate[2] - proj * u[2],
        ];
        if workbench_geometry::dot(ortho, ortho).sqrt() > 1e-8 {
            return candidate;
        }
    }
    [1.0, 0.0, 0.0]
}

fn copy_bay(
    v: &mut Value,
    p: &Project,
    c: &Value,
    selected: &BTreeSet<String>,
    node_ids: &BTreeSet<String>,
    delta: [f64; 3],
) -> Result<()> {
    let a = &c["args"];
    if a["includeSupports"] != true {
        return Err(err(
            "INVALID_SCHEMA",
            "CopyBay requires includeSupports:true so bay bases remain restrained",
        ));
    }
    if a["tieUnsupportedNodes"] != true {
        return Err(err(
            "INVALID_SCHEMA",
            "CopyBay requires tieUnsupportedNodes:true to connect roof/eave lines between bays",
        ));
    }
    let count = a["count"].as_u64().unwrap_or(0);
    if !(1..=50).contains(&count) {
        return Err(err(
            "INVALID_SCHEMA",
            "CopyBay count must be an integer from 1 to 50",
        ));
    }
    if delta.iter().all(|x| x.abs() < 1e-9) {
        return Err(err("INVALID_SCHEMA", "Bay offset must be non-zero"));
    }
    let set_spatial = a["setSpatial"].as_bool().unwrap_or(true);
    let stabilize = a["stabilizeBases"].as_bool().unwrap_or(true);
    if set_spatial {
        v["analysisMode"] = json!("spatial");
    } else if v["analysisMode"] != "spatial" {
        return Err(err(
            "UNSUPPORTED_FEATURE",
            "CopyBay requires spatial analysis mode",
        ));
    }
    let command_id = c["id"]
        .as_str()
        .filter(|id| !id.is_empty())
        .ok_or_else(|| err("INVALID_SCHEMA", "CopyBay command ID required"))?;
    let prefix = format!("b{}", &workbench_model::digest(command_id.as_bytes())[..20]);
    let supported: BTreeSet<_> = p
        .supports
        .iter()
        .filter(|s| node_ids.contains(&s.node))
        .map(|s| s.node.clone())
        .collect();
    if stabilize {
        for s in v["supports"].as_array_mut().unwrap().iter_mut() {
            if node_ids.contains(s["node"].as_str().unwrap_or("")) {
                s["fixed"] = json!([true, true, true, true, true, true]);
            }
        }
    }
    let template_nodes: Vec<_> = p
        .nodes
        .iter()
        .filter(|n| node_ids.contains(&n.id))
        .cloned()
        .collect();
    let template_members: Vec<_> = p
        .members
        .iter()
        .filter(|m| selected.contains(&m.id))
        .cloned()
        .collect();
    let template_supports: Vec<_> = p
        .supports
        .iter()
        .filter(|s| node_ids.contains(&s.node))
        .cloned()
        .collect();
    if template_members.is_empty() {
        return Err(err(
            "INVALID_SCHEMA",
            "CopyBay requires at least one selected member",
        ));
    }
    // bay_maps[0] is identity (original IDs); later entries are each copy generation.
    let mut bay_maps: Vec<BTreeMap<String, String>> = vec![template_nodes
        .iter()
        .map(|n| (n.id.clone(), n.id.clone()))
        .collect()];
    let mut ordinal = 0u64;
    for bay in 1..=count as usize {
        let scale = bay as f64;
        let mut mapping = BTreeMap::new();
        for n in &template_nodes {
            let id = format!("{prefix}_{ordinal}");
            ordinal += 1;
            mapping.insert(n.id.clone(), id.clone());
            v["nodes"].as_array_mut().unwrap().push(json!({
                "id": id,
                "position": [
                    n.position[0] + scale * delta[0],
                    n.position[1] + scale * delta[1],
                    n.position[2] + scale * delta[2]
                ]
            }));
        }
        for m in &template_members {
            let id = format!("{prefix}_{ordinal}");
            ordinal += 1;
            let mut member = serde_json::to_value(m).unwrap();
            member["id"] = json!(id);
            member["start"] = json!(mapping[&m.start]);
            member["end"] = json!(mapping[&m.end]);
            member.as_object_mut().unwrap().remove("parentMemberId");
            member.as_object_mut().unwrap().remove("stationRange");
            v["members"].as_array_mut().unwrap().push(member);
        }
        for s in &template_supports {
            let id = format!("{prefix}_{ordinal}");
            ordinal += 1;
            let fixed = if stabilize {
                json!([true, true, true, true, true, true])
            } else {
                json!(s.fixed)
            };
            v["supports"].as_array_mut().unwrap().push(json!({
                "id": id,
                "node": mapping[&s.node],
                "fixed": fixed,
                "prescribed": s.prescribed
            }));
        }
        bay_maps.push(mapping);
    }
    let material = template_members[0].material.clone();
    let section = template_members[0].section.clone();
    for bay in 0..count as usize {
        let from = &bay_maps[bay];
        let to = &bay_maps[bay + 1];
        for n in &template_nodes {
            if supported.contains(&n.id) {
                continue;
            }
            let start = from[&n.id].clone();
            let end = to[&n.id].clone();
            let a_pos = p
                .nodes
                .iter()
                .find(|x| x.id == n.id)
                .map(|x| {
                    [
                        x.position[0] + (bay as f64) * delta[0],
                        x.position[1] + (bay as f64) * delta[1],
                        x.position[2] + (bay as f64) * delta[2],
                    ]
                })
                .unwrap();
            let b_pos = [
                n.position[0] + ((bay + 1) as f64) * delta[0],
                n.position[1] + ((bay + 1) as f64) * delta[1],
                n.position[2] + ((bay + 1) as f64) * delta[2],
            ];
            let axis = [
                b_pos[0] - a_pos[0],
                b_pos[1] - a_pos[1],
                b_pos[2] - a_pos[2],
            ];
            let id = format!("{prefix}_{ordinal}");
            ordinal += 1;
            v["members"].as_array_mut().unwrap().push(json!({
                "id": id,
                "start": start,
                "end": end,
                "material": material,
                "section": section,
                "localY": tie_local_y(axis),
                "releaseStart": { "my": false, "mz": false },
                "releaseEnd": { "my": false, "mz": false }
            }));
        }
    }
    Ok(())
}

pub fn apply(v: &mut Value, c: &Value) -> Result<()> {
    let p = Project::parse(&v.to_string())?;
    let a = &c["args"];
    let selected = ids(&a["ids"])?;
    let known: BTreeSet<_> = p
        .nodes
        .iter()
        .map(|n| n.id.as_str())
        .chain(p.members.iter().map(|m| m.id.as_str()))
        .collect();
    if selected.iter().any(|id| !known.contains(id.as_str())) {
        return Err(err(
            "DANGLING_REFERENCE",
            "Selection contains an unknown node or member",
        ));
    }
    let mut node_ids: BTreeSet<String> = p
        .nodes
        .iter()
        .filter(|n| selected.contains(&n.id))
        .map(|n| n.id.clone())
        .collect();
    for m in p.members.iter().filter(|m| selected.contains(&m.id)) {
        node_ids.extend([m.start.clone(), m.end.clone()]);
    }
    match c["type"].as_str().unwrap_or("") {
        "MoveNodes" | "CopySelection" | "CopyBay" => {
            let mut delta = a["delta"].clone();
            for n in delta
                .as_array_mut()
                .ok_or_else(|| err("INVALID_SCHEMA", "Three offset coordinates required"))?
            {
                super::quantity(n, "length")?;
            }
            let delta: [f64; 3] = serde_json::from_value(delta)
                .map_err(|_| err("INVALID_SCHEMA", "Three offset coordinates required"))?;
            if delta.iter().any(|x| !x.is_finite() || x.abs() > 1e6) {
                return Err(err("INVALID_SCHEMA", "Invalid offset"));
            }
            if c["type"] == "MoveNodes" {
                for n in v["nodes"]
                    .as_array_mut()
                    .unwrap()
                    .iter_mut()
                    .filter(|n| node_ids.contains(n["id"].as_str().unwrap()))
                {
                    for i in 0..3 {
                        n["position"][i] = json!(n["position"][i].as_f64().unwrap() + delta[i]);
                    }
                }
            } else if c["type"] == "CopyBay" {
                copy_bay(v, &p, c, &selected, &node_ids, delta)?;
            } else {
                if a["connectToExisting"] != false {
                    return Err(err(
                        "INVALID_SCHEMA",
                        "Copy requires connectToExisting:false; use explicit merge/connect afterwards",
                    ));
                }
                let id = c["id"]
                    .as_str()
                    .filter(|id| !id.is_empty())
                    .ok_or_else(|| err("INVALID_SCHEMA", "Copy command ID required"))?;
                let prefix = format!("c{}", &workbench_model::digest(id.as_bytes())[..20]);
                let mut ordinal = 0;
                let mut mapping = BTreeMap::new();
                for n in &p.nodes {
                    if node_ids.contains(&n.id) {
                        let id = format!("{prefix}_{ordinal}");
                        ordinal += 1;
                        mapping.insert(n.id.clone(), id.clone());
                        v["nodes"].as_array_mut().unwrap().push(json!({"id":id,"position":std::array::from_fn::<_,3,_>(|i|n.position[i]+delta[i])}));
                    }
                }
                for m in &p.members {
                    if selected.contains(&m.id) {
                        let id = format!("{prefix}_{ordinal}");
                        ordinal += 1;
                        mapping.insert(m.id.clone(), id.clone());
                        let mut member = serde_json::to_value(m).unwrap();
                        member["id"] = json!(id);
                        member["start"] = json!(mapping[&m.start]);
                        member["end"] = json!(mapping[&m.end]);
                        member.as_object_mut().unwrap().remove("parentMemberId");
                        member.as_object_mut().unwrap().remove("stationRange");
                        v["members"].as_array_mut().unwrap().push(member);
                    }
                }
                // Copy geometry only. Attachments are deliberately listed as unchanged in preview.
            }
        }
        "DeleteGeometry" => {
            let mut removed = selected;
            for m in &p.members {
                if removed.contains(&m.start) || removed.contains(&m.end) {
                    removed.insert(m.id.clone());
                }
            }
            for s in &p.supports {
                if removed.contains(&s.node) {
                    removed.insert(s.id.clone());
                }
            }
            for l in v["loads"].as_array().unwrap() {
                if l.get("node")
                    .or_else(|| l.get("member"))
                    .and_then(Value::as_str)
                    .is_some_and(|id| removed.contains(id))
                {
                    removed.insert(l["id"].as_str().unwrap().to_string());
                }
            }
            if a["cascade"] != true && removed.len() > a["ids"].as_array().unwrap().len() {
                return Err(err(
                    "DANGLING_REFERENCE",
                    "Dependent members, supports or loads require explicit cascade preview",
                ));
            }
            for key in ["nodes", "members", "supports", "loads"] {
                v[key]
                    .as_array_mut()
                    .unwrap()
                    .retain(|x| !removed.contains(x["id"].as_str().unwrap()));
            }
            for l in v["loads"].as_array_mut().unwrap() {
                if l["type"] == "selfWeight" {
                    l["members"]
                        .as_array_mut()
                        .unwrap()
                        .retain(|id| !removed.contains(id.as_str().unwrap()));
                }
            }
        }
        _ => return Err(err("UNSUPPORTED_FEATURE", "Unsupported CAD command")),
    }
    Ok(())
}
pub fn measure(p: &Project, q: &Value) -> Result<Value> {
    let start = p
        .nodes
        .iter()
        .find(|n| n.id == q["start"])
        .ok_or_else(|| err("DANGLING_REFERENCE", "Start node"))?;
    let end = p
        .nodes
        .iter()
        .find(|n| n.id == q["end"])
        .ok_or_else(|| err("DANGLING_REFERENCE", "End node"))?;
    let delta: [f64; 3] = std::array::from_fn(|i| end.position[i] - start.position[i]);
    Ok(
        json!({"start":start.id,"end":end.id,"delta":delta,"distance":workbench_geometry::dot(delta,delta).sqrt()}),
    )
}
