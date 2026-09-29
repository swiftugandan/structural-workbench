//! Declarative study sweeps on validated project snapshots (M22,
//! `contracts/PROTOCOL.md` §1.1).
//!
//! A study is data, not a program: each variant is the base project with a
//! bounded list of JSON-pointer `set` steps, re-parsed and validated through
//! the same Rust model as an interactive edit before the same analysis. Every
//! failure names the variant, step, path and stage it came from; the report
//! carries every model/result hash and a digest of the study for replay.

use serde_json::{Value, json};
use workbench_model::{Diagnostic, Project, Result, digest, err};

use crate::analyse;

/// At most this many variants per study.
pub const MAX_VARIANTS: usize = 50;
/// At most this many `set` steps in one variant.
pub const MAX_STEPS_PER_VARIANT: usize = 100;
/// At most this many `set` steps in the whole study.
pub const MAX_STEPS: usize = 1000;

/// Top-level project members a study may never retarget: identity, schema
/// and metadata are not engineering parameters, and solver overrides do not
/// exist.
const PROTECTED: [&str; 4] = ["schemaVersion", "id", "metadata", "solverOverride"];

fn only_keys(v: &Value, allowed: &[&str], what: &str) -> Result<()> {
    let object = v
        .as_object()
        .ok_or_else(|| err("INVALID_SCHEMA", format!("{what} must be an object")))?;
    if let Some(k) = object.keys().find(|k| !allowed.contains(&k.as_str())) {
        return Err(err("INVALID_SCHEMA", format!("Unknown {what} field `{k}`")));
    }
    Ok(())
}

/// Where in the study a diagnostic arose.
struct Location<'a> {
    variant_index: usize,
    variant_id: &'a str,
    step: Option<(usize, &'a str)>,
    stage: &'static str,
}

impl Location<'_> {
    fn attach(&self, mut d: Diagnostic) -> Diagnostic {
        let mut at = json!({
            "variantIndex": self.variant_index,
            "variantId": self.variant_id,
            "stage": self.stage,
        });
        if let Some((index, path)) = self.step {
            at["stepIndex"] = json!(index);
            at["path"] = json!(path);
        }
        let where_ = match self.step {
            Some((index, path)) => format!(
                "variant {} ({}), step {} ({path})",
                self.variant_index + 1,
                self.variant_id,
                index + 1
            ),
            None => format!(
                "variant {} ({}), {}",
                self.variant_index + 1,
                self.variant_id,
                self.stage
            ),
        };
        d.message = format!("{where_}: {}", d.message);
        if !d.details.is_object() {
            d.details = json!({});
        }
        d.details["studyLocation"] = at;
        d
    }
}

/// Run a schemaVersion 1.0.0 study document against an already-loaded base project JSON text.
pub fn execute_study_document(study: &Value, base_project_text: &str) -> Result<Value> {
    only_keys(
        study,
        &[
            "schemaVersion",
            "id",
            "name",
            "description",
            "baseProject",
            "caseId",
            "observe",
            "variants",
        ],
        "study",
    )?;
    if study["schemaVersion"] != "1.0.0" {
        return Err(err(
            "UNSUPPORTED_SCHEMA",
            "Study schemaVersion must be 1.0.0",
        ));
    }
    let case_id = study["caseId"].as_str().unwrap_or("LC1");
    let variants = study["variants"]
        .as_array()
        .ok_or_else(|| err("INVALID_SCHEMA", "variants array required"))?;
    if variants.is_empty() {
        return Err(err("INVALID_SCHEMA", "variants must not be empty"));
    }
    if variants.len() > MAX_VARIANTS {
        return Err(err(
            "STUDY_BUDGET",
            format!(
                "A study runs at most {MAX_VARIANTS} variants; this one has {}",
                variants.len()
            ),
        ));
    }
    if let Some(observe) = study.get("observe") {
        only_keys(observe, &["nodeId", "dof"], "observe")?;
    }
    let observe_node = study["observe"]["nodeId"].as_str();
    let observe_dof = study["observe"]["dof"].as_str().unwrap_or("uz");
    let dof_index = match observe_dof {
        "ux" => 0,
        "uy" => 1,
        "uz" => 2,
        "rx" => 3,
        "ry" => 4,
        "rz" => 5,
        _ => {
            return Err(err(
                "INVALID_SCHEMA",
                "observe.dof must be ux|uy|uz|rx|ry|rz",
            ));
        }
    };
    // Shape and budget of every variant before any analysis runs.
    let mut ids = std::collections::BTreeSet::new();
    let mut total_steps = 0;
    for (i, variant) in variants.iter().enumerate() {
        only_keys(variant, &["id", "description", "set"], "variant")?;
        let id = variant["id"]
            .as_str()
            .ok_or_else(|| err("INVALID_SCHEMA", format!("variant {} needs an id", i + 1)))?;
        if !ids.insert(id) {
            return Err(err("INVALID_SCHEMA", format!("Duplicate variant id {id}")));
        }
        let steps = variant["set"].as_array().ok_or_else(|| {
            err(
                "INVALID_SCHEMA",
                format!("variant {id}: set array required"),
            )
        })?;
        if steps.len() > MAX_STEPS_PER_VARIANT {
            return Err(err(
                "STUDY_BUDGET",
                format!("variant {id}: at most {MAX_STEPS_PER_VARIANT} set steps"),
            ));
        }
        total_steps += steps.len();
        for (j, step) in steps.iter().enumerate() {
            only_keys(step, &["path", "value"], "set step").map_err(|e| {
                err(
                    &e.code,
                    format!("variant {id}, step {}: {}", j + 1, e.message),
                )
            })?;
        }
    }
    if total_steps > MAX_STEPS {
        return Err(err(
            "STUDY_BUDGET",
            format!("A study applies at most {MAX_STEPS} set steps; this one has {total_steps}"),
        ));
    }

    let base_json: Value = serde_json::from_str(base_project_text).map_err(|e| {
        err(
            "INVALID_SCHEMA",
            format!("Base project JSON parse failed: {e}"),
        )
    })?;
    if base_json.get("solverOverride").is_some() {
        return Err(err(
            "UNSUPPORTED_FEATURE",
            "solverOverride is not permitted in study base projects",
        ));
    }
    let base = Project::parse(base_project_text)?;
    base.validate()?;
    // Variants apply their steps to the validated base in the current schema,
    // exactly as edits apply to the open project.
    let base_current = serde_json::to_value(&base).unwrap();

    let mut rows = Vec::new();
    for (i, variant) in variants.iter().enumerate() {
        let id = variant["id"].as_str().unwrap();
        let mut project_json = base_current.clone();
        let steps = variant["set"].as_array().unwrap();
        for (j, op) in steps.iter().enumerate() {
            let path = op["path"].as_str().unwrap_or("");
            let at = Location {
                variant_index: i,
                variant_id: id,
                step: Some((j, path)),
                stage: "set",
            };
            let value = op
                .get("value")
                .ok_or_else(|| at.attach(err("INVALID_SCHEMA", "set.value required")))?;
            let top = path.trim_start_matches('/').split('/').next().unwrap_or("");
            if PROTECTED.contains(&top) {
                return Err(at.attach(err(
                    "UNSUPPORTED_FEATURE",
                    format!("Study steps may not set /{top}"),
                )));
            }
            apply_pointer(&mut project_json, path, value.clone()).map_err(|e| at.attach(e))?;
        }
        let at = |stage| Location {
            variant_index: i,
            variant_id: id,
            step: None,
            stage,
        };
        let text = serde_json::to_string(&project_json).unwrap();
        let project = Project::parse(&text)
            .and_then(|p| p.validate().map(|_| p))
            .map_err(|e| at("validate").attach(e))?;
        let analysis = analyse(&project, case_id).map_err(|e| at("analyse").attach(e))?;
        let observed = observe_node.map(|nid| {
            analysis
                .node_ids
                .iter()
                .position(|id| id == nid)
                .map(|n| analysis.node_displacements[n * 6 + dof_index])
        });
        if observe_node.is_some() && observed == Some(None) {
            return Err(at("observe").attach(err(
                "DANGLING_REFERENCE",
                format!(
                    "Observed node {} is not in the model",
                    observe_node.unwrap()
                ),
            )));
        }
        rows.push(json!({
            "variantId": id,
            "steps": steps.len(),
            "modelHash": analysis.model_hash,
            "resultId": analysis.result_id,
            "settingsHash": analysis.settings_hash,
            "observed": {
                "nodeId": observe_node,
                "dof": observe_dof,
                "value": observed.flatten()
            }
        }));
    }

    let mut hashes: Vec<&str> = rows
        .iter()
        .filter_map(|r| r["modelHash"].as_str())
        .collect();
    hashes.sort_unstable();
    if hashes.windows(2).any(|w| w[0] == w[1]) {
        return Err(err(
            "INVALID_SCHEMA",
            "Study variants produced identical model hashes; parameter changes did not affect the model",
        ));
    }

    Ok(json!({
        "status": "ok",
        "studyId": study["id"],
        "studyName": study["name"],
        // Replay identity: the same study on the same base model and solver
        // build reproduces this report exactly.
        "studyDigest": digest(&serde_json::to_vec(study).unwrap()),
        "baseModelHash": base.hash(),
        "solverBuildHash": option_env!("WORKBENCH_SOURCE_HASH").unwrap_or("development"),
        "caseId": case_id,
        "variantCount": rows.len(),
        "variants": rows
    }))
}

pub fn apply_pointer(root: &mut Value, pointer: &str, value: Value) -> Result<()> {
    if !pointer.starts_with('/') {
        return Err(err("INVALID_SCHEMA", "JSON pointer path must start with /"));
    }
    let tokens: Vec<&str> = pointer
        .split('/')
        .skip(1)
        .filter(|t| !t.is_empty())
        .collect();
    if tokens.is_empty() {
        return Err(err("INVALID_SCHEMA", "Cannot replace document root"));
    }
    let mut cur = root;
    for (i, token) in tokens.iter().enumerate() {
        let last = i + 1 == tokens.len();
        let key = token.replace("~1", "/").replace("~0", "~");
        if last {
            match cur {
                Value::Object(map) => {
                    map.insert(key, value);
                    return Ok(());
                }
                Value::Array(arr) => {
                    let idx: usize = key.parse().map_err(|_| {
                        err(
                            "INVALID_SCHEMA",
                            "Array index in JSON pointer must be numeric",
                        )
                    })?;
                    if idx >= arr.len() {
                        return Err(err(
                            "INVALID_SCHEMA",
                            "JSON pointer array index out of range",
                        ));
                    }
                    arr[idx] = value;
                    return Ok(());
                }
                _ => {
                    return Err(err(
                        "INVALID_SCHEMA",
                        "JSON pointer parent is neither object nor array",
                    ));
                }
            }
        }
        cur = match cur {
            Value::Object(map) => map
                .get_mut(&key)
                .ok_or_else(|| err("INVALID_SCHEMA", format!("Missing object key {key}")))?,
            Value::Array(arr) => {
                let idx: usize = key.parse().map_err(|_| {
                    err(
                        "INVALID_SCHEMA",
                        "Array index in JSON pointer must be numeric",
                    )
                })?;
                arr.get_mut(idx)
                    .ok_or_else(|| err("INVALID_SCHEMA", "JSON pointer array index out of range"))?
            }
            _ => {
                return Err(err(
                    "INVALID_SCHEMA",
                    "JSON pointer parent is neither object nor array",
                ));
            }
        };
    }
    Err(err("INVALID_SCHEMA", "JSON pointer application failed"))
}
