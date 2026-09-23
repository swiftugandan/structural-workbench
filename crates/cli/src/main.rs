//! Declarative study runner: bounded parameter sweep on validated project snapshots.
use serde_json::{Value, json};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use workbench_assembly::{analyse, execute_study_document};
use workbench_model::{Project, Result, err};

fn main() {
    let args: Vec<_> = env::args().collect();
    let code = match args.get(1).map(String::as_str) {
        Some("study") => run_study(args.get(2).map(String::as_str)),
        Some(path) if !path.starts_with('-') && args.get(2).map(|s| s.as_str()) != Some("study") => {
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
    match execute_study_file(Path::new(path)) {
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

fn execute_study_file(study_path: &Path) -> Result<Value> {
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
    let base_rel = study["baseProject"]
        .as_str()
        .ok_or_else(|| err("INVALID_SCHEMA", "baseProject required"))?;
    let base_path = resolve_from(study_path, base_rel);
    let base_text = fs::read_to_string(&base_path).map_err(|e| {
        err(
            "INVALID_SCHEMA",
            &format!("Unable to read base project {}: {e}", base_path.display()),
        )
    })?;
    let mut report = execute_study_document(&study, &base_text)?;
    if let Some(obj) = report.as_object_mut() {
        obj.insert("baseProject".into(), json!(base_rel));
    }
    Ok(report)
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
    let from_workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join(rel);
    if from_workspace.exists() {
        return from_workspace;
    }
    from_study
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
        let report = execute_study_file(&study).expect("study");
        assert_eq!(report["status"], "ok");
        assert_eq!(report["variantCount"], 2);
        let a = &report["variants"][0];
        let b = &report["variants"][1];
        assert_ne!(a["modelHash"], b["modelHash"]);
        let ua = a["observed"]["value"].as_f64().unwrap();
        let ub = b["observed"]["value"].as_f64().unwrap();
        assert!(ub.abs() < ua.abs(), "uz {ua} vs {ub}");
    }
}
