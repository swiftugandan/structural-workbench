//! Schema 1.9.0 (ADR 0030): single-plate connection drafts bound to a beam
//! end, validated against the model's topology; 1.8.0 files cannot carry one.
use serde_json::{Value, json};
use workbench_model::{CURRENT_SCHEMA, SCHEMA_1_8, import_project};

/// C01 (W18X50 beam between two W14X90 columns) with one connection draft
/// at the beam's end node and its design object.
fn connection(c: Value) -> Value {
    let (mut p, _) = import_project(include_str!("../../../fixtures/models/C01.json")).unwrap();
    let inputs = json!({"rows":4.0,"columns":1.0,"pitch":0.0762,"gauge":0.0762,"plateThickness":0.00635,"plateFy":344.738e6,
        "plateFu":448.159e6,"lev":0.03175,"lehPlate":0.0381,"a":0.0762,"lehBeam":0.0381,"underrun":0.0,"topOffset":0.0762,
        "weldSize":0.00635,"fexx":482.633e6});
    let draft = json!({"id":"sp1","kind":"singlePlate","targetId":"beam","inputSource":"user","inputs":inputs,"soilReference":"","connection":c});
    p.design_previews = vec![serde_json::from_value(draft).unwrap()];
    let mut structure = p.structure.clone();
    structure.sync_records(&p);
    p.structure = structure;
    serde_json::to_value(&p).unwrap()
}

fn at(end: &str, support: &str) -> Value {
    json!({"end":end,"supportMemberId":support,"supportKind":"columnFlange","bolt":"3/4","boltGroup":"group120",
           "threadsExcluded":false,"deformationConsidered":true,"bracedAgainstRotation":true})
}

#[test]
fn a_connection_at_the_beam_end_round_trips() {
    let v = connection(at("end", "c2"));
    assert_eq!(v["schemaVersion"], CURRENT_SCHEMA);
    let (p, report) = import_project(&v.to_string()).unwrap();
    assert!(report.steps.is_empty());
    let d = &p.design_previews[0];
    assert_eq!(
        d.connection.as_ref().unwrap().support_member_id.as_deref(),
        Some("c2")
    );
    assert_eq!(d.inputs["underrun"], 0.0);
    assert_eq!(p.structure.design_objects[0].name, "Steel connection");
}

#[test]
fn the_support_must_meet_the_connected_end() {
    let v = connection(at("end", "c2"));
    let mut wrong = v.clone();
    wrong["designPreviews"][0]["connection"]["supportMemberId"] = json!("c1");
    assert!(
        import_project(&wrong.to_string())
            .unwrap_err()
            .message
            .contains("connected end")
    );
    let mut start = v.clone();
    start["designPreviews"][0]["connection"] = at("start", "c1");
    assert!(import_project(&start.to_string()).is_ok());
}

#[test]
fn connection_inputs_are_validated() {
    let v = connection(at("end", "c2"));
    for (pointer, bad) in [
        ("/designPreviews/0/connection/bolt", json!("5/16")),
        (
            "/designPreviews/0/connection/supportKind",
            json!("baseplate"),
        ),
        ("/designPreviews/0/connection/end", json!("middle")),
        ("/designPreviews/0/connection/boltGroup", json!("group200")),
        ("/designPreviews/0/inputs/rows", json!(13.0)),
        ("/designPreviews/0/inputs/columns", json!(3.0)),
        ("/designPreviews/0/inputs/pitch", json!(0.0)),
        ("/designPreviews/0/inputs/underrun", json!(-0.001)),
        ("/designPreviews/0/inputs/plateFu", json!(300e6)),
    ] {
        let mut x = v.clone();
        *x.pointer_mut(pointer).unwrap() = bad;
        assert!(
            import_project(&x.to_string()).is_err(),
            "{pointer} accepted"
        );
    }
    // Connection inputs on another kind, or unknown fields, are refused.
    let mut x = v.clone();
    x["designPreviews"][0]["connection"]["torque"] = json!(1);
    assert!(import_project(&x.to_string()).is_err());
}

#[test]
fn a_1_8_file_migrates_and_cannot_carry_a_connection() {
    let (p, _) = import_project(include_str!("../../../fixtures/models/C01.json")).unwrap();
    let mut v: Value = serde_json::to_value(&p).unwrap();
    v["schemaVersion"] = json!(SCHEMA_1_8);
    let (_, report) = import_project(&v.to_string()).unwrap();
    assert_eq!(
        report.steps,
        [
            "set schemaVersion 1.9.0 (single-plate connection drafts)",
            "set schemaVersion 1.10.0 (composite beam drafts)"
        ]
    );
    let mut v = connection(at("end", "c2"));
    v["schemaVersion"] = json!(SCHEMA_1_8);
    assert!(
        import_project(&v.to_string())
            .unwrap_err()
            .message
            .contains("1.8.0")
    );
}
