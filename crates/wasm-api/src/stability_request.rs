//! `analyse` payload parsing for the stability-v1 analysis types (ADR 0017).
//! Ranges are validated by the assembly functions; this layer rejects shapes
//! it does not understand rather than guessing.

use serde_json::Value;
use workbench_assembly::{Imperfection, SecondOrderSettings, StabilitySettings};
use workbench_model::{Result, err};

pub enum AnalysisKind {
    LinearStatic,
    ElasticBuckling(StabilitySettings),
    SecondOrder(SecondOrderSettings),
}

fn schema(message: impl Into<String>) -> workbench_model::Diagnostic {
    err("INVALID_SCHEMA", message)
}

fn only_keys(v: &Value, allowed: &[&str], what: &str) -> Result<()> {
    let object = v
        .as_object()
        .ok_or_else(|| schema(format!("{what} must be an object")))?;
    if let Some(k) = object.keys().find(|k| !allowed.contains(&k.as_str())) {
        return Err(schema(format!("Unknown {what} field `{k}`")));
    }
    Ok(())
}

fn count(v: &Value, key: &str, default: usize) -> Result<usize> {
    match v.get(key) {
        None => Ok(default),
        Some(x) => x
            .as_u64()
            .map(|n| n as usize)
            .ok_or_else(|| schema(format!("stability.{key} must be a non-negative integer"))),
    }
}

fn imperfection(v: Option<&Value>) -> Result<Imperfection> {
    let v = v.ok_or_else(|| {
        schema("secondOrder requires stability.imperfection: {kind:\"none\"} or {kind:\"sway\",ratio,direction}")
    })?;
    match v.get("kind").and_then(Value::as_str) {
        Some("none") => {
            only_keys(v, &["kind"], "stability.imperfection")?;
            Ok(Imperfection::None)
        }
        Some("sway") => {
            only_keys(v, &["kind", "ratio", "direction"], "stability.imperfection")?;
            let ratio = v["ratio"]
                .as_f64()
                .ok_or_else(|| schema("stability.imperfection.ratio must be a number"))?;
            let direction = v["direction"]
                .as_array()
                .filter(|a| a.len() == 2)
                .and_then(|a| Some([a[0].as_f64()?, a[1].as_f64()?]))
                .ok_or_else(|| schema("stability.imperfection.direction must be [x, y]"))?;
            Ok(Imperfection::Sway { ratio, direction })
        }
        _ => Err(schema(
            "stability.imperfection.kind must be \"none\" or \"sway\"",
        )),
    }
}

pub fn parse(payload: &Value) -> Result<AnalysisKind> {
    let kind = match payload.get("analysisType") {
        None => "linearStatic",
        Some(v) => v
            .as_str()
            .ok_or_else(|| schema("analysisType must be a string"))?,
    };
    let stability = payload.get("stability");
    match kind {
        "linearStatic" => {
            if stability.is_some() {
                return Err(schema(
                    "stability settings apply only to elasticBuckling or secondOrder",
                ));
            }
            Ok(AnalysisKind::LinearStatic)
        }
        "elasticBuckling" => {
            let empty = Value::Object(Default::default());
            let s = stability.unwrap_or(&empty);
            only_keys(s, &["subdivisions", "modes"], "stability")?;
            let defaults = StabilitySettings::default();
            Ok(AnalysisKind::ElasticBuckling(StabilitySettings {
                subdivisions: count(s, "subdivisions", defaults.subdivisions)?,
                modes: count(s, "modes", defaults.modes)?,
            }))
        }
        "secondOrder" => {
            let s = stability.ok_or_else(|| {
                schema("secondOrder requires stability settings with an explicit imperfection")
            })?;
            only_keys(s, &["subdivisions", "imperfection"], "stability")?;
            Ok(AnalysisKind::SecondOrder(SecondOrderSettings {
                subdivisions: count(s, "subdivisions", StabilitySettings::default().subdivisions)?,
                imperfection: imperfection(s.get("imperfection"))?,
            }))
        }
        other => Err(schema(format!(
            "Unknown analysisType `{other}`; supported: linearStatic, elasticBuckling, secondOrder"
        ))),
    }
}
