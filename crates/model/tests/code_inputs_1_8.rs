//! Schema 1.8.0 (ADR 0027): code inputs for every RC kind, validated per kind,
//! and rcColumn link spacing.
use serde_json::{Value, json};
use workbench_model::{CURRENT_SCHEMA, SCHEMA_1_7, import_project};

/// B08 at the current schema with one rcColumn draft on m1 and its design object.
fn column(code_inputs: Option<Value>, link_spacing: bool) -> Value {
    let (mut p, _) = import_project(include_str!("../../../fixtures/models/B08.json")).unwrap();
    let mut inputs = json!({"width":0.4,"depth":0.4,"cover":0.03,"concreteStrength":30e6,"rebarStrength":500e6,
        "barDiameter":0.025,"barsAlongWidth":3.0,"barsAlongDepth":3.0,"linkDiameter":0.01});
    inputs["linkSpacing"] = json!(0.2);
    let draft = json!({"id":"dc1","kind":"rcColumn","targetId":"m1","inputSource":"user","inputs":inputs,"soilReference":""});
    p.design_previews = vec![serde_json::from_value(draft).unwrap()];
    let mut structure = p.structure.clone();
    structure.sync_records(&p);
    p.structure = structure;
    let mut v = serde_json::to_value(&p).unwrap();
    if !link_spacing {
        v["designPreviews"][0]["inputs"].as_object_mut().unwrap().remove("linkSpacing");
    }
    if let Some(ci) = code_inputs {
        v["designPreviews"][0]["codeInputs"] = ci;
    }
    v
}

#[test]
fn a_1_7_column_gains_a_synthetic_link_spacing() {
    let mut v = column(None, false);
    v["schemaVersion"] = json!(SCHEMA_1_7);
    let sources: serde_json::Map<String, Value> =
        v["designPreviews"][0]["inputs"].as_object().unwrap().keys().map(|k| (k.clone(), json!("user"))).collect();
    v["designPreviews"][0]["inputSources"] = Value::Object(sources);
    let (p, report) = import_project(&v.to_string()).unwrap();
    assert_eq!((report.from.as_str(), report.to.as_str()), (SCHEMA_1_7, CURRENT_SCHEMA));
    assert_eq!(
        report.steps,
        [
            "record 200 mm link spacing (synthetic) on 1 RC column draft(s)",
            "set schemaVersion 1.8.0 (code inputs for columns, slabs and footings)",
            "set schemaVersion 1.9.0 (single-plate connection drafts)", "set schemaVersion 1.10.0 (composite beam drafts)"
        ]
    );
    assert_eq!(p.design_previews[0].inputs["linkSpacing"], 0.2);
    assert_eq!(p.design_previews[0].input_sources["linkSpacing"], "syntheticFixture");
    // A 1.7.0 file cannot already carry 1.8.0 content.
    let mut v = column(None, true);
    v["schemaVersion"] = json!(SCHEMA_1_7);
    assert_eq!(import_project(&v.to_string()).unwrap_err().code, "INVALID_SCHEMA");
    let mut v = column(Some(json!({"braced": true})), false);
    v["schemaVersion"] = json!(SCHEMA_1_7);
    assert_eq!(import_project(&v.to_string()).unwrap_err().code, "INVALID_SCHEMA");
}

#[test]
fn code_inputs_are_validated_for_the_draft_kind() {
    let ok = json!({"exposureClass":"XC1","minimumCoverDurability":0.015,"aggregateSize":0.02,
        "braced":false,"restraintY":[0.1, 1000.0],"restraintZ":[0.5, 0.5],"effectiveCreepRatio":1.5});
    let (p, _) = import_project(&column(Some(ok.clone()), true).to_string()).unwrap();
    assert_eq!(serde_json::to_value(&p.design_previews[0].code_inputs).unwrap(), ok);
    for (field, bad) in [
        ("quasiPermanentCombinationId", json!("LC1")),
        ("structuralSystem", json!("interiorSpan")),
        ("partitionsSensitive", json!(true)),
        ("restraintY", json!([-0.1, 0.5])),
        ("restraintZ", json!([0.5, 1001.0])),
        ("effectiveCreepRatio", json!(12.0)),
    ] {
        let mut ci = ok.clone();
        ci[field] = bad;
        assert_eq!(import_project(&column(Some(ci), true).to_string()).unwrap_err().code, "INVALID_SCHEMA", "{field}");
    }
}

#[test]
fn footing_code_inputs_apply_only_to_footings_and_reference_a_combination() {
    // On a column, footing fields are refused.
    for (field, value) in [("castOnBlinding", json!(true)), ("bearingCombinationId", json!("LC1"))] {
        let mut ci = json!({});
        ci[field] = value;
        assert_eq!(import_project(&column(Some(ci), true).to_string()).unwrap_err().code, "INVALID_SCHEMA", "{field}");
    }
    // On a pad footing bound to s1 they are kept, and the combination must exist.
    let footing = |ci: Value| {
        let mut v = column(None, true);
        let d = &mut v["designPreviews"][0];
        d["kind"] = json!("padFooting");
        d["targetId"] = json!("s1");
        d["inputs"] = json!({"length":2.4,"width":2.1,"thickness":0.55,"cover":0.05,"concreteStrength":30e6,"rebarStrength":500e6,
            "columnWidth":0.4,"columnDepth":0.4,"bearingPressure":200e3,"embedment":1.2,"soilUnitWeight":18e3});
        d["codeInputs"] = ci;
        let (mut p, _) = import_project(include_str!("../../../fixtures/models/B08.json")).unwrap();
        p.design_previews = vec![serde_json::from_value(v["designPreviews"][0].clone()).unwrap()];
        let mut s = p.structure.clone();
        s.sync_records(&p);
        p.structure = s;
        let mut out = serde_json::to_value(&p).unwrap();
        out["designPreviews"][0]["codeInputs"] = v["designPreviews"][0]["codeInputs"].clone();
        out
    };
    let ok = json!({"castOnBlinding": false, "bearingCombinationId": "LC1"});
    let (p, _) = import_project(&footing(ok.clone()).to_string()).unwrap();
    assert_eq!(serde_json::to_value(&p.design_previews[0].code_inputs).unwrap(), ok);
    let err = import_project(&footing(json!({"bearingCombinationId": "nope"})).to_string()).unwrap_err();
    assert_eq!(err.code, "DANGLING_REFERENCE");
}
