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
    inputs["barCount"] = json!(bar_count);
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
    assert_eq!(sm["rowFit"]["fits"], true);
    let doc: Value = serde_json::from_str(RC_FIXTURE).unwrap();
    let want = doc["cases"].as_array().unwrap().iter().find(|c| c["id"] == "RC-PREVIEW-DEFAULT").unwrap();
    let rel = doc["tolerance"]["relative"].as_f64().unwrap();
    for (got, key, exp) in [
        (&sm["ultimate"]["neutralAxisDepth"], "x", &want["expected"]["ultimate"]["neutralAxisDepth"]),
        (&sm["ultimate"]["moment"], "Mu", &want["expected"]["ultimate"]["moment"]),
        (&sm["elastic"]["crackedInertia"], "Icr", &want["expected"]["elastic"]["crackedInertia"]),
        (&sm["elastic"]["crackingMoment"], "Mcr", &want["expected"]["elastic"]["crackingMoment"]),
    ] {
        let (g, e) = (got.as_f64().unwrap(), exp.as_f64().unwrap());
        assert!((g - e).abs() <= rel * e.abs(), "{key}: got {g:e} want {e:e}");
    }
    assert_eq!(sm["ultimate"]["classification"], want["expected"]["ultimate"]["classification"]);
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
    assert!(run["sectionMechanics"].get("ultimate").is_none());
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
