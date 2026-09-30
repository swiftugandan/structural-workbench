//! The conversion review: what a file holds, what cannot be represented, the
//! decisions a user (or a mapping manifest) must make, and the answers.
use crate::units::Quantity;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use workbench_model::{Diagnostic, Result, err};

pub const MAPPING_FORMAT: &str = "workbench-exchange-mapping-v1";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Choice {
    pub value: String,
    pub label: String,
}

/// A number a `values` choice must supply, in SI.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Field {
    pub name: String,
    pub label: String,
    /// SI unit symbol, or "" for a ratio.
    pub unit: String,
    /// What the file provided, in SI, if anything.
    pub found: Option<f64>,
    pub rule: FieldRule,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum FieldRule {
    Positive,
    NonNegative,
    /// −1 < ν < 0.5
    PoissonRatio,
}

impl FieldRule {
    fn accepts(self, x: f64) -> bool {
        x.is_finite()
            && match self {
                FieldRule::Positive => x > 0.,
                FieldRule::NonNegative => x >= 0.,
                FieldRule::PoissonRatio => x > -1. && x < 0.5,
            }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Decision {
    pub id: String,
    pub kind: String,
    pub question: String,
    pub choices: Vec<Choice>,
    /// Required when the answer's choice is `values`.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub fields: Vec<Field>,
    /// File references (GUIDs, `#id`s, layer names) the decision affects.
    pub entities: Vec<String>,
}

impl Decision {
    pub fn choose(
        id: impl Into<String>,
        kind: &str,
        question: impl Into<String>,
        choices: &[(&str, &str)],
        entities: Vec<String>,
    ) -> Self {
        Decision {
            id: id.into(),
            kind: kind.into(),
            question: question.into(),
            choices: choices
                .iter()
                .map(|(v, l)| Choice {
                    value: (*v).into(),
                    label: (*l).into(),
                })
                .collect(),
            fields: vec![],
            entities,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Answer {
    pub choice: String,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub values: BTreeMap<String, f64>,
}

/// A mapping manifest: the answers to every decision for one source file.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Mapping {
    pub format: String,
    pub source_sha256: String,
    #[serde(default)]
    pub answers: BTreeMap<String, Answer>,
}

impl Mapping {
    pub fn parse(v: &Value) -> Result<Mapping> {
        let m: Mapping = serde_json::from_value(v.clone())
            .map_err(|e| err("INVALID_MAPPING", format!("Mapping manifest: {e}")))?;
        if m.format != MAPPING_FORMAT {
            return Err(err(
                "INVALID_MAPPING",
                format!("Mapping format must be {MAPPING_FORMAT}"),
            ));
        }
        Ok(m)
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LossEntry {
    /// `notImported`, `notExported`, `converted` or `skipped`.
    pub disposition: String,
    pub subject: String,
    pub count: usize,
    pub reason: String,
    pub examples: Vec<String>,
}

#[derive(Default, Debug)]
pub struct Ledger(BTreeMap<(String, String, String), (usize, Vec<String>)>);

impl Ledger {
    pub fn add(
        &mut self,
        disposition: &str,
        subject: &str,
        reason: &str,
        example: impl Into<String>,
    ) {
        let e = self
            .0
            .entry((disposition.into(), subject.into(), reason.into()))
            .or_default();
        e.0 += 1;
        let example = example.into();
        if e.1.len() < 5 && !example.is_empty() {
            e.1.push(example);
        }
    }
    pub fn extend(&mut self, x: &LossEntry) {
        let e = self
            .0
            .entry((x.disposition.clone(), x.subject.clone(), x.reason.clone()))
            .or_default();
        e.0 += x.count;
        for ex in &x.examples {
            if e.1.len() < 5 {
                e.1.push(ex.clone());
            }
        }
    }
    pub fn entries(&self) -> Vec<LossEntry> {
        self.0
            .iter()
            .map(
                |((disposition, subject, reason), (count, examples))| LossEntry {
                    disposition: disposition.clone(),
                    subject: subject.clone(),
                    count: *count,
                    reason: reason.clone(),
                    examples: examples.clone(),
                },
            )
            .collect()
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub format: String,
    pub file_name: String,
    pub sha256: String,
    pub bytes: usize,
    /// e.g. `IFC4` or `DXF AC1027`.
    pub schema: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnitRecord {
    pub quantity: Quantity,
    /// SI factor, when defined by the file.
    pub factor: Option<f64>,
    /// `assigned`, `header`, or `undefined`.
    pub source: String,
    pub label: String,
}

/// Everything the user reviews before accepting an import.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadReport {
    pub source: Source,
    pub units: Vec<UnitRecord>,
    pub counts: BTreeMap<String, usize>,
    pub decisions: Vec<Decision>,
    pub ledger: Vec<LossEntry>,
    /// Content that cannot be imported in any form; the import is refused.
    pub blocking: Vec<Diagnostic>,
}

/// Checks a mapping against the decisions and hands out answers.
pub struct Answers<'a> {
    map: &'a BTreeMap<String, Answer>,
    decisions: BTreeMap<String, &'a Decision>,
}

impl<'a> Answers<'a> {
    pub fn check(decisions: &'a [Decision], mapping: &'a Mapping, sha256: &str) -> Result<Self> {
        if mapping.source_sha256 != sha256 {
            return Err(err(
                "MAPPING_MISMATCH",
                "The mapping manifest was made for a different source file (SHA-256 differs)",
            ));
        }
        let by_id: BTreeMap<_, _> = decisions.iter().map(|d| (d.id.clone(), d)).collect();
        let unknown: Vec<_> = mapping
            .answers
            .keys()
            .filter(|k| !by_id.contains_key(*k))
            .cloned()
            .collect();
        if !unknown.is_empty() {
            return Err(with_entities(
                err(
                    "INVALID_MAPPING",
                    format!(
                        "The mapping answers decisions this file does not need: {}",
                        unknown.join(", ")
                    ),
                ),
                unknown,
            ));
        }
        let missing: Vec<_> = by_id
            .keys()
            .filter(|k| !mapping.answers.contains_key(*k))
            .cloned()
            .collect();
        if !missing.is_empty() {
            return Err(with_entities(
                err(
                    "DECISION_REQUIRED",
                    format!(
                        "{} conversion decision(s) are unanswered: {}",
                        missing.len(),
                        missing.join(", ")
                    ),
                ),
                missing,
            ));
        }
        for (id, a) in &mapping.answers {
            let d = by_id[id];
            if !d.choices.iter().any(|c| c.value == a.choice) {
                return Err(err(
                    "INVALID_MAPPING",
                    format!("{id}: '{}' is not one of the offered choices", a.choice),
                ));
            }
            let want: BTreeSet<&str> = if a.choice == "values" {
                d.fields.iter().map(|f| f.name.as_str()).collect()
            } else {
                BTreeSet::new()
            };
            let have: BTreeSet<&str> = a.values.keys().map(String::as_str).collect();
            if want != have {
                return Err(err(
                    "INVALID_MAPPING",
                    format!(
                        "{id}: the '{}' choice needs exactly the values [{}]",
                        a.choice,
                        want.into_iter().collect::<Vec<_>>().join(", ")
                    ),
                ));
            }
            for f in &d.fields {
                if let Some(&x) = a.values.get(&f.name) {
                    if !f.rule.accepts(x) {
                        return Err(err(
                            "INVALID_MAPPING",
                            format!("{id}: {} = {x} is not valid", f.label),
                        ));
                    }
                }
            }
        }
        Ok(Answers {
            map: &mapping.answers,
            decisions: by_id,
        })
    }
    pub fn get(&self, id: &str) -> Option<&'a Answer> {
        self.map.get(id)
    }
    pub fn choice(&self, id: &str) -> Option<&'a str> {
        self.map.get(id).map(|a| a.choice.as_str())
    }
    pub fn decision(&self, id: &str) -> Option<&'a Decision> {
        self.decisions.get(id).copied()
    }
}

pub fn with_entities(mut d: Diagnostic, entities: Vec<String>) -> Diagnostic {
    d.entity_ids = entities;
    d
}

/// The field set for a material decision, prefilled with what was found.
pub fn material_fields(e: Option<f64>, nu: Option<f64>, density: Option<f64>) -> Vec<Field> {
    vec![
        Field {
            name: "E".into(),
            label: "Young's modulus E".into(),
            unit: "Pa".into(),
            found: e,
            rule: FieldRule::Positive,
        },
        Field {
            name: "nu".into(),
            label: "Poisson's ratio ν".into(),
            unit: "".into(),
            found: nu,
            rule: FieldRule::PoissonRatio,
        },
        Field {
            name: "density".into(),
            label: "Mass density ρ".into(),
            unit: "kg/m³".into(),
            found: density,
            rule: FieldRule::NonNegative,
        },
    ]
}

/// The field set for a section decision, prefilled with what was found.
pub fn section_fields(found: [Option<f64>; 6]) -> Vec<Field> {
    let names = [
        ("A", "Area A", "m²"),
        ("Iy", "Second moment Iy (about local y)", "m⁴"),
        ("Iz", "Second moment Iz (about local z)", "m⁴"),
        ("J", "Torsion constant J", "m⁴"),
        ("cy", "Extreme fibre distance cy (along local y)", "m"),
        ("cz", "Extreme fibre distance cz (along local z)", "m"),
    ];
    names
        .iter()
        .zip(found)
        .map(|((n, l, u), f)| Field {
            name: (*n).into(),
            label: (*l).into(),
            unit: (*u).into(),
            found: f,
            rule: FieldRule::Positive,
        })
        .collect()
}
