mod snap;
use serde_json::{Value, json};
use wasm_bindgen::prelude::*;
use workbench_model::{Project, Result, err};
#[wasm_bindgen]
pub struct Kernel {
    project: Option<Project>,
    undo: Vec<Project>,
    redo: Vec<Project>,
}
#[wasm_bindgen]
impl Kernel {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Kernel {
        Kernel {
            project: None,
            undo: vec![],
            redo: vec![],
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
                json!({"protocolVersion":1,"schemaVersions":["1.0.0"],"analysisTypes":["linearStatic"],"designProfiles":[],"limits":{"nodes":5000,"members":10000,"memoryMiB":512},"limitations":["Conservative fill guard may reject large models","End releases and member point actions not yet available","No code compliance or commercial parity claim"]}),
            );
        }
        if let Some(p) = &self.project {
            if r["expectedRevision"].as_u64() != Some(p.revision) {
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
                let mut p = Project::parse(&text)?;
                p.canonicalise();
                if let Some(old) = &self.project {
                    p.revision = old.revision + 1;
                }
                self.project = Some(p);
                self.undo.clear();
                self.redo.clear();
                Ok(self.snapshot())
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
                let count = payload["caseIds"].as_array().map_or(0, |a| a.len())
                    + payload["combinationIds"].as_array().map_or(0, |a| a.len());
                if count != 1 {
                    return Err(err(
                        "UNSUPPORTED_FEATURE",
                        "Select exactly one case or combination per analysis",
                    ));
                }
                let p = self.project.as_ref().unwrap();
                let case = payload["caseIds"]
                    .as_array()
                    .and_then(|a| a.first())
                    .and_then(Value::as_str)
                    .or_else(|| {
                        payload["combinationIds"]
                            .as_array()
                            .and_then(|a| a.first())
                            .and_then(Value::as_str)
                    })
                    .unwrap_or("LC1");
                let result = workbench_assembly::analyse(p, case)?;
                Ok(serde_json::to_value(result).unwrap())
            }
            "queryGeometry" => {
                let p = self.project.as_ref().unwrap();
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
        "SetLoad" => {
            if let Some(values) = a["values"].as_array_mut() {
                for (i, v) in values.iter_mut().enumerate() {
                    quantity(v, if i < 3 { "force" } else { "moment" })?
                }
            }
        }
        _ => {}
    }
    Ok(())
}
