//! Declarative study sweeps on validated project snapshots.
use serde_json::{Value, json};
use workbench_model::{Project, Result, err};

use crate::analyse;

/// Run a schemaVersion 1.0.0 study document against an already-loaded base project JSON text.
pub fn execute_study_document(study: &Value, base_project_text: &str) -> Result<Value> {
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
    if variants.is_empty() || variants.len() > 50 {
        return Err(err(
            "INVALID_SCHEMA",
            "variants must contain 1–50 entries",
        ));
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

    let mut rows = Vec::new();
    for variant in variants {
        let id = variant["id"]
            .as_str()
            .ok_or_else(|| err("INVALID_SCHEMA", "variant.id required"))?;
        let mut project_json: Value = serde_json::from_str(base_project_text).map_err(|e| {
            err(
                "INVALID_SCHEMA",
                &format!("Base project JSON parse failed: {e}"),
            )
        })?;
        if project_json.get("solverOverride").is_some() {
            return Err(err(
                "UNSUPPORTED_FEATURE",
                "solverOverride is not permitted in study base projects",
            ));
        }
        let sets = variant["set"]
            .as_array()
            .ok_or_else(|| err("INVALID_SCHEMA", "variant.set array required"))?;
        for op in sets {
            let path = op["path"]
                .as_str()
                .ok_or_else(|| err("INVALID_SCHEMA", "set.path required"))?;
            let value = op
                .get("value")
                .ok_or_else(|| err("INVALID_SCHEMA", "set.value required"))?;
            apply_pointer(&mut project_json, path, value.clone())?;
        }
        if project_json.get("solverOverride").is_some() {
            return Err(err(
                "UNSUPPORTED_FEATURE",
                "Study steps may not introduce solverOverride",
            ));
        }
        let text = serde_json::to_string(&project_json).unwrap();
        let project = Project::parse(&text)?;
        project.validate()?;
        let analysis = analyse(&project, case_id)?;
        let tip = observe_node.and_then(|nid| {
            analysis
                .node_ids
                .iter()
                .position(|id| id == nid)
                .map(|i| analysis.node_displacements[i * 6 + dof_index])
        });
        rows.push(json!({
            "variantId": id,
            "modelHash": analysis.model_hash,
            "resultId": analysis.result_id,
            "settingsHash": analysis.settings_hash,
            "observed": {
                "nodeId": observe_node,
                "dof": observe_dof,
                "value": tip
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
        "caseId": case_id,
        "variantCount": rows.len(),
        "variants": rows
    }))
}

pub fn apply_pointer(root: &mut Value, pointer: &str, value: Value) -> Result<()> {
    if !pointer.starts_with('/') {
        return Err(err(
            "INVALID_SCHEMA",
            "JSON pointer path must start with /",
        ));
    }
    let tokens: Vec<&str> = pointer.split('/').skip(1).filter(|t| !t.is_empty()).collect();
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
                        err("INVALID_SCHEMA", "Array index in JSON pointer must be numeric")
                    })?;
                    if idx >= arr.len() {
                        return Err(err("INVALID_SCHEMA", "JSON pointer array index out of range"));
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
                .ok_or_else(|| err("INVALID_SCHEMA", &format!("Missing object key {key}")))?,
            Value::Array(arr) => {
                let idx: usize = key.parse().map_err(|_| {
                    err("INVALID_SCHEMA", "Array index in JSON pointer must be numeric")
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
