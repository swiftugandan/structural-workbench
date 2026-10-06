//! M17 composite beam drafts through the protocol (ADR 0031): each stage's
//! diagram comes from the exact member actions of the case or combination
//! assigned to it. CB01 is Design Example I.1 as a model.
use serde_json::{Value, json};
use workbench_wasm_api::Kernel;

const FT: f64 = 0.3048;
const KIP: f64 = 4448.2216152605;
const IN: f64 = 0.0254;

fn req(k: &mut Kernel, op: &str, p: Value) -> Value {
    let snap: Value = serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"snapshot","operation":"getSnapshot","expectedRevision":null,"payload":{}}).to_string())).unwrap();
    serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"cb-test","operation":op,"expectedRevision":snap["revision"],"payload":p}).to_string())).unwrap()
}

fn cmd(k: &mut Kernel, kind: &str, args: Value) -> Value {
    req(
        k,
        "applyCommand",
        json!({"command":{"id":"cb-command","type":kind,"args":args}}),
    )
}

fn open() -> Kernel {
    let mut k = Kernel::new();
    let p: Value =
        serde_json::from_str(include_str!("../../../fixtures/models/CB01.json")).unwrap();
    let r = req(&mut k, "createProject", json!({"project": p}));
    assert_eq!(r["status"], "ok", "{r}");
    k
}

fn stages() -> Value {
    json!({"deck":"perpendicular","lightweight":false,"sides":["adjacent","adjacent"],"studsOverWeb":false,
           "constructionCaseId":"C-CON","compositeCaseId":"C-COMP","wetCaseId":"WET","liveCaseId":"LIVE","sustainedCaseId":"SDL",
           "preCompositeLimit":240.0,"liveLimit":360.0,"longTermLimit":240.0,"shrinkageStrain":0.0002,"creepJudgement":true})
}

fn draft(k: &mut Kernel, composite: Value) -> Value {
    let r = cmd(
        k,
        "CreateDesignPreview",
        json!({"kind":"compositeBeam","targetId":"beam"}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    let d = r["payload"]["project"]["designPreviews"][0].clone();
    let mut inputs = d["inputs"].clone();
    // I.1 camber of 2 in.
    inputs["camber"] = json!(2.0 * IN);
    let r = cmd(
        k,
        "SetDesignPreview",
        json!({"id":d["id"],"targetId":"beam","inputs":inputs,"soilReference":"","composite":composite}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    r["payload"]["project"]["designPreviews"][0].clone()
}

fn evaluate(k: &mut Kernel, d: &Value) -> Value {
    let a = req(k, "analyse", json!({"caseIds":["C-COMP"]}));
    assert_eq!(a["status"], "ok", "{a}");
    let snap = req(k, "getSnapshot", json!({}));
    let r = req(
        k,
        "evaluateDesignPreview",
        json!({"draftId":d["id"],"modelHash":snap["modelHash"],"sourceMode":"model","caseId":"C-COMP","resultId":a["payload"]["resultId"]}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    r["payload"].clone()
}

fn check<'a>(code: &'a Value, id: &str) -> &'a Value {
    code["checks"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["checkId"] == id)
        .unwrap_or_else(|| panic!("no {id}"))
}

fn f(v: &Value) -> f64 {
    v.as_f64().unwrap_or_else(|| panic!("not a number {v}"))
}

#[test]
fn example_i_1_through_its_stages() {
    let mut k = open();
    let d = draft(&mut k, stages());
    let run = evaluate(&mut k, &d);
    let code = &run["codeProfilePreview"];
    assert_eq!(code["status"], "evaluated", "{code}");
    let kip_ft = KIP * FT;
    // The stage moments of the example: 344 kip-ft construction, 678 composite.
    let con = check(code, "composite.construction.flexure");
    assert!((f(&con["demand"]) / kip_ft - 344.25).abs() < 0.01, "{con}");
    let comp = check(code, "composite.flexure");
    assert!((f(&comp["demand"]) / kip_ft - 678.4).abs() < 0.1, "{comp}");
    assert_eq!(comp["status"], "pass");
    // 45 rows at 12 in. from 6 in.: 22 rows each side of midspan at 17.2 kips.
    let qn = f(&code["studs"]["Qn"]);
    assert!((qn / KIP - 17.23).abs() < 0.01);
    assert!((f(&comp["intermediates"]["sumQn"]) - 22.0 * qn).abs() < 1e-6 * qn);
    // Deflections: wet 2.59 in. on I_s; live on I_LB.
    let wet = f(&code["deflections"]["wet"]["delta"]);
    assert!((wet / IN - 2.59).abs() < 0.005, "{wet}");
    let ilb = f(&code["deflections"]["ILB"]);
    let live = f(&code["deflections"]["live"]["delta"]);
    let closed = 5.0 * (KIP / FT) * span().powi(4) / (384.0 * 200e9 * 29000.0 / 29000.0 * ilb);
    let e = 29000.0 * 6.894757293168361e6;
    let closed = closed * 200e9 / e;
    assert!((live - closed).abs() < 1e-5 * closed, "{live} vs {closed}");
    assert_eq!(check(code, "composite.liveDeflection")["status"], "pass");
    // Net wet deflection after the 2 in. camber.
    assert!((f(&code["deflections"]["wet"]["net"]) - (wet - 2.0 * IN)).abs() < 1e-12);
    assert_eq!(run["checks"].as_array().unwrap().len(), 7);
    assert_eq!(run["schedule"][1]["quantity"], 45);
    // Uniform loads only: the slip-capacity conditions apply (≥ 50 %).
    assert_eq!(check(code, "composite.slipCapacity")["status"], "pass");
}

fn span() -> f64 {
    45.0 * FT
}

#[test]
fn stage_cases_are_kept_separate() {
    // The wet-concrete deflection is on the steel alone and the live load on
    // the composite section: swapping the live case for the wet one changes
    // only the live deflection, by I_s/I_LB.
    let mut k = open();
    let d = draft(&mut k, stages());
    let base = evaluate(&mut k, &d)["codeProfilePreview"].clone();
    let mut c = stages();
    c["liveCaseId"] = json!("WET");
    let mut k2 = open();
    let d2 = draft(&mut k2, c);
    let other = evaluate(&mut k2, &d2)["codeProfilePreview"].clone();
    let ilb = f(&base["deflections"]["ILB"]);
    let is = f(&base["deflections"]["Is"]);
    let wet = f(&base["deflections"]["wet"]["delta"]);
    let live_wet = f(&other["deflections"]["live"]["delta"]);
    assert!(
        (live_wet - wet * is / ilb).abs() < 1e-9 * wet,
        "{live_wet} vs {}",
        wet * is / ilb
    );
    assert_eq!(f(&other["deflections"]["wet"]["delta"]), wet);
    // The construction stage sees only the construction combination.
    assert_eq!(
        check(&other, "composite.construction.flexure")["demand"],
        check(&base, "composite.construction.flexure")["demand"]
    );
}

#[test]
fn missing_inputs_and_unsupported_conditions_are_never_passed() {
    let mut k = open();
    // No stage cases: unavailable, with the reason.
    let d = draft(
        &mut k,
        json!({"deck":"perpendicular","lightweight":false,"sides":["adjacent","adjacent"],"studsOverWeb":false}),
    );
    let run = evaluate(&mut k, &d);
    assert_eq!(run["codeProfilePreview"]["status"], "unavailable");
    assert!(
        run["codeProfilePreview"]["reason"]
            .as_str()
            .unwrap()
            .contains("stage")
    );
    assert_ne!(run["overall"], "pass");
    // Creep not judged: indeterminate, the run is not a pass.
    let mut c = stages();
    c.as_object_mut().unwrap().remove("creepJudgement");
    let mut k = open();
    let d = draft(&mut k, c);
    let run = evaluate(&mut k, &d);
    assert_eq!(
        check(&run["codeProfilePreview"], "composite.creep")["status"],
        "indeterminate"
    );
    assert_eq!(run["overall"], "indeterminate");
    // A stage case that does not exist is refused when saved.
    let mut k = open();
    let r = cmd(
        &mut k,
        "CreateDesignPreview",
        json!({"kind":"compositeBeam","targetId":"beam"}),
    );
    let d = r["payload"]["project"]["designPreviews"][0].clone();
    let mut c = stages();
    c["liveCaseId"] = json!("NOPE");
    let before = req(&mut k, "getSnapshot", json!({}))["modelHash"].clone();
    let r = cmd(
        &mut k,
        "SetDesignPreview",
        json!({"id":d["id"],"targetId":"beam","inputs":d["inputs"],"soilReference":"","composite":c}),
    );
    assert_eq!(r["diagnostics"][0]["code"], "DANGLING_REFERENCE", "{r}");
    assert_eq!(req(&mut k, "getSnapshot", json!({}))["modelHash"], before);
}

#[test]
fn composite_inputs_persist() {
    let mut k = open();
    let r = cmd(
        &mut k,
        "CreateDesignPreview",
        json!({"kind":"compositeBeam","targetId":"beam"}),
    );
    let d = r["payload"]["project"]["designPreviews"][0].clone();
    let r = cmd(
        &mut k,
        "SetDesignPreview",
        json!({"id":d["id"],"targetId":"beam","inputs":d["inputs"],"soilReference":"","composite":stages()}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    let project = r["payload"]["project"].clone();
    let mut reopened = Kernel::new();
    let r = req(
        &mut reopened,
        "importProject",
        json!({"jsonUtf8": project.to_string()}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    let saved = &r["payload"]["project"]["designPreviews"][0];
    assert_eq!(saved["composite"], stages());
    assert_eq!(saved["inputs"]["camber"], d["inputs"]["camber"]);
    assert_eq!(
        r["payload"]["project"]["schemaVersion"],
        workbench_model::CURRENT_SCHEMA
    );
}
