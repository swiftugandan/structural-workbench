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
        // A faithful 1.1.0 draft: no link legs (introduced in 1.3.0).
        obj.remove("linkLegs");
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
    assert_eq!(migrated["schemaVersion"], "1.5.0");
    let m = &migrated["designPreviews"][0];
    assert_eq!(m["inputs"]["linkLegs"], 2.0);
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
    r["payload"].clone()
}
#[test]
fn rc_beam_model_demand_matches_closed_form_and_reports_face_orientation() {
    let close = |v: &Value, expected: f64| {
        let v = v.as_f64().unwrap();
        assert!((v - expected).abs() <= 1e-6 * expected.abs(), "{v} vs {expected}");
    };
    let up = model_demand([0., 1., 0.])["flexuralDemand"].clone();
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
    let down = model_demand([0., -1., 0.])["flexuralDemand"].clone();
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
/// M08-A5: each state's governing model moment drives the cracked-section
/// service stresses; expected values come from the independent oracle cases
/// RC-PREVIEW-B08-*-SERVICE (default draft, B08 closed-form moments).
#[test]
fn rc_beam_service_stresses_under_model_moments_match_oracle() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../fixtures/design/rc-section-mechanics/cases.json"
    ))
    .unwrap();
    let expected = |id: &str| {
        fixture["cases"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["id"] == id)
            .unwrap()["expected"]["elastic"]
            .clone()
    };
    let close = |got: &Value, want: &Value| {
        let (g, w) = (got.as_f64().unwrap(), want.as_f64().unwrap());
        assert!((g - w).abs() <= 1e-9 * w.abs(), "{g} vs {w}");
    };
    let run = model_demand([0., 1., 0.]);
    let sm = &run["sectionMechanics"];
    assert_eq!(sm["status"], "evaluated");
    for (state, id, moment, station) in [
        ("sagging", "RC-PREVIEW-B08-SAGGING-SERVICE", 15000., 0.5),
        ("hogging", "RC-PREVIEW-B08-HOGGING-SERVICE", 30000., 0.),
    ] {
        let want = expected(id);
        let st = &sm[state];
        close(&st["serviceMoment"]["moment"], &json!(moment));
        close(&st["serviceMoment"]["station"], &json!(station));
        assert_eq!(st["serviceMoment"]["combinationId"], "LC1");
        assert_eq!(st["serviceMoment"]["stressBasis"], "crackedSection");
        // Both closed-form moments are below M_cr = 58.4 kN m for this draft.
        assert_eq!(st["serviceMoment"]["belowCrackingMoment"], true);
        close(&st["elastic"]["serviceConcreteStress"], &want["serviceConcreteStress"]);
        for (g, w) in st["elastic"]["serviceSteelStress"]
            .as_array()
            .unwrap()
            .iter()
            .zip(want["serviceSteelStress"].as_array().unwrap())
        {
            close(g, w);
        }
    }
    assert_eq!(run["overall"], "unsupported");
}
#[test]
fn rc_beam_synthetic_run_has_no_service_stresses() {
    let mut k = open();
    let draft = create(&mut k, "rcBeam");
    let c = req(&mut k, "getSnapshot", json!({}));
    let run = rc_run(&mut k, &draft["payload"]["project"]["designPreviews"][0]["id"], &c["modelHash"]);
    for state in ["sagging", "hogging"] {
        let st = &run["sectionMechanics"][state];
        assert_eq!(st["serviceMoment"], Value::Null);
        assert_eq!(st["elastic"].get("serviceConcreteStress"), None, "{st}");
    }
}
/// M08-B3 (ADR 0016): the disabled EC2 profile runs at the governing sagging,
/// hogging and shear key stations of the bound combination. Expected values
/// come from the independent oracles: RC-PREVIEW-EC2-UK-DEFAULT (rc_section
/// oracle) and designCheckTargets.previewDefaultDraftUk (EC2 beam oracle).
#[test]
fn rc_beam_ec2_preview_runs_disabled_profile_at_governing_stations() {
    let rc: Value = serde_json::from_str(include_str!(
        "../../../fixtures/design/rc-section-mechanics/cases.json"
    ))
    .unwrap();
    let mu = rc["cases"].as_array().unwrap().iter()
        .find(|c| c["id"] == "RC-PREVIEW-EC2-UK-DEFAULT").unwrap()["expected"]["ultimate"]["moment"]
        .as_f64().unwrap();
    let ec2: Value = serde_json::from_str(include_str!(
        "../../../fixtures/design/ec2-uk-na/jrc-axis2-beam.reconciliation.json"
    ))
    .unwrap();
    let t = &ec2["designCheckTargets"]["previewDefaultDraftUk"];
    let close = |got: &Value, want: f64, rel: f64, what: &str| {
        let g = got.as_f64().unwrap_or_else(|| panic!("{what} missing: {got}"));
        assert!((g - want).abs() <= rel * want.abs(), "{what}: {g} vs {want}");
    };
    let run = model_demand([0., 1., 0.]);
    let code = &run["codeProfilePreview"];
    assert_eq!(code["status"], "evaluated", "{code}");
    assert_eq!(code["profileId"], "ec2-uk-na");
    assert_eq!(code["profileEnabled"], false);
    assert_eq!(code["basis"], "disabledProfilePreview");
    assert_eq!(code["tensionAnchorageConfirmed"], false);
    // The preview never changes the checks or the overall status.
    assert_eq!(run["overall"], "unsupported");
    assert!(run["checks"].as_array().unwrap().iter().all(|c| c["status"] == "unsupported"));
    let governing = code["governing"].as_array().unwrap();
    // B08: hogging and shear both govern at the fixed end x/L = 0, so they share one entry.
    let roles: Vec<Vec<&str>> = governing.iter().map(|g| g["roles"].as_array().unwrap().iter().map(|r| r.as_str().unwrap()).collect()).collect();
    assert_eq!(roles, vec![vec!["sagging"], vec!["hogging", "shear"]]);
    let has = |g: &Value, role: &str| g["roles"].as_array().unwrap().iter().any(|r| r == role);
    let check = |role: &str, id: &str| -> Value {
        let g = governing.iter().find(|g| has(g, role)).unwrap();
        g["checks"].as_array().unwrap().iter().find(|c| c["checkId"] == id).cloned()
            .unwrap_or_else(|| panic!("{role} {id} missing: {g}"))
    };
    // Symmetric default draft: sagging and hogging M_Rd equal the oracle, B08 moments pass.
    for (role, med) in [("sagging", 15000.), ("hogging", 30000.)] {
        let fl = check(role, "ec2.flexure");
        close(&fl["resistance"], mu, 1e-9, &format!("{role} M_Rd"));
        close(&fl["demand"], med, 1e-6, &format!("{role} M_Ed"));
        assert_eq!(fl["status"], "pass");
        close(&check(role, "ec2.as-min")["demand"], f(&t["AsMin_mm2"]) / 1e6, 1e-9, "As,min");
    }
    // Governing shear is the first end (station 0), Vz = qL/2 = 30 kN.
    let sh_station = governing.iter().find(|g| has(g, "shear")).unwrap();
    assert_eq!(sh_station["station"], 0.0);
    let sh = check("shear", "ec2.shear");
    close(&sh["demand"], 30000., 1e-6, "V_Ed");
    close(&sh["resistance"], f(&t["shearWithLinks"]["VRd_kN"]) * 1e3, 1e-5, "V_Rd");
    close(&sh["intermediates"]["cotTheta"], f(&t["shearWithLinks"]["cotTheta"]), 1e-4, "cot theta");
    assert_eq!(sh["intermediates"]["rhoL"], 0.0, "unconfirmed anchorage excludes Asl");
    let sp = check("shear", "ec2.links-spacing");
    close(&sp["intermediates"]["st"], f(&t["st_mm"]) / 1e3, 1e-9, "s_t");
    close(&sp["intermediates"]["slMax"], f(&t["slMax_mm"]) / 1e3, 1e-9, "s_l,max");
    close(&check("shear", "ec2.links-min")["resistance"], f(&t["rhoW"]), 1e-9, "rho_w");
    // Companions keep every station from passing overall.
    for g in governing {
        assert_eq!(g["overall"], "unsupported", "{}", g["roles"]);
    }
}
fn f(v: &Value) -> f64 {
    v.as_f64().unwrap()
}
#[test]
fn rc_beam_ec2_preview_is_unavailable_without_model_actions() {
    let mut k = open();
    let draft = create(&mut k, "rcBeam");
    let c = req(&mut k, "getSnapshot", json!({}));
    let run = rc_run(&mut k, &draft["payload"]["project"]["designPreviews"][0]["id"], &c["modelHash"]);
    assert_eq!(run["codeProfilePreview"]["status"], "unavailable");
}
#[test]
fn rc_beam_anchorage_confirmation_is_explicit_and_rc_only() {
    let mut k = open();
    let c = create(&mut k, "rcBeam");
    let d = c["payload"]["project"]["designPreviews"][0].clone();
    assert!(d.get("tensionAnchorageConfirmed").is_none());
    assert_eq!(d["inputs"]["linkLegs"], 2.0);
    let set = |k: &mut Kernel, extra: Value| {
        let mut args = json!({"id":d["id"],"inputs":d["inputs"],"soilReference":"","targetId":"m1"});
        for (key, v) in extra.as_object().unwrap() {
            args[key] = v.clone();
        }
        cmd(k, "SetDesignPreview", args)
    };
    let on = set(&mut k, json!({"tensionAnchorageConfirmed": true}));
    assert_eq!(on["status"], "ok", "{on}");
    assert_eq!(on["payload"]["project"]["designPreviews"][0]["tensionAnchorageConfirmed"], true);
    let off = set(&mut k, json!({}));
    assert!(off["payload"]["project"]["designPreviews"][0].get("tensionAnchorageConfirmed").is_none());
    let mut bad = d["inputs"].clone();
    bad["linkLegs"] = json!("3.5");
    let r = cmd(&mut k, "SetDesignPreview", json!({"id":d["id"],"inputs":bad,"soilReference":""}));
    assert_eq!(r["status"], "error", "fractional link legs must be refused");
    let footing = create(&mut k, "padFooting");
    let fd = footing["payload"]["project"]["designPreviews"].as_array().unwrap().iter()
        .find(|x| x["kind"] == "padFooting").unwrap().clone();
    let r = cmd(&mut k, "SetDesignPreview", json!({"id":fd["id"],"inputs":fd["inputs"],"soilReference":"x","targetId":"s1","tensionAnchorageConfirmed":true}));
    assert_eq!(r["status"], "error");
}

/// ADR 0016: 1.2.0 → 1.3.0 records 2 link legs with synthetic provenance,
/// keeps every other value and source, never adds an anchorage confirmation,
/// and refuses 1.2.0 drafts that already carry 1.3.0 fields.
#[test]
fn schema_1_2_rc_beam_drafts_gain_two_synthetic_link_legs() {
    let mut k = open();
    let c = create(&mut k, "rcBeam");
    let mut legacy = c["payload"]["project"].clone();
    legacy["schemaVersion"] = json!("1.2.0");
    for map in ["inputs", "inputSources"] {
        legacy["designPreviews"][0][map].as_object_mut().unwrap().remove("linkLegs");
    }
    legacy["designPreviews"][0]["inputs"]["linkSpacing"] = json!(0.15);
    legacy["designPreviews"][0]["inputSources"]["linkSpacing"] = json!("user");
    let r = req(&mut Kernel::new(), "importProject", json!({"jsonUtf8":legacy.to_string()}));
    assert_eq!(r["status"], "ok", "{r}");
    let m = &r["payload"]["project"]["designPreviews"][0];
    assert_eq!(r["payload"]["project"]["schemaVersion"], "1.5.0");
    assert_eq!(m["inputs"]["linkLegs"], 2.0);
    assert_eq!(m["inputSources"]["linkLegs"], "syntheticFixture");
    assert_eq!(m["inputs"]["linkSpacing"], 0.15);
    assert_eq!(m["inputSources"]["linkSpacing"], "user");
    assert!(m.get("tensionAnchorageConfirmed").is_none());
    let steps = r["payload"]["migrationReport"]["steps"].to_string();
    assert!(steps.contains("2 link legs"), "{steps}");

    let mut with_legs = legacy.clone();
    with_legs["designPreviews"][0]["inputs"]["linkLegs"] = json!(4.0);
    assert_eq!(req(&mut Kernel::new(), "importProject", json!({"jsonUtf8":with_legs.to_string()}))["status"], "error");
    let mut with_anchorage = legacy.clone();
    with_anchorage["designPreviews"][0]["tensionAnchorageConfirmed"] = json!(true);
    assert_eq!(req(&mut Kernel::new(), "importProject", json!({"jsonUtf8":with_anchorage.to_string()}))["status"], "error");
}
/// Governing shear must be the largest |Vz|: a propped cantilever (B08 with
/// the far end free to rotate) has closed-form end shears 5qL/8 = 37.5 kN at
/// the fixed end and 3qL/8 = 22.5 kN at the pin; hogging qL²/8 = 45 kN·m.
#[test]
fn rc_beam_ec2_preview_picks_the_largest_shear_station() {
    let mut k = Kernel::new();
    let mut p: Value =
        serde_json::from_str(include_str!("../../../fixtures/models/B08.json")).unwrap();
    p["supports"][1]["fixed"][4] = json!(false);
    assert_eq!(req(&mut k, "createProject", json!({"project":p}))["status"], "ok");
    let c = create(&mut k, "rcBeam");
    let a = req(&mut k, "analyse", json!({"caseIds":["LC1"]}));
    let r = req(
        &mut k,
        "evaluateDesignPreview",
        json!({"draftId":c["payload"]["project"]["designPreviews"][0]["id"],"modelHash":a["modelHash"],"caseId":"LC1","resultId":a["payload"]["resultId"],"sourceMode":"model"}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    let g = r["payload"]["codeProfilePreview"]["governing"].as_array().unwrap().clone();
    let has = |x: &Value, role: &str| x["roles"].as_array().unwrap().iter().any(|r| r == role);
    let shear = g.iter().find(|x| has(x, "shear")).unwrap();
    assert_eq!(shear["station"], 0.0);
    let v = shear["actions"][2].as_f64().unwrap().abs();
    assert!((v - 37500.).abs() <= 1e-6 * 37500., "governing |Vz| {v}");
    let hog = g.iter().find(|x| has(x, "hogging")).unwrap();
    let m = hog["actions"][4].as_f64().unwrap();
    assert!((m - 45000.).abs() <= 1e-6 * 45000., "hogging My {m}");
}
