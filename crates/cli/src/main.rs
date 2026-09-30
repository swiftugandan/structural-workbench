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
        Some("reference-residential") => match workbench_model::residential_reference() {
            Ok(p) => {
                println!("{}", serde_json::to_string_pretty(&p).unwrap());
                0
            }
            Err(e) => {
                eprintln!("{e:?}");
                1
            }
        },
        Some("residential-review") => {
            let result = args
                .get(2)
                .ok_or_else(|| err("INVALID_SCHEMA", "project path required"))
                .and_then(|path| {
                    fs::read_to_string(path).map_err(|e| err("INVALID_SCHEMA", e.to_string()))
                })
                .and_then(|s| Project::parse(&s))
                .and_then(|p| workbench_assembly::residential_review(&p));
            match result {
                Ok(v) => {
                    println!("{}", serde_json::to_string_pretty(&v).unwrap());
                    0
                }
                Err(e) => {
                    eprintln!("{e:?}");
                    1
                }
            }
        }
        Some("study") => run_study(args.get(2).map(String::as_str)),
        Some("exchange") => run_exchange(&args[2..]),
        Some(path) if !path.starts_with('-') => {
            run_analyse(path, args.get(2).map(String::as_str).unwrap_or("LC1"))
        }
        _ => {
            eprintln!(
                "usage:\n  workbench-cli <project.json> [caseId]\n  workbench-cli study <study.json>\n  workbench-cli exchange read <file.ifc|file.dxf>\n  workbench-cli exchange import <file.ifc|file.dxf> <mapping.json> <project-out.json> [record-out.json]\n  workbench-cli exchange export <project.json> <out.ifc|out.dxf>"
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

/// exchange-v1 (ADR 0025): the same read/commit/export core as the browser.
/// Batch imports need an explicit mapping manifest; nothing is defaulted.
fn run_exchange(args: &[String]) -> i32 {
    let format_of = |path: &str| -> Result<&'static str> {
        match Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref()
        {
            Some("ifc") => Ok("ifc"),
            Some("dxf") => Ok("dxf"),
            _ => Err(err(
                "UNSUPPORTED_FEATURE",
                "Exchange files must end in .ifc or .dxf",
            )),
        }
    };
    let read = |path: &str| {
        fs::read_to_string(path)
            .map_err(|e| err("INVALID_SCHEMA", &format!("Unable to read {path}: {e}")))
    };
    let write = |path: &str, text: &str| {
        fs::write(path, text)
            .map_err(|e| err("INVALID_SCHEMA", &format!("Unable to write {path}: {e}")))
    };
    let name = |path: &str| {
        Path::new(path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(path)
            .to_string()
    };
    let result: Result<Value> = match args
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .as_slice()
    {
        ["read", file] => format_of(file)
            .and_then(|f| workbench_exchange::read(f, &name(file), &read(file)?))
            .map(|r| serde_json::to_value(r).unwrap()),
        ["import", file, mapping, out, rest @ ..] if rest.len() <= 1 => (|| {
            let mapping: Value = serde_json::from_str(&read(mapping)?)
                .map_err(|e| err("INVALID_MAPPING", &format!("Mapping JSON: {e}")))?;
            let (project, record) =
                workbench_exchange::commit(format_of(file)?, &name(file), &read(file)?, &mapping)?;
            write(out, &serde_json::to_string_pretty(&project).unwrap())?;
            let record = serde_json::to_value(record).unwrap();
            if let Some(path) = rest.first() {
                write(path, &serde_json::to_string_pretty(&record).unwrap())?;
            }
            Ok(json!({"status":"ok","projectHash":project.hash(),"ledger":record["ledger"]}))
        })(),
        ["export", project, out] => (|| {
            let p = Project::parse(&read(project)?)?;
            let timestamp = env::var("SOURCE_DATE_EPOCH")
                .ok()
                .and_then(|s| s.parse::<u64>().ok())
                .map_or_else(now_iso8601, iso8601);
            let e = workbench_exchange::export_as(&p, format_of(out)?, &timestamp)?;
            write(out, &e.text)?;
            Ok(
                json!({"status":"ok","sha256":e.sha256,"projectHash":e.project_hash,"ledger":e.ledger}),
            )
        })(),
        _ => {
            eprintln!("usage: workbench-cli exchange read|import|export ...");
            return 2;
        }
    };
    match result {
        Ok(v) => {
            println!("{}", serde_json::to_string_pretty(&v).unwrap());
            0
        }
        Err(d) => {
            println!("{}", json!({"status":"error","diagnostics":[d]}));
            1
        }
    }
}

fn now_iso8601() -> String {
    iso8601(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_secs()),
    )
}

/// UTC ISO 8601 from Unix seconds (civil-from-days, proleptic Gregorian).
fn iso8601(secs: u64) -> String {
    let (days, rem) = ((secs / 86400) as i64, secs % 86400);
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
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
    let study_text = fs::read_to_string(study_path)
        .map_err(|e| err("INVALID_SCHEMA", &format!("Unable to read study: {e}")))?;
    let study: Value = serde_json::from_str(&study_text)
        .map_err(|e| err("INVALID_SCHEMA", &format!("Study JSON parse failed: {e}")))?;
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
    fn batch_exchange_import_needs_an_explicit_mapping() {
        let root = workspace_root();
        let dir = std::env::temp_dir().join(format!("workbench-exchange-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let ifc = root.join("fixtures/exchange/X-FEET-KIP.ifc");
        let oracle: Value = serde_json::from_str(
            &fs::read_to_string(root.join("fixtures/exchange/exchange-oracle.json")).unwrap(),
        )
        .unwrap();
        let entry = oracle["corpus"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| e["file"] == "X-FEET-KIP.ifc")
            .unwrap();
        let s = |p: &Path| p.to_string_lossy().to_string();
        // Without answers: refused, nothing written.
        let empty = dir.join("empty.json");
        fs::write(&empty, json!({"format":"workbench-exchange-mapping-v1","sourceSha256":entry["sha256"],"answers":{}}).to_string()).unwrap();
        let out = dir.join("project.json");
        assert_eq!(
            run_exchange(&["import".into(), s(&ifc), s(&empty), s(&out)]),
            1
        );
        assert!(!out.exists());
        // With the manifest: the project and the conversion record.
        let manifest = dir.join("mapping.json");
        fs::write(&manifest, json!({"format":"workbench-exchange-mapping-v1","sourceSha256":entry["sha256"],"answers":entry["mapping"]}).to_string()).unwrap();
        let record = dir.join("record.json");
        assert_eq!(
            run_exchange(&["import".into(), s(&ifc), s(&manifest), s(&out), s(&record)]),
            0
        );
        let p = Project::parse(&fs::read_to_string(&out).unwrap()).unwrap();
        assert_eq!(p.members.len(), 3);
        let r: Value = serde_json::from_str(&fs::read_to_string(&record).unwrap()).unwrap();
        assert_eq!(r["projectHash"], p.hash());
        assert_eq!(r["mapping"]["answers"], entry["mapping"]);
        // Export both formats from the imported project.
        assert_eq!(
            run_exchange(&["export".into(), s(&out), s(&dir.join("x.ifc"))]),
            0
        );
        assert_eq!(
            run_exchange(&["export".into(), s(&out), s(&dir.join("x.dxf"))]),
            0
        );
        assert_eq!(run_exchange(&["read".into(), s(&dir.join("x.ifc"))]), 0);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn iso8601_matches_known_instants() {
        assert_eq!(iso8601(0), "1970-01-01T00:00:00");
        assert_eq!(iso8601(951782400), "2000-02-29T00:00:00");
        assert_eq!(iso8601(1790000000), "2026-09-21T14:13:20");
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
