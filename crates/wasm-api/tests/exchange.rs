//! exchange-v1 through the protocol (ADR 0025): exchangeRead,
//! exchangeImport and exchangeExport, atomic refusals, and analysis of an
//! imported model.
use serde_json::{Value, json};
use workbench_wasm_api::Kernel;

fn req(k: &mut Kernel, op: &str, p: Value) -> Value {
    let snap: Value = serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"snapshot","operation":"getSnapshot","expectedRevision":null,"payload":{}}).to_string())).unwrap();
    serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"exchange-test","operation":op,"expectedRevision":snap["revision"],"payload":p}).to_string())).unwrap()
}
fn code(r: &Value) -> &str {
    r["diagnostics"][0]["code"].as_str().unwrap_or("")
}
fn fixture(name: &str) -> String {
    std::fs::read_to_string(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../fixtures/exchange")
            .join(name),
    )
    .unwrap()
}
fn oracle_mapping(file: &str) -> Value {
    let o: Value = serde_json::from_str(&fixture("exchange-oracle.json")).unwrap();
    o["corpus"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["file"] == file)
        .unwrap()["mapping"]
        .clone()
}

fn import(k: &mut Kernel, file: &str) -> Value {
    let text = fixture(file);
    let format = if file.ends_with(".ifc") { "ifc" } else { "dxf" };
    let read = req(
        k,
        "exchangeRead",
        json!({"format":format,"fileName":file,"text":text}),
    );
    assert_eq!(read["status"], "ok", "{read}");
    let sha = read["payload"]["source"]["sha256"].clone();
    req(
        k,
        "exchangeImport",
        json!({"format":format,"fileName":file,"text":text,
               "mapping":{"format":"workbench-exchange-mapping-v1","sourceSha256":sha,"answers":oracle_mapping(file)}}),
    )
}

#[test]
fn imported_ifc_models_are_the_project_and_analyse() {
    for file in ["X-PORTAL-MM.ifc", "X-FEET-KIP.ifc", "X-PLANAR.ifc"] {
        // exchangeRead and exchangeImport need no open project.
        let mut k = Kernel::new();
        let r = import(&mut k, file);
        assert_eq!(r["status"], "ok", "{file}: {r}");
        let p = r["payload"]["project"].clone();
        let record = &r["payload"]["conversionRecord"];
        assert_eq!(record["exchange"], "exchange-v1");
        assert_eq!(record["projectHash"], r["modelHash"]);
        // Every case and combination of the imported model analyses.
        for case in p["loadCases"].as_array().unwrap() {
            let a = req(&mut k, "analyse", json!({"caseIds":[case["id"]]}));
            assert_eq!(a["status"], "ok", "{file} {}: {a}", case["id"]);
        }
        for c in p["combinations"].as_array().unwrap() {
            let a = req(&mut k, "analyse", json!({"combinationIds":[c["id"]]}));
            assert_eq!(a["status"], "ok", "{file} {}: {a}", c["id"]);
        }
    }
}

#[test]
fn a_refused_import_leaves_the_project_unchanged() {
    let mut k = Kernel::new();
    assert_eq!(import(&mut k, "X-PLANAR.ifc")["status"], "ok");
    let before = req(&mut k, "getSnapshot", json!({}));
    // Blocking content.
    let r = import(&mut k, "X-BLOCKED.ifc");
    assert_eq!(code(&r), "UNSUPPORTED_FEATURE", "{r}");
    // Unanswered decisions.
    let text = fixture("X-FEET-KIP.ifc");
    let read = req(
        &mut k,
        "exchangeRead",
        json!({"format":"ifc","fileName":"f.ifc","text":text}),
    );
    let sha = read["payload"]["source"]["sha256"].clone();
    let r = req(
        &mut k,
        "exchangeImport",
        json!({"format":"ifc","fileName":"f.ifc","text":text,"mapping":{"format":"workbench-exchange-mapping-v1","sourceSha256":sha,"answers":{}}}),
    );
    assert_eq!(code(&r), "DECISION_REQUIRED", "{r}");
    // A mapping for another file.
    let r = req(
        &mut k,
        "exchangeImport",
        json!({"format":"ifc","fileName":"f.ifc","text":text,"mapping":{"format":"workbench-exchange-mapping-v1","sourceSha256":"0".repeat(64),"answers":oracle_mapping("X-FEET-KIP.ifc")}}),
    );
    assert_eq!(code(&r), "MAPPING_MISMATCH", "{r}");
    let after = req(&mut k, "getSnapshot", json!({}));
    assert_eq!(before["modelHash"], after["modelHash"]);
    assert_eq!(before["revision"], after["revision"]);
}

#[test]
fn exports_carry_their_ledger_and_reimport() {
    let mut k = Kernel::new();
    let p: Value = serde_json::from_str(&fixture("X-FRAME.json")).unwrap();
    assert_eq!(
        req(&mut k, "createProject", json!({"project":p}))["status"],
        "ok"
    );
    let hash = req(&mut k, "getSnapshot", json!({}))["modelHash"].clone();
    let e = req(
        &mut k,
        "exchangeExport",
        json!({"format":"ifc","timestamp":"1970-01-01T00:00:00"}),
    );
    assert_eq!(e["status"], "ok", "{e}");
    let e = &e["payload"];
    assert!(e["fileName"].as_str().unwrap().ends_with(".ifc"));
    assert!(
        e["ledger"]
            .as_array()
            .unwrap()
            .iter()
            .any(|l| l["subject"] == "analysis results")
    );
    let o: Value = serde_json::from_str(&fixture("exchange-oracle.json")).unwrap();
    let checked = o["exportChecks"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["project"] == "X-FRAME")
        .unwrap();
    assert_eq!(
        e["sha256"], checked["ifcSha256"],
        "the protocol writes the file IfcOpenShell validated"
    );
    // Re-import into the same session: the analysis model is unchanged.
    let text = e["text"].as_str().unwrap().to_string();
    let read = req(
        &mut k,
        "exchangeRead",
        json!({"format":"ifc","fileName":"x.ifc","text":text}),
    );
    assert!(read["payload"]["decisions"].as_array().unwrap().is_empty());
    let r = req(
        &mut k,
        "exchangeImport",
        json!({"format":"ifc","fileName":"x.ifc","text":text,"mapping":{"format":"workbench-exchange-mapping-v1","sourceSha256":read["payload"]["source"]["sha256"],"answers":{}}}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    assert_eq!(r["modelHash"], hash, "re-import reproduces the model hash");
    let d = req(&mut k, "exchangeExport", json!({"format":"dxf"}));
    assert_eq!(d["payload"]["sha256"], checked["dxfSha256"]);
    assert_eq!(
        code(&req(&mut k, "exchangeExport", json!({"format":"step"}))),
        "UNSUPPORTED_FEATURE"
    );
}
