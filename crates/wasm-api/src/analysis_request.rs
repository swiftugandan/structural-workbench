//! `analyse` payload parsing for every analysis type: linear static, the
//! stability-v1 types (ADR 0017) and modal (dynamics-v1, ADR 0018). Ranges are
//! validated by the assembly functions; this layer rejects shapes it does not
//! understand rather than guessing.

use serde_json::Value;
use workbench_assembly::{
    Combination, Damping, HarmonicSettings, Imperfection, MassMatrix, ModalSettings,
    SecondOrderSettings, SpectrumSettings, StabilitySettings,
};
use workbench_model::{Result, err};

pub enum AnalysisKind {
    LinearStatic,
    ElasticBuckling(StabilitySettings),
    SecondOrder(SecondOrderSettings),
    Modal(ModalSettings),
    Harmonic(HarmonicSettings),
    ResponseSpectrum(SpectrumSettings),
}

impl AnalysisKind {
    /// Whether the analysis takes one real case or combination (all but
    /// modal, which takes none; linear static also accepts several).
    pub fn takes_cases(&self) -> bool {
        !matches!(self, Self::Modal(_) | Self::ResponseSpectrum(_))
    }
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

fn count(v: &Value, key: &str, default: usize, what: &str) -> Result<usize> {
    match v.get(key) {
        None => Ok(default),
        Some(x) => x
            .as_u64()
            .map(|n| n as usize)
            .ok_or_else(|| schema(format!("{what}.{key} must be a non-negative integer"))),
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
    for (key, owner) in [
        ("modal", "modal"),
        ("harmonic", "harmonic"),
        ("responseSpectrum", "responseSpectrum"),
    ] {
        if kind != owner && payload.get(key).is_some() {
            return Err(schema(format!(
                "{key} settings apply only to {owner} analysis"
            )));
        }
    }
    if ["harmonic", "responseSpectrum"].contains(&kind) && stability.is_some() {
        return Err(schema(format!(
            "stability settings do not apply to {kind} analysis"
        )));
    }
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
                subdivisions: count(s, "subdivisions", defaults.subdivisions, "stability")?,
                modes: count(s, "modes", defaults.modes, "stability")?,
            }))
        }
        "secondOrder" => {
            let s = stability.ok_or_else(|| {
                schema("secondOrder requires stability settings with an explicit imperfection")
            })?;
            only_keys(s, &["subdivisions", "imperfection"], "stability")?;
            Ok(AnalysisKind::SecondOrder(SecondOrderSettings {
                subdivisions: count(
                    s,
                    "subdivisions",
                    StabilitySettings::default().subdivisions,
                    "stability",
                )?,
                imperfection: imperfection(s.get("imperfection"))?,
            }))
        }
        "modal" => {
            if stability.is_some() {
                return Err(schema("stability settings do not apply to modal analysis"));
            }
            let empty = Value::Object(Default::default());
            let s = payload.get("modal").unwrap_or(&empty);
            only_keys(
                s,
                &["modes", "massMatrix", "subdivisions", "participationTarget"],
                "modal",
            )?;
            let defaults = ModalSettings::default();
            let mass_matrix = match s.get("massMatrix") {
                None => defaults.mass_matrix,
                Some(v) => match v.as_str() {
                    Some("consistent") => MassMatrix::Consistent,
                    Some("lumped") => MassMatrix::Lumped,
                    _ => {
                        return Err(schema(
                            "modal.massMatrix must be \"consistent\" or \"lumped\"",
                        ));
                    }
                },
            };
            let participation_target = match s.get("participationTarget") {
                None => defaults.participation_target,
                Some(v) => v
                    .as_f64()
                    .ok_or_else(|| schema("modal.participationTarget must be a number"))?,
            };
            Ok(AnalysisKind::Modal(ModalSettings {
                modes: count(s, "modes", defaults.modes, "modal")?,
                mass_matrix,
                subdivisions: count(s, "subdivisions", defaults.subdivisions, "modal")?,
                participation_target,
            }))
        }
        "harmonic" => Ok(AnalysisKind::Harmonic(harmonic(payload.get("harmonic"))?)),
        "responseSpectrum" => Ok(AnalysisKind::ResponseSpectrum(spectrum(
            payload.get("responseSpectrum"),
        )?)),
        other => Err(schema(format!(
            "Unknown analysisType `{other}`; supported: linearStatic, elasticBuckling, secondOrder, modal, harmonic, responseSpectrum"
        ))),
    }
}

fn number(v: &Value, key: &str, what: &str) -> Result<f64> {
    v.get(key)
        .and_then(Value::as_f64)
        .ok_or_else(|| schema(format!("{what}.{key} must be a number")))
}

fn mass_matrix(v: &Value, what: &str) -> Result<MassMatrix> {
    match v.get("massMatrix") {
        None => Ok(MassMatrix::Consistent),
        Some(x) => match x.as_str() {
            Some("consistent") => Ok(MassMatrix::Consistent),
            Some("lumped") => Ok(MassMatrix::Lumped),
            _ => Err(schema(format!(
                "{what}.massMatrix must be \"consistent\" or \"lumped\""
            ))),
        },
    }
}

/// `harmonic: {frequencies | sweep, damping, massMatrix?, subdivisions?}`.
/// A sweep `{from, to, count, spacing: linear|log}` is expanded here, so the
/// kernel always receives explicit frequencies.
fn harmonic(v: Option<&Value>) -> Result<HarmonicSettings> {
    let v = v.ok_or_else(|| {
        schema("harmonic requires settings with frequencies or a sweep, and damping")
    })?;
    only_keys(
        v,
        &[
            "frequencies",
            "sweep",
            "damping",
            "massMatrix",
            "subdivisions",
        ],
        "harmonic",
    )?;
    let frequencies = match (v.get("frequencies"), v.get("sweep")) {
        (Some(list), None) => list
            .as_array()
            .ok_or_else(|| schema("harmonic.frequencies must be an array of numbers"))?
            .iter()
            .map(|x| {
                x.as_f64()
                    .ok_or_else(|| schema("harmonic.frequencies must be an array of numbers"))
            })
            .collect::<Result<Vec<f64>>>()?,
        (None, Some(s)) => {
            only_keys(s, &["from", "to", "count", "spacing"], "harmonic.sweep")?;
            let (from, to) = (
                number(s, "from", "harmonic.sweep")?,
                number(s, "to", "harmonic.sweep")?,
            );
            let count = count(s, "count", 0, "harmonic.sweep")?;
            let log = match s.get("spacing").and_then(Value::as_str) {
                Some("linear") | None => false,
                Some("log") => true,
                _ => {
                    return Err(schema(
                        "harmonic.sweep.spacing must be \"linear\" or \"log\"",
                    ));
                }
            };
            if !(from > 0. && to > from && to.is_finite()) || !(2..=200).contains(&count) {
                return Err(workbench_model::err(
                    "INVALID_SETTINGS",
                    "A sweep needs 0 < from < to and 2–200 frequencies",
                ));
            }
            (0..count)
                .map(|k| {
                    let t = k as f64 / (count - 1) as f64;
                    if log {
                        from * (to / from).powf(t)
                    } else {
                        from + (to - from) * t
                    }
                })
                .collect()
        }
        _ => {
            return Err(schema("harmonic takes exactly one of frequencies or sweep"));
        }
    };
    let d = v
        .get("damping")
        .ok_or_else(|| schema("harmonic.damping is required: {ratio, frequencies} or {a0, a1}"))?;
    let damping = if d.get("ratio").is_some() {
        only_keys(d, &["ratio", "frequencies"], "harmonic.damping")?;
        let pair = d
            .get("frequencies")
            .and_then(Value::as_array)
            .filter(|a| a.len() == 2)
            .and_then(|a| Some([a[0].as_f64()?, a[1].as_f64()?]))
            .ok_or_else(|| schema("harmonic.damping.frequencies must be [f1, f2]"))?;
        Damping::Ratio {
            ratio: number(d, "ratio", "harmonic.damping")?,
            frequencies: pair,
        }
    } else {
        only_keys(d, &["a0", "a1"], "harmonic.damping")?;
        Damping::Coefficients {
            a0: number(d, "a0", "harmonic.damping")?,
            a1: number(d, "a1", "harmonic.damping")?,
        }
    };
    Ok(HarmonicSettings {
        frequencies,
        damping,
        mass_matrix: mass_matrix(v, "harmonic")?,
        subdivisions: count(
            v,
            "subdivisions",
            ModalSettings::default().subdivisions,
            "harmonic",
        )?,
    })
}

/// `responseSpectrum: {spectrumId, direction, scale?, combination?, modes?,
/// massMatrix?, subdivisions?, participationTarget?}`.
fn spectrum(v: Option<&Value>) -> Result<SpectrumSettings> {
    let v = v.ok_or_else(|| {
        schema("responseSpectrum requires settings with a spectrumId and a direction")
    })?;
    only_keys(
        v,
        &[
            "spectrumId",
            "direction",
            "scale",
            "combination",
            "modes",
            "massMatrix",
            "subdivisions",
            "participationTarget",
        ],
        "responseSpectrum",
    )?;
    let defaults = ModalSettings::default();
    let direction = match v.get("direction").and_then(Value::as_str) {
        Some("X") => 0,
        Some("Y") => 1,
        Some("Z") => 2,
        _ => {
            return Err(schema(
                "responseSpectrum.direction must be \"X\", \"Y\" or \"Z\"",
            ));
        }
    };
    let combination = match v.get("combination").and_then(Value::as_str) {
        None | Some("cqc") => Combination::Cqc,
        Some("srss") => Combination::Srss,
        _ => {
            return Err(schema(
                "responseSpectrum.combination must be \"srss\" or \"cqc\"",
            ));
        }
    };
    Ok(SpectrumSettings {
        spectrum: v
            .get("spectrumId")
            .and_then(Value::as_str)
            .ok_or_else(|| schema("responseSpectrum.spectrumId must be a string"))?
            .into(),
        direction,
        scale: match v.get("scale") {
            None => 1.,
            Some(_) => number(v, "scale", "responseSpectrum")?,
        },
        combination,
        modes: count(v, "modes", defaults.modes, "responseSpectrum")?,
        mass_matrix: mass_matrix(v, "responseSpectrum")?,
        subdivisions: count(v, "subdivisions", defaults.subdivisions, "responseSpectrum")?,
        participation_target: match v.get("participationTarget") {
            None => defaults.participation_target,
            Some(_) => number(v, "participationTarget", "responseSpectrum")?,
        },
    })
}
