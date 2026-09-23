use workbench_model::{
    CURRENT_SCHEMA, LEGACY_SCHEMA_0_9, Project, digest, import_project,
};

fn b02() -> String {
    std::fs::read_to_string("../../fixtures/models/B02.json").unwrap()
}

fn legacy() -> String {
    std::fs::read_to_string("../../fixtures/models/LEGACY09-B02.json").unwrap()
}

#[test]
fn migrates_0_9_to_1_0_and_matches_current_hash() {
    let original = legacy();
    let (mut migrated, report) = import_project(&original).unwrap();
    assert_eq!(report.from, LEGACY_SCHEMA_0_9);
    assert_eq!(report.to, CURRENT_SCHEMA);
    assert!(
        report
            .steps
            .iter()
            .any(|s| s.contains("units → displayUnits")),
        "{:?}",
        report.steps
    );
    assert!(
        report
            .steps
            .iter()
            .any(|s| s.contains("releaseStart") || s.contains("releaseEnd")),
        "{:?}",
        report.steps
    );
    assert_eq!(report.original_sha256, digest(original.as_bytes()));
    assert!(report.original_retained);
    assert_eq!(migrated.schema_version, CURRENT_SCHEMA);

    migrated.canonicalise();
    let mut current = Project::parse(&b02()).unwrap();
    current.canonicalise();
    assert_eq!(
        migrated.hash(),
        current.hash(),
        "legacy migration must preserve engineering hash"
    );
}

#[test]
fn current_schema_import_is_identity_migration() {
    let original = b02();
    let (_, report) = import_project(&original).unwrap();
    assert_eq!(report.from, CURRENT_SCHEMA);
    assert_eq!(report.to, CURRENT_SCHEMA);
    assert!(report.steps.is_empty());
    assert_eq!(report.original_sha256, digest(original.as_bytes()));
}

#[test]
fn unknown_future_schema_is_refused() {
    let mut raw: serde_json::Value = serde_json::from_str(&b02()).unwrap();
    raw["schemaVersion"] = "9.0.0".into();
    let err = import_project(&raw.to_string()).unwrap_err();
    assert_eq!(err.code, "UNSUPPORTED_SCHEMA");
}
