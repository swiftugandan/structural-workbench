//! M13 single-plate connection drafts through the protocol (ADR 0030): the
//! beam's exact end actions feed the AISC 360-22 kernel; moment transfer is
//! refused as unsupported; the inputs persist and invalid ones are refused
//! atomically.
use serde_json::{Value, json};
use workbench_design::connection as conn;
use workbench_wasm_api::Kernel;

const CAT: &str = "aisc-shapes-v16.0-subset-1";
const IN: f64 = 0.0254;

fn req(k: &mut Kernel, op: &str, p: Value) -> Value {
    let snap: Value = serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"snapshot","operation":"getSnapshot","expectedRevision":null,"payload":{}}).to_string())).unwrap();
    serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"sp-test","operation":op,"expectedRevision":snap["revision"],"payload":p}).to_string())).unwrap()
}

fn cmd(k: &mut Kernel, kind: &str, args: Value) -> Value {
    req(
        k,
        "applyCommand",
        json!({"command":{"id":"sp-command","type":kind,"args":args}}),
    )
}

/// Two 4 m W14X90 columns (fixed bases, flanges facing the beam) and a 9 m
/// W18X50 beam between their tops, released for strong-axis moment (local z)
/// at both ends when `pinned`, under 30 kN/m.
fn frame(pinned: bool) -> Kernel {
    let release = json!({"my": false, "mz": pinned});
    let rigid = json!({"my": false, "mz": false});
    let section = json!({"id":"s","name":"placeholder","A":0.01,"Iy":1e-5,"Iz":2e-5,"J":1e-6,"cy":0.2,"cz":0.1,"provenance":"test"});
    let p = json!({
        "schemaVersion": "1.0.0", "id": "sp", "name": "Single-plate frame", "revision": 0,
        "metadata": {"description": "Single-plate connection frame", "createdBy": "Structural Workbench", "entityLabels": {}},
        "displayUnits": "engineeringMetric", "analysisMode": "spatial", "gravity": [0, 0, -9.80665],
        "materials": [{"id":"mat1","name":"steel","E":200e9,"nu":0.3,"density":7850}],
        "sections": [section],
        "nodes": [
            {"id":"b1","position":[0,0,0]}, {"id":"t1","position":[0,0,4]},
            {"id":"b2","position":[9,0,0]}, {"id":"t2","position":[9,0,4]}
        ],
        "members": [
            {"id":"c1","start":"b1","end":"t1","material":"mat1","section":"s","localY":[1,0,0],"releaseStart":rigid,"releaseEnd":rigid},
            {"id":"c2","start":"b2","end":"t2","material":"mat1","section":"s","localY":[1,0,0],"releaseStart":rigid,"releaseEnd":rigid},
            {"id":"beam","start":"t1","end":"t2","material":"mat1","section":"s","localY":[0,0,1],"releaseStart":release,"releaseEnd":release}
        ],
        "supports": [
            {"id":"s1","node":"b1","fixed":[true,true,true,true,true,true],"prescribed":[0,0,0,0,0,0]},
            {"id":"s2","node":"b2","fixed":[true,true,true,true,true,true],"prescribed":[0,0,0,0,0,0]}
        ],
        "loadCases": [{"id":"LC1","name":"Floor","category":"other"}],
        "loads": [{"id":"w","case":"LC1","type":"uniform","member":"beam","axes":"global","forcePerLength":[0,0,-30000]}],
        "combinations": [],
        "analysisSettings": {"type":"linearStatic","formulation":"eulerBernoulli3D","mergeTolerance":1e-6,"timeoutMs":30000,"memoryLimitMiB":512}
    });
    let mut k = Kernel::new();
    let r = req(&mut k, "createProject", json!({"project": p}));
    assert_eq!(r["status"], "ok", "{r}");
    for (id, shape) in [("c1", "W14X90"), ("c2", "W14X90"), ("beam", "W18X50")] {
        let r = cmd(
            &mut k,
            "AssignSteelCatalogue",
            json!({"id":id,"sectionRef":format!("{CAT}:{shape}"),"materialRef":"astm-a992-50-65-v1"}),
        );
        assert_eq!(r["status"], "ok", "{r}");
    }
    k
}

fn draft(k: &mut Kernel) -> Value {
    let r = cmd(
        k,
        "CreateDesignPreview",
        json!({"kind":"singlePlate","targetId":"beam"}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    r["payload"]["project"]["designPreviews"][0].clone()
}

fn connection(end: &str, support: &str) -> Value {
    json!({"end":end,"supportMemberId":support,"supportKind":"columnFlange","bolt":"3/4","boltGroup":"group120",
           "threadsExcluded":false,"deformationConsidered":true,"bracedAgainstRotation":true})
}

fn set(k: &mut Kernel, d: &Value, inputs: Value, c: Value) -> Value {
    cmd(
        k,
        "SetDesignPreview",
        json!({"id":d["id"],"targetId":"beam","inputs":inputs,"soilReference":"","connection":c}),
    )
}

fn evaluate(k: &mut Kernel, d: &Value) -> Value {
    let a = req(k, "analyse", json!({"caseIds":["LC1"]}));
    assert_eq!(a["status"], "ok", "{a}");
    let snap = req(k, "getSnapshot", json!({}));
    let r = req(
        k,
        "evaluateDesignPreview",
        json!({"draftId":d["id"],"modelHash":snap["modelHash"],"sourceMode":"model","caseId":"LC1","resultId":a["payload"]["resultId"]}),
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

/// The starter inputs as the kernel's types (SI).
fn kernel_inputs(d: &Value) -> conn::SinglePlate {
    let i = &d["inputs"];
    let f = |k: &str| i[k].as_f64().unwrap();
    conn::SinglePlate {
        bolt: conn::Bolt::new("3/4", conn::BoltGroup::Group120, false).unwrap(),
        rows: f("rows") as usize,
        columns: f("columns") as usize,
        pitch: f("pitch"),
        gauge: f("gauge"),
        thickness: f("plateThickness"),
        fy: f("plateFy"),
        fu: f("plateFu"),
        elastic_modulus: 29000.0 * 6.894757293168361e6,
        lev: f("lev"),
        leh_plate: f("lehPlate"),
        a: f("a"),
        leh_beam: f("lehBeam"),
        underrun: f("underrun"),
        top_offset: f("topOffset"),
        weld: f("weldSize"),
        fexx: f("fexx"),
        deformation_considered: true,
        braced_against_rotation: Some(true),
    }
}

#[test]
fn a_pinned_beam_end_is_designed_from_its_exact_reaction() {
    let mut k = frame(true);
    let d = draft(&mut k);
    assert_eq!(d["connection"]["bolt"], "3/4");
    let r = set(&mut k, &d, d["inputs"].clone(), connection("end", "c2"));
    assert_eq!(r["status"], "ok", "{r}");
    let d = r["payload"]["project"]["designPreviews"][0].clone();
    let run = evaluate(&mut k, &d);
    let code = &run["codeProfilePreview"];
    assert_eq!(code["status"], "evaluated", "{code}");
    assert_eq!(code["profileId"], "aisc-360-22-lrfd");
    assert_eq!(
        run["codeProfile"]["certification"],
        "Demonstration, not a certified design"
    );
    // The simply supported reaction, wL/2, carried to the support face.
    let v = code["actions"]["V"].as_f64().unwrap();
    assert!((v - 135e3).abs() <= 1e-6 * 135e3, "V {v}");
    assert!(code["actions"]["M"].as_f64().unwrap().abs() <= 1e-6 * v);
    assert_eq!(check(code, "connection.momentTransfer")["status"], "pass");
    // The protocol result is the kernel's on the same inputs.
    let i = kernel_inputs(&d);
    let beam = conn::Beam {
        designation: "W18X50".into(),
        d: 18.0 * IN,
        tw: 0.355 * IN,
        tf: 0.57 * IN,
        ag: 14.7 * IN * IN,
        kdes: 0.972 * IN,
        fy: 50.0 * 6.894757293168361e6,
        fu: 65.0 * 6.894757293168361e6,
    };
    let support = conn::Support {
        designation: "W14X90".into(),
        kind: conn::SupportKind::ColumnFlange,
        thickness: 0.71 * IN,
        fu: 65.0 * 6.894757293168361e6,
        flange_width: 14.5 * IN,
        web_thickness: 0.44 * IN,
    };
    let direct = conn::design(
        &i,
        &beam,
        &support,
        &conn::ConnectionActions {
            v: 135e3,
            ..Default::default()
        },
    );
    for c in &direct.checks {
        let got = check(code, &c.check_id);
        assert_eq!(got["status"], c.status.as_str(), "{}", c.check_id);
        if let (Some(r), Some(g)) = (c.resistance, got["resistance"].as_f64()) {
            assert!(
                (r - g).abs() <= 1e-9 * r.abs(),
                "{}: {g} vs {r}",
                c.check_id
            );
        }
    }
    // Rows, schedule (bill of materials) and drawing geometry.
    let rows: Vec<&str> = run["checks"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["name"].as_str().unwrap())
        .collect();
    assert_eq!(
        rows,
        [
            "Simple connection",
            "Bolt group",
            "Plate",
            "Weld",
            "Support",
            "Beam web",
            "Detailing and fit"
        ]
    );
    assert_eq!(run["schedule"].as_array().unwrap().len(), 3);
    assert_eq!(run["schedule"][1]["quantity"], 4);
    let g = &code["geometry"];
    let l = g["plate"]["length"].as_f64().unwrap();
    assert!((l - (2.0 * i.lev + 3.0 * i.pitch)).abs() < 1e-12);
    assert_eq!(g["bolts"]["y"].as_array().unwrap().len(), 4);
    // Equilibrium of the connection: the support reaction opposes the beam.
    let fb = &code["freeBody"];
    assert_eq!(
        fb["supportReaction"]["V"].as_f64().unwrap(),
        -fb["supportFace"]["V"].as_f64().unwrap()
    );
    let ecc = code["boltGroup"]["eccentricity"].as_f64().unwrap();
    assert!((fb["supportFace"]["M"].as_f64().unwrap() - v * ecc).abs() <= 1e-9 * v * ecc);
    // The start end sees the same reaction (symmetric frame).
    let r = set(&mut k, &d, d["inputs"].clone(), connection("start", "c1"));
    assert_eq!(r["status"], "ok", "{r}");
    let run = evaluate(
        &mut k,
        &r["payload"]["project"]["designPreviews"][0].clone(),
    );
    let vs = run["codeProfilePreview"]["actions"]["V"].as_f64().unwrap();
    assert!((vs - 135e3).abs() <= 1e-6 * 135e3, "start V {vs}");
}

#[test]
fn moment_transfer_is_unsupported_never_passed() {
    let mut k = frame(false);
    let d = draft(&mut k);
    let r = set(&mut k, &d, d["inputs"].clone(), connection("end", "c2"));
    let d = r["payload"]["project"]["designPreviews"][0].clone();
    let run = evaluate(&mut k, &d);
    let code = &run["codeProfilePreview"];
    assert_eq!(
        check(code, "connection.momentTransfer")["status"],
        "unsupported"
    );
    // Fail outranks unsupported overall; the run is never a pass.
    assert!(
        ["fail", "unsupported"].contains(&run["overall"].as_str().unwrap()),
        "{}",
        run["overall"]
    );
    assert_eq!(run["checks"][0]["name"], "Simple connection");
    assert_eq!(run["checks"][0]["status"], "unsupported");
}

#[test]
fn an_unconfigured_connection_says_what_is_missing() {
    let mut k = frame(true);
    let d = draft(&mut k);
    // No supporting member chosen yet.
    let run = evaluate(&mut k, &d);
    assert_eq!(run["codeProfilePreview"]["status"], "unavailable");
    assert!(
        run["codeProfilePreview"]["reason"]
            .as_str()
            .unwrap()
            .contains("supporting member")
    );
    assert_eq!(run["overall"], "unsupported");
}

#[test]
fn invalid_connection_inputs_are_refused_atomically() {
    let mut k = frame(true);
    let d = draft(&mut k);
    let before = req(&mut k, "getSnapshot", json!({}))["modelHash"].clone();
    // A support that does not meet the beam at the connected end.
    let r = set(&mut k, &d, d["inputs"].clone(), connection("end", "c1"));
    assert_eq!(r["status"], "error");
    assert_eq!(r["diagnostics"][0]["code"], "DANGLING_REFERENCE", "{r}");
    // Unknown bolt, rows out of range, and a connection on another kind.
    let mut bad = connection("end", "c2");
    bad["bolt"] = json!("5/16");
    assert_eq!(set(&mut k, &d, d["inputs"].clone(), bad)["status"], "error");
    let mut inputs = d["inputs"].clone();
    inputs["rows"] = json!(13);
    assert_eq!(
        set(&mut k, &d, inputs, connection("end", "c2"))["status"],
        "error"
    );
    let rc = cmd(
        &mut k,
        "CreateDesignPreview",
        json!({"kind":"rcBeam","targetId":"beam"}),
    );
    let rc = rc["payload"]["project"]["designPreviews"][1].clone();
    let r = cmd(
        &mut k,
        "SetDesignPreview",
        json!({"id":rc["id"],"inputs":rc["inputs"],"soilReference":"","connection":connection("end","c2")}),
    );
    assert_eq!(r["status"], "error");
    // Nothing above changed the project except the new RC draft.
    let r = cmd(&mut k, "DeleteDesignPreview", json!({"id":rc["id"]}));
    assert_eq!(r["status"], "ok");
    assert_eq!(req(&mut k, "getSnapshot", json!({}))["modelHash"], before);
}

#[test]
fn connection_inputs_persist_through_save_and_reopen() {
    let mut k = frame(true);
    let d = draft(&mut k);
    let mut inputs = d["inputs"].clone();
    inputs["rows"] = json!(5);
    inputs["plateThickness"] = json!("10 mm");
    let r = set(&mut k, &d, inputs, connection("end", "c2"));
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
    assert_eq!(saved["connection"], connection("end", "c2"));
    assert_eq!(saved["inputs"]["rows"], 5.0);
    assert!((saved["inputs"]["plateThickness"].as_f64().unwrap() - 0.010).abs() < 1e-15);
    assert_eq!(saved["inputSources"]["plateThickness"], "user");
    assert_eq!(
        r["payload"]["project"]["schemaVersion"],
        workbench_model::CURRENT_SCHEMA
    );
}
