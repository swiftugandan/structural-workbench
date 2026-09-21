use serde_json::{Value, json};
use workbench_wasm_api::Kernel;
fn request(k: &mut Kernel, op: &str, rev: u64, payload: Value) -> Value {
    serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"test","operation":op,"expectedRevision":rev,"payload":payload}).to_string())).unwrap()
}
fn fixture(name: &str) -> Value {
    serde_json::from_str(
        &std::fs::read_to_string(format!("../../fixtures/models/{name}.json")).unwrap(),
    )
    .unwrap()
}
fn open(p: Value) -> (Kernel, Value) {
    let mut k = Kernel::new();
    let r = request(&mut k, "createProject", 0, json!({"project":p}));
    assert_eq!(r["status"], "ok", "{r}");
    (k, r)
}
fn command(k: &mut Kernel, rev: u64, c: Value) -> Value {
    request(k, "applyCommand", rev, json!({"command":c}))
}
#[test]
fn split_uniform_load_preserves_response_provenance_and_exact_undo() {
    let p = fixture("B07");
    let original = workbench_model::Project::parse(&p.to_string()).unwrap();
    let expected =
        serde_json::to_value(workbench_assembly::analyse(&original, "LC1").unwrap()).unwrap();
    let (mut k, initial) = open(p);
    let c = json!({"id":"splitA","type":"SplitMember","args":{"id":"m1","stations":[0.25,0.75]}});
    let preview = request(
        &mut k,
        "queryGeometry",
        0,
        json!({"kind":"topologyPreview","query":{"command":c},"viewRevision":17}),
    );
    assert_eq!(preview["status"], "ok", "{preview}");
    assert_eq!(preview["modelHash"], initial["modelHash"]);
    let out = command(&mut k, 0, c);
    assert_eq!(out["status"], "ok", "{out}");
    let p = &out["payload"]["project"];
    assert_eq!(p["members"].as_array().unwrap().len(), 3);
    assert_eq!(p["loads"].as_array().unwrap().len(), 3);
    for m in p["members"].as_array().unwrap() {
        assert_eq!(m["parentMemberId"], "m1");
    }
    let mut preview_p = preview["payload"]["project"].clone();
    preview_p["revision"] = json!(1);
    assert_eq!(&preview_p, p);
    let result = request(&mut k, "analyse", 1, json!({"caseIds":["LC1"]}));
    assert_eq!(result["status"], "ok", "{result}");
    for (i, id) in expected["nodeIds"].as_array().unwrap().iter().enumerate() {
        let j = result["payload"]["nodeIds"]
            .as_array()
            .unwrap()
            .iter()
            .position(|n| n == id)
            .unwrap();
        for d in 0..6 {
            let a = expected["nodeDisplacements"][i * 6 + d].as_f64().unwrap();
            let b = result["payload"]["nodeDisplacements"][j * 6 + d]
                .as_f64()
                .unwrap();
            assert!((a - b).abs() < 1e-9);
        }
    }
    let undo = request(&mut k, "undo", 1, json!({}));
    assert_eq!(undo["modelHash"], initial["modelHash"]);
    for field in ["nodes", "members", "loads", "supports"] {
        assert_eq!(
            undo["payload"]["project"][field],
            initial["payload"]["project"][field]
        );
    }
    let redo = request(&mut k, "redo", 2, json!({}));
    assert_eq!(redo["modelHash"], out["modelHash"]);
    let child = p["members"][0]["id"].clone();
    let again = command(
        &mut k,
        3,
        json!({"id":"splitB","type":"SplitMember","args":{"id":child,"stations":[0.5]}}),
    );
    assert_eq!(again["status"], "ok", "{again}");
    let intervals: Vec<_> = again["payload"]["project"]["members"]
        .as_array()
        .unwrap()
        .iter()
        .map(|m| {
            assert_eq!(m["parentMemberId"], "m1");
            m["stationRange"].clone()
        })
        .collect();
    assert!(intervals.contains(&json!([0.0, 0.125])));
    assert!(intervals.contains(&json!([0.125, 0.25])));
}
#[test]
fn split_self_weight_and_bad_stations_are_atomic() {
    let mut p = fixture("B02");
    p["loads"] =
        json!([{"id":"weight","case":"LC1","type":"selfWeight","members":["m1"],"factor":1.}]);
    let (mut k, initial) = open(p);
    for stations in [
        json!([]),
        json!([0]),
        json!([1]),
        json!([0.5, 0.5]),
        json!([1e-9]),
    ] {
        let out = command(
            &mut k,
            0,
            json!({"id":"bad","type":"SplitMember","args":{"id":"m1","stations":stations}}),
        );
        assert_eq!(out["status"], "error");
        assert_eq!(out["modelHash"], initial["modelHash"]);
        assert_eq!(out["revision"], 0);
    }
    let good = command(
        &mut k,
        0,
        json!({"id":"good","type":"SplitMember","args":{"id":"m1","stations":[0.5]}}),
    );
    assert_eq!(good["status"], "ok");
    assert_eq!(
        good["payload"]["project"]["loads"][0]["members"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
}
fn crossing() -> Value {
    let mut p = fixture("B02");
    p["analysisMode"] = json!("planarXZ");
    p["nodes"].as_array_mut().unwrap().extend([
        json!({"id":"n3","position":[1.5,0,-1]}),
        json!({"id":"n4","position":[1.5,0,1]}),
    ]);
    let mut m = p["members"][0].clone();
    m["id"] = json!("m2");
    m["start"] = json!("n3");
    m["end"] = json!("n4");
    p["members"].as_array_mut().unwrap().push(m);
    p
}
#[test]
fn connect_crossing_is_explicit_and_reuses_one_shared_node() {
    let (mut k, initial) = open(crossing());
    let c = json!({"id":"connect","type":"ConnectIntersections","args":{"memberIds":["m2","m1"]}});
    let prev = request(
        &mut k,
        "queryGeometry",
        0,
        json!({"kind":"topologyPreview","query":{"command":c},"viewRevision":3}),
    );
    assert_eq!(prev["status"], "ok", "{prev}");
    assert_eq!(prev["modelHash"], initial["modelHash"]);
    let out = command(&mut k, 0, c);
    assert_eq!(out["status"], "ok", "{out}");
    let p = &out["payload"]["project"];
    assert_eq!(p["nodes"].as_array().unwrap().len(), 5);
    assert_eq!(p["members"].as_array().unwrap().len(), 4);
    let n = p["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["position"] == json!([1.5, 0., 0.]))
        .unwrap();
    assert_eq!(
        p["members"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|m| m["start"] == n["id"] || m["end"] == n["id"])
            .count(),
        4
    );
    let undo = request(&mut k, "undo", 1, json!({}));
    assert_eq!(undo["modelHash"], initial["modelHash"]);
}
#[test]
fn merge_moves_references_rejects_conflicts_distance_and_zero_length() {
    let mut p = fixture("B02");
    p["nodes"]
        .as_array_mut()
        .unwrap()
        .push(json!({"id":"near","position":[0,0,0]}));
    let (mut k, initial) = open(p.clone());
    let c = json!({"id":"merge","type":"MergeNodes","args":{"sourceIds":["n1"],"targetId":"near"}});
    let out = command(&mut k, 0, c.clone());
    assert_eq!(out["status"], "ok", "{out}");
    assert_eq!(out["payload"]["project"]["members"][0]["start"], "near");
    assert_eq!(out["payload"]["project"]["supports"][0]["node"], "near");
    let undo = request(&mut k, "undo", 1, json!({}));
    assert_eq!(undo["modelHash"], initial["modelHash"]);
    let far = command(
        &mut k,
        2,
        json!({"id":"far","type":"MergeNodes","args":{"sourceIds":["n2"],"targetId":"n1"}}),
    );
    assert_eq!(far["status"], "error");
    assert_eq!(far["modelHash"], initial["modelHash"]);
    let mut s = p["supports"][0].clone();
    s["id"] = json!("s2");
    s["node"] = json!("near");
    p["supports"].as_array_mut().unwrap().push(s);
    let (mut k, initial) = open(p);
    let out = command(&mut k, 0, c);
    assert_eq!(out["diagnostics"][0]["code"], "INVALID_RESTRAINT");
    assert_eq!(out["modelHash"], initial["modelHash"]);
    let mut p = fixture("B02");
    p["nodes"][1]["position"] = json!([0.000001, 0, 0]);
    let (mut k, initial) = open(p);
    let out = command(
        &mut k,
        0,
        json!({"id":"zero","type":"MergeNodes","args":{"sourceIds":["n2"],"targetId":"n1"}}),
    );
    assert_eq!(out["diagnostics"][0]["code"], "ZERO_LENGTH_MEMBER");
    assert_eq!(out["modelHash"], initial["modelHash"]);
}
#[test]
fn local_axes_reversal_vertical_and_skew_are_right_handed() {
    for (end, hint, expected) in [
        (
            [0., 0., 3.],
            [0., 1., 0.],
            json!([[0., 0., 1.], [0., 1., 0.], [-1., 0., 0.]]),
        ),
        (
            [-3., 0., 0.],
            [0., 1., 0.],
            json!([[-1., 0., 0.], [0., 1., 0.], [0., 0., -1.]]),
        ),
    ] {
        let mut p = fixture("B02");
        p["nodes"][1]["position"] = json!(end);
        p["members"][0]["localY"] = json!(hint);
        let (mut k, initial) = open(p);
        let out = request(
            &mut k,
            "queryGeometry",
            0,
            json!({"kind":"axes","query":{},"viewRevision":9}),
        );
        assert_eq!(out["payload"]["members"][0]["axes"], expected);
        assert_eq!(out["modelHash"], initial["modelHash"]);
    }
    let (_, r) = workbench_geometry::axes([0., 0., 0.], [2., 3., 4.], [1., 2., 0.]);
    for i in 0..3 {
        for j in 0..3 {
            assert!(
                (workbench_geometry::dot(r[i], r[j]) - if i == j { 1. } else { 0. }).abs() < 1e-12
            );
        }
    }
    assert_eq!(workbench_geometry::cross(r[0], r[1]), r[2]);
}

#[test]
fn connect_t_junction_reuses_endpoint_and_three_way_crossing_is_single_joint() {
    let mut p = crossing();
    p["nodes"][2]["position"] = json!([1.5, 0, 0]);
    let (mut k, _) = open(p);
    let out = command(
        &mut k,
        0,
        json!({"id":"tee","type":"ConnectIntersections","args":{"memberIds":["m1","m2"]}}),
    );
    assert_eq!(out["status"], "ok", "{out}");
    let p = &out["payload"]["project"];
    assert_eq!(p["nodes"].as_array().unwrap().len(), 4);
    assert_eq!(p["members"].as_array().unwrap().len(), 3);
    assert_eq!(
        p["members"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|m| m["start"] == "n3" || m["end"] == "n3")
            .count(),
        3
    );
    let mut p = crossing();
    p["nodes"].as_array_mut().unwrap().extend([
        json!({"id":"n5","position":[0.5,0,-1]}),
        json!({"id":"n6","position":[2.5,0,1]}),
    ]);
    let mut m = p["members"][0].clone();
    m["id"] = json!("m3");
    m["start"] = json!("n5");
    m["end"] = json!("n6");
    p["members"].as_array_mut().unwrap().push(m);
    let (mut k, _) = open(p);
    let out = command(
        &mut k,
        0,
        json!({"id":"three","type":"ConnectIntersections","args":{"memberIds":["m1","m2","m3"]}}),
    );
    assert_eq!(out["status"], "ok", "{out}");
    assert_eq!(
        out["payload"]["project"]["nodes"].as_array().unwrap().len(),
        7
    );
    assert_eq!(
        out["payload"]["project"]["members"]
            .as_array()
            .unwrap()
            .len(),
        6
    );
}
#[test]
fn merge_repeated_loads_and_stale_preview_cannot_mutate() {
    let mut p = fixture("B02");
    p["nodes"]
        .as_array_mut()
        .unwrap()
        .push(json!({"id":"near","position":[3,0,0]}));
    let mut l = p["loads"][0].clone();
    l["id"] = json!("repeat");
    l["node"] = json!("near");
    p["loads"].as_array_mut().unwrap().push(l);
    let (mut k, initial) = open(p);
    let out = command(
        &mut k,
        0,
        json!({"id":"merge","type":"MergeNodes","args":{"sourceIds":["near"],"targetId":"n2"}}),
    );
    assert_eq!(out["diagnostics"][0]["code"], "INVALID_LOAD");
    assert_eq!(out["modelHash"], initial["modelHash"]);
    let c = json!({"id":"split","type":"SplitMember","args":{"id":"m1","stations":[0.5]}});
    let prev = request(
        &mut k,
        "queryGeometry",
        0,
        json!({"kind":"topologyPreview","query":{"command":c},"viewRevision":1}),
    );
    assert_eq!(prev["status"], "ok");
    let changed = command(
        &mut k,
        0,
        json!({"type":"SetNodePosition","args":{"id":"near","position":[4,0,0]}}),
    );
    assert_eq!(changed["status"], "ok");
    let out = command(&mut k, 0, c);
    assert_eq!(out["diagnostics"][0]["code"], "REVISION_CONFLICT");
    assert_eq!(out["modelHash"], changed["modelHash"]);
}
