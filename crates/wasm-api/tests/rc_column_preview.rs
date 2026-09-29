//! RC column drafts through the protocol (ADR 0022): the draft reproduces the
//! column oracle's SQ-PARABOLA section, and model station actions reach the
//! biaxial kernel with the documented sign mapping.
use serde_json::{Value, json};
use workbench_wasm_api::Kernel;

fn req(k: &mut Kernel, op: &str, p: Value) -> Value {
    let snap: Value = serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"snapshot","operation":"getSnapshot","expectedRevision":null,"payload":{}}).to_string())).unwrap();
    serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"column-test","operation":op,"expectedRevision":snap["revision"],"payload":p}).to_string())).unwrap()
}
fn cmd(k: &mut Kernel, kind: &str, args: Value) -> Value {
    req(
        k,
        "applyCommand",
        json!({"command":{"id":"column-command","type":kind,"args":args}}),
    )
}
fn oracle() -> Value {
    serde_json::from_str(include_str!("../../../fixtures/column/column-oracle.json")).unwrap()
}
fn config(id: &str) -> Value {
    oracle()["configs"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["id"] == id)
        .unwrap()
        .clone()
}
/// B04 (a 3 m cantilever along global X, fixed at n1) with tip load `values`.
fn open(values: [f64; 6]) -> Kernel {
    let mut k = Kernel::new();
    let mut p: Value =
        serde_json::from_str(include_str!("../../../fixtures/models/B04.json")).unwrap();
    p["loads"][0]["values"] = json!(values);
    assert_eq!(
        req(&mut k, "createProject", json!({"project":p}))["status"],
        "ok"
    );
    k
}
/// An rcColumn draft on m1 matching SQ-PARABOLA: 400 × 400, eight Ø25 bars
/// at ±150 mm (cover 27.5 + link 10 + 12.5), parabola 17 MPa, ε_c2 0.002,
/// ε_cu 0.0035, n 2, f_y 435 MPa, E_s 200 GPa, ε_c 0.002.
fn column(k: &mut Kernel) -> Value {
    let r = cmd(
        k,
        "CreateDesignPreview",
        json!({"kind":"rcColumn","targetId":"m1"}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    let d = r["payload"]["project"]["designPreviews"][0].clone();
    assert_eq!(d["mechanics"]["inputs"]["fullCompressionStrain"], 0.002);
    let r = cmd(
        k,
        "SetDesignPreview",
        json!({"id":d["id"],"targetId":"m1","soilReference":"",
            "inputs":{"width":"400 mm","depth":"400 mm","cover":"27.5 mm","barDiameter":"25 mm","barsAlongWidth":"3","barsAlongDepth":"3",
                "linkDiameter":"10 mm","concreteStrength":"30 MPa","rebarStrength":"500 MPa"},
            "mechanics":{"law":"parabolaRectangle","inputs":{"parabolaPeak":"17 MPa","strainAtPeak":"0.002","parabolaExponent":"2",
                "ultimateStrain":"0.0035","steelYieldStrength":"435 MPa","steelModulus":"200 GPa","concreteModulus":"30 GPa",
                "concreteTensileStrength":"2.8 MPa","minimumClearSpacing":"25 mm","fullCompressionStrain":"0.002"}}}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    r["payload"]["project"]["designPreviews"][0].clone()
}
fn evaluate(k: &mut Kernel, d: &Value, mode: &str) -> Value {
    let a = if mode == "model" {
        let a = req(k, "analyse", json!({"caseIds":["LC1"]}));
        assert_eq!(a["status"], "ok", "{a}");
        Some(a)
    } else {
        None
    };
    let snap = req(k, "getSnapshot", json!({}));
    let mut input = json!({"draftId":d["id"],"modelHash":snap["modelHash"],"sourceMode":mode});
    if let Some(a) = a {
        input["caseId"] = json!("LC1");
        input["resultId"] = a["payload"]["resultId"].clone();
    }
    let r = req(k, "evaluateDesignPreview", input);
    assert_eq!(r["status"], "ok", "{r}");
    r["payload"].clone()
}
fn root(run: &Value) -> Value {
    run["columnMechanics"]["stations"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["station"] == 0.0)
        .unwrap()
        .clone()
}
fn rel(a: f64, b: f64) -> f64 {
    (a - b).abs() / b.abs()
}

#[test]
fn synthetic_run_reproduces_the_oracle_section() {
    let c = config("SQ-PARABOLA");
    let tol = oracle()["tolerance"]["capacityRelative"].as_f64().unwrap();
    let mut k = open([0., -10000., 0., 0., 0., 0.]);
    let d = column(&mut k);
    let run = evaluate(&mut k, &d, "synthetic");
    let cm = &run["columnMechanics"];
    assert_eq!(cm["status"], "evaluated");
    assert_eq!(cm["basis"], "mechanics");
    assert_eq!(cm["section"]["barCount"], 8);
    assert_eq!(cm["demand"]["status"], "unavailable");
    let range = &c["closedForm"];
    assert!(
        rel(
            cm["axialRange"]["squash"].as_f64().unwrap(),
            range["squash"].as_f64().unwrap()
        ) <= 1e-12
    );
    assert!(
        rel(
            cm["axialRange"]["tension"].as_f64().unwrap(),
            range["tension"].as_f64().unwrap()
        ) <= 1e-12
    );
    // The contour at N = 0: neutral-axis angle 3π/2 (point 54 of 72) is the
    // θ = 0 capacity of the square section.
    assert_eq!(cm["contour"]["nEd"], 0.0);
    let p = &cm["contour"]["points"][54];
    let want = c["capacities"]
        .as_array()
        .unwrap()
        .iter()
        .find(|x| x["nEd"] == 0.0 && x["thetaDeg"] == 0.0)
        .unwrap();
    assert!(
        rel(p[0].as_f64().unwrap(), want["mRd"].as_f64().unwrap()) <= tol,
        "{p}"
    );
    assert!(p[1].as_f64().unwrap().abs() <= tol * want["mRd"].as_f64().unwrap());
    assert_eq!(run["overall"], "unsupported");
    for check in run["checks"].as_array().unwrap() {
        assert_eq!(check["status"], "unsupported");
    }
}

/// The fixed-end station carries N_Ed and a moment at θ = 37° from the
/// oracle's case, scaled to 80 % of its resistance: the run reports 0.8.
#[test]
fn model_station_actions_reach_the_kernel_with_the_documented_signs() {
    let c = config("SQ-PARABOLA");
    let tol = oracle()["tolerance"]["capacityRelative"].as_f64().unwrap();
    let case = c["capacities"]
        .as_array()
        .unwrap()
        .iter()
        .find(|x| {
            x["thetaDeg"] == 37.0
                && x["nEd"].as_f64().unwrap() > 1e6
                && x["nEd"].as_f64().unwrap() < 2e6
        })
        .unwrap()
        .clone();
    let (n_ed, m_rd) = (case["nEd"].as_f64().unwrap(), case["mRd"].as_f64().unwrap());
    // Probe the root moment per unit tip force in Y and in Z.
    let probe = |values: [f64; 6]| {
        let mut k = open(values);
        let d = column(&mut k);
        root(&evaluate(&mut k, &d, "model"))["actions"].clone()
    };
    let per_fy = probe([0., 1., 0., 0., 0., 0.])[5].as_f64().unwrap();
    let per_fz = probe([0., 0., 1., 0., 0., 0.])[4].as_f64().unwrap();
    let theta = 37f64.to_radians();
    let m = 0.8 * m_rd;
    // A tip force along −X compresses the cantilever: N_frame = −n_ed.
    let values = [
        -n_ed,
        m * theta.sin() / per_fy,
        m * theta.cos() / per_fz,
        0.,
        0.,
        0.,
    ];
    let mut k = open(values);
    let d = column(&mut k);
    let run = evaluate(&mut k, &d, "model");
    let cm = &run["columnMechanics"];
    let r = root(&run);
    assert_eq!(r["status"], "evaluated", "{r}");
    assert!(rel(r["nEd"].as_f64().unwrap(), n_ed) <= 1e-9, "{r}");
    assert!(
        rel(
            r["mzEd"]
                .as_f64()
                .unwrap()
                .atan2(r["myEd"].as_f64().unwrap()),
            theta
        ) <= 1e-9
    );
    assert!(
        rel(r["capacity"]["mRd"].as_f64().unwrap(), m_rd) <= tol,
        "{r}"
    );
    assert!(rel(r["utilisation"].as_f64().unwrap(), 0.8) <= tol, "{r}");
    assert_eq!(cm["governing"]["station"], 0.0);
    assert!(rel(cm["contour"]["nEd"].as_f64().unwrap(), n_ed) <= 1e-9);
    // The free end carries N only: utilisation 0
    let tip = cm["stations"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["station"] == 1.0)
        .unwrap();
    // (up to the frame's round-off moment there).
    assert!(tip["utilisation"].as_f64().unwrap() <= 1e-12, "{tip}");
    assert_eq!(run["sourceProvenance"]["kind"], "modelAnalysis");
    assert_eq!(run["overall"], "unsupported");
    // Deterministic.
    let snap = req(&mut k, "getSnapshot", json!({}));
    let again = req(
        &mut k,
        "evaluateDesignPreview",
        json!({"draftId":d["id"],"modelHash":snap["modelHash"],"sourceMode":"model","caseId":"LC1","resultId":run["sourceProvenance"]["resultId"]}),
    );
    assert_eq!(again["payload"], run);
}

#[test]
fn axial_force_beyond_the_squash_load_is_reported_not_rated() {
    let c = config("SQ-PARABOLA");
    let squash = c["closedForm"]["squash"].as_f64().unwrap();
    let mut k = open([-1.05 * squash, 0., 0., 0., 0., 0.]);
    let d = column(&mut k);
    let run = evaluate(&mut k, &d, "model");
    let cm = &run["columnMechanics"];
    assert_eq!(cm["beyondAxialRange"], true);
    assert!(
        cm["stations"]
            .as_array()
            .unwrap()
            .iter()
            .all(|s| s["status"] == "beyondAxialRange" && s["utilisation"].is_null())
    );
    assert!(cm["governing"].is_null());
}

#[test]
fn column_inputs_are_validated_and_refusals_are_atomic() {
    let mut k = open([0., -10000., 0., 0., 0., 0.]);
    let d = column(&mut k);
    let before = req(&mut k, "getSnapshot", json!({}))["modelHash"].clone();
    for (key, value) in [
        ("barsAlongWidth", "1"),
        ("barsAlongDepth", "2.5"),
        ("cover", "190 mm"),
    ] {
        let mut inputs = d["inputs"].clone();
        inputs[key] = json!(value);
        let r = cmd(
            &mut k,
            "SetDesignPreview",
            json!({"id":d["id"],"targetId":"m1","soilReference":"","inputs":inputs}),
        );
        assert_eq!(r["status"], "error", "{key}: {r}");
        assert_eq!(req(&mut k, "getSnapshot", json!({}))["modelHash"], before);
    }
    // ε_c above ε_cu is refused.
    let mut mech = json!({"law":d["mechanics"]["law"],"inputs":d["mechanics"]["inputs"]});
    mech["inputs"]["fullCompressionStrain"] = json!(0.004);
    let r = cmd(
        &mut k,
        "SetDesignPreview",
        json!({"id":d["id"],"targetId":"m1","soilReference":"","inputs":d["inputs"],"mechanics":mech}),
    );
    assert_eq!(r["status"], "error", "{r}");
    // Beam drafts do not take the column key.
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
    assert!(
        b["mechanics"]["inputs"]
            .get("fullCompressionStrain")
            .is_none()
    );
    // Round trip through a saved file; a 1.4.0 file cannot hold a column.
    let project = req(&mut k, "getSnapshot", json!({}))["payload"]["project"].clone();
    let mut reopened = Kernel::new();
    let r = req(
        &mut reopened,
        "importProject",
        json!({"jsonUtf8":project.to_string()}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    let mut old = project.clone();
    old["schemaVersion"] = json!("1.4.0");
    let r = req(
        &mut Kernel::new(),
        "importProject",
        json!({"jsonUtf8":old.to_string()}),
    );
    assert_eq!(r["status"], "error", "{r}");
    // The template lists the column fields and the pivot-C strain.
    let t = req(&mut k, "designPreviewTemplates", json!({}));
    let col = t["payload"]["templates"]
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["kind"] == "rcColumn")
        .unwrap()
        .clone();
    assert!(
        col["mechanics"]["fields"]
            .as_array()
            .unwrap()
            .iter()
            .any(|f| f["key"] == "fullCompressionStrain" && f["law"] == "all")
    );
    let beam_t = t["payload"]["templates"]
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["kind"] == "rcBeam")
        .unwrap()
        .clone();
    assert!(
        !beam_t["mechanics"]["fields"]
            .as_array()
            .unwrap()
            .iter()
            .any(|f| f["key"] == "fullCompressionStrain")
    );
}

/// An untouched integer input (JSON `3` from the form) equals the stored
/// `3.0`: provenance stays synthetic.
#[test]
fn untouched_integer_inputs_keep_their_provenance() {
    let mut k = open([0., -10000., 0., 0., 0., 0.]);
    let d = column(&mut k);
    assert_eq!(d["inputSources"]["barsAlongWidth"], "syntheticFixture");
    assert_eq!(d["inputSources"]["cover"], "user");
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
    let mut inputs = b["inputs"].clone();
    inputs["topBarCount"] = json!(4);
    inputs["linkLegs"] = json!(2);
    let r = cmd(
        &mut k,
        "SetDesignPreview",
        json!({"id":b["id"],"targetId":"m1","soilReference":"","inputs":inputs}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    let saved = r["payload"]["project"]["designPreviews"]
        .as_array()
        .unwrap()
        .iter()
        .find(|x| x["id"] == b["id"])
        .unwrap()
        .clone();
    assert_eq!(saved["inputSources"]["topBarCount"], "syntheticFixture");
    assert_eq!(saved["inputSources"]["linkLegs"], "syntheticFixture");
}
