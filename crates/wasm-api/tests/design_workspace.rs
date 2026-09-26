use serde_json::{Value, json};
use workbench_wasm_api::Kernel;

fn req(k: &mut Kernel, op: &str, p: Value) -> Value {
    let snap:Value=serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"snapshot","operation":"getSnapshot","expectedRevision":null,"payload":{}}).to_string())).unwrap();
    let rev = snap["revision"].clone();
    serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"native-design","operation":op,"expectedRevision":rev,"payload":p}).to_string())).unwrap()
}
fn command(k: &mut Kernel, kind: &str, args: Value) -> Value {
    req(
        k,
        "applyCommand",
        json!({"command":{"id":"design-command","type":kind,"args":args}}),
    )
}
fn open() -> Kernel {
    let mut k = Kernel::new();
    let p: Value = serde_json::from_str(include_str!("../../../fixtures/models/B04.json")).unwrap();
    assert_eq!(
        req(&mut k, "createProject", json!({"project":p}))["status"],
        "ok"
    );
    k
}
fn assign(k: &mut Kernel, shape: &str) -> Value {
    let r = command(
        k,
        "AssignSteelCatalogue",
        json!({"id":"m1","sectionRef":format!("aisc-shapes-v16.0-subset-1:{shape}"),"materialRef":"astm-a992-50-65-v1"}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    r
}
fn inputs(k: &mut Kernel, lb: f64) -> Value {
    let mut d =
        req(k, "getSnapshot", json!({}))["payload"]["project"]["members"][0]["steelDesign"].clone();
    for (key, value) in [("ky", 1.0), ("kz", 1.0), ("lb", lb), ("cb", 1.0)] {
        d[key] = json!({"value":value,"source":"user"});
    }
    d["stabilityBasis"] = json!("firstOrderUserEffectiveLength");
    d["bracing"] = json!(if lb == 0.0 { "continuous" } else { "unbraced" });
    let r = command(k, "SetSteelDesign", json!({"id":"m1","design":d}));
    assert_eq!(r["status"], "ok", "{r}");
    r
}
fn evaluate(k: &mut Kernel) -> Value {
    let a = req(k, "analyse", json!({"caseIds":["LC1"]}));
    assert_eq!(a["status"], "ok", "{a}");
    let r = req(
        k,
        "evaluateModelDesign",
        json!({"memberId":"m1","modelHash":a["modelHash"],"caseId":"LC1","resultId":a["payload"]["resultId"]}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    r["payload"].clone()
}

#[test]
fn native_binding_readiness_persistence_and_exact_undo() {
    let mut k = open();
    let initial = req(&mut k, "getSnapshot", json!({}));
    assert_eq!(
        req(&mut k, "steelReadiness", json!({"memberId":"m1"}))["payload"]["status"],
        "incomplete"
    );
    let bound = assign(&mut k, "W18X50");
    assert_eq!(
        req(&mut k, "steelReadiness", json!({"memberId":"m1"}))["payload"]["status"],
        "incomplete"
    );
    let configured = inputs(&mut k, 0.0);
    assert_ne!(configured["modelHash"], bound["modelHash"]);
    assert_eq!(
        req(&mut k, "steelReadiness", json!({"memberId":"m1"}))["payload"]["status"],
        "ready"
    );
    let mut reopened = Kernel::new();
    let r = req(
        &mut reopened,
        "importProject",
        json!({"jsonUtf8":configured["payload"]["project"].to_string()}),
    );
    assert_eq!(r["modelHash"], configured["modelHash"]);
    assert_eq!(
        req(&mut k, "undo", json!({}))["modelHash"],
        bound["modelHash"]
    );
    assert_eq!(
        req(&mut k, "undo", json!({}))["modelHash"],
        initial["modelHash"]
    );
}

#[test]
fn native_no_seed_flexure_and_shear_have_exact_station_provenance() {
    let mut k = open();
    assign(&mut k, "W18X50");
    inputs(&mut k, 0.0);
    let run = evaluate(&mut k);
    assert_eq!(run["overall"], "pass", "{run}");
    assert_eq!(run["source"], "modelNative");
    assert_eq!(run["mock"], false);
    let flex = run["checks"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["checkId"] == "flexure")
        .unwrap();
    // B04: 10 kN at 3 m gives 30 kN m at the fixed end. AISC F.1-1B
    // published capacity 379 kip-ft, tolerance inherited from rounded print value.
    assert!((flex["demand"].as_f64().unwrap() - 30000.0).abs() < 1e-7);
    assert!((flex["resistance"].as_f64().unwrap() / 1355.8179483314 - 379.0).abs() < 0.5);
    assert_eq!(flex["station"], 0.0);
    assert_eq!(
        flex["actions"][5].as_f64().unwrap().abs(),
        flex["demand"].as_f64().unwrap()
    );
    assert_eq!(run["designRunId"].as_str().unwrap().len(), 64);
    assert_eq!(
        run["catalogueSourceHash"],
        "82d0ceb96a0d938ae1a6bd9637cb10a1e269225b5d668dce5b0bdc8d86013496"
    );
    assert!(
        run["stationChecks"].as_array().unwrap().len() > run["checks"].as_array().unwrap().len()
    );
}

#[test]
fn unsupported_compactness_ltb_and_missing_tension_details_never_pass() {
    let mut k = open();
    assign(&mut k, "W14X99");
    inputs(&mut k, 0.0);
    assert_eq!(evaluate(&mut k)["overall"], "unsupported");
    assign(&mut k, "W18X50");
    inputs(&mut k, 3.0);
    assert_eq!(evaluate(&mut k)["overall"], "unsupported");
    let mut p = req(&mut k, "getSnapshot", json!({}))["payload"]["project"].clone();
    p["loads"][0]["values"] = json!([10000., 0., 0., 0., 0., 0.]);
    req(&mut k, "importProject", json!({"jsonUtf8":p.to_string()}));
    assert_eq!(evaluate(&mut k)["overall"], "unsupported");
}

#[test]
fn mismatched_section_invalidates_readiness_and_forged_result_is_rejected() {
    let mut k = open();
    assign(&mut k, "W18X50");
    let snap = inputs(&mut k, 0.0);
    let bad = req(
        &mut k,
        "evaluateModelDesign",
        json!({"memberId":"m1","modelHash":snap["modelHash"],"caseId":"LC1","resultId":"forged"}),
    );
    assert_eq!(bad["status"], "error");
    let mut section = snap["payload"]["project"]["sections"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["name"] == "W18X50")
        .unwrap()
        .clone();
    section["A"] = json!(0.05);
    section["existence"] = json!("update");
    command(&mut k, "SetSection", section);
    assert_eq!(
        req(&mut k, "steelReadiness", json!({"memberId":"m1"}))["payload"]["status"],
        "incomplete"
    );
    let stale = req(
        &mut k,
        "evaluateModelDesign",
        json!({"memberId":"m1","modelHash":snap["modelHash"],"caseId":"LC1","resultId":"forged"}),
    );
    assert_eq!(stale["diagnostics"][0]["code"], "STALE_RESULT");
}

#[test]
fn invalid_settings_fail_atomically_and_provenance_changes_hash() {
    let mut k = open();
    assign(&mut k, "W18X50");
    let snap = inputs(&mut k, 0.0);
    let mut d = snap["payload"]["project"]["members"][0]["steelDesign"].clone();
    d["ky"]["value"] = json!(-1.0);
    let bad = command(&mut k, "SetSteelDesign", json!({"id":"m1","design":d}));
    assert_eq!(bad["status"], "error");
    assert_eq!(bad["modelHash"], snap["modelHash"]);
    d["ky"] = json!({"value":1.0,"source":"imported"});
    let changed = command(&mut k, "SetSteelDesign", json!({"id":"m1","design":d}));
    assert_eq!(changed["status"], "ok");
    assert_ne!(changed["modelHash"], snap["modelHash"]);
}

#[test]
fn weak_axis_and_zero_actions_are_fail_closed() {
    let mut k = open();
    assign(&mut k, "W18X50");
    inputs(&mut k, 0.0);
    let mut p = req(&mut k, "getSnapshot", json!({}))["payload"]["project"].clone();
    p["loads"][0]["values"] = json!([0., 0., -10000., 0., 0., 0.]);
    req(&mut k, "importProject", json!({"jsonUtf8":p.to_string()}));
    assert_eq!(evaluate(&mut k)["overall"], "unsupported");
    p["loads"][0]["values"] = json!([0., 0., 0., 0., 0., 0.]);
    req(&mut k, "importProject", json!({"jsonUtf8":p.to_string()}));
    assert_eq!(evaluate(&mut k)["overall"], "indeterminate");
}

#[test]
fn overview_keeps_unready_members_and_matches_exact_member_runs() {
    let mut p: Value =
        serde_json::from_str(include_str!("../../../fixtures/models/B04.json")).unwrap();
    p["nodes"].as_array_mut().unwrap().extend([
        json!({"id":"n3","position":[0.,2.,0.]}),
        json!({"id":"n4","position":[3.,2.,0.]}),
    ]);
    let mut m = p["members"][0].clone();
    m["id"] = json!("m2");
    m["start"] = json!("n3");
    m["end"] = json!("n4");
    p["members"].as_array_mut().unwrap().push(m);
    let mut support = p["supports"][0].clone();
    support["id"] = json!("s2");
    support["node"] = json!("n3");
    p["supports"].as_array_mut().unwrap().push(support);
    let mut k = Kernel::new();
    let opened = req(&mut k, "importProject", json!({"jsonUtf8":p.to_string()}));
    assert_eq!(opened["status"], "ok", "{opened}");
    assign(&mut k, "W18X50");
    inputs(&mut k, 0.0);
    let individual = evaluate(&mut k);
    let input = json!({"modelHash":individual["modelHash"],"caseId":"LC1","resultId":individual["resultId"]});
    let before = req(&mut k, "getSnapshot", json!({}));
    let review = req(&mut k, "evaluateSteelOverview", input.clone());
    assert_eq!(review["status"], "ok", "{review}");
    let rows = review["payload"]["rows"].as_array().unwrap();
    assert_eq!(rows.len(), 2);
    assert_eq!(rows[0]["run"], individual);
    assert_eq!(rows[1]["status"], "notChecked");
    assert!(rows[1]["run"].is_null());
    assert!(rows[1]["utilisation"].is_null());
    assert_eq!(
        before["modelHash"],
        req(&mut k, "getSnapshot", json!({}))["modelHash"]
    );
    let mut bad = input.clone();
    bad["resultId"] = json!("forged");
    assert_eq!(
        req(&mut k, "evaluateSteelOverview", bad)["diagnostics"][0]["code"],
        "STALE_RESULT"
    );
    let mut bad = input;
    bad["caseId"] = json!("__envelope__");
    assert_eq!(
        req(&mut k, "evaluateSteelOverview", bad)["diagnostics"][0]["code"],
        "INVALID_LOAD"
    );
}

#[test]
fn catalogue_study_reanalyses_self_weight_without_mutating_baseline() {
    let mut k = open();
    assign(&mut k, "W18X50");
    inputs(&mut k, 0.0);
    let mut p = req(&mut k, "getSnapshot", json!({}))["payload"]["project"].clone();
    p["gravity"] = json!([0., 9.80665, 0.]);
    p["loads"] = json!([{"id":"l1","case":"LC1","type":"selfWeight","members":["m1"],"factor":1.}]);
    assert_eq!(
        req(&mut k, "importProject", json!({"jsonUtf8":p.to_string()}))["status"],
        "ok"
    );
    let baseline = evaluate(&mut k);
    let before = req(&mut k, "exportProject", json!({}));
    let input = json!({"modelHash":baseline["modelHash"],"resultId":baseline["resultId"],"caseId":"LC1","memberId":"m1","sectionRefs":["aisc-shapes-v16.0-subset-1:W18X50","aisc-shapes-v16.0-subset-1:W24X62","aisc-shapes-v16.0-subset-1:W14X99"]});
    let r = req(&mut k, "studySteelCatalogue", input.clone());
    assert_eq!(r["status"], "ok", "{r}");
    assert_eq!(r["payload"]["complete"], true);
    for row in r["payload"]["candidates"].as_array().unwrap() {
        // Independent published input dimensions; direct cantilever mechanics.
        let area_in2 = match row["designation"].as_str().unwrap() {
            "W18X50" => 14.7,
            "W24X62" => 18.2,
            "W14X99" => 29.1,
            _ => panic!(),
        };
        let mass = 7850. * area_in2 * 0.0254_f64.powi(2) * 3.;
        assert!((row["massKg"].as_f64().unwrap() - mass).abs() < 1e-10);
        let max_moment = row["run"]["stationChecks"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| c["actions"][5].as_f64().unwrap().abs())
            .fold(0., f64::max);
        assert!((max_moment - mass * 9.80665 * 1.5).abs() < 1e-7);
        assert_eq!(row["reanalysed"], true);
        assert_eq!(row["resultId"], row["run"]["resultId"]);
        assert_eq!(row["modelHash"], row["run"]["modelHash"]);
    }
    assert_eq!(before, req(&mut k, "exportProject", json!({})));
    let mut invalid = input;
    invalid["sectionRefs"] = json!([
        "aisc-shapes-v16.0-subset-1:W18X50",
        "aisc-shapes-v16.0-subset-1:W18X50"
    ]);
    assert_eq!(
        req(&mut k, "studySteelCatalogue", invalid)["status"],
        "error"
    );
}
