//! Schema 1.7.0 rcBeam code inputs (ADR 0026): migration from 1.6.0 and
//! validation of the stored values.
use serde_json::{Value, json};
use workbench_model::{CURRENT_SCHEMA, SCHEMA_1_6, import_project};

fn beam(code_inputs: Option<Value>) -> Value {
    // B08 at the current schema with one rcBeam draft on m1 and its design object.
    let (mut p, _) = import_project(include_str!("../../../fixtures/models/B08.json")).unwrap();
    let draft = json!({"id":"dp1","kind":"rcBeam","targetId":"m1","inputSource":"user",
        "inputs":{"width":0.3,"depth":0.6,"cover":0.03,"concreteStrength":30e6,"rebarStrength":500e6,
            "topBarCount":2.0,"topBarDiameter":0.016,"bottomBarCount":3.0,"bottomBarDiameter":0.02,
            "linkDiameter":0.008,"linkSpacing":0.2,"linkLegs":2.0},
        "soilReference":""});
    p.design_previews = vec![serde_json::from_value(draft).unwrap()];
    let mut structure = p.structure.clone();
    structure.sync_records(&p);
    p.structure = structure;
    let mut v = serde_json::to_value(&p).unwrap();
    if let Some(ci) = code_inputs {
        v["designPreviews"][0]["codeInputs"] = ci;
    }
    v
}

fn inputs() -> Value {
    json!({"exposureClass":"XC1","minimumCoverDurability":0.015,"aggregateSize":0.02,
        "structuralSystem":"interiorSpan","partitionsSensitive":false,"quasiPermanentCombinationId":"LC1"})
}

#[test]
fn a_1_6_project_migrates_by_version_only_and_cannot_carry_code_inputs() {
    let mut v = beam(None);
    v["schemaVersion"] = json!(SCHEMA_1_6);
    let (migrated, report) = import_project(&v.to_string()).unwrap();
    assert_eq!((report.from.as_str(), report.to.as_str()), (SCHEMA_1_6, CURRENT_SCHEMA));
    assert_eq!(
        report.steps,
        ["set schemaVersion 1.7.0 (no RC beam code inputs)", "set schemaVersion 1.8.0 (code inputs for columns, slabs and footings)", "set schemaVersion 1.9.0 (single-plate connection drafts)", "set schemaVersion 1.10.0 (composite beam drafts)"]
    );
    assert!(migrated.design_previews[0].code_inputs.is_none());
    // A 1.6.0 file cannot already carry 1.7.0 content.
    let mut v = beam(Some(inputs()));
    v["schemaVersion"] = json!(SCHEMA_1_6);
    assert_eq!(import_project(&v.to_string()).unwrap_err().code, "INVALID_SCHEMA");
}

#[test]
fn code_inputs_round_trip_and_invalid_values_are_refused() {
    let (p, _) = import_project(&beam(Some(inputs())).to_string()).unwrap();
    let stored = serde_json::to_value(&p.design_previews[0].code_inputs).unwrap();
    assert_eq!(stored, inputs());
    for (field, bad, code) in [
        ("exposureClass", json!("XZ9"), "INVALID_SCHEMA"),
        ("structuralSystem", json!("propped"), "INVALID_SCHEMA"),
        ("minimumCoverDurability", json!(0.2), "INVALID_SCHEMA"),
        ("aggregateSize", json!(0.0), "INVALID_SCHEMA"),
        ("quasiPermanentCombinationId", json!("nope"), "DANGLING_REFERENCE"),
        ("unknownField", json!(1), "INVALID_SCHEMA"),
    ] {
        let mut ci = inputs();
        ci[field] = bad;
        let err = import_project(&beam(Some(ci)).to_string()).unwrap_err();
        assert_eq!(err.code, code, "{field}: {}", err.message);
    }
    // Code inputs belong to RC beams only.
    let mut v = beam(Some(inputs()));
    v["designPreviews"][0]["kind"] = json!("padFooting");
    assert!(import_project(&v.to_string()).is_err());
}
