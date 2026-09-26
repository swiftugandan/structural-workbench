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
