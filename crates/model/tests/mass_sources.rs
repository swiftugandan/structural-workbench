//! Declared mass sources (schema 1.4.0, ADR 0018): validation, deduplication
//! rules, identity and migration from 1.3.0.
use serde_json::{Value, json};
use workbench_model::{CURRENT_SCHEMA, MassSource, Project, SCHEMA_1_3, import_project};

/// B02 migrated to the current schema through the real chain, with `mass`.
fn b02(mass: Value) -> Value {
    let fixture = std::fs::read_to_string("../../fixtures/models/B02.json").unwrap();
    let mut p = serde_json::to_value(import_project(&fixture).unwrap().0).unwrap();
    assert_eq!(p["schemaVersion"], CURRENT_SCHEMA);
    p["massSources"] = mass;
    p
}

fn code(p: &Value) -> String {
    Project::parse(&p.to_string())
        .and_then(|p| p.validate())
        .unwrap_err()
        .code
}

#[test]
fn declared_sources_round_trip_and_get_ms_labels() {
    let p = Project::parse(
        &b02(json!([
            {"id": "z", "kind": "nodalMass", "node": "n2", "mass": 1200.0},
            {"id": "a", "kind": "selfMass", "factor": 1.0},
            {"id": "q", "kind": "loadCase", "case": "LC1", "factor": 0.3},
        ]))
        .to_string(),
    )
    .unwrap();
    p.validate().unwrap();
    let mut c = p.clone();
    c.canonicalise();
    let ids: Vec<&str> = c.mass_sources.iter().map(|s| s.id()).collect();
    assert_eq!(ids, ["a", "q", "z"]);
    let label = |id: &str| c.metadata.entity_labels[id].clone();
    assert!(label("a").starts_with("ms") && label("z").starts_with("ms"));
    assert!(matches!(c.mass_sources[1], MassSource::LoadCase { factor, .. } if factor == 0.3));
    let again = Project::parse(&serde_json::to_string(&c).unwrap()).unwrap();
    assert_eq!(again.hash(), c.hash());
}

#[test]
fn mass_enters_the_model_hash_and_absence_is_not_written() {
    let without = Project::parse(&b02(json!([])).to_string()).unwrap();
    assert!(
        serde_json::to_value(&without)
            .unwrap()
            .get("massSources")
            .is_none()
    );
    let with =
        Project::parse(&b02(json!([{"id": "a", "kind": "selfMass", "factor": 1.0}])).to_string())
            .unwrap();
    assert_ne!(without.hash(), with.hash());
}

#[test]
fn invalid_duplicate_or_dangling_sources_are_refused() {
    let cases = [
        (
            json!([{"id": "a", "kind": "selfMass", "factor": 0.0}]),
            "INVALID_MASS_SOURCE",
        ),
        (
            json!([{"id": "a", "kind": "selfMass", "factor": 1.0},
                {"id": "b", "kind": "selfMass", "factor": 0.5}]),
            "INVALID_MASS_SOURCE",
        ),
        (
            json!([{"id": "a", "kind": "loadCase", "case": "LC1", "factor": 1.0},
                {"id": "b", "kind": "loadCase", "case": "LC1", "factor": 0.3}]),
            "INVALID_MASS_SOURCE",
        ),
        (
            json!([{"id": "a", "kind": "loadCase", "case": "LC9", "factor": 1.0}]),
            "DANGLING_REFERENCE",
        ),
        (
            json!([{"id": "a", "kind": "nodalMass", "node": "n2", "mass": -1.0}]),
            "INVALID_MASS_SOURCE",
        ),
        (
            json!([{"id": "a", "kind": "nodalMass", "node": "n2", "mass": 5.0},
                {"id": "b", "kind": "nodalMass", "node": "n2", "mass": 5.0}]),
            "INVALID_MASS_SOURCE",
        ),
        (
            json!([{"id": "a", "kind": "nodalMass", "node": "n9", "mass": 5.0}]),
            "DANGLING_REFERENCE",
        ),
        (
            json!([{"id": "n1", "kind": "selfMass", "factor": 1.0}]),
            "DUPLICATE_ID",
        ),
    ];
    for (mass, expected) in cases {
        assert_eq!(code(&b02(mass.clone())), expected, "{mass}");
    }
    // Unknown kinds and fields are schema errors, not guesses.
    for mass in [
        json!([{"id": "a", "kind": "floorMass", "factor": 1.0}]),
        json!([{"id": "a", "kind": "selfMass", "factor": 1.0, "direction": "X"}]),
    ] {
        assert_eq!(
            Project::parse(&b02(mass).to_string()).unwrap_err().code,
            "INVALID_SCHEMA"
        );
    }
}

#[test]
fn a_1_3_project_migrates_by_version_only() {
    let mut v = b02(json!([]));
    v.as_object_mut().unwrap().remove("massSources");
    v["schemaVersion"] = json!(SCHEMA_1_3);
    let (migrated, report) = import_project(&v.to_string()).unwrap();
    assert_eq!(report.from, SCHEMA_1_3);
    assert_eq!(report.to, CURRENT_SCHEMA);
    assert_eq!(
        report.steps,
        [
            "set schemaVersion 1.4.0 (no mass sources declared)",
            "set schemaVersion 1.5.0 (slab plate analysis not configured)",
            "set schemaVersion 1.6.0 (no response spectra)",
            "set schemaVersion 1.7.0 (no RC beam code inputs)",
            "set schemaVersion 1.8.0 (code inputs for columns, slabs and footings)",
            "set schemaVersion 1.9.0 (single-plate connection drafts)"
        ]
    );
    assert!(migrated.mass_sources.is_empty());
    // A 1.3.0 file cannot already carry 1.4.0 content.
    v["massSources"] = json!([{"id": "a", "kind": "selfMass", "factor": 1.0}]);
    assert_eq!(
        import_project(&v.to_string()).unwrap_err().code,
        "INVALID_SCHEMA"
    );
}
