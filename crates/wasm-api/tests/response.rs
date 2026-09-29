//! response-v1 through the protocol: spectra commands, harmonic and
//! response-spectrum `analyse` requests and their refusals (ADR 0023).
use serde_json::{Value, json};
use workbench_wasm_api::Kernel;

fn req(k: &mut Kernel, op: &str, p: Value) -> Value {
    let snap: Value = serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"snapshot","operation":"getSnapshot","expectedRevision":null,"payload":{}}).to_string())).unwrap();
    serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"response-test","operation":op,"expectedRevision":snap["revision"],"payload":p}).to_string())).unwrap()
}
fn cmd(k: &mut Kernel, kind: &str, args: Value) -> Value {
    req(
        k,
        "applyCommand",
        json!({"command":{"id":"response-command","type":kind,"args":args}}),
    )
}
fn code(r: &Value) -> &str {
    r["diagnostics"][0]["code"].as_str().unwrap_or("")
}

/// B04: a 3 m cantilever along X with a 10 kN tip load in −Y, plus a
/// 1500 kg tip mass.
fn open() -> Kernel {
    let mut k = Kernel::new();
    let p: Value = serde_json::from_str(include_str!("../../../fixtures/models/B04.json")).unwrap();
    assert_eq!(
        req(&mut k, "createProject", json!({"project":p}))["status"],
        "ok"
    );
    let r = cmd(
        &mut k,
        "SetMassSource",
        json!({"existence":"create","id":"tip","kind":"nodalMass","node":"n2","mass":"1.5 t"}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    k
}

#[test]
fn spectra_are_project_data_edited_by_command() {
    let mut k = open();
    let r = cmd(
        &mut k,
        "SetResponseSpectrum",
        json!({"existence":"create","id":"design","name":"Site spectrum","saUnit":"g",
               "points":[[0, 0.2], [0.1, 0.5], [0.5, 0.5], [4, 0.05]],"dampingRatio":0.05,
               "reference":"Engineer's site-specific spectrum"}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    let p = &r["payload"]["project"];
    assert_eq!(p["schemaVersion"], workbench_model::CURRENT_SCHEMA);
    let s = &p["responseSpectra"][0];
    assert_eq!(s["points"][1][1], 0.5 * 9.80665);
    assert!(s.get("saUnit").is_none());
    assert!(
        p["metadata"]["entityLabels"]["design"]
            .as_str()
            .unwrap()
            .starts_with("rs")
    );
    // Invalid tables are refused atomically.
    let before = req(&mut k, "getSnapshot", json!({}))["modelHash"].clone();
    for points in [
        json!([[0.1, 1.0], [1, 1]]),
        json!([[0, 1.0], [1, -1]]),
        json!([[0, 1.0]]),
        json!([[0, 1], [1, 1], [0.5, 1]]),
    ] {
        let r = cmd(
            &mut k,
            "SetResponseSpectrum",
            json!({"existence":"update","id":"design","name":"x","points":points,"dampingRatio":0.05,"reference":""}),
        );
        assert_eq!(code(&r), "INVALID_SPECTRUM", "{points}: {r}");
        assert_eq!(req(&mut k, "getSnapshot", json!({}))["modelHash"], before);
    }
    let r = cmd(
        &mut k,
        "SetResponseSpectrum",
        json!({"existence":"update","id":"design","name":"x","points":[[0, 1], [1, 1]],"dampingRatio":0.05,"reference":"","saUnit":"furlong"}),
    );
    assert_eq!(code(&r), "INVALID_SCHEMA");
    let r = cmd(
        &mut k,
        "DeleteEntities",
        json!({"ids":["design"],"cascade":false}),
    );
    assert!(
        r["payload"]["project"]
            .get("responseSpectra")
            .is_none_or(|v| v.as_array().unwrap().is_empty())
    );
}

#[test]
fn harmonic_and_spectrum_run_through_analyse() {
    let mut k = open();
    cmd(
        &mut k,
        "SetResponseSpectrum",
        json!({"existence":"create","id":"sp","name":"Flat","points":[[0, 3.0], [10, 3.0]],"dampingRatio":0.05,"reference":"test"}),
    );
    // Harmonic sweep, 20 log-spaced frequencies.
    let r = req(
        &mut k,
        "analyse",
        json!({"caseIds":["LC1"],"combinationIds":[],"analysisType":"harmonic",
               "harmonic":{"sweep":{"from":0.5,"to":50,"count":20,"spacing":"log"},
                           "damping":{"ratio":0.02,"frequencies":[1, 10]},"subdivisions":4}}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    let h = &r["payload"];
    assert_eq!(h["analysisType"], "harmonic");
    let freqs = h["frequencies"].as_array().unwrap();
    assert_eq!(freqs.len(), 20);
    assert!((freqs[0]["frequency"].as_f64().unwrap() - 0.5).abs() < 1e-12);
    assert!((freqs[19]["frequency"].as_f64().unwrap() - 50.).abs() < 1e-9);
    assert!(
        freqs
            .iter()
            .all(|f| f["residual"].as_f64().unwrap() <= 1e-8)
    );
    // Spectrum: the flat 3 m/s² gives base shear m·Sa for the single Y mode.
    let r = req(
        &mut k,
        "analyse",
        json!({"caseIds":[],"combinationIds":[],"analysisType":"responseSpectrum",
               "responseSpectrum":{"spectrumId":"sp","direction":"Y","combination":"srss","modes":3,"subdivisions":4}}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    let s = &r["payload"];
    assert_eq!(s["analysisType"], "responseSpectrum");
    assert!((s["baseReaction"][1].as_f64().unwrap() - 1500. * 3.).abs() <= 1e-6 * 4500.);
    assert_eq!(s["disclosures"][0], "USER_SPECTRUM_NOT_A_CODE_SPECTRUM");
}

#[test]
fn requests_are_validated() {
    let mut k = open();
    let analyse = |k: &mut Kernel, payload: Value| req(k, "analyse", payload);
    let base = json!({"caseIds":["LC1"],"combinationIds":[],"analysisType":"harmonic",
                      "harmonic":{"frequencies":[1, 2],"damping":{"a0":0,"a1":0.001}}});
    assert_eq!(analyse(&mut k, base.clone())["status"], "ok");
    let with = |edit: &dyn Fn(&mut Value)| {
        let mut v = base.clone();
        edit(&mut v);
        v
    };
    for (payload, want) in [
        (with(&|v| v["caseIds"] = json!([])), "INVALID_LOAD"),
        (
            with(&|v| v["harmonic"]["sweep"] = json!({"from":1,"to":2,"count":3})),
            "INVALID_SCHEMA",
        ),
        (
            with(&|v| {
                v["harmonic"].as_object_mut().unwrap().remove("damping");
            }),
            "INVALID_SCHEMA",
        ),
        (
            with(&|v| v["harmonic"]["damping"] = json!({"a0":1,"a1":0})),
            "INVALID_SETTINGS",
        ),
        (
            with(&|v| v["harmonic"]["extra"] = json!(1)),
            "INVALID_SCHEMA",
        ),
        (with(&|v| v["modal"] = json!({})), "INVALID_SCHEMA"),
        (
            with(&|v| {
                v["harmonic"].as_object_mut().unwrap().remove("frequencies");
                v["harmonic"]["sweep"] = json!({"from":2,"to":1,"count":5});
            }),
            "INVALID_SETTINGS",
        ),
    ] {
        let r = analyse(&mut k, payload.clone());
        assert_eq!(code(&r), want, "{payload}: {r}");
    }
    let rs = json!({"caseIds":[],"combinationIds":[],"analysisType":"responseSpectrum",
                    "responseSpectrum":{"spectrumId":"missing","direction":"X"}});
    assert_eq!(code(&analyse(&mut k, rs.clone())), "DANGLING_REFERENCE");
    let mut with_case = rs.clone();
    with_case["caseIds"] = json!(["LC1"]);
    assert_eq!(code(&analyse(&mut k, with_case)), "INVALID_LOAD");
    let mut bad = rs;
    bad["responseSpectrum"]["direction"] = json!("W");
    assert_eq!(code(&analyse(&mut k, bad)), "INVALID_SCHEMA");
}
