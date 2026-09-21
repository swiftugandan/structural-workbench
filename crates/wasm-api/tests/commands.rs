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

#[test]
fn snapping_is_authoritative_and_does_not_change_topology() {
    let mut k = Kernel::new();
    let p: Value =
        serde_json::from_str(&std::fs::read_to_string("../../fixtures/models/B02.json").unwrap())
            .unwrap();
    let initial = request(&mut k, "createProject", Value::Null, json!({"project":p}));
    let snapped = request(
        &mut k,
        "queryGeometry",
        json!(0),
        json!({"kind":"snap","query":{"position":["2999 mm",0,0],"tolerance":0.01,"features":true,"grid":0.5},"viewRevision":7}),
    );
    assert_eq!(snapped["payload"]["entityId"], "n2");
    assert_eq!(snapped["payload"]["position"], json!([3., 0., 0.]));
    assert_eq!(snapped["payload"]["viewRevision"], 7);
    assert_eq!(snapped["modelHash"], initial["modelHash"]);
    let mid = request(
        &mut k,
        "queryGeometry",
        json!(0),
        json!({"kind":"snap","query":{"position":[1.5,0,0],"tolerance":0.01,"features":true,"grid":0.5},"viewRevision":8}),
    );
    assert_eq!(mid["payload"]["kind"], "midpoint");
    assert_eq!(mid["payload"]["entityId"], Value::Null);
    let bad = request(
        &mut k,
        "queryGeometry",
        json!(0),
        json!({"kind":"snap","query":{"position":["3 kN",0,0]}}),
    );
    assert_eq!(bad["status"], "error");
    assert_eq!(bad["modelHash"], initial["modelHash"]);
}

#[test]
fn member_creation_batch_is_one_atomic_history_step() {
    let mut k = Kernel::new();
    let p: Value =
        serde_json::from_str(&std::fs::read_to_string("../../fixtures/models/B02.json").unwrap())
            .unwrap();
    let initial = request(&mut k, "createProject", Value::Null, json!({"project":p}));
    let mut m = p["members"][0].clone();
    m["id"] = json!("m2");
    m["start"] = json!("n2");
    m["end"] = json!("n3");
    let batch = |position: Value| json!({"command":{"type":"Batch","args":{"commands":[{"type":"AddNode","args":{"id":"n3","position":position}},{"type":"AddMember","args":m}]}}});
    let bad = request(&mut k, "applyCommand", json!(0), batch(json!([3, 0, 0])));
    assert_eq!(bad["diagnostics"][0]["code"], "ZERO_LENGTH_MEMBER");
    assert_eq!(bad["modelHash"], initial["modelHash"]);
    let good = request(
        &mut k,
        "applyCommand",
        json!(0),
        batch(json!([3, 0, "3000 mm"])),
    );
    assert_eq!(good["status"], "ok");
    assert_eq!(
        good["payload"]["project"]["nodes"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    let undo = request(&mut k, "undo", json!(1), json!({}));
    assert_eq!(undo["modelHash"], initial["modelHash"]);
    let redo = request(&mut k, "redo", json!(2), json!({}));
    assert_eq!(redo["modelHash"], good["modelHash"]);
}

#[test]
fn crossing_snap_does_not_split_or_connect_members() {
    let mut p: Value =
        serde_json::from_str(&std::fs::read_to_string("../../fixtures/models/B02.json").unwrap())
            .unwrap();
    p["nodes"].as_array_mut().unwrap().extend([
        json!({"id":"n3","position":[1.5,0,-1]}),
        json!({"id":"n4","position":[1.5,0,1]}),
    ]);
    let mut m = p["members"][0].clone();
    m["id"] = json!("m2");
    m["start"] = json!("n3");
    m["end"] = json!("n4");
    p["members"].as_array_mut().unwrap().push(m);
    let mut k = Kernel::new();
    let original = request(&mut k, "createProject", Value::Null, json!({"project":p}));
    assert_eq!(original["status"], "ok");
    let hit = request(
        &mut k,
        "queryGeometry",
        json!(0),
        json!({"kind":"snap","query":{"position":[1.5,0,0],"features":true,"tolerance":0.01,"grid":0.5},"viewRevision":1}),
    );
    assert_eq!(hit["payload"]["kind"], "intersection");
    assert_eq!(hit["payload"]["entityId"], Value::Null);
    let after = request(&mut k, "getSnapshot", json!(0), json!({}));
    assert_eq!(after["modelHash"], original["modelHash"]);
    assert_eq!(
        after["payload"]["project"]["nodes"],
        original["payload"]["project"]["nodes"]
    );
    assert_eq!(
        after["payload"]["project"]["members"],
        original["payload"]["project"]["members"]
    );
}

#[test]
fn load_variant_unit_conversion_preserves_exact_schema() {
    for (load, field, expected) in [
        (
            json!({"id":"newload","case":"LC1","type":"nodal","node":"n2","values":[0,0,"-12 kN",0,0,"2 kN m"]}),
            "values",
            json!([0., 0., -12000., 0., 0., 2000.]),
        ),
        (
            json!({"id":"newload","case":"LC1","type":"uniform","member":"m1","axes":"global","forcePerLength":[0,0,"-2 kN/m"]}),
            "forcePerLength",
            json!([0., 0., -2000.]),
        ),
        (
            json!({"id":"newload","case":"LC1","type":"selfWeight","members":["m1"],"factor":"1.2"}),
            "factor",
            json!(1.2),
        ),
    ] {
        let mut k = Kernel::new();
        let p: Value = serde_json::from_str(
            &std::fs::read_to_string("../../fixtures/models/B02.json").unwrap(),
        )
        .unwrap();
        request(&mut k, "createProject", Value::Null, json!({"project":p}));
        let mut args = load.clone();
        args["existence"] = json!("create");
        let out = request(
            &mut k,
            "applyCommand",
            json!(0),
            json!({"command":{"type":"SetLoad","args":args}}),
        );
        assert_eq!(out["status"], "ok", "{out}");
        let result = out["payload"]["project"]["loads"]
            .as_array()
            .unwrap()
            .iter()
            .find(|l| l["id"] == "newload")
            .unwrap();
        assert_eq!(result[field], expected);
        assert_eq!(
            result.as_object().unwrap().len(),
            load.as_object().unwrap().len()
        );
    }
}
