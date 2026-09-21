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
        "MoveNodes" | "CopySelection" => {
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
