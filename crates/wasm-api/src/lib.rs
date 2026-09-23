mod cad;
mod snap;
mod topology;
mod view;
use serde_json::{Value, json};
use wasm_bindgen::prelude::*;
use workbench_model::{Project, Result, err, import_project};
#[wasm_bindgen]
pub struct Kernel {
    project: Option<Project>,
    undo: Vec<Project>,
    redo: Vec<Project>,
    view_index: Option<view::Index>,
}
#[wasm_bindgen]
impl Kernel {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Kernel {
        Kernel {
            project: None,
            undo: vec![],
            redo: vec![],
            view_index: None,
        }
    }
    pub fn request(&mut self, input: &str) -> String {
        let r:Value=match serde_json::from_str(input){Ok(v)=>v,Err(e)=>return json!({"status":"error","diagnostics":[{"code":"INVALID_SCHEMA","message":e.to_string()}]}).to_string()};
        let op = r["operation"].as_str().unwrap_or("");
        let id = r["requestId"].clone();
        let result = self.dispatch(&r, op);
        let revision = self.project.as_ref().map(|p| p.revision);
        let hash = self.project.as_ref().map(|p| p.hash());
        match result{Ok(payload)=>json!({"protocolVersion":1,"requestId":id,"operation":op,"status":"ok","revision":revision,"modelHash":hash,"payload":payload,"diagnostics":[]}).to_string(),Err(d)=>json!({"protocolVersion":1,"requestId":id,"operation":op,"status":"error","revision":revision,"modelHash":hash,"payload":null,"diagnostics":[d]}).to_string()}
    }
}
impl Kernel {
    fn snapshot(&self) -> Value {
        let p = self.project.as_ref().unwrap();
        json!({"project":p,"modelHash":p.hash(),"canUndo":!self.undo.is_empty(),"canRedo":!self.redo.is_empty()})
    }
    fn dispatch(&mut self, r: &Value, op: &str) -> Result<Value> {
        if r["protocolVersion"] != 1 {
            return Err(err("INVALID_SCHEMA", "Protocol version must be 1"));
        }
        if op == "capabilities" {
            return Ok(
                json!({"protocolVersion":1,"schemaVersions":["0.9.0","1.0.0"],"analysisTypes":["linearStatic"],"designProfiles":[],"limits":{"nodes":5000,"members":10000,"memoryMiB":512},"limitations":["Conservative fill guard may reject large models","No code compliance or commercial parity claim","Schema 0.9.0 imports migrate to 1.0.0; unknown majors are refused"]}),
            );
        }
        if let Some(p) = &self.project {
            let expected = r.get("expectedRevision");
            let force_replace = matches!(op, "importProject" | "createProject")
                && expected.map(|v| v.is_null()).unwrap_or(true);
            if !force_replace && expected.and_then(|v| v.as_u64()) != Some(p.revision) {
                return Err(err(
                    "REVISION_CONFLICT",
                    "Model changed; reload the current snapshot",
                ));
            }
        } else if !["createProject", "importProject"].contains(&op) {
            return Err(err("INVALID_SCHEMA", "Open a project first"));
        }
        let payload = &r["payload"];
        match op {
            "createProject" | "importProject" => {
                let text = if op == "importProject" {
                    payload["jsonUtf8"]
                        .as_str()
                        .ok_or_else(|| err("INVALID_SCHEMA", "Missing JSON"))?
                        .to_string()
                } else {
                    payload["project"].to_string()
                };
                let (mut p, migration) = if op == "importProject" {
                    import_project(&text)?
                } else {
                    let p = Project::parse(&text)?;
                    (
                        p,
                        workbench_model::MigrationReport::identity(workbench_model::digest(
                            text.as_bytes(),
                        )),
                    )
                };
                p.canonicalise();
                if let Some(old) = &self.project {
                    p.revision = old.revision + 1;
                }
                self.project = Some(p);
                self.undo.clear();
                self.redo.clear();
                let mut snap = self.snapshot();
                snap["migrationReport"] = serde_json::to_value(migration).unwrap();
                Ok(snap)
            }
            "getSnapshot" | "exportProject" => Ok(self.snapshot()),
            "validateModel" => {
                self.project.as_ref().unwrap().validate()?;
                Ok(json!({"canAnalyse":true,"diagnostics":[]}))
            }
            "undo" | "redo" => {
                let old = self.project.as_ref().unwrap().clone();
                let from = if op == "undo" {
                    &mut self.undo
                } else {
                    &mut self.redo
                };
                let mut restored = from
                    .pop()
                    .ok_or_else(|| err("INVALID_SCHEMA", "No history"))?;
                restored.revision = old.revision + 1;
                if op == "undo" {
                    self.redo.push(old)
                } else {
                    self.undo.push(old)
                }
                self.project = Some(restored);
                Ok(self.snapshot())
            }
            "applyCommand" => {
                let old = self.project.as_ref().unwrap().clone();
                let mut v = serde_json::to_value(&old).unwrap();
                apply(&mut v, &payload["command"], false)?;
                let mut p = Project::parse(&v.to_string())?;
                p.revision = old.revision + 1;
                p.canonicalise();
                self.undo.push(old);
                if self.undo.len() > 100 {
                    self.undo.remove(0);
                }
                self.redo.clear();
                self.project = Some(p);
                Ok(self.snapshot())
            }
            "analyse" => {
                let mut ids = Vec::new();
                if let Some(a) = payload["caseIds"].as_array() {
                    for v in a {
                        if let Some(s) = v.as_str() {
                            ids.push(s.to_string());
                        }
                    }
                }
                if let Some(a) = payload["combinationIds"].as_array() {
                    for v in a {
                        if let Some(s) = v.as_str() {
                            ids.push(s.to_string());
                        }
                    }
                }
                if ids.is_empty() {
                    return Err(err(
                        "INVALID_LOAD",
                        "Select at least one case or combination",
                    ));
                }
                let p = self.project.as_ref().unwrap();
                if ids.len() == 1 {
                    let result = workbench_assembly::analyse(p, &ids[0])?;
                    Ok(serde_json::to_value(result).unwrap())
                } else {
                    let result = workbench_assembly::envelope(p, &ids)?;
                    Ok(serde_json::to_value(result).unwrap())
                }
            }
            "queryGeometry" => {
                let p = self.project.as_ref().unwrap();
                if ["screenPick", "boxSelect", "viewGeometry"]
                    .iter()
                    .any(|kind| payload["kind"] == *kind)
                {
                    let q = &payload["query"];
                    let key = format!("{}:{}", p.revision, q["camera"]);
                    if self.view_index.as_ref().is_none_or(|v| v.key != key) {
                        self.view_index = Some(view::Index::new(p, &q["camera"], key)?);
                    }
                    let index = self.view_index.as_mut().unwrap();
                    let mut value = match payload["kind"].as_str().unwrap() {
                        "screenPick" => index.pick(q)?,
                        "boxSelect" => index.select(q)?,
                        _ => index.crossings(),
                    };
                    value["viewRevision"] = payload["viewRevision"].clone();
                    return Ok(value);
                }
                if payload["kind"] == "measure" {
                    return cad::measure(p, &payload["query"]);
                }
                if payload["kind"] == "commandPreview" {
                    let mut v = serde_json::to_value(p).unwrap();
                    apply(&mut v, &payload["query"]["command"], false)?;
                    let mut candidate = Project::parse(&v.to_string())?;
                    candidate.canonicalise();
                    return Ok(json!({"project":candidate,"viewRevision":payload["viewRevision"]}));
                }
                if payload["kind"] == "axes" {
                    let positions: std::collections::BTreeMap<_, _> = p
                        .nodes
                        .iter()
                        .map(|n| (n.id.as_str(), n.position))
                        .collect();
                    let members: Vec<Value> = p.members.iter().map(|m| {
                        let a = positions[m.start.as_str()];
                        let b = positions[m.end.as_str()];
                        let (length, axes) = workbench_geometry::axes(a, b, m.local_y);
                        json!({"id":m.id,"origin":std::array::from_fn::<_,3,_>(|i| (a[i]+b[i])*0.5),"length":length,"axes":axes})
                    }).collect();
                    let mut nodes: Vec<_> = p.nodes.iter().collect();
                    nodes.sort_by(|a, b| a.position[0].total_cmp(&b.position[0]));
                    let mut near = vec![];
                    'outer: for (i, a) in nodes.iter().enumerate() {
                        for b in nodes.iter().skip(i + 1) {
                            if b.position[0] - a.position[0] > 1e-6 {
                                break;
                            }
                            let distance = (0..3)
                                .map(|i| (a.position[i] - b.position[i]).powi(2))
                                .sum::<f64>()
                                .sqrt();
                            if distance <= 1e-6 {
                                near.push(json!({"nodeIds":[a.id,b.id],"distance":distance}));
                                if near.len() == 100 {
                                    break 'outer;
                                }
                            }
                        }
                    }
                    return Ok(
                        json!({"members":members,"nearCoincidentNodes":near,"viewRevision":payload["viewRevision"]}),
                    );
                }
                if payload["kind"] == "topologyPreview" {
                    let mut v = serde_json::to_value(p).unwrap();
                    topology::apply(&mut v, &payload["query"]["command"])?;
                    let mut candidate = Project::parse(&v.to_string())?;
                    candidate.canonicalise();
                    return Ok(json!({"project":candidate,"viewRevision":payload["viewRevision"]}));
                }
                if payload["kind"] == "snap" {
                    let mut answer = snap::snap(p, &payload["query"])?;
                    answer["viewRevision"] = payload["viewRevision"].clone();
                    return Ok(answer);
                }
                if payload["kind"] != "ray" {
                    return Err(err(
                        "UNSUPPORTED_FEATURE",
                        "Only ray picking currently available",
                    ));
                }
                let origin: [f64; 3] = serde_json::from_value(payload["query"]["origin"].clone())
                    .map_err(|_| err("INVALID_SCHEMA", "Ray origin"))?;
                let dir: [f64; 3] = serde_json::from_value(payload["query"]["direction"].clone())
                    .map_err(|_| err("INVALID_SCHEMA", "Ray direction"))?;
                let tolerance = payload["query"]["tolerance"].as_f64().unwrap_or(0.05);
                let dot = workbench_geometry::dot;
                let mut best = None;
                let mut distance = tolerance;
                for m in &p.members {
                    let a = p.nodes.iter().find(|n| n.id == m.start).unwrap().position;
                    let b = p.nodes.iter().find(|n| n.id == m.end).unwrap().position;
                    let v = std::array::from_fn(|i| b[i] - a[i]);
                    let w = std::array::from_fn(|i| a[i] - origin[i]);
                    let dd = dot(dir, dir);
                    if dd <= 0. {
                        return Err(err("INVALID_SCHEMA", "Zero ray direction"));
                    }
                    let vd = dot(v, dir);
                    let den = dot(v, v) - vd * vd / dd;
                    let t = if den.abs() < 1e-20 {
                        0.
                    } else {
                        ((vd * dot(w, dir) / dd - dot(v, w)) / den).clamp(0., 1.)
                    };
                    let point: [f64; 3] = std::array::from_fn(|i| a[i] + t * v[i]);
                    let q: [f64; 3] = std::array::from_fn(|i| point[i] - origin[i]);
                    let along = dot(q, dir) / dd;
                    let perp = std::array::from_fn(|i| q[i] - along * dir[i]);
                    let d = dot(perp, perp).sqrt();
                    if d < distance {
                        distance = d;
                        best = Some(m.id.clone());
                    }
                }
                Ok(
                    json!({"entityId":best,"distance":distance,"viewRevision":payload["viewRevision"]}),
                )
            }
            "evaluateDesign" => Err(err(
                "UNSUPPORTED_FEATURE",
                "No verified design code profile is enabled",
            )),
            _ => Err(err(
                "UNSUPPORTED_FEATURE",
                format!("Unsupported operation {op}"),
            )),
        }
    }
}
fn apply(v: &mut Value, c: &Value, nested: bool) -> Result<()> {
    let kind = c["type"].as_str().unwrap_or("");
    if ["MoveNodes", "CopySelection", "CopyBay", "DeleteGeometry"].contains(&kind) {
        return cad::apply(v, c);
    }
    if ["SplitMember", "MergeNodes", "ConnectIntersections"].contains(&kind) {
        return topology::apply(v, c);
    }
    let mut normalised = c["args"].clone();
    normalise_units(kind, &mut normalised)?;
    let a = &normalised;
    if kind == "Batch" {
        if nested {
            return Err(err("INVALID_SCHEMA", "Nested batch"));
        }
        for cmd in a["commands"]
            .as_array()
            .ok_or_else(|| err("INVALID_SCHEMA", "Missing commands"))?
        {
            apply(v, cmd, true)?;
        }
        return Ok(());
    }
    let collection = match kind {
        "AddNode" | "SetNodePosition" => "nodes",
        "AddMember" => "members",
        "SetMaterial" => "materials",
        "SetSection" => "sections",
        "SetSupport" => "supports",
        "SetLoadCase" => "loadCases",
        "SetLoad" => "loads",
        "SetCombination" => "combinations",
        "SetGravity" => {
            v["gravity"] = a["gravity"].clone();
            return Ok(());
        }
        "SetAnalysisMode" => {
            v["analysisMode"] = a["mode"].clone();
            return Ok(());
        }
        "DeleteEntities" => {
            let ids = a["ids"]
                .as_array()
                .ok_or_else(|| err("INVALID_SCHEMA", "Missing IDs"))?;
            for k in [
                "nodes",
                "members",
                "materials",
                "sections",
                "supports",
                "loadCases",
                "loads",
                "combinations",
            ] {
                v[k].as_array_mut()
                    .unwrap()
                    .retain(|item| !ids.contains(&item["id"]));
            }
            return Ok(());
        }
        _ => return Err(err("UNSUPPORTED_FEATURE", kind)),
    };
    let items = v[collection].as_array_mut().unwrap();
    let id = &a["id"];
    let found = items.iter().position(|x| x["id"] == *id);
    if kind == "SetNodePosition" {
        let pos = found.ok_or_else(|| err("DANGLING_REFERENCE", "Unknown node"))?;
        items[pos]["position"] = a["position"].clone();
        return Ok(());
    }
    let mode = a["existence"]
        .as_str()
        .unwrap_or(if kind.starts_with("Add") {
            "create"
        } else {
            ""
        });
    if (mode == "create" && found.is_some())
        || (mode == "update" && found.is_none())
        || !["create", "update"].contains(&mode)
    {
        return Err(err(
            "REVISION_CONFLICT",
            "Entity existence does not match command",
        ));
    }
    let mut item = a.clone();
    item.as_object_mut()
        .ok_or_else(|| err("INVALID_SCHEMA", "Command args"))?
        .remove("existence");
    if let Some(i) = found {
        items[i] = item
    } else {
        items.push(item)
    }
    Ok(())
}

fn quantity(v: &mut Value, dimension: &str) -> Result<()> {
    if let Some(text) = v.as_str() {
        let number =
            workbench_units::parse(text, dimension, 1.0).map_err(|e| err("INVALID_SCHEMA", e))?;
        *v = json!(number);
    }
    Ok(())
}
fn normalise_units(kind: &str, a: &mut Value) -> Result<()> {
    match kind {
        "AddNode" | "SetNodePosition" => {
            if let Some(values) = a["position"].as_array_mut() {
                for v in values {
                    quantity(v, "length")?
                }
            }
        }
        "SetMaterial" => {
            quantity(&mut a["E"], "stress")?;
            quantity(&mut a["nu"], "dimensionless")?;
            quantity(&mut a["density"], "density")?
        }
        "SetSection" => {
            for k in ["A"] {
                quantity(&mut a[k], "area")?
            }
            for k in ["Iy", "Iz", "J"] {
                quantity(&mut a[k], "inertia")?
            }
            for k in ["cy", "cz"] {
                quantity(&mut a[k], "length")?
            }
        }
        "AddMember" => {
            if let Some(values) = a["localY"].as_array_mut() {
                for v in values {
                    quantity(v, "dimensionless")?;
                }
            }
        }
        "SetSupport" => {
            if let Some(values) = a["prescribed"].as_array_mut() {
                for (i, v) in values.iter_mut().enumerate() {
                    quantity(v, if i < 3 { "length" } else { "rotation" })?;
                }
            }
        }
        "SetLoad" => {
            if let Some(values) = a.get_mut("forcePerLength").and_then(Value::as_array_mut) {
                for v in values {
                    quantity(v, "forcePerLength")?;
                }
            }
            if a.get("factor").is_some() {
                quantity(&mut a["factor"], "dimensionless")?;
            }
            if let Some(values) = a.get_mut("values").and_then(Value::as_array_mut) {
                for (i, v) in values.iter_mut().enumerate() {
                    quantity(v, if i < 3 { "force" } else { "moment" })?
                }
            }
        }
        _ => {}
    }
    Ok(())
}
