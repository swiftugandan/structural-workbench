//! Workflow previews. Missing numerical/code resources never produce a PASS.
use serde_json::{Value, json};
use workbench_design::rc_section::{
    self, BarLayer, BarRow, ConcreteLaw, ElasticInputs, RcRectangle, SteelLaw,
};
use workbench_model::{
    DesignPreview, MECHANICS_COMMON_KEYS, Project, Result, SectionMechanicsInputs, digest, err,
};

fn fields(kind: &str) -> Vec<(&'static str, &'static str, f64, &'static str, f64)> {
    let mut f = match kind {
        "rcBeam" => vec![
            ("width", "Width", 0.3, "mm", 1000.),
            ("depth", "Depth", 0.6, "mm", 1000.),
            ("cover", "Cover", 0.035, "mm", 1000.),
            ("topBarDiameter", "Top bar diameter", 0.02, "mm", 1000.),
            ("topBarCount", "Top bars", 4., "", 1.),
            ("bottomBarDiameter", "Bottom bar diameter", 0.02, "mm", 1000.),
            ("bottomBarCount", "Bottom bars", 4., "", 1.),
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
/// (key, label, synthetic default, unit, display scale, law or "all"). Defaults are the
/// RC-SR-BLOCK oracle fixture values, never code coefficients (ADR 0012).
type MechanicsField = (&'static str, &'static str, f64, &'static str, f64, &'static str);
const MECHANICS_FIELDS: &[MechanicsField] = &[
    ("blockIntensity", "Stress-block intensity", 20e6, "MPa", 1e-6, "rectangularBlock"),
    ("blockDepthRatio", "Stress-block depth ratio λ", 0.75, "", 1., "rectangularBlock"),
    ("parabolaPeak", "Peak concrete stress", 20e6, "MPa", 1e-6, "parabolaRectangle"),
    ("strainAtPeak", "Strain at peak stress", 0.002, "", 1., "parabolaRectangle"),
    ("parabolaExponent", "Parabola exponent n", 2., "", 1., "parabolaRectangle"),
    ("ultimateStrain", "Ultimate concrete strain", 0.003, "", 1., "all"),
    ("steelYieldStrength", "Steel yield strength (mechanics)", 460e6, "MPa", 1e-6, "all"),
    ("steelModulus", "Steel modulus", 200e9, "GPa", 1e-9, "all"),
    ("concreteModulus", "Concrete modulus", 30e9, "GPa", 1e-9, "all"),
    ("concreteTensileStrength", "Concrete tensile strength", 2.8e6, "MPa", 1e-6, "all"),
    ("minimumClearSpacing", "Minimum clear bar spacing", 0.025, "mm", 1000., "all"),
];
const MECHANICS_LAWS: &[(&str, &str)] = &[
    ("rectangularBlock", "Rectangular stress block"),
    ("parabolaRectangle", "Parabola-rectangle"),
];
fn mechanics_default(law: &str, key: &str) -> Option<f64> {
    MECHANICS_FIELDS
        .iter()
        .find(|f| f.0 == key && (f.5 == "all" || f.5 == law))
        .map(|f| f.2)
}
fn mechanics_keys(law: &str) -> Result<Vec<&'static str>> {
    let law_keys = SectionMechanicsInputs::law_keys(law)
        .ok_or_else(|| err("INVALID_SCHEMA", "Unknown section-mechanics law"))?;
    Ok(MECHANICS_COMMON_KEYS.iter().chain(law_keys).copied().collect())
}
fn default_mechanics() -> SectionMechanicsInputs {
    let law = "rectangularBlock";
    let keys = mechanics_keys(law).unwrap();
    SectionMechanicsInputs {
        law: law.into(),
        inputs: keys
            .iter()
            .map(|k| (k.to_string(), mechanics_default(law, k).unwrap()))
            .collect(),
        input_sources: keys
            .iter()
            .map(|k| (k.to_string(), "syntheticFixture".to_string()))
            .collect(),
    }
}
/// Parse edited mechanics inputs; provenance is `user` only where the value
/// differs from the previously stored value (or the synthetic default for a
/// newly introduced key).
fn edit_mechanics(
    old: Option<&SectionMechanicsInputs>,
    args: &Value,
) -> Result<SectionMechanicsInputs> {
    let law = args["law"]
        .as_str()
        .ok_or_else(|| err("INVALID_SCHEMA", "Section-mechanics law is required"))?;
    let keys = mechanics_keys(law)?;
    let mut inputs = std::collections::BTreeMap::new();
    let mut sources = std::collections::BTreeMap::new();
    for key in keys {
        let unit = MECHANICS_FIELDS.iter().find(|f| f.0 == key).unwrap().3;
        let mut v = args["inputs"][key].clone();
        super::quantity(
            &mut v,
            match unit {
                "MPa" | "GPa" => "stress",
                "" => "dimensionless",
                _ => "length",
            },
        )?;
        let value = v.as_f64().ok_or_else(|| {
            err("INVALID_SCHEMA", format!("Section-mechanics input {key} must be numeric"))
        })?;
        let previous =
            old.and_then(|m| m.inputs.get(key).map(|v| (*v, m.input_sources[key].clone())));
        let source = match previous {
            Some((p, s)) if p == value => s,
            Some(_) => "user".into(),
            None if mechanics_default(law, key) == Some(value) => "syntheticFixture".into(),
            None => "user".into(),
        };
        inputs.insert(key.to_string(), value);
        sources.insert(key.to_string(), source);
    }
    let m = SectionMechanicsInputs {
        law: law.into(),
        inputs,
        input_sources: sources,
    };
    m.validate()?;
    Ok(m)
}
pub fn templates() -> Value {
    json!([("rcBeam","RC beam"),("slab","Slab"),("padFooting","Pad footing")].iter().map(|(kind,name)|{
        let mut t = json!({"kind":kind,"name":name,"mock":true,"fields":fields(kind).into_iter().map(|(key,label,value,unit,scale)|json!({"key":key,"label":label,"defaultValue":value,"unit":unit,"displayScale":scale})).collect::<Vec<_>>()});
        if *kind == "rcBeam" {
            t["mechanics"] = json!({
                "laws": MECHANICS_LAWS.iter().map(|(id,label)|json!({"id":id,"label":label})).collect::<Vec<_>>(),
                "defaultLaw": "rectangularBlock",
                "fields": MECHANICS_FIELDS.iter().map(|(key,label,value,unit,scale,law)|json!({"key":key,"label":label,"defaultValue":value,"unit":unit,"displayScale":scale,"law":law})).collect::<Vec<_>>(),
            });
        }
        t
    }).collect::<Vec<_>>())
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
            mechanics: (kind == "rcBeam").then(default_mechanics),
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
        if kind == "rcBeam" && !a["mechanics"].is_null() {
            let old: Option<SectionMechanicsInputs> =
                serde_json::from_value(v["designPreviews"][index]["mechanics"].clone()).ok();
            v["designPreviews"][index]["mechanics"] =
                serde_json::to_value(edit_mechanics(old.as_ref(), &a["mechanics"])?).unwrap();
        } else if kind != "rcBeam" && !a["mechanics"].is_null() {
            return Err(err(
                "INVALID_SCHEMA",
                "Section mechanics apply only to RC beam drafts",
            ));
        }
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
/// Code-agnostic section mechanics for an rcBeam draft (ADR 0012). Each face
/// has one row of its own bars; `cover` is taken to the link. Sagging puts
/// the top face in compression, hogging the bottom. Results are mechanics only
/// and never feed a check status.
fn section_mechanics(d: &DesignPreview) -> Value {
    let Some(m) = &d.mechanics else {
        return json!({"status":"notConfigured","reason":"No explicit section-mechanics material law is recorded for this draft"});
    };
    let v = &d.inputs;
    let mi = &m.inputs;
    let row = |face: &str| BarRow {
        width: v["width"],
        side_cover: v["cover"],
        link_diameter: v["linkDiameter"],
        bar_diameter: v[&format!("{face}BarDiameter")],
        count: v[&format!("{face}BarCount")] as u32,
        minimum_clear_spacing: mi["minimumClearSpacing"],
    };
    let base = json!({"basis":"mechanics","codeProfile":null,"law":m.law,"inputs":mi,"inputSources":m.input_sources,
        "arrangement":"One row per face (top and bottom bar inputs); cover measured to the link; layer depths from the compression face",
        "limitations":["Mechanics only — not a code resistance; no partial factors or code limits applied","Pure flexure (N = 0) about the width axis; concrete tension ignored at ultimate and in the cracked state","Material-law parameters are explicit inputs with recorded provenance"]});
    let (top, bottom) = match (rc_section::row_fit(&row("top")), rc_section::row_fit(&row("bottom"))) {
        (Ok(t), Ok(b)) => (t, b),
        (Err(e), _) | (_, Err(e)) => return merge(base, json!({"status":"unsupported","reason":e.message})),
    };
    let fits = json!({"top":top,"bottom":bottom});
    if !(top.fits && bottom.fits) {
        let faces: Vec<&str> = [("top", top.fits), ("bottom", bottom.fits)]
            .iter()
            .filter(|(_, ok)| !ok)
            .map(|(f, _)| *f)
            .collect();
        return merge(base, json!({"status":"rowDoesNotFit","rowFits":fits,"reason":format!("The {} bar row does not fit the width with the stated clear spacing; ultimate state not evaluated", faces.join(" and "))}));
    }
    let section = RcRectangle { width: v["width"], depth: v["depth"] };
    let steel = SteelLaw { yield_strength: mi["steelYieldStrength"], modulus: mi["steelModulus"] };
    let law = if m.law == "rectangularBlock" {
        ConcreteLaw::RectangularBlock {
            intensity: mi["blockIntensity"],
            depth_ratio: mi["blockDepthRatio"],
            ultimate_strain: mi["ultimateStrain"],
        }
    } else {
        ConcreteLaw::ParabolaRectangle {
            peak: mi["parabolaPeak"],
            strain_at_peak: mi["strainAtPeak"],
            ultimate_strain: mi["ultimateStrain"],
            exponent: mi["parabolaExponent"],
        }
    };
    let elastic_inputs = ElasticInputs {
        concrete_modulus: mi["concreteModulus"],
        tensile_strength: Some(mi["concreteTensileStrength"]),
        service_moment: None,
    };
    // Layers are ordered [compression-face row, opposite row] with depths from
    // the compression face.
    let state = |compression: &str, near: &rc_section::RowFit, far: &rc_section::RowFit| -> Value {
        let layers = [
            BarLayer { depth: near.depth_from_face, area: near.area },
            BarLayer { depth: v["depth"] - far.depth_from_face, area: far.area },
        ];
        match (
            rc_section::ultimate(&section, &layers, &steel, &law),
            rc_section::elastic(&section, &layers, &steel, &elastic_inputs),
        ) {
            (Ok(u), Ok(e)) => json!({"status":"evaluated","compressionFace":compression,"layers":layers,"ultimate":u,"elastic":e}),
            (Err(e), _) | (_, Err(e)) => json!({"status":"unsupported","compressionFace":compression,"reason":e.message}),
        }
    };
    let sagging = state("top", &top, &bottom);
    let hogging = state("bottom", &bottom, &top);
    let status = if sagging["status"] == "evaluated" && hogging["status"] == "evaluated" {
        "evaluated"
    } else {
        "unsupported"
    };
    merge(base, json!({"status":status,"rowFits":fits,"sagging":sagging,"hogging":hogging}))
}
fn merge(mut a: Value, b: Value) -> Value {
    for (k, v) in b.as_object().unwrap() {
        a[k] = v.clone();
    }
    a
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
        json!([("ILL-T1","Top","top"),("ILL-B1","Bottom","bottom")].iter().map(|(mark,region,face)|json!({"mark":mark,"region":region,"diameter":draft.inputs[&format!("{face}BarDiameter")],"quantity":draft.inputs[&format!("{face}BarCount")],"cutLength":null,"source":"illustrationOnly","status":"unverified"})).collect::<Vec<_>>())
    } else {
        json!([])
    };
    let mut run = json!({"contractVersion":1,"draftId":id,"kind":draft.kind,"overall":"unsupported","mock":true,"codeProfile":null,"modelHash":p.hash(),"sourceRevision":p.revision,
        "inputHash":digest(&serde_json::to_vec(draft).unwrap()),"inputs":draft,"sourceProvenance":source,"schedule":schedule,
        "checks":checks.iter().map(|name|json!({"name":name,"status":"unsupported","utilisation":null,"reason":if *name=="Flexure"&&draft.kind=="rcBeam"{"Code profile unavailable. Section mechanics are reported separately and are not a code resistance"}else{"Required numerical family or locked code/example resources are unavailable"}})).collect::<Vec<_>>(),
        "contactState":if draft.kind=="padFooting"{"indeterminate"}else{"notApplicable"},
        "reinforcementFields":["Top X","Top Y","Bottom X","Bottom Y"],
        "soilProvenance":if draft.kind=="padFooting"{json!({"source":draft.input_sources.get("bearingPressure").unwrap_or(&draft.input_source),"reference":draft.soil_reference,"bearingPressure":draft.inputs["bearingPressure"],"computedByWorkbench":false})}else{Value::Null},
        "sectionMechanics":if draft.kind=="rcBeam"{section_mechanics(draft)}else{Value::Null},
        "limitations":["MOCK WORKFLOW — no code-compliance claim","Dimensions are draft inputs; frame geometry/stiffness is unchanged","Illustrations are not construction details; quantities/fit/anchorage and cut lengths are unverified"]});
    run["previewRunId"] = json!(digest(&serde_json::to_vec(&run).unwrap()));
    Ok(run)
}
