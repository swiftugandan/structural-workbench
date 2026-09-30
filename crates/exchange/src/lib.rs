//! Model exchange (exchange-v1, ADR 0025, `docs/formulations/exchange.md`):
//! project JSON, IFC4 structural analysis models and DXF wireframes.
//!
//! Import is two pure steps on the same file: `read` states what the file
//! holds, what cannot be represented and which decisions are needed;
//! `commit` applies a mapping (the answers) and yields a validated project.
//! The browser's conversion review and the CLI's mapping manifest are the
//! same data, so batch and interactive imports agree by construction.
pub mod dxf;
pub mod guid;
pub mod ifc_read;
pub mod ifc_write;
pub mod review;
pub mod step;
pub mod units;

use review::{Answers, LossEntry, Mapping, ReadReport, Source};
use serde::Serialize;
use serde_json::{Value, json};
use workbench_model::{Project, Result, err};

pub const EXCHANGE_VERSION: &str = "exchange-v1";
/// Largest source file accepted, in bytes.
pub const MAX_BYTES: usize = 64 * 1024 * 1024;

pub fn import(s: &str) -> Result<Project> {
    Project::parse(s)
}
pub fn export(p: &Project) -> String {
    serde_json::to_string_pretty(p).expect("validated model")
}

/// The workbench default member orientation: local y along global Y, or
/// global −X for a member along Y (local z then stays upward for
/// horizontal members).
pub fn default_local_y(x: [f64; 3]) -> [f64; 3] {
    if x[1].abs() > 1. - 1e-9 {
        [-1., 0., 0.]
    } else {
        [0., 1., 0.]
    }
}

fn source(format: &str, file_name: &str, text: &str) -> Result<Source> {
    if text.len() > MAX_BYTES {
        return Err(err(
            "MEMORY_LIMIT",
            format!(
                "Source files are limited to {} MiB",
                MAX_BYTES / 1024 / 1024
            ),
        ));
    }
    Ok(Source {
        format: format.into(),
        file_name: file_name.chars().take(256).collect(),
        sha256: workbench_model::digest(text.as_bytes()),
        bytes: text.len(),
        schema: String::new(),
    })
}

enum Planned {
    Ifc(Box<ifc_read::Plan>),
    Dxf(dxf::Plan),
}

impl Planned {
    fn report(&self) -> &ReadReport {
        match self {
            Planned::Ifc(p) => &p.report,
            Planned::Dxf(p) => &p.report,
        }
    }
}

fn plan(format: &str, file_name: &str, text: &str, model: Option<&str>) -> Result<Planned> {
    let mut src = source(format, file_name, text)?;
    match format {
        "ifc" => {
            let file = step::parse(text)?;
            src.schema = file.schemas.join(",");
            Ok(Planned::Ifc(Box::new(ifc_read::plan(&file, src, model)?)))
        }
        "dxf" => Ok(Planned::Dxf(dxf::plan(text, src)?)),
        other => Err(err(
            "UNSUPPORTED_FEATURE",
            format!("Unknown exchange format '{other}' (ifc or dxf)"),
        )),
    }
}

/// What the file holds and what it needs decided.
pub fn read(format: &str, file_name: &str, text: &str) -> Result<ReadReport> {
    Ok(plan(format, file_name, text, None)?.report().clone())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionRecord {
    pub exchange: &'static str,
    pub source: Source,
    pub units: Vec<review::UnitRecord>,
    pub mapping: Mapping,
    pub ledger: Vec<LossEntry>,
    pub project_hash: String,
}

/// Apply a mapping and produce a validated project with its conversion
/// record. Refused when anything blocks the import or a decision is
/// unanswered.
pub fn commit(
    format: &str,
    file_name: &str,
    text: &str,
    mapping: &Value,
) -> Result<(Project, ConversionRecord)> {
    // Blocking content refuses the import whatever the mapping says.
    let refuse = |report: &ReadReport| -> Result<()> {
        let Some(first) = report.blocking.first() else {
            return Ok(());
        };
        let mut d = first.clone();
        d.message = format!(
            "{} ({} blocking item(s) in total; see the conversion review)",
            d.message,
            report.blocking.len()
        );
        d.details = json!({"blocking": report.blocking});
        Err(d)
    };
    let mut planned = plan(format, file_name, text, None)?;
    refuse(planned.report())?;
    let mapping = Mapping::parse(mapping)?;
    if let Some(model) = mapping.answers.get("model") {
        planned = plan(format, file_name, text, Some(&model.choice))?;
    }
    let report = planned.report().clone();
    refuse(&report)?;
    let answers = Answers::check(&report.decisions, &mapping, &report.source.sha256)?;
    let (project, ledger) = match &planned {
        Planned::Ifc(p) => {
            let b = ifc_read::build(p, &answers)?;
            (b.project, b.ledger)
        }
        Planned::Dxf(p) => dxf::build(p, &answers)?,
    };
    let record = ConversionRecord {
        exchange: EXCHANGE_VERSION,
        project_hash: project.hash(),
        source: report.source.clone(),
        units: report.units.clone(),
        mapping,
        ledger,
    };
    Ok((project, record))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Exported {
    pub file_name: String,
    pub media_type: &'static str,
    pub text: String,
    pub sha256: String,
    pub ledger: Vec<LossEntry>,
    pub project_hash: String,
}

/// Write the project as IFC4 or DXF with the ledger of what the file cannot
/// carry. `timestamp` goes into the IFC header only.
pub fn export_as(p: &Project, format: &str, timestamp: &str) -> Result<Exported> {
    p.validate()?;
    // Canonical order and labels, so the file depends only on the model.
    let mut canonical = p.clone();
    canonical.canonicalise();
    let p = &canonical;
    let stem: String = p
        .name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let stem = if stem.is_empty() { p.id.clone() } else { stem };
    let (file_name, media_type, text, ledger) = match format {
        "ifc" => {
            let name = format!("{stem}.ifc");
            let w = ifc_write::write(p, &name, timestamp);
            (name, "application/x-step", w.text, w.ledger)
        }
        "dxf" => {
            let (t, l) = dxf::write(p);
            (format!("{stem}.dxf"), "image/vnd.dxf", t, l)
        }
        other => {
            return Err(err(
                "UNSUPPORTED_FEATURE",
                format!("Unknown exchange format '{other}' (ifc or dxf)"),
            ));
        }
    };
    Ok(Exported {
        sha256: workbench_model::digest(text.as_bytes()),
        file_name,
        media_type,
        text,
        ledger: ledger.entries(),
        project_hash: p.hash(),
    })
}
