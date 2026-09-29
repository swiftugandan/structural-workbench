//! Slab plate analysis inputs (schema 1.5.0, ADR 0021): validation and
//! migration from 1.4.0.
use serde_json::{Value, json};
use workbench_model::{CURRENT_SCHEMA, Project, SCHEMA_1_4, import_project};

fn slab(plate: Option<Value>) -> Value {
    let fixture = std::fs::read_to_string("../../fixtures/models/B02.json").unwrap();
    let mut p = serde_json::to_value(import_project(&fixture).unwrap().0).unwrap();
    assert_eq!(p["schemaVersion"], CURRENT_SCHEMA);
    let keys = [
        ("length", 6.0),
        ("width", 5.0),
        ("thickness", 0.225),
        ("cover", 0.03),
        ("concreteStrength", 30e6),
        ("rebarStrength", 500e6),
        ("meshSize", 0.4),
        ("openingWidth", 1.0),
        ("openingLength", 1.0),
    ];
    let d = json!({
        "id": "dp1",
        "kind": "slab",
        "inputSource": "syntheticFixture",
        "inputs": keys.iter().map(|(k, v)| (k.to_string(), json!(v))).collect::<serde_json::Map<_, _>>(),
        "soilReference": "",
    });
    p["designPreviews"] = json!([d]);
    // The draft's physical design object, as the command layer records it.
    let mut project: Project = serde_json::from_value(p).unwrap();
    let copy = project.clone();
    project.structure.sync_records(&copy);
    let mut p = serde_json::to_value(project).unwrap();
    if let Some(plate) = plate {
        p["designPreviews"][0]["plate"] = plate;
    }
    p
}

fn plate() -> Value {
    json!({
        "edges": ["simple", "simple", "clamped", "free"],
        "includeOpening": true,
        "inputs": {"pressure": 10e3, "elasticModulus": 30e9, "poissonRatio": 0.2, "openingX": 2.5, "openingY": 2.0},
        "inputSources": {"pressure": "user", "elasticModulus": "syntheticFixture", "poissonRatio": "syntheticFixture",
            "openingX": "syntheticFixture", "openingY": "syntheticFixture", "edges": "user", "includeOpening": "syntheticFixture"},
    })
}

fn code(p: &Value) -> String {
    Project::parse(&p.to_string())
        .and_then(|p| p.validate())
        .unwrap_err()
        .code
}

#[test]
fn plate_inputs_round_trip() {
    let p = Project::parse(&slab(Some(plate())).to_string()).unwrap();
    p.validate().unwrap();
    let back = serde_json::to_value(&p).unwrap();
    assert_eq!(back["designPreviews"][0]["plate"], plate());
    // Absent means not configured.
    Project::parse(&slab(None).to_string())
        .unwrap()
        .validate()
        .unwrap();
}

#[test]
fn plate_inputs_are_validated() {
    let with = |f: &dyn Fn(&mut Value)| {
        let mut p = plate();
        f(&mut p);
        slab(Some(p))
    };
    for bad in [
        with(&|p| p["edges"][1] = json!("pinned")),
        with(&|p| p["inputs"]["pressure"] = json!(0.0)),
        with(&|p| p["inputs"]["poissonRatio"] = json!(0.5)),
        with(&|p| p["inputs"]["poissonRatio"] = json!(-0.1)),
        with(&|p| p["inputs"]["elasticModulus"] = json!(-1.0)),
        with(&|p| {
            p["inputSources"].as_object_mut().unwrap().remove("edges");
        }),
        with(&|p| p["inputSources"]["pressure"] = json!("guess")),
        // The opening must sit strictly inside the 6 × 5 panel.
        with(&|p| p["inputs"]["openingX"] = json!(5.0)),
        with(&|p| p["inputs"]["openingY"] = json!(0.0)),
    ] {
        assert_eq!(
            code(&bad),
            "INVALID_SCHEMA",
            "{}",
            bad["designPreviews"][0]["plate"]
        );
    }
    // An opening that is not analysed is not positioned.
    Project::parse(
        &with(&|p| {
            p["includeOpening"] = json!(false);
            p["inputs"]["openingX"] = json!(5.0);
        })
        .to_string(),
    )
    .unwrap()
    .validate()
    .unwrap();
    // Unknown fields and plate inputs on other kinds are refused.
    let mut extra = slab(Some(plate()));
    extra["designPreviews"][0]["plate"]["mesh"] = json!("fine");
    assert_eq!(
        Project::parse(&extra.to_string()).unwrap_err().code,
        "INVALID_SCHEMA"
    );
    let mut beam = slab(Some(plate()));
    beam["designPreviews"][0]["kind"] = json!("padFooting");
    assert_eq!(code(&beam), "INVALID_SCHEMA");
}

#[test]
fn a_1_4_project_migrates_by_version_only() {
    let mut v = slab(None);
    v["schemaVersion"] = json!(SCHEMA_1_4);
    let (migrated, report) = import_project(&v.to_string()).unwrap();
    assert_eq!(
        (report.from.as_str(), report.to.as_str()),
        (SCHEMA_1_4, CURRENT_SCHEMA)
    );
    assert_eq!(
        report.steps,
        ["set schemaVersion 1.5.0 (slab plate analysis not configured)"]
    );
    assert!(migrated.design_previews[0].plate.is_none());
    // A 1.4.0 file cannot already carry 1.5.0 content.
    v["designPreviews"][0]["plate"] = plate();
    assert_eq!(
        import_project(&v.to_string()).unwrap_err().code,
        "INVALID_SCHEMA"
    );
}
