use serde_json::{Value, json};
use workbench_wasm_api::Kernel;
fn request(k: &mut Kernel, op: &str, rev: Value, payload: Value) -> Value {
    serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"test","operation":op,"expectedRevision":rev,"payload":payload}).to_string())).unwrap()
}
#[test]
fn atomic_undo_revision_conflict() {
    let mut k = Kernel::new();
    let p: Value =
        serde_json::from_str(&std::fs::read_to_string("../../fixtures/models/B02.json").unwrap())
            .unwrap();
    let a = request(&mut k, "createProject", Value::Null, json!({"project":p}));
    assert_eq!(a["status"], "ok");
    let bad = request(
        &mut k,
        "applyCommand",
        json!(0),
        json!({"command":{"type":"SetNodePosition","args":{"id":"n2","position":[0,0,0]}}}),
    );
    assert_eq!(bad["status"], "error");
    assert_eq!(bad["revision"], 0);
    let b = request(
        &mut k,
        "applyCommand",
        json!(0),
        json!({"command":{"type":"SetNodePosition","args":{"id":"n2","position":[4,0,0]}}}),
    );
    assert_eq!(b["revision"], 1);
    assert_ne!(a["modelHash"], b["modelHash"]);
    let conflict = request(&mut k, "undo", json!(0), json!({}));
    assert_eq!(conflict["diagnostics"][0]["code"], "REVISION_CONFLICT");
    let c = request(&mut k, "undo", json!(1), json!({}));
    assert_eq!(c["modelHash"], a["modelHash"]);
    let d = request(&mut k, "redo", json!(2), json!({}));
    assert_eq!(d["modelHash"], b["modelHash"]);
}

#[test]
fn engineering_units_are_parsed_in_rust_and_fail_atomically() {
    let mut k = Kernel::new();
    let p: Value =
        serde_json::from_str(&std::fs::read_to_string("../../fixtures/models/B02.json").unwrap())
            .unwrap();
    request(&mut k, "createProject", Value::Null, json!({"project":p}));
    let out = request(
        &mut k,
        "applyCommand",
        json!(0),
        json!({"command":{"type":"SetNodePosition","args":{"id":"n2","position":["4250 mm",0,0]}}}),
    );
    assert_eq!(out["payload"]["project"]["nodes"][1]["position"][0], 4.25);
    let bad = request(
        &mut k,
        "applyCommand",
        json!(1),
        json!({"command":{"type":"SetNodePosition","args":{"id":"n2","position":["10 kN",0,0]}}}),
    );
    assert_eq!(bad["status"], "error");
    assert_eq!(bad["revision"], 1);
}
