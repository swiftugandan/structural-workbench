//! Slab drafts through the protocol: plate-v1 analysis of the draft panel
//! (ADR 0021), reproducing the P-OPEN-OS oracle on the identical mesh.
use serde_json::{Value, json};
use workbench_wasm_api::Kernel;

fn req(k: &mut Kernel, op: &str, p: Value) -> Value {
    let snap: Value = serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"snapshot","operation":"getSnapshot","expectedRevision":null,"payload":{}}).to_string())).unwrap();
    serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"slab-test","operation":op,"expectedRevision":snap["revision"],"payload":p}).to_string())).unwrap()
}
fn cmd(k: &mut Kernel, kind: &str, args: Value) -> Value {
    req(
        k,
        "applyCommand",
        json!({"command":{"id":"slab-command","type":kind,"args":args}}),
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
fn oracle() -> Value {
    serde_json::from_str(include_str!("../../../fixtures/plate/plate-oracle.json")).unwrap()
}
fn slab(k: &mut Kernel) -> Value {
    let r = cmd(k, "CreateDesignPreview", json!({"kind":"slab"}));
    assert_eq!(r["status"], "ok", "{r}");
    r["payload"]["project"]["designPreviews"][0].clone()
}
fn set(k: &mut Kernel, d: &Value, inputs: Value, plate: Value) -> Value {
    cmd(
        k,
        "SetDesignPreview",
        json!({"id":d["id"],"inputs":inputs,"soilReference":"","plate":plate}),
    )
}
fn evaluate(k: &mut Kernel, d: &Value, mode: &str) -> Value {
    let snap = req(k, "getSnapshot", json!({}));
    req(
        k,
        "evaluateDesignPreview",
        json!({"draftId":d["id"],"modelHash":snap["modelHash"],"sourceMode":mode}),
    )
}
fn plate_args(d: &Value) -> Value {
    json!({"edges":d["plate"]["edges"],"includeOpening":d["plate"]["includeOpening"],"inputs":d["plate"]["inputs"]})
}

#[test]
fn new_slab_drafts_carry_synthetic_plate_inputs() {
    let mut k = open();
    let d = slab(&mut k);
    let plate = &d["plate"];
    assert_eq!(
        plate["edges"],
        json!(["simple", "simple", "simple", "simple"])
    );
    assert_eq!(plate["includeOpening"], true);
    assert_eq!(plate["inputs"]["pressure"], 10e3);
    assert!(
        plate["inputSources"]
            .as_object()
            .unwrap()
            .values()
            .all(|s| s == "syntheticFixture")
    );
    let templates = req(&mut k, "designPreviewTemplates", json!({}));
    let slab_template = templates["payload"]["templates"]
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["kind"] == "slab")
        .unwrap()
        .clone();
    assert_eq!(
        slab_template["plate"]["fields"].as_array().unwrap().len(),
        5
    );
    assert_eq!(
        slab_template["plate"]["edgeConditions"],
        json!(["free", "simple", "clamped"])
    );
}

/// The draft's panel meshed and solved through the protocol matches OpenSees
/// ShellMITC4 on the identical mesh to the oracle tolerance.
#[test]
fn plate_source_reproduces_the_opening_oracle() {
    let o = oracle();
    let c = &o["openingOpenSees"];
    let mut k = open();
    let d = slab(&mut k);
    let mut inputs = d["inputs"].clone();
    inputs["thickness"] = json!("200 mm");
    inputs["meshSize"] = json!("250 mm");
    let mut plate = plate_args(&d);
    plate["inputs"]["openingX"] = json!("2 m");
    plate["inputs"]["pressure"] = json!("10 kPa");
    let r = set(&mut k, &d, inputs, plate);
    assert_eq!(r["status"], "ok", "{r}");
    let saved = &r["payload"]["project"]["designPreviews"][0];
    assert_eq!(saved["plate"]["inputSources"]["openingX"], "user");
    // 10 kPa equals the stored default: provenance unchanged.
    assert_eq!(
        saved["plate"]["inputSources"]["pressure"],
        "syntheticFixture"
    );

    let run = evaluate(&mut k, saved, "plate");
    assert_eq!(run["status"], "ok", "{run}");
    let run = &run["payload"];
    let pa = &run["plateAnalysis"];
    assert_eq!(pa["status"], "evaluated");
    assert_eq!(pa["basis"], "mechanics");
    assert_eq!(run["sourceProvenance"]["kind"], "plateAnalysis");
    assert_eq!(run["sourceProvenance"]["mock"], false);
    assert_eq!(run["overall"], "unsupported");
    for check in run["checks"].as_array().unwrap() {
        assert_eq!(check["status"], "unsupported");
    }
    assert_eq!(pa["mesh"]["elements"], c["elements"]);
    assert_eq!(pa["mesh"]["nodes"], c["nodes"]);
    assert!(pa["equilibrium"]["relativeImbalance"].as_f64().unwrap() <= 1e-9);
    let tol = c["tolerance"].as_f64().unwrap();
    let f = &pa["fields"];
    let grid = |k: &str| -> Value {
        let (i, j) = k.split_once(',').unwrap();
        json!([i.parse::<u64>().unwrap(), j.parse::<u64>().unwrap()])
    };
    let find = |list: &Value, key: &Value| {
        list.as_array()
            .unwrap()
            .iter()
            .position(|g| g == key)
            .unwrap()
    };
    for (key, want) in c["nodeW"].as_object().unwrap() {
        let n = find(&f["nodes"], &grid(key));
        let (got, want) = (f["w"][n].as_f64().unwrap(), want.as_f64().unwrap());
        assert!(
            (got - want).abs() <= tol * want.abs(),
            "w {key}: {got} vs {want}"
        );
    }
    for (key, want) in c["elementMoments"].as_object().unwrap() {
        let e = find(&f["cells"], &grid(key));
        let scale = want["mx"]
            .as_f64()
            .unwrap()
            .abs()
            .max(want["my"].as_f64().unwrap().abs());
        for m in ["mx", "my", "mxy"] {
            let (got, w) = (f[m][e].as_f64().unwrap(), want[m].as_f64().unwrap());
            assert!((got - w).abs() <= tol * scale, "{m} {key}: {got} vs {w}");
        }
    }
    // Wood–Armer governing values are the field maxima.
    for face in ["bottomX", "bottomY", "topX", "topY"] {
        let max = f[face]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_f64().unwrap())
            .fold(0., f64::max);
        assert_eq!(pa["designMoments"][face]["value"].as_f64().unwrap(), max);
    }
    // Re-entrant opening corners: the indicator reports, never hides.
    assert!(pa["convergence"]["change"].as_f64().unwrap() > 0.);
    // Deterministic.
    let again = evaluate(&mut k, saved, "plate");
    assert_eq!(again["payload"], *run);
}

#[test]
fn clamped_edges_report_line_moments() {
    let mut k = open();
    let d = slab(&mut k);
    let mut plate = plate_args(&d);
    plate["edges"] = json!(["clamped", "clamped", "clamped", "clamped"]);
    plate["includeOpening"] = json!(false);
    let r = set(&mut k, &d, d["inputs"].clone(), plate);
    assert_eq!(r["status"], "ok", "{r}");
    let saved = &r["payload"]["project"]["designPreviews"][0];
    assert_eq!(saved["plate"]["inputSources"]["edges"], "user");
    assert_eq!(saved["plate"]["inputSources"]["includeOpening"], "user");
    let run = evaluate(&mut k, saved, "plate");
    let pa = &run["payload"]["plateAnalysis"];
    assert!(pa["panel"]["opening"].is_null());
    let edges = pa["edgeMoments"].as_array().unwrap();
    assert!(!edges.is_empty());
    // Clamped edges hog along their middle.
    assert!(
        edges
            .iter()
            .filter(|m| m["moment"].as_f64().unwrap() < 0.)
            .count()
            > edges.len() / 2
    );
    assert!(pa["designMoments"]["topX"]["value"].as_f64().unwrap() > 0.);
}

#[test]
fn refusals_leave_the_project_unchanged() {
    let mut k = open();
    let d = slab(&mut k);
    let before = req(&mut k, "getSnapshot", json!({}))["modelHash"].clone();
    // Stored but unstable: the run is refused with the reason.
    let mut plate = plate_args(&d);
    plate["edges"] = json!(["simple", "free", "free", "free"]);
    let r = set(&mut k, &d, d["inputs"].clone(), plate);
    assert_eq!(r["status"], "ok", "{r}");
    let saved = r["payload"]["project"]["designPreviews"][0].clone();
    let run = evaluate(&mut k, &saved, "plate");
    assert_eq!(run["diagnostics"][0]["code"], "UNSTABLE_MODEL", "{run}");
    req(&mut k, "undo", json!({}));
    assert_eq!(req(&mut k, "getSnapshot", json!({}))["modelHash"], before);
    // Invalid inputs are atomic refusals.
    for (field, value) in [
        ("pressure", json!("-5 kPa")),
        ("poissonRatio", json!("0.5")),
        ("openingX", json!("5.5 m")),
    ] {
        let mut plate = plate_args(&d);
        plate["inputs"][field] = value;
        let r = set(&mut k, &d, d["inputs"].clone(), plate);
        assert_eq!(r["status"], "error", "{field}: {r}");
        assert_eq!(req(&mut k, "getSnapshot", json!({}))["modelHash"], before);
    }
    let mut plate = plate_args(&d);
    plate["edges"] = json!(["simple", "pinned", "simple", "simple"]);
    assert_eq!(
        set(&mut k, &d, d["inputs"].clone(), plate)["status"],
        "error"
    );
    // Too fine a mesh is a memory refusal, not a hang.
    let mut inputs = d["inputs"].clone();
    inputs["meshSize"] = json!("20 mm");
    let r = set(&mut k, &d, inputs, plate_args(&d));
    let saved = r["payload"]["project"]["designPreviews"][0].clone();
    assert_eq!(
        evaluate(&mut k, &saved, "plate")["diagnostics"][0]["code"],
        "MEMORY_LIMIT"
    );
    // Plate inputs and the plate source belong to slabs only.
    let beam = cmd(
        &mut k,
        "CreateDesignPreview",
        json!({"kind":"rcBeam","targetId":"m1"}),
    );
    let b = beam["payload"]["project"]["designPreviews"]
        .as_array()
        .unwrap()
        .iter()
        .find(|x| x["kind"] == "rcBeam")
        .unwrap()
        .clone();
    assert_eq!(evaluate(&mut k, &b, "plate")["status"], "error");
    assert_eq!(
        set(&mut k, &b, b["inputs"].clone(), plate_args(&d))["status"],
        "error"
    );
}

#[test]
fn migrated_slab_drafts_are_not_configured() {
    let mut k = open();
    let d = slab(&mut k);
    let mut project = req(&mut k, "getSnapshot", json!({}))["payload"]["project"].clone();
    project["schemaVersion"] = json!("1.4.0");
    project["designPreviews"][0]
        .as_object_mut()
        .unwrap()
        .remove("plate");
    let mut reopened = Kernel::new();
    let r = req(
        &mut reopened,
        "importProject",
        json!({"jsonUtf8":project.to_string()}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    assert_eq!(r["payload"]["project"]["schemaVersion"], "1.5.0");
    let run = evaluate(&mut reopened, &d, "plate");
    assert_eq!(run["diagnostics"][0]["code"], "DESIGN_INPUT_INCOMPLETE", "{run}");
    // The synthetic illustration still runs and says the plate was not run.
    let run = evaluate(&mut reopened, &d, "synthetic");
    assert_eq!(run["payload"]["plateAnalysis"]["status"], "notRun");
    // Recording plate inputs configures it.
    let r = set(&mut reopened, &d, d["inputs"].clone(), plate_args(&d));
    assert_eq!(r["status"], "ok", "{r}");
    assert_eq!(
        evaluate(&mut reopened, &d, "plate")["payload"]["plateAnalysis"]["status"],
        "evaluated"
    );
}
