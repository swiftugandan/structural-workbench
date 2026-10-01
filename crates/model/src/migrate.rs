use crate::{Project, Result, digest, err};
use serde_json::{Value, json};

/// Current engineering project schema written by the application.
pub const CURRENT_SCHEMA: &str = "1.8.0";
/// rcBeam code inputs only; rcColumn drafts have no link spacing (ADR 0026, ADR 0027).
pub const SCHEMA_1_7: &str = "1.7.0";
/// No rcBeam code inputs (ADR 0026).
pub const SCHEMA_1_6: &str = "1.6.0";
/// No response spectra (ADR 0023).
pub const SCHEMA_1_5: &str = "1.5.0";
/// No slab plate inputs or RC columns (ADR 0021, ADR 0022).
pub const SCHEMA_1_4: &str = "1.4.0";
/// No declared mass sources (ADR 0018).
pub const SCHEMA_1_3: &str = "1.3.0";
/// Previous current schema (per-face rcBeam bar rows; no link legs, ADR 0013).
pub const SCHEMA_1_2: &str = "1.2.0";
/// Explicit structure, single rcBeam bar preference.
pub const SCHEMA_1_1: &str = "1.1.0";
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
    let (mut steps, report_from) = match version.as_str() {
        CURRENT_SCHEMA => (Vec::new(), CURRENT_SCHEMA.to_string()),
        SCHEMA_1_7 => (Vec::new(), SCHEMA_1_7.to_string()),
        SCHEMA_1_6 => (Vec::new(), SCHEMA_1_6.to_string()),
        SCHEMA_1_5 => (Vec::new(), SCHEMA_1_5.to_string()),
        SCHEMA_1_4 => (Vec::new(), SCHEMA_1_4.to_string()),
        SCHEMA_1_3 => (Vec::new(), SCHEMA_1_3.to_string()),
        SCHEMA_1_2 => (Vec::new(), SCHEMA_1_2.to_string()),
        SCHEMA_1_1 => (Vec::new(), SCHEMA_1_1.to_string()),
        "1.0.0" => (Vec::new(), "1.0.0".to_string()),
        LEGACY_SCHEMA_0_9 => (migrate_0_9_to_1_0(&mut raw)?, LEGACY_SCHEMA_0_9.to_string()),
        _ => {
            return Err(err(
                "UNSUPPORTED_SCHEMA",
                format!(
                    "Project schema {version} is not supported. Supported import schemas: {LEGACY_SCHEMA_0_9}, 1.0.0, {SCHEMA_1_1}, {SCHEMA_1_2}, {SCHEMA_1_3}, {SCHEMA_1_4}, {SCHEMA_1_5}, {SCHEMA_1_6}, {SCHEMA_1_7}, {CURRENT_SCHEMA}"
                ),
            ));
        }
    };

    if version == LEGACY_SCHEMA_0_9 || version == "1.0.0" {
        if raw.get("structure").is_some() {
            return Err(err(
                "INVALID_SCHEMA",
                "Legacy project cannot contain a structure extension",
            ));
        }
        raw["schemaVersion"] = json!(SCHEMA_1_1);
        raw["structure"] = serde_json::to_value(crate::Structure::default()).unwrap();
        let legacy: Project = serde_json::from_value(raw.clone())
            .map_err(|e| err("INVALID_SCHEMA", e.to_string()))?;
        raw["structure"] = serde_json::to_value(crate::Structure::initialise(&legacy)).unwrap();
        steps.push("create explicit physical members, joints, support details and draft bindings; preserve unassigned roles".into());
        steps.push("set schemaVersion 1.1.0".into());
    }
    let newer = |versions: &[&str]| versions.contains(&version.as_str());
    if !newer(&[CURRENT_SCHEMA, SCHEMA_1_7, SCHEMA_1_6, SCHEMA_1_5, SCHEMA_1_4, SCHEMA_1_3, SCHEMA_1_2]) {
        steps.extend(migrate_1_1_to_1_2(&mut raw)?);
    }
    if !newer(&[CURRENT_SCHEMA, SCHEMA_1_7, SCHEMA_1_6, SCHEMA_1_5, SCHEMA_1_4, SCHEMA_1_3]) {
        steps.extend(migrate_1_2_to_1_3(&mut raw)?);
    }
    if !newer(&[CURRENT_SCHEMA, SCHEMA_1_7, SCHEMA_1_6, SCHEMA_1_5, SCHEMA_1_4]) {
        steps.extend(migrate_1_3_to_1_4(&mut raw)?);
    }
    if !newer(&[CURRENT_SCHEMA, SCHEMA_1_7, SCHEMA_1_6, SCHEMA_1_5]) {
        steps.extend(migrate_1_4_to_1_5(&mut raw)?);
    }
    if !newer(&[CURRENT_SCHEMA, SCHEMA_1_7, SCHEMA_1_6]) {
        steps.extend(migrate_1_5_to_1_6(&mut raw)?);
    }
    if !newer(&[CURRENT_SCHEMA, SCHEMA_1_7]) {
        steps.extend(migrate_1_6_to_1_7(&mut raw)?);
    }
    if version != CURRENT_SCHEMA {
        steps.extend(migrate_1_7_to_1_8(&mut raw)?);
    }
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

/// 1.1.0 → 1.2.0: an rcBeam draft's single bar preference (applied to both
/// faces) becomes explicit, equal top and bottom rows. Values and per-field
/// provenance are copied unchanged, so engineering meaning is preserved.
fn migrate_1_1_to_1_2(raw: &mut Value) -> Result<Vec<String>> {
    let mut split = 0;
    if let Some(drafts) = raw.get_mut("designPreviews").and_then(|v| v.as_array_mut()) {
        for d in drafts.iter_mut().filter(|d| d["kind"] == "rcBeam") {
            for map in ["inputs", "inputSources"] {
                let Some(obj) = d.get_mut(map).and_then(|v| v.as_object_mut()) else {
                    continue;
                };
                if obj.is_empty() && map == "inputSources" {
                    continue;
                }
                for (old, faces) in [
                    ("barDiameter", ["topBarDiameter", "bottomBarDiameter"]),
                    ("barCount", ["topBarCount", "bottomBarCount"]),
                ] {
                    let value = obj.remove(old).ok_or_else(|| {
                        err(
                            "INVALID_SCHEMA",
                            format!("Schema 1.1.0 RC beam draft is missing {map}.{old}"),
                        )
                    })?;
                    for face in faces {
                        obj.insert(face.into(), value.clone());
                    }
                }
            }
            split += 1;
        }
    }
    raw["schemaVersion"] = json!(SCHEMA_1_2);
    let mut steps = Vec::new();
    if split > 0 {
        steps.push(format!(
            "split the bar preference of {split} RC beam draft(s) into equal top and bottom rows"
        ));
    }
    steps.push("set schemaVersion 1.2.0".into());
    Ok(steps)
}

/// 1.2.0 → 1.3.0: rcBeam drafts gain an explicit link-leg count (ADR 0016).
/// Earlier drafts described one closed link per set, as their illustrations
/// draw it, so the count is 2 with synthetic provenance. The anchorage
/// confirmation is never added: absent means not confirmed.
fn migrate_1_2_to_1_3(raw: &mut Value) -> Result<Vec<String>> {
    let mut added = 0;
    if let Some(drafts) = raw.get_mut("designPreviews").and_then(|v| v.as_array_mut()) {
        for d in drafts.iter_mut().filter(|d| d["kind"] == "rcBeam") {
            if d.get("tensionAnchorageConfirmed").is_some() {
                return Err(err(
                    "INVALID_SCHEMA",
                    "Schema 1.2.0 RC beam drafts cannot carry an anchorage confirmation",
                ));
            }
            let inputs = d
                .get_mut("inputs")
                .and_then(|v| v.as_object_mut())
                .ok_or_else(|| err("INVALID_SCHEMA", "RC beam draft is missing inputs"))?;
            if inputs.contains_key("linkLegs") {
                return Err(err(
                    "INVALID_SCHEMA",
                    "Schema 1.2.0 RC beam drafts cannot already define link legs",
                ));
            }
            inputs.insert("linkLegs".into(), json!(2.0));
            if let Some(sources) = d.get_mut("inputSources").and_then(|v| v.as_object_mut())
                && !sources.is_empty()
            {
                sources.insert("linkLegs".into(), json!("syntheticFixture"));
            }
            added += 1;
        }
    }
    raw["schemaVersion"] = json!(SCHEMA_1_3);
    let mut steps = Vec::new();
    if added > 0 {
        steps.push(format!(
            "record 2 link legs (one closed link per set, synthetic) on {added} RC beam draft(s)"
        ));
    }
    steps.push("set schemaVersion 1.3.0".into());
    Ok(steps)
}

/// 1.3.0 → 1.4.0: projects may declare mass sources (ADR 0018). Mass is never
/// implied, so a 1.3.0 project gains none and keeps its engineering content.
fn migrate_1_3_to_1_4(raw: &mut Value) -> Result<Vec<String>> {
    if raw.get("massSources").is_some() {
        return Err(err(
            "INVALID_SCHEMA",
            "Schema 1.3.0 projects cannot declare mass sources",
        ));
    }
    raw["schemaVersion"] = json!(SCHEMA_1_4);
    Ok(vec![
        "set schemaVersion 1.4.0 (no mass sources declared)".into(),
    ])
}

/// 1.4.0 → 1.5.0: slab drafts may carry plate analysis inputs (ADR 0021) and
/// RC column drafts exist (ADR 0022). Neither is implied, so existing slab
/// drafts stay unconfigured.
fn migrate_1_4_to_1_5(raw: &mut Value) -> Result<Vec<String>> {
    if raw["designPreviews"].as_array().is_some_and(|ds| {
        ds.iter()
            .any(|d| d.get("plate").is_some() || d["kind"] == "rcColumn")
    }) {
        return Err(err(
            "INVALID_SCHEMA",
            "Schema 1.4.0 design drafts cannot carry plate inputs or RC columns",
        ));
    }
    raw["schemaVersion"] = json!(SCHEMA_1_5);
    Ok(vec![
        "set schemaVersion 1.5.0 (slab plate analysis not configured)".into(),
    ])
}

/// 1.5.0 → 1.6.0: projects may carry response spectra (ADR 0023) and slab
/// drafts a placement and columns (ADR 0021). None is implied.
fn migrate_1_5_to_1_6(raw: &mut Value) -> Result<Vec<String>> {
    let slab_columns = raw["designPreviews"].as_array().is_some_and(|ds| {
        ds.iter().any(|d| {
            d["plate"].get("columns").is_some() || d["plate"].get("placement").is_some()
        })
    });
    let bracing_points = raw["members"].as_array().is_some_and(|ms| {
        ms.iter().any(|m| {
            m["steelDesign"].get("bracingPoints").is_some() || m["steelDesign"]["bracing"] == "points"
        })
    });
    if raw.get("responseSpectra").is_some() || slab_columns || bracing_points {
        return Err(err(
            "INVALID_SCHEMA",
            "Schema 1.5.0 projects cannot carry response spectra, slab columns or bracing points",
        ));
    }
    raw["schemaVersion"] = json!(SCHEMA_1_6);
    Ok(vec!["set schemaVersion 1.6.0 (no response spectra)".into()])
}

fn migrate_1_6_to_1_7(raw: &mut Value) -> Result<Vec<String>> {
    let code_inputs = raw["designPreviews"]
        .as_array()
        .is_some_and(|ds| ds.iter().any(|d| d.get("codeInputs").is_some()));
    if code_inputs {
        return Err(err("INVALID_SCHEMA", "Schema 1.6.0 projects cannot carry RC beam code inputs"));
    }
    raw["schemaVersion"] = json!(SCHEMA_1_7);
    Ok(vec!["set schemaVersion 1.7.0 (no RC beam code inputs)".into()])
}

/// 1.7.0 → 1.8.0 (ADR 0027): code inputs extend to columns, slabs and pad
/// footings, and rcColumn drafts gain a link spacing. Existing column drafts
/// get 200 mm with synthetic provenance; 1.7.0 files carrying either 1.8.0
/// addition are refused, not guessed.
fn migrate_1_7_to_1_8(raw: &mut Value) -> Result<Vec<String>> {
    let mut added = 0;
    if let Some(drafts) = raw.get_mut("designPreviews").and_then(|v| v.as_array_mut()) {
        for d in drafts.iter_mut() {
            if d["kind"] != "rcBeam" && d.get("codeInputs").is_some() {
                return Err(err("INVALID_SCHEMA", "Schema 1.7.0 code inputs apply only to RC beam drafts"));
            }
            if d["kind"] != "rcColumn" {
                continue;
            }
            let inputs = d
                .get_mut("inputs")
                .and_then(|v| v.as_object_mut())
                .ok_or_else(|| err("INVALID_SCHEMA", "RC column draft is missing inputs"))?;
            if inputs.contains_key("linkSpacing") {
                return Err(err("INVALID_SCHEMA", "Schema 1.7.0 RC column drafts cannot already define link spacing"));
            }
            inputs.insert("linkSpacing".into(), json!(0.2));
            if let Some(sources) = d.get_mut("inputSources").and_then(|v| v.as_object_mut())
                && !sources.is_empty()
            {
                sources.insert("linkSpacing".into(), json!("syntheticFixture"));
            }
            added += 1;
        }
    }
    raw["schemaVersion"] = json!(CURRENT_SCHEMA);
    let mut steps = Vec::new();
    if added > 0 {
        steps.push(format!("record 200 mm link spacing (synthetic) on {added} RC column draft(s)"));
    }
    steps.push("set schemaVersion 1.8.0 (code inputs for columns, slabs and footings)".into());
    Ok(steps)
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

    obj.insert("schemaVersion".into(), json!("1.0.0"));
    steps.push("set schemaVersion 1.0.0".into());
    Ok(steps)
}

impl Project {
    /// Parse a current-schema document only (no migration). Used after migration and by commands.
    pub fn parse_current(s: &str) -> Result<Self> {
        if s.len() > 50 * 1024 * 1024 {
            return Err(err("MEMORY_LIMIT", "Project exceeds 50 MiB"));
        }
        // Import migration already checks the version. Commands operate on the
        // current typed project; validate() checks its schema and every reference.
        let p: Self = serde_json::from_str(s).map_err(|e| err("INVALID_SCHEMA", e.to_string()))?;
        p.validate()?;
        Ok(p)
    }
}
