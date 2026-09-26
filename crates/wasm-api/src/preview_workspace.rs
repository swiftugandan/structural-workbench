//! Workflow previews. Missing numerical/code resources never produce a PASS.
use serde_json::{Value, json};
use workbench_model::{DesignPreview, Project, Result, digest, err};

fn fields(kind: &str) -> Vec<(&'static str, &'static str, f64, &'static str, f64)> {
    let mut f = match kind {
        "rcBeam" => vec![
            ("width", "Width", 0.3, "mm", 1000.),
            ("depth", "Depth", 0.6, "mm", 1000.),
            ("cover", "Cover", 0.035, "mm", 1000.),
            ("barDiameter", "Preferred bar diameter", 0.02, "mm", 1000.),
            ("barCount", "Preferred bars per face", 4., "", 1.),
            ("linkDiameter", "Link diameter", 0.01, "mm", 1000.),
            ("linkSpacing", "Link spacing", 0.2, "mm", 1000.),
        ],
        "slab" => vec![
            ("length", "Length X", 6., "m", 1.),
            ("width", "Length Y", 5., "m", 1.),
            ("thickness", "Thickness", 0.225, "mm", 1000.),
            ("cover", "Nominal cover", 0.03, "mm", 1000.),
            ("meshSize", "Target mesh size", 0.4, "mm", 1000.),
            ("openingWidth", "Opening Y", 1., "m", 1.),
            ("openingLength", "Opening X", 1., "m", 1.),
        ],
        "padFooting" => vec![
            ("length", "Length X", 2.4, "m", 1.),
            ("width", "Length Y", 2.1, "m", 1.),
            ("thickness", "Thickness", 0.55, "mm", 1000.),
            ("cover", "Cover", 0.05, "mm", 1000.),
            ("columnWidth", "Column X", 0.4, "mm", 1000.),
            ("columnDepth", "Column Y", 0.4, "mm", 1000.),
            (
                "bearingPressure",
                "Allowable bearing input",
                200000.,
                "kPa",
                0.001,
            ),
            ("embedment", "Foundation depth", 1.2, "m", 1.),
            ("soilUnitWeight", "Soil unit weight", 18000., "N/m³", 1.),
        ],
        _ => vec![],
    };
    f.extend([
        (
            "concreteStrength",
            "Concrete strength input",
            30e6,
            "MPa",
            1e-6,
        ),
        (
            "rebarStrength",
            "Reinforcement strength input",
            500e6,
            "MPa",
            1e-6,
        ),
    ]);
    f
}
pub fn templates() -> Value {
    json!([("rcBeam","RC beam"),("slab","Slab"),("padFooting","Pad footing")].iter().map(|(kind,name)|json!({"kind":kind,"name":name,"mock":true,"fields":fields(kind).into_iter().map(|(key,label,value,unit,scale)|json!({"key":key,"label":label,"defaultValue":value,"unit":unit,"displayScale":scale})).collect::<Vec<_>>()})).collect::<Vec<_>>())
}
pub fn apply(v: &mut Value, c: &Value) -> Result<()> {
    if v.get("designPreviews").is_none() {
        v["designPreviews"] = json!([]);
    }
    let a = &c["args"];
    if c["type"] == "CreateDesignPreview" {
        let kind = a["kind"].as_str().unwrap_or("");
        if !["rcBeam", "slab", "padFooting"].contains(&kind) {
            return Err(err("INVALID_SCHEMA", "Unknown preview kind"));
        }
        let id = format!(
            "dp{}",
            &digest(format!("{}:{}", c["id"], v["revision"]).as_bytes())[..16]
        );
        let draft = DesignPreview {
            id,
            kind: kind.into(),
            target_id: a["targetId"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(String::from),
            input_source: "syntheticFixture".into(),
            input_sources: fields(kind)
                .iter()
                .map(|(k, _, _, _, _)| (k.to_string(), "syntheticFixture".to_string()))
                .collect(),
            inputs: fields(kind)
                .iter()
                .map(|(k, _, v, _, _)| (k.to_string(), *v))
                .collect(),
            soil_reference:
                "Synthetic starter input; replace with a referenced geotechnical report".into(),
        };
        v["designPreviews"]
            .as_array_mut()
            .unwrap()
            .push(serde_json::to_value(draft).unwrap());
    } else {
        let id = a["id"].as_str().unwrap_or("");
        let index = v["designPreviews"]
            .as_array()
            .unwrap()
            .iter()
            .position(|d| d["id"] == id)
            .ok_or_else(|| err("DANGLING_REFERENCE", "Unknown design preview"))?;
        if c["type"] == "DeleteDesignPreview" {
            v["designPreviews"].as_array_mut().unwrap().remove(index);
            return Ok(());
        }
        let kind = v["designPreviews"][index]["kind"]
            .as_str()
            .unwrap()
            .to_string();
        let mut inputs = a["inputs"].clone();
        for (key, _, _, unit, _) in fields(&kind) {
            if key == "soilUnitWeight" {
                let n = inputs[key]
                    .as_f64()
                    .or_else(|| inputs[key].as_str().and_then(|s| s.parse().ok()))
                    .ok_or_else(|| {
                        err("INVALID_SCHEMA", "Soil unit weight must be numeric in N/m³")
                    })?;
                inputs[key] = json!(n);
            } else {
                super::quantity(
                    &mut inputs[key],
                    match unit {
                        "MPa" | "kPa" => "stress",
                        "" => "dimensionless",
                        _ => "length",
                    },
                )?;
            }
        }
        let old = &v["designPreviews"][index];
        let sources: serde_json::Map<String, Value> = fields(&kind)
            .iter()
            .map(|(key, _, _, _, _)| {
                let source = if inputs[*key] != old["inputs"][*key] {
                    "user"
                } else {
                    old["inputSources"][*key]
                        .as_str()
                        .unwrap_or(old["inputSource"].as_str().unwrap_or("syntheticFixture"))
                };
                (key.to_string(), json!(source))
            })
            .collect();
        let all_user = sources.values().all(|s| s == "user");
        let all_mock = sources.values().all(|s| s == "syntheticFixture");
        v["designPreviews"][index]["inputSources"] = json!(sources);
        v["designPreviews"][index]["inputs"] = inputs;
        v["designPreviews"][index]["inputSource"] = json!(if all_user {
            "user"
        } else if all_mock {
            "syntheticFixture"
        } else {
            "mixed"
        });
        v["designPreviews"][index]["soilReference"] =
            json!(a["soilReference"].as_str().unwrap_or(""));
        if let Some(id) = a["targetId"].as_str().filter(|s| !s.is_empty()) {
            v["designPreviews"][index]["targetId"] = json!(id);
        } else {
            v["designPreviews"][index]
                .as_object_mut()
                .unwrap()
                .remove("targetId");
        }
    }
    Ok(())
}
pub fn evaluate(p: &Project, input: &Value) -> Result<Value> {
    if input["modelHash"] != p.hash() {
        return Err(err(
            "STALE_RESULT",
            "Preview request belongs to another model",
        ));
    }
    let id = input["draftId"].as_str().unwrap_or("");
    let draft = p
        .design_previews
        .iter()
        .find(|d| d.id == id)
        .ok_or_else(|| err("DANGLING_REFERENCE", "Unknown preview"))?;
    let mut source = json!({"kind":"syntheticFixture","mock":true,"fixtureId":format!("{}-workflow-illustration-v1",draft.kind),"units":"SI","actions":[0,40000,0,0,0,120000],"note":"Illustrative upstream actions, not a solver result"});
    if draft.kind == "padFooting" {
        source = json!({"kind":"syntheticFixture","mock":true,"fixtureId":"pad-footing-reaction-v1","foundationActions":[0,0,-800000,40000,60000,0],"axes":"Global [Fx,Fy,Fz,Mx,My,Mz], N and N m","note":"Synthetic downward load and biaxial moments; no contact solution"});
    }
    if draft.kind == "slab" {
        source = json!({"kind":"syntheticFixture","mock":true,"fixtureId":"slab-plate-actions-v1","units":"N m/m","rawPlateActions":{"mx":-62000,"my":-31000,"mxy":8500},"designTransform":"unavailable","meshConvergence":"notChecked","note":"No validated plate/shell analysis; never use a frame-member result as a slab action"});
    }
    if input["sourceMode"] == "model" {
        if draft.kind == "slab" {
            return Err(err(
                "UNSUPPORTED_FEATURE",
                "Validated plate actions are unavailable; only synthetic slab preview is supported",
            ));
        }
        let target = draft
            .target_id
            .as_ref()
            .ok_or_else(|| err("DESIGN_INPUT_INCOMPLETE", "Choose a model member/support"))?;
        let case = input["caseId"].as_str().unwrap_or("");
        let a = workbench_assembly::analyse(p, case)?;
        if input["resultId"] != a.result_id || !a.converged {
            return Err(err(
                "STALE_RESULT",
                "Current converged case/combination is required",
            ));
        }
        source = json!({"kind":"modelAnalysis","mock":false,"resultId":a.result_id,"modelHash":a.model_hash,"sourceRevision":a.source_revision,"solverBuildHash":a.solver_build_hash,"settingsHash":a.settings_hash,"combinationId":case,"targetId":target});
        if draft.kind == "rcBeam" {
            let m = a
                .members
                .iter()
                .find(|m| &m.id == target)
                .ok_or_else(|| err("DANGLING_REFERENCE", "Member result unavailable"))?;
            source["stations"] = serde_json::to_value(&m.key_stations).unwrap();
            source["note"] = json!(
                "Actual model actions; preview section is not applied to frame stiffness, and no concrete resistance is calculated"
            );
        } else {
            let i = a
                .reaction_support_ids
                .iter()
                .position(|id| id == target)
                .ok_or_else(|| err("DANGLING_REFERENCE", "Support reaction unavailable"))?;
            let reaction = &a.reactions[i * 6..i * 6 + 6];
            source["supportReaction"] = json!(reaction);
            source["foundationActions"] = json!(reaction.iter().map(|v| -v).collect::<Vec<_>>());
            source["axes"] = json!(
                "Global [Fx,Fy,Fz,Mx,My,Mz], SI; foundation actions oppose support-on-structure reactions"
            );
            source["note"] = json!(
                "Exact simultaneous support reaction; no soil/contact solution or frame-foundation coupling"
            );
        }
    } else if input["sourceMode"] != "synthetic" {
        return Err(err(
            "INVALID_SCHEMA",
            "Choose model or synthetic upstream source",
        ));
    }
    let checks: Vec<&str> = match draft.kind.as_str() {
        "rcBeam" => vec![
            "Flexure",
            "Shear",
            "Minimum/maximum reinforcement",
            "Cover and spacing",
            "Anchorage",
            "Serviceability",
        ],
        "slab" => vec![
            "Plate/shell solution",
            "Mesh convergence",
            "Design action transformation",
            "Top X/Y reinforcement",
            "Bottom X/Y reinforcement",
            "Punching",
        ],
        _ => vec![
            "Compression-only contact",
            "Bearing",
            "Sliding/overturning",
            "Flexure",
            "One-way shear",
            "Punching",
            "Detailing",
        ],
    };
    let schedule = if draft.kind == "rcBeam" {
        json!([{"mark":"ILL-01","region":"Top and bottom preference","diameter":draft.inputs["barDiameter"],"quantityPerFace":draft.inputs["barCount"],"cutLength":null,"source":"illustrationOnly","status":"unverified"}])
    } else {
        json!([])
    };
    let mut run = json!({"contractVersion":1,"draftId":id,"kind":draft.kind,"overall":"unsupported","mock":true,"codeProfile":null,"modelHash":p.hash(),"sourceRevision":p.revision,
        "inputHash":digest(&serde_json::to_vec(draft).unwrap()),"inputs":draft,"sourceProvenance":source,"schedule":schedule,
        "checks":checks.iter().map(|name|json!({"name":name,"status":"unsupported","utilisation":null,"reason":"Required numerical family or locked code/example resources are unavailable"})).collect::<Vec<_>>(),
        "contactState":if draft.kind=="padFooting"{"indeterminate"}else{"notApplicable"},
        "reinforcementFields":["Top X","Top Y","Bottom X","Bottom Y"],
        "soilProvenance":if draft.kind=="padFooting"{json!({"source":draft.input_sources.get("bearingPressure").unwrap_or(&draft.input_source),"reference":draft.soil_reference,"bearingPressure":draft.inputs["bearingPressure"],"computedByWorkbench":false})}else{Value::Null},
        "limitations":["MOCK WORKFLOW — no code-compliance claim","Dimensions are draft inputs; frame geometry/stiffness is unchanged","Illustrations are not construction details; quantities/fit/anchorage and cut lengths are unverified"]});
    run["previewRunId"] = json!(digest(&serde_json::to_vec(&run).unwrap()));
    Ok(run)
}
