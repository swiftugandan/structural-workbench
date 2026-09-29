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
    /// rcBeam and rcColumn: explicit section-mechanics material law (ADR 0012,
    /// ADR 0022). Never a code value.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mechanics: Option<SectionMechanicsInputs>,
    /// rcBeam only: the user confirms longitudinal tension steel extends at
    /// least l_bd + d beyond the checked sections (ADR 0016). Absent means not
    /// confirmed; it is never defaulted by the application.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tension_anchorage_confirmed: Option<bool>,
    /// slab only: plate-v1 panel analysis inputs (schema 1.5.0, ADR 0021).
    /// Absent means the plate analysis is not configured.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plate: Option<SlabPlateInputs>,
}

/// Plate analysis inputs of a slab draft. The panel is the draft's
/// length × width at its thickness and target mesh size; these add the load,
/// the elastic material, the edge conditions and the opening position.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SlabPlateInputs {
    /// Edge conditions at x = 0, x = Lx, y = 0, y = Ly.
    pub edges: [String; 4],
    /// Whether the draft's opening is cut from the panel.
    pub include_opening: bool,
    /// SI values keyed by `SLAB_PLATE_KEYS`.
    pub inputs: std::collections::BTreeMap<String, f64>,
    /// Provenance of every numeric key and of `edges` and `includeOpening`.
    pub input_sources: std::collections::BTreeMap<String, String>,
}

/// pressure (Pa, uniform, downward), elasticModulus (Pa), poissonRatio,
/// openingX / openingY (m, the opening's corner nearest the origin).
pub const SLAB_PLATE_KEYS: &[&str] = &[
    "pressure",
    "elasticModulus",
    "poissonRatio",
    "openingX",
    "openingY",
];
pub const SLAB_EDGE_CONDITIONS: &[&str] = &["free", "simple", "clamped"];

impl SlabPlateInputs {
    pub fn validate(&self) -> Result<()> {
        if self
            .edges
            .iter()
            .any(|e| !SLAB_EDGE_CONDITIONS.contains(&e.as_str()))
        {
            return Err(err(
                "INVALID_SCHEMA",
                "Slab edges must be free, simple or clamped",
            ));
        }
        if self.inputs.len() != SLAB_PLATE_KEYS.len()
            || SLAB_PLATE_KEYS
                .iter()
                .any(|k| self.inputs.get(*k).is_none_or(|v| !v.is_finite()))
        {
            return Err(err(
                "INVALID_SCHEMA",
                "Plate inputs must be complete and finite",
            ));
        }
        let v = |k: &str| self.inputs[k];
        if v("pressure") <= 0.0 || v("elasticModulus") <= 0.0 {
            return Err(err(
                "INVALID_SCHEMA",
                "Plate pressure and elastic modulus must be positive",
            ));
        }
        if !(0.0..0.5).contains(&v("poissonRatio")) {
            return Err(err(
                "INVALID_SCHEMA",
                "Poisson's ratio must be at least 0 and below 0.5",
            ));
        }
        let keys = SLAB_PLATE_KEYS
            .iter()
            .copied()
            .chain(["edges", "includeOpening"]);
        if self.input_sources.len() != SLAB_PLATE_KEYS.len() + 2
            || keys.into_iter().any(|k| {
                self.input_sources
                    .get(k)
                    .is_none_or(|s| !["syntheticFixture", "user"].contains(&s.as_str()))
            })
        {
            return Err(err("INVALID_SCHEMA", "Incomplete plate input provenance"));
        }
        Ok(())
    }
}

/// Material law and fit inputs for code-agnostic RC section mechanics. Keys are
/// SI; the required set depends on `law`.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SectionMechanicsInputs {
    pub law: String,
    pub inputs: std::collections::BTreeMap<String, f64>,
    pub input_sources: std::collections::BTreeMap<String, String>,
}

/// rcColumn mechanics add the full-compression strain of pivot C (ADR 0022).
pub const COLUMN_MECHANICS_KEYS: &[&str] = &["fullCompressionStrain"];

pub const MECHANICS_COMMON_KEYS: &[&str] = &[
    "ultimateStrain",
    "steelYieldStrength",
    "steelModulus",
    "concreteModulus",
    "concreteTensileStrength",
    "minimumClearSpacing",
];

impl SectionMechanicsInputs {
    pub fn law_keys(law: &str) -> Option<&'static [&'static str]> {
        match law {
            "rectangularBlock" => Some(&["blockIntensity", "blockDepthRatio"]),
            "parabolaRectangle" => Some(&["parabolaPeak", "strainAtPeak", "parabolaExponent"]),
            _ => None,
        }
    }

    /// The keys a draft of `kind` records for `law`.
    pub fn keys(kind: &str, law: &str) -> Option<Vec<&'static str>> {
        let law_keys = Self::law_keys(law)?;
        let extra: &[&str] = if kind == "rcColumn" {
            COLUMN_MECHANICS_KEYS
        } else {
            &[]
        };
        Some(
            MECHANICS_COMMON_KEYS
                .iter()
                .chain(law_keys)
                .chain(extra)
                .copied()
                .collect(),
        )
    }

    pub fn validate(&self, kind: &str) -> Result<()> {
        let expected = Self::keys(kind, &self.law)
            .ok_or_else(|| err("INVALID_SCHEMA", "Unknown section-mechanics law"))?;
        if self.inputs.len() != expected.len()
            || expected.iter().any(|k| {
                self.inputs
                    .get(*k)
                    .is_none_or(|v| !v.is_finite() || *v <= 0.0)
            })
        {
            return Err(err(
                "INVALID_SCHEMA",
                "Section-mechanics inputs must be complete, finite and positive for the chosen law",
            ));
        }
        if self.input_sources.len() != expected.len()
            || expected.iter().any(|k| {
                self.input_sources
                    .get(*k)
                    .is_none_or(|s| !["syntheticFixture", "user"].contains(&s.as_str()))
            })
        {
            return Err(err(
                "INVALID_SCHEMA",
                "Incomplete section-mechanics provenance",
            ));
        }
        if self.law == "rectangularBlock" && self.inputs["blockDepthRatio"] > 1.0 {
            return Err(err("INVALID_SCHEMA", "Block depth ratio must not exceed 1"));
        }
        if self.law == "parabolaRectangle"
            && self.inputs["strainAtPeak"] > self.inputs["ultimateStrain"]
        {
            return Err(err(
                "INVALID_SCHEMA",
                "Strain at peak must not exceed ultimate strain",
            ));
        }
        if kind == "rcColumn"
            && self.inputs["fullCompressionStrain"] > self.inputs["ultimateStrain"]
        {
            return Err(err(
                "INVALID_SCHEMA",
                "Full-compression strain must not exceed ultimate strain",
            ));
        }
        Ok(())
    }
}

impl DesignPreview {
    /// Drafts bound to an analytical member (rather than a support).
    pub fn binds_member(&self) -> bool {
        matches!(self.kind.as_str(), "rcBeam" | "rcColumn")
    }

    pub fn validate(&self) -> Result<()> {
        if let Some(m) = &self.mechanics {
            if !self.binds_member() {
                return Err(err(
                    "INVALID_SCHEMA",
                    "Section mechanics apply only to RC beam and column drafts",
                ));
            }
            m.validate(&self.kind)?;
        }
        if let Some(plate) = &self.plate {
            if self.kind != "slab" {
                return Err(err(
                    "INVALID_SCHEMA",
                    "Plate analysis inputs apply only to slab drafts",
                ));
            }
            plate.validate()?;
        }
        if self.tension_anchorage_confirmed.is_some() && self.kind != "rcBeam" {
            return Err(err(
                "INVALID_SCHEMA",
                "Tension anchorage confirmation applies only to RC beam drafts",
            ));
        }
        let keys: &[&str] = match self.kind.as_str() {
            "rcBeam" => &[
                "width",
                "depth",
                "cover",
                "concreteStrength",
                "rebarStrength",
                "topBarDiameter",
                "topBarCount",
                "bottomBarDiameter",
                "bottomBarCount",
                "linkDiameter",
                "linkSpacing",
                "linkLegs",
            ],
            "rcColumn" => &[
                "width",
                "depth",
                "cover",
                "concreteStrength",
                "rebarStrength",
                "barDiameter",
                "barsAlongWidth",
                "barsAlongDepth",
                "linkDiameter",
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
            && ["topBarCount", "bottomBarCount"]
                .iter()
                .any(|k| self.inputs[*k].fract() != 0.0 || self.inputs[*k] > 20.0)
        {
            return Err(err(
                "INVALID_SCHEMA",
                "Bar count per face must be an integer from 1 to 20",
            ));
        }
        if self.kind == "rcBeam"
            && (self.inputs["linkLegs"].fract() != 0.0
                || !(2.0..=8.0).contains(&self.inputs["linkLegs"]))
        {
            return Err(err(
                "INVALID_SCHEMA",
                "Link legs must be an integer from 2 to 8",
            ));
        }
        if self.kind == "rcColumn" {
            if ["barsAlongWidth", "barsAlongDepth"]
                .iter()
                .any(|k| self.inputs[*k].fract() != 0.0 || !(2.0..=20.0).contains(&self.inputs[*k]))
            {
                return Err(err(
                    "INVALID_SCHEMA",
                    "Bars along each face must be an integer from 2 to 20",
                ));
            }
            let inset =
                self.inputs["cover"] + self.inputs["linkDiameter"] + self.inputs["barDiameter"];
            if 2.0 * inset >= self.inputs["width"].min(self.inputs["depth"]) {
                return Err(err(
                    "INVALID_SCHEMA",
                    "Cover, links and bars consume the column section",
                ));
            }
        }
        let depth = if self.binds_member() {
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
        if let Some(plate) = self.plate.as_ref().filter(|p| p.include_opening) {
            let (x0, y0) = (plate.inputs["openingX"], plate.inputs["openingY"]);
            if x0 <= 0.0
                || y0 <= 0.0
                || x0 + self.inputs["openingLength"] >= self.inputs["length"]
                || y0 + self.inputs["openingWidth"] >= self.inputs["width"]
            {
                return Err(err(
                    "INVALID_SCHEMA",
                    "The analysed opening must lie strictly inside the slab panel",
                ));
            }
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
    /// User serviceability criteria (ADR 0020); absent means not checked.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub serviceability: Option<SteelServiceability>,
}

/// A deflection limit L/n under one service case or combination, measured
/// relative to the member chord or from the undeformed position (ADR 0020).
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SteelServiceability {
    pub combination_id: String,
    /// n in the L/n limit.
    pub limit_ratio: f64,
    /// "chord" | "absolute".
    pub basis: String,
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
            // Cb alone may be derived from the analysis (F1-1): no stored value.
            let derived = key == "Cb" && v.value.is_none() && v.source == DesignSource::Derived;
            if !derived && v.value.is_some() == (v.source == DesignSource::NotProvided) {
                return Err(err(
                    "INVALID_SCHEMA",
                    format!("{key} value and source disagree"),
                ));
            }
        }
        if let Some(s) = &self.serviceability {
            if !(s.limit_ratio.is_finite() && (1.0..=100_000.0).contains(&s.limit_ratio)) {
                return Err(err(
                    "INVALID_SCHEMA",
                    "The deflection limit L/n needs n between 1 and 100000",
                ));
            }
            if !["chord", "absolute"].contains(&s.basis.as_str()) {
                return Err(err(
                    "INVALID_SCHEMA",
                    "Deflection basis must be chord or absolute",
                ));
            }
            if s.combination_id.is_empty() || s.combination_id.len() > 64 {
                return Err(err(
                    "INVALID_SCHEMA",
                    "Service case or combination is required",
                ));
            }
        }
        Ok(())
    }
}
