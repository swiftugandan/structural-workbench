//! M16 joint clashes through the protocol (ADR 0032): J01's two equal
//! beams framing into a column top clash with each other and with the
//! column's face bars; deepening one beam and using corner bars only clears
//! them; the aggregate size completes the 8.2(2) check.
use serde_json::{Value, json};
use workbench_wasm_api::Kernel;

fn req(k: &mut Kernel, op: &str, p: Value) -> Value {
    let snap: Value = serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"snapshot","operation":"getSnapshot","expectedRevision":null,"payload":{}}).to_string())).unwrap();
    serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"joint-test","operation":op,"expectedRevision":snap["revision"],"payload":p}).to_string())).unwrap()
}

fn open() -> (Kernel, Value) {
    let mut k = Kernel::new();
    let p: Value = serde_json::from_str(include_str!("../../../fixtures/models/J01.json")).unwrap();
    let r = req(&mut k, "createProject", json!({"project": p}));
    assert_eq!(r["status"], "ok", "{r}");
    let project = r["payload"]["project"].clone();
    (k, project)
}

fn joints(k: &mut Kernel) -> Value {
    let r = req(k, "detailJoints", json!({}));
    assert_eq!(r["status"], "ok", "{r}");
    r["payload"].clone()
}

fn draft<'a>(p: &'a Value, target: &str) -> &'a Value {
    p["designPreviews"]
        .as_array()
        .unwrap()
        .iter()
        .find(|d| d["targetId"] == target)
        .unwrap()
}

fn set(k: &mut Kernel, d: &Value, inputs: Value, code: Option<Value>) -> Value {
    let mut args =
        json!({"id":d["id"],"targetId":d["targetId"],"inputs":inputs,"soilReference":""});
    if let Some(c) = code {
        args["codeInputs"] = c;
    }
    let r = req(
        k,
        "applyCommand",
        json!({"command":{"id":"joint-set","type":"SetDesignPreview","args":args}}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    r["payload"]["project"].clone()
}

#[test]
fn equal_beams_into_a_column_clash_until_detailed() {
    let (mut k, p) = open();
    let r = joints(&mut k);
    assert_eq!(r["status"], "clash");
    let j = &r["joints"][0];
    assert_eq!(j["node"], "top");
    let clashes = j["clashes"].as_array().unwrap();
    // Equal beams: top and bottom bars intersect.
    for face in ["top", "bottom"] {
        assert!(clashes.iter().any(|c| c["kind"] == "beamBeam"
            && c["face"] == face
            && c["distance"].as_f64().unwrap() < 1e-9));
    }
    // The column's middle face bars sit in line with the beams' inner bars.
    assert!(clashes.iter().any(|c| c["kind"] == "beamColumn"));
    // Deepen beamY by 40 mm: centred on its axis, its top bars move up 20 mm
    // and its bottom bars down 20 mm (one Ø20) — the crossing bars now touch.
    let by = draft(&p, "beamY").clone();
    let mut inputs = by["inputs"].clone();
    inputs["depth"] = json!(inputs["depth"].as_f64().unwrap() + 0.04);
    let p = set(&mut k, &by, inputs, None);
    let r = joints(&mut k);
    assert!(
        r["joints"][0]["clashes"]
            .as_array()
            .unwrap()
            .iter()
            .all(|c| c["kind"] != "beamBeam"),
        "{r}"
    );
    // Corner bars only in the column: its bars at ±142.5 mm clear the beams'
    // outer bars at ±95 mm by exactly (20 + 25)/2 + 25 mm.
    let col = draft(&p, "column").clone();
    let mut inputs = col["inputs"].clone();
    inputs["barsAlongWidth"] = json!(2.0);
    inputs["barsAlongDepth"] = json!(2.0);
    let p = set(&mut k, &col, inputs, None);
    let r = joints(&mut k);
    assert_eq!(
        r["joints"][0]["clashes"].as_array().unwrap().len(),
        0,
        "{r}"
    );
    // No aggregate on the drafts: indeterminate until it is entered.
    assert_eq!(r["status"], "indeterminate");
    for target in ["column", "beamX", "beamY"] {
        let d = draft(&p, target).clone();
        set(
            &mut k,
            &d,
            d["inputs"].clone(),
            Some(json!({"aggregateSize": "20 mm"})),
        );
    }
    let r = joints(&mut k);
    assert_eq!(r["status"], "clear", "{r}");
    assert!(r["joints"][0]["pairsChecked"].as_u64().unwrap() > 0);
}
