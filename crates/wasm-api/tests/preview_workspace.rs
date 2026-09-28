use serde_json::{Value, json};
use workbench_wasm_api::Kernel;
fn req(k: &mut Kernel, op: &str, p: Value) -> Value {
    let snap:Value=serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"snapshot","operation":"getSnapshot","expectedRevision":null,"payload":{}}).to_string())).unwrap();
    serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"preview-test","operation":op,"expectedRevision":snap["revision"],"payload":p}).to_string())).unwrap()
}
fn cmd(k: &mut Kernel, kind: &str, args: Value) -> Value {
    req(
        k,
        "applyCommand",
        json!({"command":{"id":"preview-command","type":kind,"args":args}}),
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
fn create(k: &mut Kernel, kind: &str) -> Value {
    let r = cmd(
        k,
        "CreateDesignPreview",
        json!({"kind":kind,"targetId":if kind=="rcBeam"{json!("m1")}else if kind=="padFooting"{json!("s1")}else{Value::Null}}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    r
}
#[test]
fn preview_all_families_persist_and_never_claim_compliance() {
    for kind in ["rcBeam", "slab", "padFooting"] {
        let mut k = open();
        let before = req(&mut k, "getSnapshot", json!({}));
        let c = create(&mut k, kind);
        let draft = &c["payload"]["project"]["designPreviews"][0];
        let input =
            json!({"draftId":draft["id"],"modelHash":c["modelHash"],"sourceMode":"synthetic"});
        let r = req(&mut k, "evaluateDesignPreview", input.clone());
        assert_eq!(r["status"], "ok", "{r}");
        let run = &r["payload"];
        assert_eq!(run["overall"], "unsupported");
        assert_eq!(run["mock"], true);
        assert!(run["codeProfile"].is_null());
        for check in run["checks"].as_array().unwrap() {
            assert_eq!(check["status"], "unsupported");
            assert!(check["utilisation"].is_null());
        }
        let mut reopened = Kernel::new();
        assert_eq!(
            req(
                &mut reopened,
                "importProject",
                json!({"jsonUtf8":c["payload"]["project"].to_string()})
            )["status"],
            "ok"
        );
        assert_eq!(
            req(&mut reopened, "evaluateDesignPreview", input)["payload"],
            *run
        );
        assert_eq!(
            req(&mut k, "undo", json!({}))["modelHash"],
            before["modelHash"]
        );
    }
}
#[test]
fn preview_model_sources_are_exact_and_stale_or_forged_results_rejected() {
    for kind in ["rcBeam", "padFooting"] {
        let mut k = open();
        let c = create(&mut k, kind);
        let a = req(&mut k, "analyse", json!({"caseIds":["LC1"]}));
        assert_eq!(a["status"], "ok", "{a}");
        let mut input = json!({"draftId":c["payload"]["project"]["designPreviews"][0]["id"],"modelHash":a["modelHash"],"caseId":"LC1","resultId":a["payload"]["resultId"],"sourceMode":"model"});
        let r = req(&mut k, "evaluateDesignPreview", input.clone());
        assert_eq!(r["status"], "ok", "{r}");
        let source = &r["payload"]["sourceProvenance"];
        assert_eq!(source["mock"], false);
        assert_eq!(source["resultId"], a["payload"]["resultId"]);
        if kind == "padFooting" {
            assert_eq!(source["supportReaction"], a["payload"]["reactions"]);
            for (a, b) in source["supportReaction"]
                .as_array()
                .unwrap()
                .iter()
                .zip(source["foundationActions"].as_array().unwrap())
            {
                assert_eq!(a.as_f64().unwrap(), -b.as_f64().unwrap());
            }
            assert_eq!(r["payload"]["contactState"], "indeterminate");
        } else {
            assert_eq!(
                source["stations"],
                a["payload"]["members"][0]["keyStations"]
            );
        }
        input["resultId"] = json!("forged");
        assert_eq!(
            req(&mut k, "evaluateDesignPreview", input.clone())["status"],
            "error"
        );
        input["modelHash"] = json!("old");
        assert_eq!(
            req(&mut k, "evaluateDesignPreview", input)["status"],
            "error"
        );
    }
}
#[test]
fn preview_invalid_geometry_is_atomic_and_slab_refuses_frame_actions() {
    let mut k = open();
    let c = create(&mut k, "slab");
    let d = &c["payload"]["project"]["designPreviews"][0];
    let mut inputs = d["inputs"].clone();
    inputs["cover"] = json!("900 mm");
    let bad = cmd(
        &mut k,
        "SetDesignPreview",
        json!({"id":d["id"],"inputs":inputs}),
    );
    assert_eq!(bad["status"], "error");
    assert_eq!(
        req(&mut k, "getSnapshot", json!({}))["modelHash"],
        c["modelHash"]
    );
    assert_eq!(
        req(
            &mut k,
            "evaluateDesignPreview",
            json!({"draftId":d["id"],"modelHash":c["modelHash"],"sourceMode":"model"})
        )["status"],
        "error"
    );
    inputs = d["inputs"].clone();
    inputs["thickness"] = json!("250 mm");
    let good = cmd(
        &mut k,
        "SetDesignPreview",
        json!({"id":d["id"],"inputs":inputs}),
    );
    assert_eq!(good["status"], "ok", "{good}");
    assert_eq!(
        good["payload"]["project"]["designPreviews"][0]["inputs"]["thickness"],
        0.25
    );
    assert_eq!(
        good["payload"]["project"]["designPreviews"][0]["inputSources"]["thickness"],
        "user"
    );
    assert_eq!(
        good["payload"]["project"]["designPreviews"][0]["inputSources"]["concreteStrength"],
        "syntheticFixture"
    );
    assert_ne!(good["modelHash"], c["modelHash"]);
    assert_eq!(req(&mut k, "undo", json!({}))["modelHash"], c["modelHash"]);
}

const RC_FIXTURE: &str = include_str!("../../../fixtures/design/rc-section-mechanics/cases.json");

fn rc_run(k: &mut Kernel, id: &Value, model_hash: &Value) -> Value {
    let r = req(
        k,
        "evaluateDesignPreview",
        json!({"draftId":id,"modelHash":model_hash,"sourceMode":"synthetic"}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    r["payload"].clone()
}
fn rc_set(k: &mut Kernel, draft: &Value, mechanics: Value, bar_count: &str) -> Value {
    let mut inputs = draft["inputs"].clone();
    inputs["bottomBarCount"] = json!(bar_count);
    cmd(
        k,
        "SetDesignPreview",
        json!({"id":draft["id"],"inputs":inputs,"targetId":"m1","soilReference":"","mechanics":mechanics}),
    )
}
fn block_mechanics(depth_ratio: &str) -> Value {
    json!({"law":"rectangularBlock","inputs":{"blockIntensity":"20 MPa","blockDepthRatio":depth_ratio,"ultimateStrain":"0.003",
        "steelYieldStrength":"460 MPa","steelModulus":"200 GPa","concreteModulus":"30 GPa","concreteTensileStrength":"2.8 MPa","minimumClearSpacing":"25 mm"}})
}

#[test]
fn rc_beam_section_mechanics_match_oracle_and_never_change_status() {
    let mut k = open();
    let c = create(&mut k, "rcBeam");
    let draft = &c["payload"]["project"]["designPreviews"][0];
    assert_eq!(draft["mechanics"]["law"], "rectangularBlock");
    assert!(draft["mechanics"]["inputSources"].as_object().unwrap().values().all(|s| s == "syntheticFixture"));
    let run = rc_run(&mut k, &draft["id"], &c["modelHash"]);
    assert_eq!(run["overall"], "unsupported");
    assert!(run["checks"].as_array().unwrap().iter().all(|c| c["status"] == "unsupported" && c["utilisation"].is_null()));
    let sm = &run["sectionMechanics"];
    assert_eq!(sm["status"], "evaluated", "{sm}");
    assert_eq!(sm["basis"], "mechanics");
    assert!(sm["codeProfile"].is_null());
    assert_eq!(sm["rowFits"]["top"]["fits"], true);
    assert_eq!(sm["rowFits"]["bottom"]["fits"], true);
    let doc: Value = serde_json::from_str(RC_FIXTURE).unwrap();
    let want = doc["cases"].as_array().unwrap().iter().find(|c| c["id"] == "RC-PREVIEW-DEFAULT").unwrap();
    let rel = doc["tolerance"]["relative"].as_f64().unwrap();
    for (got, key, exp) in [
        (&sm["sagging"]["ultimate"]["neutralAxisDepth"], "x", &want["expected"]["ultimate"]["neutralAxisDepth"]),
        (&sm["sagging"]["ultimate"]["moment"], "Mu", &want["expected"]["ultimate"]["moment"]),
        (&sm["sagging"]["elastic"]["crackedInertia"], "Icr", &want["expected"]["elastic"]["crackedInertia"]),
        (&sm["sagging"]["elastic"]["crackingMoment"], "Mcr", &want["expected"]["elastic"]["crackingMoment"]),
    ] {
        let (g, e) = (got.as_f64().unwrap(), exp.as_f64().unwrap());
        assert!((g - e).abs() <= rel * e.abs(), "{key}: got {g:e} want {e:e}");
    }
    assert_eq!(sm["sagging"]["ultimate"]["classification"], want["expected"]["ultimate"]["classification"]);
}

#[test]
fn rc_beam_mechanics_edits_are_validated_atomic_and_provenance_tracked() {
    let mut k = open();
    let c = create(&mut k, "rcBeam");
    let draft = c["payload"]["project"]["designPreviews"][0].clone();
    let before = req(&mut k, "getSnapshot", json!({}));
    let bad = rc_set(&mut k, &draft, block_mechanics("1.5"), "4");
    assert_eq!(bad["status"], "error", "{bad}");
    assert_eq!(req(&mut k, "getSnapshot", json!({}))["modelHash"], before["modelHash"]);

    let unchanged = rc_set(&mut k, &draft, block_mechanics("0.75"), "4");
    assert_eq!(unchanged["status"], "ok", "{unchanged}");
    let m = &unchanged["payload"]["project"]["designPreviews"][0]["mechanics"];
    assert!(m["inputSources"].as_object().unwrap().values().all(|s| s == "syntheticFixture"), "{m}");

    let parabola = json!({"law":"parabolaRectangle","inputs":{"parabolaPeak":"22 MPa","strainAtPeak":"0.002","parabolaExponent":"2","ultimateStrain":"0.0034",
        "steelYieldStrength":"460 MPa","steelModulus":"200 GPa","concreteModulus":"30 GPa","concreteTensileStrength":"2.8 MPa","minimumClearSpacing":"25 mm"}});
    let r = rc_set(&mut k, &draft, parabola, "4");
    assert_eq!(r["status"], "ok", "{r}");
    let d = &r["payload"]["project"]["designPreviews"][0];
    let src = &d["mechanics"]["inputSources"];
    assert_eq!(src["parabolaPeak"], "user");
    assert_eq!(src["ultimateStrain"], "user");
    assert_eq!(src["strainAtPeak"], "syntheticFixture");
    assert_eq!(src["steelModulus"], "syntheticFixture");
    assert!(d["mechanics"]["inputs"].get("blockIntensity").is_none());
    let run = rc_run(&mut k, &d["id"], &r["modelHash"]);
    assert_eq!(run["sectionMechanics"]["law"], "parabolaRectangle");
    assert_eq!(run["sectionMechanics"]["status"], "evaluated");

    let crowded = rc_set(&mut k, d, block_mechanics("0.75"), "12");
    assert_eq!(crowded["status"], "ok", "{crowded}");
    let run = rc_run(&mut k, &d["id"], &crowded["modelHash"]);
    assert_eq!(run["sectionMechanics"]["status"], "rowDoesNotFit");
    assert!(run["sectionMechanics"].get("sagging").is_none());
    assert!(run["sectionMechanics"]["reason"].as_str().unwrap().contains("bottom"));
    assert_eq!(run["overall"], "unsupported");
}

#[test]
fn rc_beam_saved_without_mechanics_reopens_as_not_configured() {
    let mut k = open();
    let c = create(&mut k, "rcBeam");
    let mut project = c["payload"]["project"].clone();
    project["designPreviews"][0].as_object_mut().unwrap().remove("mechanics");
    let mut reopened = Kernel::new();
    let r = req(&mut reopened, "importProject", json!({"jsonUtf8":project.to_string()}));
    assert_eq!(r["status"], "ok", "{r}");
    let run = rc_run(&mut reopened, &project["designPreviews"][0]["id"], &r["modelHash"]);
    assert_eq!(run["sectionMechanics"]["status"], "notConfigured");
    assert_eq!(run["overall"], "unsupported");
}

#[test]
fn mechanics_rejected_for_non_beam_previews() {
    let mut k = open();
    let c = create(&mut k, "slab");
    let d = &c["payload"]["project"]["designPreviews"][0];
    assert!(d.get("mechanics").is_none());
    let r = cmd(
        &mut k,
        "SetDesignPreview",
        json!({"id":d["id"],"inputs":d["inputs"],"soilReference":"","mechanics":block_mechanics("0.75")}),
    );
    assert_eq!(r["status"], "error", "{r}");
}

fn oracle_case(id: &str) -> (Value, f64) {
    let doc: Value = serde_json::from_str(RC_FIXTURE).unwrap();
    let case = doc["cases"].as_array().unwrap().iter().find(|c| c["id"] == id).unwrap().clone();
    (case, doc["tolerance"]["relative"].as_f64().unwrap())
}

#[test]
fn rc_beam_unequal_faces_give_distinct_sagging_and_hogging_matching_oracle() {
    let mut k = open();
    let c = create(&mut k, "rcBeam");
    let draft = c["payload"]["project"]["designPreviews"][0].clone();
    let mut inputs = draft["inputs"].clone();
    inputs["topBarDiameter"] = json!("16 mm");
    inputs["topBarCount"] = json!("2");
    inputs["bottomBarDiameter"] = json!("25 mm");
    inputs["bottomBarCount"] = json!("4");
    let r = cmd(
        &mut k,
        "SetDesignPreview",
        json!({"id":draft["id"],"inputs":inputs,"targetId":"m1","soilReference":"","mechanics":block_mechanics("0.75")}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    let run = rc_run(&mut k, &draft["id"], &r["modelHash"]);
    let sm = &run["sectionMechanics"];
    assert_eq!(sm["status"], "evaluated", "{sm}");
    for (face, id, compression) in [
        ("sagging", "RC-PREVIEW-ASYM-SAGGING", "top"),
        ("hogging", "RC-PREVIEW-ASYM-HOGGING", "bottom"),
    ] {
        let (case, rel) = oracle_case(id);
        let got = &sm[face];
        assert_eq!(got["compressionFace"], compression);
        let want = &case["expected"]["ultimate"];
        for key in ["neutralAxisDepth", "moment"] {
            let (g, e) = (got["ultimate"][key].as_f64().unwrap(), want[key].as_f64().unwrap());
            assert!((g - e).abs() <= rel * e.abs(), "{face} {key}: got {g:e} want {e:e}");
        }
        assert_eq!(got["ultimate"]["classification"], want["classification"], "{face}");
        for (l, w) in got["layers"].as_array().unwrap().iter().zip(case["layers"].as_array().unwrap()) {
            let (g, e) = (l["depth"].as_f64().unwrap(), w["depth"].as_f64().unwrap());
            assert!((g - e).abs() <= 1e-15, "{face} layer depth {g} vs {e}");
        }
    }
    let schedule = run["schedule"].as_array().unwrap();
    assert_eq!(schedule.len(), 2);
    assert_eq!(schedule[0]["region"], "Top");
    assert_eq!(schedule[0]["quantity"], 2.0);
    assert_eq!(schedule[1]["diameter"], 0.025);
    assert_eq!(run["overall"], "unsupported");
}

#[test]
fn schema_1_1_rc_beam_drafts_migrate_to_equal_top_and_bottom_rows() {
    let mut k = open();
    let c = create(&mut k, "rcBeam");
    let mut legacy = c["payload"]["project"].clone();
    legacy["schemaVersion"] = json!("1.1.0");
    let d = &mut legacy["designPreviews"][0];
    d.as_object_mut().unwrap().remove("mechanics");
    for map in ["inputs", "inputSources"] {
        let obj = d[map].as_object_mut().unwrap();
        let (dia, count) = (obj["topBarDiameter"].clone(), obj["topBarCount"].clone());
        for key in ["topBarDiameter", "topBarCount", "bottomBarDiameter", "bottomBarCount"] {
            obj.remove(key);
        }
        obj.insert("barDiameter".into(), dia);
        obj.insert("barCount".into(), count);
    }
    legacy["designPreviews"][0]["inputs"]["barCount"] = json!(3.0);
    legacy["designPreviews"][0]["inputSources"]["barCount"] = json!("user");
    let mut reopened = Kernel::new();
    let r = req(&mut reopened, "importProject", json!({"jsonUtf8":legacy.to_string()}));
    assert_eq!(r["status"], "ok", "{r}");
    let migrated = &r["payload"]["project"];
    assert_eq!(migrated["schemaVersion"], "1.2.0");
    let m = &migrated["designPreviews"][0];
    for face in ["top", "bottom"] {
        assert_eq!(m["inputs"][format!("{face}BarCount")], 3.0);
        assert_eq!(m["inputs"][format!("{face}BarDiameter")], 0.02);
        assert_eq!(m["inputSources"][format!("{face}BarCount")], "user");
    }
    assert!(m["inputs"].get("barCount").is_none());
    let steps = r["payload"]["migrationReport"]["steps"].to_string();
    assert!(steps.contains("equal top and bottom rows"), "{}", r["payload"]["migrationReport"]);

    // A 1.1.0 RC beam missing its bar preference is refused, not guessed.
    legacy["designPreviews"][0]["inputs"].as_object_mut().unwrap().remove("barDiameter");
    let bad = req(&mut Kernel::new(), "importProject", json!({"jsonUtf8":legacy.to_string()}));
    assert_eq!(bad["status"], "error", "{bad}");
}
/// ADR 0014: fixed-fixed UDL (B08, q = 10 kN/m, L = 6 m) has closed-form
/// hogging qL²/12 = 30 kN·m at both ends and sagging qL²/24 = 15 kN·m at
/// midspan. Reversing localY flips local z, so the draft faces swap.
fn model_demand(local_y: [f64; 3]) -> Value {
    let mut k = Kernel::new();
    let mut p: Value =
        serde_json::from_str(include_str!("../../../fixtures/models/B08.json")).unwrap();
    p["members"][0]["localY"] = json!(local_y);
    assert_eq!(req(&mut k, "createProject", json!({"project":p}))["status"], "ok");
    let c = create(&mut k, "rcBeam");
    let a = req(&mut k, "analyse", json!({"caseIds":["LC1"]}));
    assert_eq!(a["status"], "ok", "{a}");
    let r = req(
        &mut k,
        "evaluateDesignPreview",
        json!({"draftId":c["payload"]["project"]["designPreviews"][0]["id"],"modelHash":a["modelHash"],"caseId":"LC1","resultId":a["payload"]["resultId"],"sourceMode":"model"}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    assert_eq!(r["payload"]["overall"], "unsupported");
    r["payload"]["flexuralDemand"].clone()
}
#[test]
fn rc_beam_model_demand_matches_closed_form_and_reports_face_orientation() {
    let close = |v: &Value, expected: f64| {
        let v = v.as_f64().unwrap();
        assert!((v - expected).abs() <= 1e-6 * expected.abs(), "{v} vs {expected}");
    };
    let up = model_demand([0., 1., 0.]);
    assert_eq!(up["status"], "evaluated");
    assert_eq!(up["combinationId"], "LC1");
    assert_eq!(up["topFaceOrientation"], "up");
    assert_eq!(up["utilisation"], Value::Null);
    close(&up["sagging"]["moment"], 15000.);
    close(&up["sagging"]["station"], 0.5);
    close(&up["sagging"]["actions"][4], -15000.);
    close(&up["hogging"]["moment"], 30000.);
    assert_eq!(up["hogging"]["station"], 0.);
    close(&up["hogging"]["actions"][4], 30000.);
    let down = model_demand([0., -1., 0.]);
    assert_eq!(down["topFaceOrientation"], "down");
    assert_eq!(down["topFaceDirection"], json!([0., 0., -1.]));
    close(&down["sagging"]["moment"], 30000.);
    close(&down["hogging"]["moment"], 15000.);
    close(&down["hogging"]["station"], 0.5);
}
#[test]
fn rc_beam_synthetic_run_has_no_model_demand() {
    let mut k = open();
    let draft = create(&mut k, "rcBeam");
    let c = req(&mut k, "getSnapshot", json!({}));
    let run = rc_run(&mut k, &draft["payload"]["project"]["designPreviews"][0]["id"], &c["modelHash"]);
    assert_eq!(run["flexuralDemand"]["status"], "unavailable");
}
