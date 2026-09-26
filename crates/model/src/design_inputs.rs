use crate::{Result, err};
use serde::{Deserialize, Serialize};

/// Persisted workflow-only inputs. These never enable an unvalidated code profile.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DesignPreview {
    pub id: String,
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_id: Option<String>,
    pub input_source: String,
    #[serde(default, skip_serializing_if = "std::collections::BTreeMap::is_empty")]
    pub input_sources: std::collections::BTreeMap<String, String>,
    pub inputs: std::collections::BTreeMap<String, f64>,
    pub soil_reference: String,
}
impl DesignPreview {
    pub fn validate(&self) -> Result<()> {
        let keys: &[&str] = match self.kind.as_str() {
            "rcBeam" => &[
                "width",
                "depth",
                "cover",
                "concreteStrength",
                "rebarStrength",
                "barDiameter",
                "barCount",
                "linkDiameter",
                "linkSpacing",
            ],
            "slab" => &[
                "length",
                "width",
                "thickness",
                "cover",
                "concreteStrength",
                "rebarStrength",
                "meshSize",
                "openingWidth",
                "openingLength",
            ],
            "padFooting" => &[
                "length",
                "width",
                "thickness",
                "cover",
                "concreteStrength",
                "rebarStrength",
                "columnWidth",
                "columnDepth",
                "bearingPressure",
                "embedment",
                "soilUnitWeight",
            ],
            _ => return Err(err("INVALID_SCHEMA", "Unknown design preview kind")),
        };
        if !["syntheticFixture", "user", "mixed"].contains(&self.input_source.as_str())
            || self.soil_reference.len() > 512
        {
            return Err(err("INVALID_SCHEMA", "Invalid preview provenance"));
        }
        if !self.input_sources.is_empty()
            && (self.input_sources.len() != keys.len()
                || keys.iter().any(|k| {
                    self.input_sources
                        .get(*k)
                        .is_none_or(|s| !["syntheticFixture", "user"].contains(&s.as_str()))
                }))
        {
            return Err(err("INVALID_SCHEMA", "Incomplete field provenance"));
        }
        if self.inputs.len() != keys.len()
            || keys.iter().any(|k| {
                self.inputs
                    .get(*k)
                    .is_none_or(|v| !v.is_finite() || *v <= 0.0)
            })
        {
            return Err(err(
                "INVALID_SCHEMA",
                "Preview inputs must be complete, finite and positive",
            ));
        }
        if self.kind == "rcBeam"
            && (self.inputs["barCount"].fract() != 0.0 || self.inputs["barCount"] > 20.0)
        {
            return Err(err(
                "INVALID_SCHEMA",
                "Illustration bar count must be an integer from 1 to 20",
            ));
        }
        let depth = if self.kind == "rcBeam" {
            self.inputs["depth"]
        } else {
            self.inputs["thickness"]
        };
        if 2.0 * self.inputs["cover"] >= depth.min(self.inputs["width"]) {
            return Err(err("INVALID_SCHEMA", "Cover consumes the concrete section"));
        }
        if self.kind == "slab"
            && (self.inputs["openingWidth"] >= self.inputs["width"]
                || self.inputs["openingLength"] >= self.inputs["length"])
        {
            return Err(err(
                "INVALID_SCHEMA",
                "Preview opening must lie inside the slab boundary",
            ));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum DesignSource {
    Catalogue,
    ProjectDefault,
    GroupDefault,
    Derived,
    User,
    Imported,
    NotProvided,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DesignValue {
    pub value: Option<f64>,
    pub source: DesignSource,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SteelDesign {
    pub section_ref: String,
    pub material_ref: String,
    pub profile_id: String,
    pub stability_basis: String,
    pub bracing: String,
    pub ky: DesignValue,
    pub kz: DesignValue,
    pub lb: DesignValue,
    pub cb: DesignValue,
}

impl SteelDesign {
    pub fn validate(&self) -> Result<()> {
        for s in [
            &self.section_ref,
            &self.material_ref,
            &self.profile_id,
            &self.stability_basis,
            &self.bracing,
        ] {
            if s.len() > 256 {
                return Err(err("INVALID_SCHEMA", "Design reference exceeds 256 bytes"));
            }
        }
        if !["notProvided", "continuous", "unbraced"].contains(&self.bracing.as_str()) {
            return Err(err("INVALID_SCHEMA", "Unknown bracing assumption"));
        }
        for (key, v) in [
            ("Ky", &self.ky),
            ("Kz", &self.kz),
            ("Lb", &self.lb),
            ("Cb", &self.cb),
        ] {
            if v.value
                .is_some_and(|n| !n.is_finite() || n < 0.0 || (key != "Lb" && n == 0.0))
            {
                return Err(err(
                    "INVALID_SCHEMA",
                    format!(
                        "{key} must be finite and {}",
                        if key == "Lb" {
                            "nonnegative"
                        } else {
                            "positive"
                        }
                    ),
                ));
            }
            if v.value.is_some() == (v.source == DesignSource::NotProvided) {
                return Err(err(
                    "INVALID_SCHEMA",
                    format!("{key} value and source disagree"),
                ));
            }
        }
        Ok(())
    }
}
