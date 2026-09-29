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

fn governing_flexure(run: &Value) -> Value {
    run["checks"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["checkId"] == "flexure")
        .unwrap()
        .clone()
}

#[test]
fn noncompact_flanges_and_ltb_use_their_clauses_and_missing_tension_details_never_pass() {
    let mut k = open();
    // W14×99: noncompact flange for flexure, so F3-1 flange local buckling.
    assign(&mut k, "W14X99");
    inputs(&mut k, 0.0);
    let run = evaluate(&mut k);
    assert_eq!(governing_flexure(&run)["clause"], "F3-1");
    // W18×50 with Lb = 3 m (> Lp = 5.83 ft): inelastic LTB, F2-2 with Cb.
    assign(&mut k, "W18X50");
    inputs(&mut k, 3.0);
    let run = evaluate(&mut k);
    let flex = governing_flexure(&run);
    assert_eq!(flex["clause"], "F2-2");
    let (_, _, section) = workbench_design::native::resolve(
        &format!("{}:W18X50", workbench_design::native::CATALOGUE_ID),
        workbench_design::native::MATERIAL_ID,
    )
    .unwrap();
    let ltb = workbench_design::evaluate_ltb(&section, 50.0 * 6_894_757.293_168_361, 3.0, 1.0);
    let expected = 0.9 * ltb.mn.unwrap();
    assert!((flex["resistance"].as_f64().unwrap() / expected - 1.).abs() <= 1e-12);
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

/// Sets the member's serviceability criteria through SetSteelDesign.
fn service(k: &mut Kernel, criteria: Value) -> Value {
    let mut d =
        req(k, "getSnapshot", json!({}))["payload"]["project"]["members"][0]["steelDesign"].clone();
    d["serviceability"] = criteria;
    command(k, "SetSteelDesign", json!({"id":"m1","design":d}))
}

#[test]
fn serviceability_is_a_separate_deflection_status_against_the_closed_form() {
    let mut k = open();
    assign(&mut k, "W18X50");
    inputs(&mut k, 0.0);
    // Without criteria serviceability is reported as not checked.
    assert_eq!(evaluate(&mut k)["serviceability"]["status"], "notChecked");

    // B04: 3 m cantilever, 10 kN at the tip in -Y, bending about AISC x.
    let project = req(&mut k, "getSnapshot", json!({}))["payload"]["project"].clone();
    let m = &project["members"][0];
    let section = project["sections"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["id"] == m["section"])
        .unwrap();
    let material = project["materials"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["id"] == m["material"])
        .unwrap();
    let (p, l) = (10_000.0f64, 3.0f64);
    let ei = material["E"].as_f64().unwrap() * section["Iz"].as_f64().unwrap();
    let tip = p * l.powi(3) / (3.0 * ei);

    let r = service(
        &mut k,
        json!({"combinationId":"LC1","limitRatio":180.0,"basis":"absolute"}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    let run = evaluate(&mut k);
    let s = &run["serviceability"];
    assert!(
        (s["demand"].as_f64().unwrap() / tip - 1.0).abs() <= 1e-9,
        "{s}"
    );
    assert_eq!(s["station"], 1.0);
    assert!((s["limit"].as_f64().unwrap() - l / 180.0).abs() <= 1e-15);
    assert_eq!(s["status"], if tip <= l / 180.0 { "pass" } else { "fail" });

    // Relative to the chord: max over x of v(x) - v(L) x / L, v = P x²(3L - x)/(6EI).
    service(
        &mut k,
        json!({"combinationId":"LC1","limitRatio":100000.0,"basis":"chord"}),
    );
    let run = evaluate(&mut k);
    let s = &run["serviceability"];
    let v = |x: f64| p * x * x * (3.0 * l - x) / (6.0 * ei);
    let exact = (0..=40)
        .map(|i| {
            let x = l * i as f64 / 40.0;
            (v(x) - v(l) * x / l).abs()
        })
        .fold(0.0, f64::max);
    assert!(
        (s["demand"].as_f64().unwrap() / exact - 1.0).abs() <= 1e-9,
        "{s}"
    );
    // A tight limit fails serviceability without touching the strength verdict.
    assert_eq!(s["status"], "fail");
    assert_eq!(run["overall"], "pass");
    assert!(
        run["checks"]
            .as_array()
            .unwrap()
            .iter()
            .all(|c| c["checkId"] != "serviceability")
    );
}

#[test]
fn serviceability_refuses_strength_combinations_and_dangling_references() {
    let mut k = open();
    assign(&mut k, "W18X50");
    inputs(&mut k, 0.0);
    let r = command(
        &mut k,
        "SetCombination",
        json!({"id":"ULS","name":"ULS","purpose":"strength","terms":[{"case":"LC1","factor":1.5}],"existence":"create"}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    let r = service(
        &mut k,
        json!({"combinationId":"ULS","limitRatio":360.0,"basis":"chord"}),
    );
    assert_eq!(r["diagnostics"][0]["code"], "INVALID_LOAD", "{r}");
    let r = service(
        &mut k,
        json!({"combinationId":"missing","limitRatio":360.0,"basis":"chord"}),
    );
    assert_eq!(r["diagnostics"][0]["code"], "DANGLING_REFERENCE", "{r}");
    let r = service(
        &mut k,
        json!({"combinationId":"LC1","limitRatio":0.5,"basis":"chord"}),
    );
    assert_eq!(r["diagnostics"][0]["code"], "INVALID_SCHEMA", "{r}");
    // Reassigning the section keeps the member's criteria.
    service(
        &mut k,
        json!({"combinationId":"LC1","limitRatio":360.0,"basis":"chord"}),
    );
    assign(&mut k, "W24X62");
    let d =
        &req(&mut k, "getSnapshot", json!({}))["payload"]["project"]["members"][0]["steelDesign"];
    assert_eq!(d["serviceability"]["limitRatio"], 360.0);
}

/// Example F.1-2B as a model: a simply supported 35 ft W18×50 under
/// wu = 1.74 kip/ft, braced at the ends and third points, as three members.
fn third_point_beam() -> Kernel {
    let ft = 0.3048;
    let span = 35.0 * ft;
    let wu = 1.74 * 4448.2216152605 / ft;
    let node = |id: &str, x: f64| json!({"id": id, "position": [x, 0.0, 0.0]});
    let member = |id: &str, a: &str, b: &str| {
        json!({"id": id, "start": a, "end": b, "material": "mat1", "section": "sec1",
               "localY": [0.0, 0.0, 1.0],
               "releaseStart": {"my": false, "mz": false}, "releaseEnd": {"my": false, "mz": false}})
    };
    let loads: Vec<Value> = ["m1", "m2", "m3"]
        .iter()
        .map(|m| {
            json!({"id": format!("w{m}"), "case": "LC1", "type": "uniform",
                   "member": m, "axes": "global", "forcePerLength": [0.0, 0.0, -wu]})
        })
        .collect();
    let p = json!({
        "schemaVersion": "1.0.0", "id": "f12b", "name": "F.1-2B beam", "revision": 0,
        "displayUnits": "SI", "analysisMode": "spatial", "gravity": [0, 0, -9.80665],
        "materials": [{"id": "mat1", "name": "steel", "E": 200e9, "nu": 0.3, "density": 0}],
        "sections": [{"id": "sec1", "name": "placeholder", "A": 0.01, "Iy": 1e-5, "Iz": 1e-4, "J": 1e-6,
                      "cy": 0.1, "cz": 0.1, "provenance": "replaced by the catalogue"}],
        "nodes": [node("n1", 0.0), node("n2", span / 3.0), node("n3", 2.0 * span / 3.0), node("n4", span)],
        "members": [member("m1", "n1", "n2"), member("m2", "n2", "n3"), member("m3", "n3", "n4")],
        "supports": [
            {"id": "s1", "node": "n1", "fixed": [true, true, true, true, false, false], "prescribed": [0, 0, 0, 0, 0, 0]},
            {"id": "s2", "node": "n4", "fixed": [false, true, true, false, false, false], "prescribed": [0, 0, 0, 0, 0, 0]}
        ],
        "loadCases": [{"id": "LC1", "name": "1.2D+1.6L", "category": "other"}],
        "loads": loads,
        "combinations": [],
        "analysisSettings": {"type": "linearStatic", "formulation": "eulerBernoulli3D",
            "mergeTolerance": 1e-6, "timeoutMs": 30000, "memoryLimitMiB": 512},
        "metadata": {"description": "AISC Example F.1-2B", "createdBy": "tests"}
    });
    let mut k = Kernel::new();
    assert_eq!(
        req(&mut k, "createProject", json!({"project": p}))["status"],
        "ok"
    );
    for id in ["m1", "m2", "m3"] {
        let r = command(
            &mut k,
            "AssignSteelCatalogue",
            json!({"id": id, "sectionRef": "aisc-shapes-v16.0-subset-1:W18X50", "materialRef": "astm-a992-50-65-v1"}),
        );
        assert_eq!(r["status"], "ok", "{r}");
        let mut d = req(&mut k, "getSnapshot", json!({}))["payload"]["project"]["members"]
            .as_array()
            .unwrap()
            .iter()
            .find(|m| m["id"] == id)
            .unwrap()["steelDesign"]
            .clone();
        for (key, value) in [("ky", 1.0), ("kz", 1.0), ("lb", span / 3.0)] {
            d[key] = json!({"value": value, "source": "user"});
        }
        d["cb"] = json!({"value": null, "source": "derived"});
        d["stabilityBasis"] = json!("firstOrderUserEffectiveLength");
        d["bracing"] = json!("unbraced");
        let r = command(&mut k, "SetSteelDesign", json!({"id": id, "design": d}));
        assert_eq!(r["status"], "ok", "{r}");
    }
    k
}

fn evaluate_member(k: &mut Kernel, id: &str) -> Value {
    let a = req(k, "analyse", json!({"caseIds": ["LC1"]}));
    assert_eq!(a["status"], "ok", "{a}");
    let r = req(
        k,
        "evaluateModelDesign",
        json!({"memberId": id, "modelHash": a["modelHash"], "caseId": "LC1", "resultId": a["payload"]["resultId"]}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    r["payload"].clone()
}

#[test]
fn cb_from_the_model_matches_example_f1_2b_for_third_point_bracing() {
    let mut k = third_point_beam();
    // Published F.1-2B: centre segment Cb = 1.01, end segments Cb = 1.46.
    let centre = evaluate_member(&mut k, "m2");
    let cb = centre["cbDerivation"]["Cb"].as_f64().unwrap();
    assert!((cb - 1.01).abs() <= 0.005, "centre Cb {cb}");
    let end = evaluate_member(&mut k, "m1");
    let cb_end = end["cbDerivation"]["Cb"].as_f64().unwrap();
    assert!((cb_end - 1.46).abs() <= 0.005, "end Cb {cb_end}");
    // The centre segment governs with inelastic LTB, evaluated with the
    // derived Cb (F1-1 gives 1.0136, which the example rounds to 1.01) and the
    // exact third-point Lb (11.67 ft, rounded to 11.7 ft in the example).
    // The published 304 kip-ft with the rounded inputs is fixture S3-F12B.
    let flex = governing_flexure(&centre);
    assert_eq!(flex["clause"], "F2-2");
    let (_, _, section) = workbench_design::native::resolve(
        &format!("{}:W18X50", workbench_design::native::CATALOGUE_ID),
        workbench_design::native::MATERIAL_ID,
    )
    .unwrap();
    let lb = 35.0 * 0.3048 / 3.0;
    let ltb = workbench_design::evaluate_ltb(&section, 50.0 * 6_894_757.293_168_361, lb, cb);
    let expected = 0.9 * ltb.mn.unwrap();
    assert!((flex["resistance"].as_f64().unwrap() / expected - 1.0).abs() <= 1e-12);
    let phi_mn = expected / 1355.8179483314;
    assert!((phi_mn / 304.0 - 1.0).abs() <= 0.01, "φbMn {phi_mn} kip-ft");
}

#[test]
fn cb_from_the_model_needs_the_member_to_be_the_unbraced_segment() {
    let mut k = third_point_beam();
    let mut d =
        req(&mut k, "getSnapshot", json!({}))["payload"]["project"]["members"][1]["steelDesign"]
            .clone();
    d["lb"] = json!({"value": 1.0, "source": "user"});
    command(&mut k, "SetSteelDesign", json!({"id": "m2", "design": d}));
    let ready = req(&mut k, "steelReadiness", json!({"memberId": "m2"}))["payload"].clone();
    assert_eq!(ready["status"], "incomplete");
    assert!(
        ready["missing"]
            .as_array()
            .unwrap()
            .iter()
            .any(|m| m.as_str().unwrap().contains("Cb from the model"))
    );
}

#[test]
fn a_cantilever_with_a_free_end_takes_cb_of_one() {
    // B04 is a 3 m cantilever; F1-1 on its linear diagram would give 1.67,
    // but Spec F1 sets Cb = 1.0 for an unbraced free end.
    let mut k = open();
    assign(&mut k, "W18X50");
    inputs(&mut k, 3.0);
    let mut d =
        req(&mut k, "getSnapshot", json!({}))["payload"]["project"]["members"][0]["steelDesign"]
            .clone();
    d["cb"] = json!({"value": null, "source": "derived"});
    assert_eq!(
        command(&mut k, "SetSteelDesign", json!({"id": "m1", "design": d}))["status"],
        "ok"
    );
    let run = evaluate(&mut k);
    assert_eq!(run["cbDerivation"]["Cb"], 1.0);
    assert!(
        run["cbDerivation"]["equation"]
            .as_str()
            .unwrap()
            .contains("cantilever")
    );
}
