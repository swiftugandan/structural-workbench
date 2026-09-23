//! Declarative study runner: bounded parameter sweep on validated project snapshots.
use serde_json::{Value, json};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use workbench_assembly::analyse;
use workbench_model::{Project, Result, err};

fn main() {
    let args: Vec<_> = env::args().collect();
    let code = match args.get(1).map(String::as_str) {
        Some("study") => run_study(args.get(2).map(String::as_str)),
        Some(path) if !path.starts_with('-') && args.get(2).map(|s| s.as_str()) != Some("study") => {
            // Backward-compatible: workbench-cli <project.json> [caseId]
            run_analyse(path, args.get(2).map(String::as_str).unwrap_or("LC1"))
        }
        _ => {
            eprintln!(
                "usage:\n  workbench-cli <project.json> [caseId]\n  workbench-cli study <study.json>"
            );
            2
        }
    };
    std::process::exit(code);
}

fn run_analyse(path: &str, case: &str) -> i32 {
    let input = fs::read_to_string(path).unwrap_or_else(|e| {
        eprintln!("{e}");
        std::process::exit(1);
    });
    match Project::parse(&input).and_then(|p| analyse(&p, case)) {
        Ok(r) => {
            println!("{}", serde_json::to_string(&r).unwrap());
            0
        }
        Err(d) => {
            println!("{}", json!({"status":"error","diagnostics":[d]}));
            1
        }
    }
}

fn run_study(path: Option<&str>) -> i32 {
    let Some(path) = path else {
        eprintln!("study path required");
        return 2;
    };
    match execute_study(Path::new(path)) {
        Ok(report) => {
            println!("{}", serde_json::to_string_pretty(&report).unwrap());
            0
        }
        Err(d) => {
            println!("{}", json!({"status":"error","diagnostics":[d]}));
            1
        }
    }
}

fn execute_study(study_path: &Path) -> Result<Value> {
    let study_text = fs::read_to_string(study_path).map_err(|e| {
        err(
            "INVALID_SCHEMA",
            &format!("Unable to read study: {e}"),
        )
    })?;
    let study: Value = serde_json::from_str(&study_text).map_err(|e| {
        err(
            "INVALID_SCHEMA",
            &format!("Study JSON parse failed: {e}"),
        )
    })?;
    if study["schemaVersion"] != "1.0.0" {
        return Err(err(
            "UNSUPPORTED_SCHEMA",
            "Study schemaVersion must be 1.0.0",
        ));
    }
    let base_rel = study["baseProject"]
        .as_str()
        .ok_or_else(|| err("INVALID_SCHEMA", "baseProject required"))?;
    let case_id = study["caseId"].as_str().unwrap_or("LC1");
    let base_path = resolve_from(study_path, base_rel);
    let base_text = fs::read_to_string(&base_path).map_err(|e| {
        err(
            "INVALID_SCHEMA",
            &format!("Unable to read base project {}: {e}", base_path.display()),
        )
    })?;
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
        let mut project_json: Value = serde_json::from_str(&base_text).map_err(|e| {
            err(
                "INVALID_SCHEMA",
                &format!("Base project JSON parse failed: {e}"),
            )
        })?;
        // Studies may only mutate declared paths — never inject solver overrides.
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

    // Distinct stiffness variants must not share a model hash.
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
        "baseProject": base_rel,
        "caseId": case_id,
        "variantCount": rows.len(),
        "variants": rows
    }))
}

fn resolve_from(study_path: &Path, rel: &str) -> PathBuf {
    if Path::new(rel).is_absolute() {
        return PathBuf::from(rel);
    }
    let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let from_cwd = cwd.join(rel);
    if from_cwd.exists() {
        return from_cwd;
    }
    let from_study = study_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(rel);
    if from_study.exists() {
        return from_study;
    }
    // Workspace-root relative when invoked from a crate subdirectory.
    let from_workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..").join(rel);
    if from_workspace.exists() {
        return from_workspace;
    }
    from_study
}

fn apply_pointer(root: &mut Value, pointer: &str, value: Value) -> Result<()> {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn workspace_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .expect("workspace root")
    }

    #[test]
    fn s22_e_sweep_changes_hash_and_tip() {
        let study = workspace_root().join("fixtures/studies/S22-E.json");
        let report = execute_study(&study).expect("study");
        assert_eq!(report["status"], "ok");
        assert_eq!(report["variantCount"], 2);
        let a = &report["variants"][0];
        let b = &report["variants"][1];
        assert_ne!(a["modelHash"], b["modelHash"]);
        let ua = a["observed"]["value"].as_f64().unwrap();
        let ub = b["observed"]["value"].as_f64().unwrap();
        // Higher E → smaller |uz| for the same load.
        assert!(ub.abs() < ua.abs(), "uz {ua} vs {ub}");
    }
}
