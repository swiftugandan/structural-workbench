use crate::{Result, err};
use serde::{Deserialize, Serialize};

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
