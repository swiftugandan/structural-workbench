use serde_json::{Value, json};
use workbench_wasm_api::Kernel;
fn request(k: &mut Kernel, op: &str, rev: u64, p: Value) -> Value {
    serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"structure","operation":op,"expectedRevision":rev,"payload":p}).to_string())).unwrap()
}
fn open() -> (Kernel, Value) {
    let mut k = Kernel::new();
    let p: Value = serde_json::from_str(include_str!("../../../fixtures/models/B07.json")).unwrap();
    let r = request(&mut k, "createProject", 0, json!({"project":p}));
    assert_eq!(r["status"], "ok", "{r}");
    (k, r)
}
fn cmd(k: &mut Kernel, rev: u64, kind: &str, args: Value) -> Value {
    request(
        k,
        "applyCommand",
        rev,
        json!({"command":{"id":format!("s{rev}"),"type":kind,"args":args}}),
    )
}
fn set(k: &mut Kernel, rev: u64, key: &str, entity: Value, mode: &str) -> Value {
    cmd(
        k,
        rev,
        "SetStructureEntity",
        json!({"collection":key,"entity":entity,"existence":mode}),
    )
}
#[test]
fn migration_authorship_hashes_and_atomic_references() {
    let (mut k, r) = open();
    let original = &r["payload"]["project"];
    assert_eq!(original["schemaVersion"], "1.2.0");
    assert_eq!(
        original["structure"]["physicalMembers"][0]["role"],
        "unassigned"
    );
    assert_eq!(original["structure"]["joints"].as_array().unwrap().len(), 2);
    let level = set(
        &mut k,
        0,
        "storeys",
        json!({"id":"ground","name":"Ground","elevation":"1250 mm"}),
        "create",
    );
    assert_eq!(level["status"], "ok", "{level}");
    assert_eq!(
        level["payload"]["project"]["structure"]["storeys"][0]["elevation"],
        1.25
    );
    assert_eq!(level["modelHash"], r["modelHash"]);
    assert_ne!(
        level["payload"]["structureHash"],
        r["payload"]["structureHash"]
    );
    let mut physical = original["structure"]["physicalMembers"][0].clone();
    physical["role"] = json!("beam");
    physical["storeyId"] = json!("ground");
    physical["name"] = json!("Beam 01");
    let assigned = set(&mut k, 1, "physicalMembers", physical.clone(), "update");
    assert_eq!(assigned["status"], "ok", "{assigned}");
    let rejected = cmd(
        &mut k,
        2,
        "DeleteStructureEntity",
        json!({"collection":"storeys","id":"ground"}),
    );
    assert_eq!(rejected["status"], "error");
    assert_eq!(rejected["revision"], 2);
    let stale = set(&mut k, 1, "physicalMembers", physical.clone(), "update");
    assert_eq!(stale["diagnostics"][0]["code"], "REVISION_CONFLICT");
    let group = set(
        &mut k,
        2,
        "groups",
        json!({"id":"frame","name":"Frame A","members":[{"kind":"physicalMember","id":physical["id"]}]}),
        "create",
    );
    assert_eq!(group["status"], "ok", "{group}");
    let split = cmd(
        &mut k,
        3,
        "SplitMember",
        json!({"id":"m1","stations":[0.4]}),
    );
    assert_eq!(split["status"], "ok", "{split}");
    let owner = &split["payload"]["project"]["structure"]["physicalMembers"][0];
    assert_eq!(owner["id"], physical["id"]);
    assert_eq!(owner["role"], "beam");
    assert_eq!(owner["analyticalMemberIds"].as_array().unwrap().len(), 2);
    let undo = request(&mut k, "undo", 4, json!({}));
    assert_eq!(
        undo["payload"]["project"]["structure"],
        group["payload"]["project"]["structure"]
    );
    let redo = request(&mut k, "redo", 5, json!({}));
    assert_eq!(
        redo["payload"]["structureHash"],
        split["payload"]["structureHash"]
    );
    let copy = cmd(
        &mut k,
        6,
        "CopySelection",
        json!({"ids":owner["analyticalMemberIds"],"delta":[0,0,2],"connectToExisting":false}),
    );
    assert_eq!(copy["status"], "ok", "{copy}");
    let graph = &copy["payload"]["project"]["structure"];
    assert_eq!(graph["physicalMembers"].as_array().unwrap().len(), 2);
    assert!(graph["physicalMembers"].as_array().unwrap().iter().all(|x|x["role"]=="beam" && x["analyticalMemberIds"].as_array().unwrap().len()==2));
    assert_eq!(graph["groups"][0]["members"].as_array().unwrap().len(), 2);
    let exported = copy["payload"]["project"].to_string();
    let p = workbench_model::Project::parse(&exported).unwrap();
    assert_eq!(
        p.structure.hash(),
        copy["payload"]["structureHash"].as_str().unwrap()
    );
    let deleted = cmd(
        &mut k,
        7,
        "DeleteGeometry",
        json!({"ids":owner["analyticalMemberIds"],"cascade":true}),
    );
    assert_eq!(deleted["status"], "ok", "{deleted}");
    assert_eq!(
        deleted["payload"]["project"]["structure"]["groups"][0]["members"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}
#[test]
fn strict_current_import_rejects_incomplete_and_false_engineering_claims() {
    let (_, r) = open();
    let p = r["payload"]["project"].clone();
    for change in [0, 1, 2, 3] {
        let mut q = p.clone();
        match change {
            0 => q["structure"]["physicalMembers"] = json!([]),
            1 => q["structure"]["joints"][0]["nodeId"] = json!("missing"),
            2 => q["structure"]["supportDetails"][0]["detailStatus"] = json!("PASS"),
            _ => q["structure"]["physicalMembers"][0]["role"] = json!("guessed"),
        };
        assert!(workbench_model::Project::parse(&q.to_string()).is_err());
    }
    let mut q = p.clone();
    q["schemaVersion"] = json!("1.0.0");
    assert!(workbench_model::Project::parse(&q.to_string()).is_err());
    let (mut k, _) = open();
    let bad = set(
        &mut k,
        0,
        "layers",
        json!({"id":"layer","name":"Invalid","members":[{"kind":"physicalMember","id":"missing"}]}),
        "create",
    );
    assert_eq!(bad["status"], "error");
    assert_eq!(bad["revision"], 0);
}
#[test]
fn grids_units_and_duplicate_ids_are_validated() {
    let (mut k, r) = open();
    let a = set(
        &mut k,
        0,
        "grids",
        json!({"id":"gridA","name":"A","start":[0,0,0],"end":["6000 mm",0,0]}),
        "create",
    );
    assert_eq!(a["status"], "ok", "{a}");
    assert_eq!(a["modelHash"], r["modelHash"]);
    let b = set(
        &mut k,
        1,
        "storeys",
        json!({"id":"gridA","name":"Clash","elevation":3}),
        "create",
    );
    assert_eq!(b["status"], "error");
    let c = set(
        &mut k,
        1,
        "grids",
        json!({"id":"gridB","name":"Zero length","start":[0,0,0],"end":[0,0,0]}),
        "create",
    );
    assert_eq!(c["status"], "error");
}

#[test]
fn copy_preserves_joint_storey_and_collection_and_merge_refuses_property_loss() {
    let (mut k, r) = open();
    let mut joint = r["payload"]["project"]["structure"]["joints"][0].clone();
    let node = joint["nodeId"].clone();
    let old_joint = joint["id"].clone();
    assert_eq!(
        set(
            &mut k,
            0,
            "storeys",
            json!({"id":"level","name":"Level","elevation":0}),
            "create"
        )["status"],
        "ok"
    );
    joint["storeyId"] = json!("level");
    joint["name"] = json!("Connection A");
    assert_eq!(set(&mut k, 1, "joints", joint, "update")["status"], "ok");
    assert_eq!(
        set(
            &mut k,
            2,
            "layers",
            json!({"id":"jointsLayer","name":"Connections","members":[{"kind":"joint","id":old_joint}]}),
            "create"
        )["status"],
        "ok"
    );
    let copy = cmd(
        &mut k,
        3,
        "CopySelection",
        json!({"ids":[node],"delta":[0,0,0],"connectToExisting":false}),
    );
    assert_eq!(copy["status"], "ok", "{copy}");
    let graph = &copy["payload"]["project"]["structure"];
    let copied = graph["joints"]
        .as_array()
        .unwrap()
        .iter()
        .find(|j| j["name"] == "Connection A copy")
        .unwrap();
    assert_eq!(copied["storeyId"], "level");
    assert_eq!(graph["layers"][0]["members"].as_array().unwrap().len(), 2);
    let merge = cmd(
        &mut k,
        4,
        "MergeNodes",
        json!({"sourceIds":[copied["nodeId"]],"targetId":node}),
    );
    assert_eq!(merge["status"], "error");
    assert_eq!(merge["revision"], 4);
    assert_eq!(merge["modelHash"], copy["modelHash"]);
}
