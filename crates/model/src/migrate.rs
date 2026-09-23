use crate::{Project, Result, digest, err};
use serde_json::{Value, json};

/// Current engineering project schema written by the application.
pub const CURRENT_SCHEMA: &str = "1.0.0";
/// Oldest schema this binary can migrate into CURRENT_SCHEMA.
pub const LEGACY_SCHEMA_0_9: &str = "0.9.0";

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationReport {
    pub from: String,
    pub to: String,
    pub steps: Vec<String>,
    pub original_sha256: String,
    /// Original import bytes are retained by the host; the kernel only reports the hash.
    pub original_retained: bool,
}

impl MigrationReport {
    pub fn identity(original_sha256: String) -> Self {
        Self {
            from: CURRENT_SCHEMA.into(),
            to: CURRENT_SCHEMA.into(),
            steps: vec![],
            original_sha256,
            original_retained: true,
        }
    }
}

/// Parse project JSON, applying the documented migration chain when required.
/// Caller must retain `original` bytes before replacing durable storage.
pub fn import_project(original: &str) -> Result<(Project, MigrationReport)> {
    if original.len() > 50 * 1024 * 1024 {
        return Err(err("MEMORY_LIMIT", "Project exceeds 50 MiB"));
    }
    let original_sha256 = digest(original.as_bytes());
    let mut raw: Value =
        serde_json::from_str(original).map_err(|e| err("INVALID_SCHEMA", e.to_string()))?;
    let version = raw
        .get("schemaVersion")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let (steps, report_from) = match version.as_str() {
        CURRENT_SCHEMA => (Vec::new(), CURRENT_SCHEMA.to_string()),
        LEGACY_SCHEMA_0_9 => (migrate_0_9_to_1_0(&mut raw)?, LEGACY_SCHEMA_0_9.to_string()),
        _ => {
            return Err(err(
                "UNSUPPORTED_SCHEMA",
                format!(
                    "Project schema {version} is not supported. Supported import schemas: {LEGACY_SCHEMA_0_9}, {CURRENT_SCHEMA}"
                ),
            ));
        }
    };

    let text = serde_json::to_string(&raw).map_err(|e| err("INVALID_SCHEMA", e.to_string()))?;
    let project = Project::parse_current(&text)?;
    Ok((
        project,
        MigrationReport {
            from: report_from,
            to: CURRENT_SCHEMA.into(),
            steps,
            original_sha256,
            original_retained: true,
        },
    ))
}

fn migrate_0_9_to_1_0(raw: &mut Value) -> Result<Vec<String>> {
    let mut steps = Vec::new();
    let obj = raw
        .as_object_mut()
        .ok_or_else(|| err("INVALID_SCHEMA", "Project root must be an object"))?;

    if obj.get("schemaVersion").and_then(|v| v.as_str()) != Some(LEGACY_SCHEMA_0_9) {
        return Err(err(
            "INVALID_SCHEMA",
            "migrate_0_9_to_1_0 requires schemaVersion 0.9.0",
        ));
    }

    if !obj.contains_key("displayUnits") {
        if let Some(units) = obj.remove("units") {
            obj.insert("displayUnits".into(), units);
            steps.push("rename units → displayUnits".into());
        } else {
            return Err(err(
                "INVALID_SCHEMA",
                "Legacy 0.9.0 project requires units or displayUnits",
            ));
        }
    } else if obj.contains_key("units") {
        obj.remove("units");
        steps.push("drop redundant units after displayUnits".into());
    }

    if let Some(members) = obj.get_mut("members").and_then(|v| v.as_array_mut()) {
        let mut defaulted_start = false;
        let mut defaulted_end = false;
        for member in members {
            let m = member
                .as_object_mut()
                .ok_or_else(|| err("INVALID_SCHEMA", "Member must be an object"))?;
            let default_release = json!({"my": false, "mz": false});
            if !m.contains_key("releaseStart") {
                m.insert("releaseStart".into(), default_release.clone());
                defaulted_start = true;
            }
            if !m.contains_key("releaseEnd") {
                m.insert("releaseEnd".into(), default_release);
                defaulted_end = true;
            }
        }
        if defaulted_start {
            steps.push("default releaseStart My/Mz false".into());
        }
        if defaulted_end {
            steps.push("default releaseEnd My/Mz false".into());
        }
    }

    if !obj.contains_key("metadata") {
        obj.insert(
            "metadata".into(),
            json!({"description":"","createdBy":"schema-migration"}),
        );
        steps.push("insert empty metadata".into());
    }

    obj.insert("schemaVersion".into(), json!(CURRENT_SCHEMA));
    steps.push(format!("set schemaVersion {CURRENT_SCHEMA}"));
    Ok(steps)
}

impl Project {
    /// Parse a current-schema document only (no migration). Used after migration and by commands.
    pub(crate) fn parse_current(s: &str) -> Result<Self> {
        if s.len() > 50 * 1024 * 1024 {
            return Err(err("MEMORY_LIMIT", "Project exceeds 50 MiB"));
        }
        let raw: Value =
            serde_json::from_str(s).map_err(|e| err("INVALID_SCHEMA", e.to_string()))?;
        if raw["schemaVersion"] != CURRENT_SCHEMA {
            return Err(err(
                "UNSUPPORTED_SCHEMA",
                format!("Only project schema {CURRENT_SCHEMA} is supported after migration"),
            ));
        }
        if raw["members"].as_array().is_some_and(|members| {
            members.iter().any(|m| {
                ["releaseStart", "releaseEnd"].iter().any(|k| {
                    m[*k]
                        .as_object()
                        .is_some_and(|obj| obj.keys().any(|key| key != "my" && key != "mz"))
                })
            })
        }) {
            return Err(err(
                "UNSUPPORTED_FEATURE",
                "Only My/Mz end releases are supported",
            ));
        }
        let p: Self = serde_json::from_str(s).map_err(|e| err("INVALID_SCHEMA", e.to_string()))?;
        p.validate()?;
        Ok(p)
    }
}
