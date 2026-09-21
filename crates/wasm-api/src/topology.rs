//! Topology operates on a disposable candidate; Project::parse gates publication.
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
use workbench_geometry::dot;
use workbench_model::{Result, err};
const TOL: f64 = 1e-6;
fn string(v: &Value) -> Result<&str> {
    v.as_str()
        .ok_or_else(|| err("INVALID_SCHEMA", "Expected entity ID"))
}
fn position(v: &Value, id: &str) -> Result<[f64; 3]> {
    let n = v["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["id"] == id)
        .ok_or_else(|| err("DANGLING_REFERENCE", id))?;
    serde_json::from_value(n["position"].clone()).map_err(|_| err("INVALID_SCHEMA", "Position"))
}
fn sub(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    std::array::from_fn(|i| a[i] - b[i])
}
fn distance(a: [f64; 3], b: [f64; 3]) -> f64 {
    let d = sub(a, b);
    dot(d, d).sqrt()
}
fn generated(c: &Value, kind: &str, index: usize) -> Result<String> {
    let id = string(&c["id"])?;
    if id.is_empty() {
        return Err(err("INVALID_SCHEMA", "Command ID required"));
    }
    Ok(format!(
        "t{}_{}{}",
        &workbench_model::digest(id.as_bytes())[..20],
        kind,
        index
    ))
}
fn add_node(v: &mut Value, c: &Value, point: [f64; 3], ordinal: usize) -> Result<String> {
    let id = generated(c, "n", ordinal)?;
    v["nodes"]
        .as_array_mut()
        .unwrap()
        .push(json!({"id":id,"position":point}));
    Ok(id)
}
fn split(
    v: &mut Value,
    c: &Value,
    id: &str,
    mut cuts: Vec<(f64, String)>,
    ordinal: &mut usize,
) -> Result<()> {
    if cuts.is_empty() {
        return Err(err(
            "INVALID_SCHEMA",
            "Choose at least one interior split station",
        ));
    }
    cuts.sort_by(|a, b| a.0.total_cmp(&b.0));
    if cuts
        .iter()
        .any(|(t, _)| !t.is_finite() || *t <= 0. || *t >= 1.)
        || cuts.windows(2).any(|w| w[0].0 == w[1].0)
    {
        return Err(err(
            "INVALID_SCHEMA",
            "Split stations must be distinct and strictly between 0 and 1",
        ));
    }
    let members = v["members"].as_array_mut().unwrap();
    let i = members
        .iter()
        .position(|m| m["id"] == id)
        .ok_or_else(|| err("DANGLING_REFERENCE", id))?;
    let original = members.remove(i);
    let parent = original["parentMemberId"].as_str().unwrap_or(id);
    let range: [f64; 2] = original
        .get("stationRange")
        .map(|x| serde_json::from_value(x.clone()).unwrap())
        .unwrap_or([0., 1.]);
    let mut points = vec![(0., string(&original["start"])?.to_string())];
    points.append(&mut cuts);
    points.push((1., string(&original["end"])?.to_string()));
    let mut children = vec![];
    for pair in points.windows(2) {
        let mut child = original.clone();
        let child_id = generated(c, "m", *ordinal)?;
        *ordinal += 1;
        child["id"] = json!(child_id);
        child["start"] = json!(pair[0].1);
        child["end"] = json!(pair[1].1);
        child["parentMemberId"] = json!(parent);
        child["stationRange"] = json!(
            pair.iter()
                .map(|p| range[0] + p.0 * (range[1] - range[0]))
                .collect::<Vec<_>>()
        );
        children.push(child_id);
        members.push(child);
    }
    let loads = v["loads"].as_array_mut().unwrap();
    let old = std::mem::take(loads);
    for load in old {
        if load["member"] == id {
            if load["type"] != "uniform" {
                return Err(err(
                    "UNSUPPORTED_FEATURE",
                    "Only uniform member loads can be split",
                ));
            }
            for child in &children {
                let mut l = load.clone();
                l["id"] = json!(generated(c, "l", *ordinal)?);
                *ordinal += 1;
                l["member"] = json!(child);
                loads.push(l);
            }
        } else if load["type"] == "selfWeight" {
            let mut l = load;
            let ids = l["members"].as_array_mut().unwrap();
            if ids.iter().any(|x| x == id) {
                ids.retain(|x| x != id);
                ids.extend(children.iter().map(|x| json!(x)));
            }
            loads.push(l);
        } else {
            loads.push(load);
        }
    }
    Ok(())
}
fn merge(v: &mut Value, sources: &[String], target: &str) -> Result<()> {
    if sources.is_empty()
        || sources.iter().any(|s| s == target)
        || sources.iter().collect::<BTreeSet<_>>().len() != sources.len()
    {
        return Err(err(
            "INVALID_SCHEMA",
            "Select distinct source nodes and a separate target",
        ));
    }
    let target_pos = position(v, target)?;
    for id in sources {
        if distance(position(v, id)?, target_pos) > TOL {
            return Err(err(
                "INVALID_SCHEMA",
                "Merge nodes must be within 0.000001 m of the target",
            ));
        }
    }
    let affected = |id: &Value| id == target || sources.iter().any(|s| id == s);
    if v["supports"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|s| affected(&s["node"]))
        .count()
        > 1
    {
        return Err(err(
            "INVALID_RESTRAINT",
            "Merge would combine multiple supports; resolve them explicitly first",
        ));
    }
    let mut cases = BTreeMap::new();
    for l in v["loads"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|l| l["type"] == "nodal" && affected(&l["node"]))
    {
        let case = string(&l["case"])?;
        let node = string(&l["node"])?;
        if cases
            .insert(case, node)
            .is_some_and(|previous| previous != node)
        {
            return Err(err(
                "INVALID_LOAD",
                "Merge would combine nodal loads in the same case; resolve them explicitly first",
            ));
        }
    }
    for key in ["members", "supports", "loads"] {
        for item in v[key].as_array_mut().unwrap() {
            for field in ["start", "end", "node"] {
                if sources.iter().any(|s| item[field] == *s) {
                    item[field] = json!(target);
                }
            }
        }
    }
    v["nodes"]
        .as_array_mut()
        .unwrap()
        .retain(|n| !sources.iter().any(|s| n["id"] == *s));
    Ok(())
}
pub fn apply(v: &mut Value, c: &Value) -> Result<()> {
    // A preceding Batch entry may have introduced incomplete records. Reject
    // those before accessing typed geometry rather than trapping the Worker.
    workbench_model::Project::parse(&v.to_string())?;
    let a = &c["args"];
    match c["type"].as_str().unwrap_or("") {
        "SplitMember" => {
            let id = string(&a["id"])?;
            let m = v["members"]
                .as_array()
                .unwrap()
                .iter()
                .find(|m| m["id"] == id)
                .ok_or_else(|| err("DANGLING_REFERENCE", id))?
                .clone();
            let start = position(v, string(&m["start"])?)?;
            let end = position(v, string(&m["end"])?)?;
            let stations = a["stations"]
                .as_array()
                .ok_or_else(|| err("INVALID_SCHEMA", "Split stations required"))?;
            if stations.len() > 1000 {
                return Err(err(
                    "MEMORY_LIMIT",
                    "At most 1000 split stations per command",
                ));
            }
            let mut cuts = vec![];
            for (i, t) in stations.iter().enumerate() {
                let t = t
                    .as_f64()
                    .filter(|t| *t > 0. && *t < 1.)
                    .ok_or_else(|| err("INVALID_SCHEMA", "Interior fraction required"))?;
                let point = std::array::from_fn(|j| start[j] + t * (end[j] - start[j]));
                // Split creates its own node. Only Connect intersections joins other members.
                cuts.push((t, add_node(v, c, point, i)?));
            }
            split(v, c, id, cuts, &mut 0)
        }
        "MergeNodes" => {
            let sources: Vec<String> = serde_json::from_value(a["sourceIds"].clone())
                .map_err(|_| err("INVALID_SCHEMA", "Source IDs required"))?;
            merge(v, &sources, string(&a["targetId"])?)
        }
        "ConnectIntersections" => connect(v, c),
        _ => Err(err("UNSUPPORTED_FEATURE", "Not a topology command")),
    }
}
fn connect(v: &mut Value, c: &Value) -> Result<()> {
    if v["analysisMode"] != "planarXZ" {
        return Err(err(
            "UNSUPPORTED_FEATURE",
            "Connect intersections currently requires Planar XZ",
        ));
    }
    let ids: Vec<String> = serde_json::from_value(c["args"]["memberIds"].clone())
        .map_err(|_| err("INVALID_SCHEMA", "Member IDs required"))?;
    if ids.len() < 2 || ids.len() > 200 || ids.iter().collect::<BTreeSet<_>>().len() != ids.len() {
        return Err(err("INVALID_SCHEMA", "Select 2 to 200 distinct members"));
    }
    let mut selected = vec![];
    for id in ids {
        let m = v["members"]
            .as_array()
            .unwrap()
            .iter()
            .find(|m| m["id"] == id)
            .ok_or_else(|| err("DANGLING_REFERENCE", &id))?;
        let a = position(v, string(&m["start"])?)?;
        let b = position(v, string(&m["end"])?)?;
        selected.push((
            id,
            a,
            b,
            string(&m["start"])?.to_string(),
            string(&m["end"])?.to_string(),
        ));
    }
    selected.sort_by(|a, b| a.0.cmp(&b.0));
    let mut intersections: Vec<([f64; 3], Vec<(String, f64)>)> = vec![];
    for i in 0..selected.len() {
        for j in i + 1..selected.len() {
            let (ref id, a, b, _, _) = selected[i];
            let (ref other, d, e, _, _) = selected[j];
            let u = sub(b, a);
            let w = sub(e, d);
            let q = sub(d, a);
            let den = u[0] * w[2] - u[2] * w[0];
            if den.abs() <= 1e-12 * dot(u, u).sqrt() * dot(w, w).sqrt() {
                continue;
            }
            let t = (q[0] * w[2] - q[2] * w[0]) / den;
            let s = (q[0] * u[2] - q[2] * u[0]) / den;
            if !(0.0..=1.0).contains(&t) || !(0.0..=1.0).contains(&s) {
                continue;
            }
            let point = std::array::from_fn(|k| a[k] + t * u[k]);
            if distance(point, std::array::from_fn(|k| d[k] + s * w[k])) > TOL {
                continue;
            }
            let index = intersections
                .iter()
                .position(|(p, _)| distance(*p, point) <= TOL);
            let entries = if let Some(index) = index {
                &mut intersections[index].1
            } else {
                intersections.push((point, vec![]));
                &mut intersections.last_mut().unwrap().1
            };
            for entry in [(id.clone(), t), (other.clone(), s)] {
                if !entries.iter().any(|x| x.0 == entry.0) {
                    entries.push(entry);
                }
            }
        }
    }
    let mut cuts: BTreeMap<String, Vec<(f64, String)>> = BTreeMap::new();
    let mut changed = false;
    for (i, (point, entries)) in intersections.into_iter().enumerate() {
        let mut endpoints = BTreeSet::new();
        for (id, t) in &entries {
            let m = selected.iter().find(|m| m.0 == *id).unwrap();
            let length = distance(m.1, m.2);
            if t * length <= TOL {
                endpoints.insert(m.3.clone());
            } else if (1. - t) * length <= TOL {
                endpoints.insert(m.4.clone());
            }
        }
        let target = if let Some(id) = endpoints.first() {
            id.clone()
        } else {
            changed = true;
            add_node(v, c, point, i)?
        };
        if endpoints.len() > 1 {
            let sources: Vec<_> = endpoints
                .iter()
                .filter(|id| **id != target)
                .cloned()
                .collect();
            merge(v, &sources, &target)?;
            changed = true;
        }
        for (id, t) in entries {
            let m = selected.iter().find(|m| m.0 == id).unwrap();
            let length = distance(m.1, m.2);
            if t * length > TOL && (1. - t) * length > TOL {
                cuts.entry(id).or_default().push((t, target.clone()));
                changed = true;
            }
        }
    }
    if !changed {
        return Err(err(
            "INVALID_SCHEMA",
            "No disconnected nonparallel intersections found in the selection",
        ));
    }
    let mut ordinal = 0;
    for (id, points) in cuts {
        split(v, c, &id, points, &mut ordinal)?;
    }
    Ok(())
}
