//! Declarative studies (M22): deterministic replay, located errors, guards,
//! budgets and equivalence with the manual edit-then-analyse workflow.
use serde_json::{Value, json};
use workbench_assembly::{analyse, execute_study_document};
use workbench_model::Project;

fn b02() -> String {
    std::fs::read_to_string("../../fixtures/models/B02.json").unwrap()
}

fn study(variants: Value) -> Value {
    json!({
        "schemaVersion": "1.0.0", "id": "S", "name": "study", "caseId": "LC1",
        "observe": {"nodeId": "n2", "dof": "uz"}, "variants": variants
    })
}

fn stiffness(e: f64) -> Value {
    json!([{"path": "/materials/0/E", "value": e}])
}

#[test]
fn replaying_a_study_reproduces_every_hash_and_value_exactly() {
    let s = study(json!([
        {"id": "E200", "set": stiffness(200e9)},
        {"id": "E210", "set": stiffness(210e9)},
    ]));
    let a = execute_study_document(&s, &b02()).unwrap();
    let b = execute_study_document(&s, &b02()).unwrap();
    assert_eq!(a, b);
    assert_eq!(a["studyDigest"].as_str().unwrap().len(), 64);
    let base = Project::parse(&b02()).unwrap();
    assert_eq!(a["baseModelHash"], base.hash());
    // A different study document has a different digest.
    let other = study(json!([{"id": "E200", "set": stiffness(200e9)}]));
    assert_ne!(
        execute_study_document(&other, &b02()).unwrap()["studyDigest"],
        a["studyDigest"]
    );
}

#[test]
fn each_variant_matches_the_manual_edit_then_analyse_workflow() {
    let s = study(json!([
        {"id": "E210", "set": stiffness(210e9)},
        {"id": "A", "set": [{"path": "/sections/0/Iy", "value": 3.0e-5}, {"path": "/sections/0/Iz", "value": 3.0e-5}]},
    ]));
    let report = execute_study_document(&s, &b02()).unwrap();
    // The same edits made to the project by hand.
    let mut manual = Project::parse(&b02()).unwrap();
    manual.materials[0].e = 210e9;
    let r = analyse(&manual, "LC1").unwrap();
    let v = &report["variants"][0];
    assert_eq!(v["modelHash"], r.model_hash);
    assert_eq!(v["resultId"], r.result_id);
    let tip = r.node_ids.iter().position(|n| n == "n2").unwrap();
    assert_eq!(
        v["observed"]["value"].as_f64().unwrap().to_bits(),
        r.node_displacements[tip * 6 + 2].to_bits()
    );
    let mut manual = Project::parse(&b02()).unwrap();
    manual.sections[0].iy = 3.0e-5;
    manual.sections[0].iz = 3.0e-5;
    assert_eq!(
        report["variants"][1]["modelHash"],
        analyse(&manual, "LC1").unwrap().model_hash
    );
}

fn failure(s: &Value) -> (String, Value, String) {
    let d = execute_study_document(s, &b02()).unwrap_err();
    (d.code, d.details["studyLocation"].clone(), d.message)
}

#[test]
fn errors_name_the_variant_step_path_and_stage() {
    // A path that does not exist, in the second step of the second variant.
    let (code, at, message) = failure(&study(json!([
        {"id": "ok", "set": stiffness(200e9)},
        {"id": "bad", "set": [{"path": "/materials/0/E", "value": 1e11}, {"path": "/materials/9/E", "value": 1e11}]},
    ])));
    assert_eq!(code, "INVALID_SCHEMA");
    assert_eq!(
        at,
        json!({"variantIndex": 1, "variantId": "bad", "stepIndex": 1, "path": "/materials/9/E", "stage": "set"})
    );
    assert!(
        message.starts_with("variant 2 (bad), step 2 (/materials/9/E)"),
        "{message}"
    );
    // A value the model rejects is caught by the same validation as an edit.
    let (code, at, _) = failure(&study(json!([{"id": "neg", "set": stiffness(-1.0)}])));
    assert_eq!(code, "INVALID_MATERIAL");
    assert_eq!(at["stage"], "validate");
    assert_eq!(at["variantId"], "neg");
    // An unstable variant fails at analysis, located.
    let (code, at, _) = failure(&study(json!([
        {"id": "free", "set": [{"path": "/supports/0/fixed", "value": [false, false, false, false, false, false]}]},
    ])));
    assert_eq!(at["stage"], "analyse", "{code}");
}

#[test]
fn a_study_cannot_bypass_validation_or_capability_guards() {
    for (set, code) in [
        (
            json!([{"path": "/solverOverride", "value": "fast"}]),
            "UNSUPPORTED_FEATURE",
        ),
        (
            json!([{"path": "/schemaVersion", "value": "0.9.0"}]),
            "UNSUPPORTED_FEATURE",
        ),
        (
            json!([{"path": "/metadata/createdBy", "value": "x"}]),
            "UNSUPPORTED_FEATURE",
        ),
        (
            json!([{"path": "/analysisSettings/type", "value": "nonlinear"}]),
            "UNSUPPORTED_FEATURE",
        ),
        (
            json!([{"path": "/members/0/releaseStart", "value": {"mx": true}}]),
            "UNSUPPORTED_FEATURE",
        ),
        (
            json!([{"path": "/members/0/section", "value": "missing"}]),
            "DANGLING_REFERENCE",
        ),
    ] {
        let (got, at, _) = failure(&study(json!([{"id": "v", "set": set.clone()}])));
        assert_eq!(got, code, "{set}");
        assert_eq!(at["variantId"], "v", "{set}");
    }
    // Unknown study fields are refused rather than ignored.
    let mut s = study(json!([{"id": "v", "set": stiffness(2e11)}]));
    s["script"] = json!("anything");
    assert_eq!(
        execute_study_document(&s, &b02()).unwrap_err().code,
        "INVALID_SCHEMA"
    );
    let s = study(
        json!([{"id": "v", "set": [{"path": "/materials/0/E", "value": 2e11, "eval": "x"}]}]),
    );
    assert_eq!(
        execute_study_document(&s, &b02()).unwrap_err().code,
        "INVALID_SCHEMA"
    );
    // Duplicate variant ids and variants that change nothing are refused.
    let s =
        study(json!([{"id": "v", "set": stiffness(2e11)}, {"id": "v", "set": stiffness(2.1e11)}]));
    assert_eq!(
        execute_study_document(&s, &b02()).unwrap_err().code,
        "INVALID_SCHEMA"
    );
    let s =
        study(json!([{"id": "a", "set": stiffness(2e11)}, {"id": "b", "set": stiffness(2e11)}]));
    assert_eq!(
        execute_study_document(&s, &b02()).unwrap_err().code,
        "INVALID_SCHEMA"
    );
}

#[test]
fn studies_stay_within_their_budgets_before_any_analysis() {
    let many: Vec<Value> = (0..51)
        .map(|i| json!({"id": format!("v{i}"), "set": stiffness(2e11 + i as f64)}))
        .collect();
    assert_eq!(
        execute_study_document(&study(json!(many)), &b02())
            .unwrap_err()
            .code,
        "STUDY_BUDGET"
    );
    let steps: Vec<Value> = (0..101)
        .map(|_| json!({"path": "/materials/0/E", "value": 2e11}))
        .collect();
    assert_eq!(
        execute_study_document(&study(json!([{"id": "v", "set": steps}])), &b02())
            .unwrap_err()
            .code,
        "STUDY_BUDGET"
    );
    // 20 variants × 60 steps exceeds the 1000-step study total.
    let heavy: Vec<Value> = (0..20)
        .map(|i| json!({"id": format!("v{i}"), "set": (0..60).map(|_| json!({"path": "/materials/0/E", "value": 2e11 + i as f64})).collect::<Vec<_>>()}))
        .collect();
    assert_eq!(
        execute_study_document(&study(json!(heavy)), &b02())
            .unwrap_err()
            .code,
        "STUDY_BUDGET"
    );
}
