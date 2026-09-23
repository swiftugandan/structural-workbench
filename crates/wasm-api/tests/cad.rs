use serde_json::{Value, json};
use workbench_wasm_api::Kernel;
fn req(k: &mut Kernel, op: &str, revision: u64, payload: Value) -> Value {
    serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"cad","operation":op,"expectedRevision":revision,"payload":payload}).to_string())).unwrap()
}
fn fixture() -> Value {
    serde_json::from_str(&std::fs::read_to_string("../../fixtures/models/B02.json").unwrap())
        .unwrap()
}
fn open(p: Value) -> (Kernel, Value) {
    let mut k = Kernel::new();
    let r = req(&mut k, "createProject", 0, json!({"project":p}));
    assert_eq!(r["status"], "ok", "{r}");
    (k, r)
}
#[test]
fn move_copy_delete_previews_and_undo_are_atomic() {
    let (mut k, original) = open(fixture());
    let copy = json!({"id":"copy","type":"CopySelection","args":{"ids":["m1"],"delta":["4000 mm",0,0],"connectToExisting":false}});
    let preview = req(
        &mut k,
        "queryGeometry",
        0,
        json!({"kind":"commandPreview","query":{"command":copy},"viewRevision":0}),
    );
    assert_eq!(preview["status"], "ok", "{preview}");
    assert_eq!(preview["modelHash"], original["modelHash"]);
    let out = req(&mut k, "applyCommand", 0, json!({"command":copy}));
    assert_eq!(out["status"], "ok", "{out}");
    let p = &out["payload"]["project"];
    assert_eq!(p["members"].as_array().unwrap().len(), 2);
    assert_eq!(p["nodes"].as_array().unwrap().len(), 4);
    assert_eq!(p["supports"].as_array().unwrap().len(), 1);
    assert_eq!(p["loads"].as_array().unwrap().len(), 1);
    let c = json!({"type":"MoveNodes","args":{"ids":["n2"],"delta":["-3 m",0,0]}});
    let bad = req(&mut k, "applyCommand", 1, json!({"command":c}));
    assert_eq!(bad["diagnostics"][0]["code"], "ZERO_LENGTH_MEMBER");
    assert_eq!(bad["modelHash"], out["modelHash"]);
    let del = json!({"type":"DeleteGeometry","args":{"ids":["n1"],"cascade":true}});
    let preview = req(
        &mut k,
        "queryGeometry",
        1,
        json!({"kind":"commandPreview","query":{"command":del}}),
    );
    assert_eq!(preview["status"], "ok", "{preview}");
    assert_eq!(
        preview["payload"]["project"]["supports"]
            .as_array()
            .unwrap()
            .len(),
        0
    );
    let deleted = req(&mut k, "applyCommand", 1, json!({"command":del}));
    assert_eq!(deleted["status"], "ok");
    let undo = req(&mut k, "undo", 2, json!({}));
    assert_eq!(undo["modelHash"], out["modelHash"]);
    let undo = req(&mut k, "undo", 3, json!({}));
    assert_eq!(undo["modelHash"], original["modelHash"]);
}
#[test]
fn three_working_planes_snap_midpoint_grid_and_units() {
    for (plane, start, end, at) in [
        ("XZ", [0., 0., 0.], [4., 0., 0.], [2., 0., 0.]),
        ("XY", [0., 0., 3.], [4., 0., 3.], [2., 0., 3.]),
        ("YZ", [3., 0., 0.], [3., 4., 0.], [3., 2., 0.]),
    ] {
        let mut p = fixture();
        p["nodes"][0]["position"] = json!(start);
        p["nodes"][1]["position"] = json!(end);
        p["members"][0]["localY"] = if plane == "YZ" {
            json!([1, 0, 0])
        } else {
            json!([0, 1, 0])
        };
        let (mut k, original) = open(p);
        let out = req(
            &mut k,
            "queryGeometry",
            0,
            json!({"kind":"snap","query":{"plane":plane,"position":at,"features":true,"grid":0.5,"tolerance":0.1},"viewRevision":0}),
        );
        assert_eq!(out["payload"]["kind"], "midpoint");
        assert_eq!(out["modelHash"], original["modelHash"]);
    }
}
#[test]
fn projected_crossing_index_selection_depth_and_measurement() {
    let mut p = fixture();
    p["nodes"].as_array_mut().unwrap().extend([
        json!({"id":"n3","position":[1.5,1,-1]}),
        json!({"id":"n4","position":[1.5,1,1]}),
    ]);
    let mut m = p["members"][0].clone();
    m["id"] = json!("m2");
    m["start"] = json!("n3");
    m["end"] = json!("n4");
    p["members"].as_array_mut().unwrap().push(m);
    let (mut k, original) = open(p);
    let camera =
        json!({"origin":[0,0,0],"basis":[[1,0,0],[0,0,1],[0,-1,0]],"center":[0,0],"factor":100});
    let out = req(
        &mut k,
        "queryGeometry",
        0,
        json!({"kind":"viewGeometry","query":{"camera":camera},"viewRevision":10}),
    );
    assert_eq!(out["payload"]["crossings"].as_array().unwrap().len(), 1);
    assert_eq!(out["payload"]["crossings"][0]["depthSeparation"], 1.);
    let out = req(
        &mut k,
        "queryGeometry",
        0,
        json!({"kind":"screenPick","query":{"camera":camera,"point":[150,0]},"viewRevision":10}),
    );
    assert_eq!(out["payload"]["entityId"], "m2");
    let out = req(
        &mut k,
        "queryGeometry",
        0,
        json!({"kind":"boxSelect","query":{"camera":camera,"rect":[-1,-1,301,1]},"viewRevision":10}),
    );
    assert_eq!(out["payload"]["entityIds"], json!(["m1", "n1", "n2"]));
    let out = req(
        &mut k,
        "queryGeometry",
        0,
        json!({"kind":"measure","query":{"start":"n1","end":"n2"}}),
    );
    assert_eq!(out["payload"]["distance"], 3.);
    assert_eq!(out["modelHash"], original["modelHash"]);
}
#[test]
fn near_coincident_nodes_warn_without_mutation() {
    let mut p = fixture();
    p["nodes"]
        .as_array_mut()
        .unwrap()
        .push(json!({"id":"near","position":[0.0000005,0,0]}));
    let (mut k, original) = open(p);
    let out = req(
        &mut k,
        "queryGeometry",
        0,
        json!({"kind":"axes","query":{},"viewRevision":0}),
    );
    assert_eq!(
        out["payload"]["nearCoincidentNodes"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(out["modelHash"], original["modelHash"]);
}

#[test]
fn copy_bay_builds_spatial_frame_with_supports_and_ties() {
    let mut portal = fixture();
    portal["analysisMode"] = json!("planarXZ");
    portal["name"] = json!("Portal for bay copy");
    portal["nodes"] = json!([
        {"id":"n1","position":[0.0,0.0,0.0]},
        {"id":"n2","position":[0.0,0.0,3.0]},
        {"id":"n3","position":[4.0,0.0,3.0]},
        {"id":"n4","position":[4.0,0.0,0.0]}
    ]);
    portal["members"] = json!([
        {"id":"m1","start":"n1","end":"n2","material":"mat1","section":"sec1","localY":[0,1,0],"releaseStart":{"my":false,"mz":false},"releaseEnd":{"my":false,"mz":false}},
        {"id":"m2","start":"n2","end":"n3","material":"mat1","section":"sec1","localY":[0,1,0],"releaseStart":{"my":false,"mz":false},"releaseEnd":{"my":false,"mz":false}},
        {"id":"m3","start":"n4","end":"n3","material":"mat1","section":"sec1","localY":[0,1,0],"releaseStart":{"my":false,"mz":false},"releaseEnd":{"my":false,"mz":false}}
    ]);
    portal["supports"] = json!([
        {"id":"s1","node":"n1","fixed":[true,false,true,false,true,false],"prescribed":[0,0,0,0,0,0]},
        {"id":"s2","node":"n4","fixed":[true,false,true,false,true,false],"prescribed":[0,0,0,0,0,0]}
    ]);
    portal["loads"] = json!([{
        "id":"l1","case":"LC1","type":"nodal","node":"n3","values":[10000.0,0.0,0.0,0.0,0.0,0.0]
    }]);
    let (mut k, original) = open(portal);
    assert_eq!(original["payload"]["project"]["analysisMode"], "planarXZ");
    let bay = json!({
        "id": "bay-command",
        "type": "CopyBay",
        "args": {
            "ids": ["m1", "m2", "m3", "n1", "n2", "n3", "n4"],
            "delta": [0, "6 m", 0],
            "count": 1,
            "includeSupports": true,
            "tieUnsupportedNodes": true,
            "setSpatial": true,
            "stabilizeBases": true
        }
    });
    let preview = req(
        &mut k,
        "queryGeometry",
        0,
        json!({"kind":"commandPreview","query":{"command":bay},"viewRevision":0}),
    );
    assert_eq!(preview["status"], "ok", "{preview}");
    assert_eq!(preview["modelHash"], original["modelHash"]);
    let out = req(&mut k, "applyCommand", 0, json!({"command": bay}));
    assert_eq!(out["status"], "ok", "{out}");
    let p = &out["payload"]["project"];
    assert_eq!(p["analysisMode"], "spatial");
    assert_eq!(p["nodes"].as_array().unwrap().len(), 8);
    assert_eq!(p["members"].as_array().unwrap().len(), 8);
    assert_eq!(p["supports"].as_array().unwrap().len(), 4);
    for s in p["supports"].as_array().unwrap() {
        assert_eq!(s["fixed"], json!([true, true, true, true, true, true]));
    }
    let analysed = req(&mut k, "analyse", 1, json!({"caseIds":["LC1"]}));
    assert_eq!(analysed["status"], "ok", "{analysed}");
    let undo = req(&mut k, "undo", 1, json!({}));
    assert_eq!(undo["modelHash"], original["modelHash"]);
    assert_eq!(undo["payload"]["project"]["analysisMode"], "planarXZ");
}

#[test]
fn visible_labels_survive_copy_delete_undo_and_reopen() {
    let (mut k, original) = open(fixture());
    let labels = &original["payload"]["project"]["metadata"]["entityLabels"];
    assert_eq!(labels["n1"], "n1");
    let copy = json!({"id":"opaque-copy-command","type":"CopySelection","args":{"ids":["m1"],"delta":[4,0,0],"connectToExisting":false}});
    let copied = req(&mut k, "applyCommand", 0, json!({"command":copy}));
    assert_eq!(copied["status"], "ok");
    let p = &copied["payload"]["project"];
    let new_member = p["members"]
        .as_array()
        .unwrap()
        .iter()
        .find(|m| m["id"] != "m1")
        .unwrap()["id"]
        .as_str()
        .unwrap();
    assert_ne!(new_member, "m2");
    assert_eq!(p["metadata"]["entityLabels"][new_member], "m2");
    assert_eq!(p["metadata"]["entityLabels"]["n1"], "n1");
    let deleted = req(
        &mut k,
        "applyCommand",
        1,
        json!({"command":{"type":"DeleteGeometry","args":{"ids":["m1"],"cascade":true}}}),
    );
    assert_eq!(deleted["status"], "ok");
    assert_eq!(
        deleted["payload"]["project"]["metadata"]["entityLabels"][new_member],
        "m2"
    );
    let undo = req(&mut k, "undo", 2, json!({}));
    assert_eq!(
        undo["payload"]["project"]["metadata"]["entityLabels"],
        p["metadata"]["entityLabels"]
    );
    let (_, reopened) = open(p.clone());
    assert_eq!(
        reopened["payload"]["project"]["metadata"]["entityLabels"],
        p["metadata"]["entityLabels"]
    );
    assert_eq!(reopened["modelHash"], copied["modelHash"]);
}
