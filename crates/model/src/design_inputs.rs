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
    /// rcBeam only (schema 1.7.0, ADR 0026): detailing and serviceability
    /// inputs for the code profile. Every value is the engineer's; absent
    /// fields leave the checks that need them indeterminate.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub code_inputs: Option<CodeInputs>,
    /// singlePlate only (schema 1.9.0, ADR 0030): the connection's end,
    /// support and hardware. Absent means the connection is not configured.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub connection: Option<SinglePlateInputs>,
    /// compositeBeam only (schema 1.10.0, ADR 0031): deck, sides, stage
    /// cases and the engineer's service inputs. Absent: not configured.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub composite: Option<CompositeInputs>,
}

pub const DECK_KINDS: &[&str] = &["solid", "perpendicular", "parallel"];
pub const SIDE_KINDS: &[&str] = &["adjacent", "edge"];

/// A composite beam's non-numeric inputs and optional engineer's values
/// (ADR 0031). Stage cases name the model's cases or combinations.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompositeInputs {
    pub deck: String,
    pub lightweight: bool,
    /// For each side of the beam: "adjacent" (sideLeft/sideRight is the
    /// centre-to-centre distance to the next beam) or "edge" (to the slab edge).
    pub sides: [String; 2],
    pub studs_over_web: bool,
    /// e_mid-ht for deck perpendicular to the beam (m), when known.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub emid_ht: Option<f64>,
    /// Factored loads applied before the concrete hardens.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub construction_case_id: Option<String>,
    /// Factored total loads on the composite section.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub composite_case_id: Option<String>,
    /// Service wet concrete and self weight on the steel alone.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wet_case_id: Option<String>,
    /// Service live load on the composite section.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub live_case_id: Option<String>,
    /// Service sustained load applied after hardening.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sustained_case_id: Option<String>,
    /// Deflection limits as L/n.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pre_composite_limit: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub live_limit: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub long_term_limit: Option<f64>,
    /// Restrained shrinkage strain ε_sh.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shrinkage_strain: Option<f64>,
    /// The engineer's creep judgement (Commentary I3.2(c)).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub creep_judgement: Option<bool>,
    /// With point loads on the beam: the engineer confirms they are equal
    /// and equally spaced (Commentary I3.2d.1).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub regular_loading_confirmed: Option<bool>,
}

impl CompositeInputs {
    pub fn validate(&self) -> Result<()> {
        if !DECK_KINDS.contains(&self.deck.as_str()) {
            return Err(err("INVALID_SCHEMA", "Unknown deck kind"));
        }
        if self.sides.iter().any(|s| !SIDE_KINDS.contains(&s.as_str())) {
            return Err(err("INVALID_SCHEMA", "Each side is adjacent or edge"));
        }
        for limit in [self.pre_composite_limit, self.live_limit, self.long_term_limit].into_iter().flatten() {
            if !(limit.is_finite() && (50.0..=5000.0).contains(&limit)) {
                return Err(err("INVALID_SCHEMA", "Deflection limits L/n need n in [50, 5000]"));
            }
        }
        if self.shrinkage_strain.is_some_and(|e| !(e.is_finite() && (0.0..=0.002).contains(&e))) {
            return Err(err("INVALID_SCHEMA", "Shrinkage strain must lie in [0, 0.002]"));
        }
        if self.emid_ht.is_some_and(|e| !(e.is_finite() && e > 0.0 && e <= 0.2)) {
            return Err(err("INVALID_SCHEMA", "e_mid-ht must lie in (0, 200] mm"));
        }
        for id in self.case_ids().into_iter().flatten() {
            if id.is_empty() || id.len() > 64 {
                return Err(err("INVALID_SCHEMA", "Invalid case or combination reference"));
            }
        }
        Ok(())
    }

    /// The stage case references (construction, composite, wet, live, sustained).
    pub fn case_ids(&self) -> [Option<&String>; 5] {
        [
            self.construction_case_id.as_ref(),
            self.composite_case_id.as_ref(),
            self.wet_case_id.as_ref(),
            self.live_case_id.as_ref(),
            self.sustained_case_id.as_ref(),
        ]
    }
}

/// Bolt designations of AISC 360-22 Tables J3.3/J3.4 (US) and J3.3M/J3.4M
/// (metric); the design crate's bolt table must list the same.
pub const STEEL_BOLT_DESIGNATIONS: &[&str] = &[
    "1/2", "5/8", "3/4", "7/8", "1", "1-1/8", "1-1/4", "M12", "M16", "M20", "M22", "M24", "M27", "M30", "M36",
];
pub const SUPPORT_KINDS: &[&str] = &["columnFlange", "columnWeb", "girderWeb"];
pub const BOLT_GROUPS: &[&str] = &["group120", "group150"];

/// The single-plate connection at one end of the bound beam (ADR 0030).
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SinglePlateInputs {
    /// "start" or "end" of the bound member.
    pub end: String,
    /// The supporting member at that end's node (column or girder).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub support_member_id: Option<String>,
    pub support_kind: String,
    pub bolt: String,
    pub bolt_group: String,
    pub threads_excluded: bool,
    /// Deformation at the bolt hole at service load is a design consideration.
    pub deformation_considered: bool,
    /// The beam is braced against rotation about its longitudinal axis.
    /// Absent: not confirmed (the plate interactions are indeterminate).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub braced_against_rotation: Option<bool>,
}

impl SinglePlateInputs {
    pub fn validate(&self) -> Result<()> {
        if !["start", "end"].contains(&self.end.as_str()) {
            return Err(err("INVALID_SCHEMA", "Connection end must be start or end"));
        }
        if !SUPPORT_KINDS.contains(&self.support_kind.as_str()) {
            return Err(err("INVALID_SCHEMA", "Unknown connection support kind"));
        }
        if !STEEL_BOLT_DESIGNATIONS.contains(&self.bolt.as_str()) {
            return Err(err("INVALID_SCHEMA", "Unknown bolt size"));
        }
        if !BOLT_GROUPS.contains(&self.bolt_group.as_str()) {
            return Err(err("INVALID_SCHEMA", "Unknown bolt group"));
        }
        if self.support_member_id.as_deref().is_some_and(|m| m.is_empty() || m.len() > 64) {
            return Err(err("INVALID_SCHEMA", "Invalid support member reference"));
        }
        Ok(())
    }
}

/// Exposure classes of EN 206 / EN 1992-1-1 Table 4.1.
pub const EXPOSURE_CLASSES: &[&str] = &[
    "X0", "XC1", "XC2", "XC3", "XC4", "XD1", "XD2", "XD3", "XS1", "XS2", "XS3",
];
/// Structural systems of EN 1992-1-1 Table 7.4N / UK NA Table NA.5 (beams).
pub const STRUCTURAL_SYSTEMS: &[&str] = &["simplySupported", "endSpan", "interiorSpan", "cantilever", "flatSlab"];

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CodeInputs {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exposure_class: Option<String>,
    /// c_min,dur (m) from the durability standard for the exposure class.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub minimum_cover_durability: Option<f64>,
    /// Maximum aggregate size d_g (m).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aggregate_size: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub structural_system: Option<String>,
    /// Whether the beam supports partitions liable to deflection damage.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub partitions_sensitive: Option<bool>,
    /// The case or combination taken as quasi-permanent for crack control.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub quasi_permanent_combination_id: Option<String>,
    /// rcColumn: whether the column is braced against sway (5.8.3.2(3)).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub braced: Option<bool>,
    /// rcColumn: relative flexibilities k1, k2 of the end restraints for
    /// bending about local y (buckling across the depth), 5.8.3.2(3).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub restraint_y: Option<[f64; 2]>,
    /// rcColumn: the same for bending about local z (across the width).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub restraint_z: Option<[f64; 2]>,
    /// rcColumn: effective creep ratio φ_ef (5.8.4).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effective_creep_ratio: Option<f64>,
    /// padFooting: cast on blinding (true) or directly against the ground,
    /// for the 4.4.1.3(4) minimum cover.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cast_on_blinding: Option<bool>,
    /// padFooting: the case or combination compared with the allowable
    /// bearing pressure.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bearing_combination_id: Option<String>,
    /// slab: column dimensions c_x × c_y (m) for punching at every column support.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub column_size: Option<[f64; 2]>,
}

impl CodeInputs {
    /// Values in range, and only the fields that apply to the draft kind:
    /// exposure, cover and aggregate for every RC kind; structural system and
    /// partitions for beams and slabs (flat slab only for slabs); the
    /// quasi-permanent case for beams; restraint and creep for columns.
    pub fn validate(&self, kind: &str) -> Result<()> {
        let beam_or_slab = matches!(kind, "rcBeam" | "slab");
        let misplaced = (!beam_or_slab && (self.structural_system.is_some() || self.partitions_sensitive.is_some()))
            || (kind != "rcBeam" && self.quasi_permanent_combination_id.is_some())
            || (kind != "slab" && self.structural_system.as_deref() == Some("flatSlab"))
            || (kind != "rcColumn"
                && (self.braced.is_some()
                    || self.restraint_y.is_some()
                    || self.restraint_z.is_some()
                    || self.effective_creep_ratio.is_some()))
            || (kind != "padFooting" && (self.cast_on_blinding.is_some() || self.bearing_combination_id.is_some()))
            || (kind != "slab" && self.column_size.is_some());
        if misplaced {
            return Err(err("INVALID_SCHEMA", format!("Code input not applicable to a {kind} draft")));
        }
        for k in self.restraint_y.iter().chain(self.restraint_z.iter()).flatten() {
            if !(k.is_finite() && (0.0..=1000.0).contains(k)) {
                return Err(err("INVALID_SCHEMA", "End restraint flexibility k must lie in [0, 1000]"));
            }
        }
        if self.column_size.is_some_and(|c| c.iter().any(|x| !(x.is_finite() && *x > 0. && *x <= 3.))) {
            return Err(err("INVALID_SCHEMA", "Column dimensions must lie in (0, 3] m"));
        }
        if self.effective_creep_ratio.is_some_and(|c| !(c.is_finite() && (0.0..=10.0).contains(&c))) {
            return Err(err("INVALID_SCHEMA", "Effective creep ratio must lie in [0, 10]"));
        }
        if self.exposure_class.as_deref().is_some_and(|e| !EXPOSURE_CLASSES.contains(&e)) {
            return Err(err("INVALID_SCHEMA", "Unknown exposure class"));
        }
        if self.structural_system.as_deref().is_some_and(|e| !STRUCTURAL_SYSTEMS.contains(&e)) {
            return Err(err("INVALID_SCHEMA", "Unknown structural system"));
        }
        if self.minimum_cover_durability.is_some_and(|c| !(c.is_finite() && c > 0. && c <= 0.1)) {
            return Err(err("INVALID_SCHEMA", "c_min,dur must lie in (0, 100] mm"));
        }
        if self.aggregate_size.is_some_and(|c| !(c.is_finite() && c > 0. && c <= 0.063)) {
            return Err(err("INVALID_SCHEMA", "Aggregate size must lie in (0, 63] mm"));
        }
        if [&self.quasi_permanent_combination_id, &self.bearing_combination_id]
            .iter()
            .any(|r| r.as_deref().is_some_and(|c| c.is_empty() || c.len() > 64))
        {
            return Err(err("INVALID_SCHEMA", "Invalid case or combination reference"));
        }
        Ok(())
    }
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
    /// Where the panel's corner (x = 0, y = 0) sits in the model, with the
    /// panel axes along global X and Y at elevation z (schema 1.6.0).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placement: Option<[f64; 3]>,
    /// Column (point) supports of the panel (schema 1.6.0).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub columns: Vec<SlabColumn>,
}

/// A column under a slab panel: a point support at (x, y) in panel
/// coordinates. `spring` carries the column's axial (kz, N/m) and bending
/// (krx, kry about global X and Y, N m/rad) stiffness.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SlabColumn {
    pub x: f64,
    pub y: f64,
    /// "pinned", "fixed" or "spring".
    pub kind: String,
    #[serde(default)]
    pub kz: f64,
    #[serde(default)]
    pub krx: f64,
    #[serde(default)]
    pub kry: f64,
    /// "user", or "model" when derived from the frame's columns.
    pub source: String,
    /// The model node the column meets the slab at (model source).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node_id: Option<String>,
    /// The model members that gave its stiffness (model source).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub member_ids: Vec<String>,
}

/// Most columns under one slab panel.
pub const MAX_SLAB_COLUMNS: usize = 200;

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
        if self.columns.len() > MAX_SLAB_COLUMNS {
            return Err(err(
                "INVALID_SCHEMA",
                format!("At most {MAX_SLAB_COLUMNS} slab columns"),
            ));
        }
        if self.placement.is_some_and(|p| p.iter().any(|v| !v.is_finite())) {
            return Err(err("INVALID_SCHEMA", "Slab placement must be finite"));
        }
        for (k, c) in self.columns.iter().enumerate() {
            let numbers = [c.x, c.y, c.kz, c.krx, c.kry];
            let spring = c.kind == "spring";
            if !["pinned", "fixed", "spring"].contains(&c.kind.as_str())
                || numbers.iter().any(|v| !v.is_finite())
                || [c.kz, c.krx, c.kry].iter().any(|v| *v < 0.)
                || (spring && c.kz <= 0.)
                || (!spring && (c.kz != 0. || c.krx != 0. || c.kry != 0.))
            {
                return Err(err(
                    "INVALID_SCHEMA",
                    format!(
                        "Column {}: kind pinned, fixed or spring (kz > 0, rotational springs ≥ 0), finite position",
                        k + 1
                    ),
                ));
            }
            let model = c.source == "model";
            if !["user", "model"].contains(&c.source.as_str())
                || model != c.node_id.is_some()
                || (model && c.member_ids.is_empty())
            {
                return Err(err(
                    "INVALID_SCHEMA",
                    format!("Column {}: a model column names its node and members", k + 1),
                ));
            }
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

/// Where a slab's opening comes from (ADR 0035).
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OpeningBasis {
    /// The plate analysis cuts this opening (or has none).
    Analysed,
    /// No plate inputs yet: the draft's centred preview opening.
    Illustrative,
}

/// A slab draft's panel outline in panel coordinates (x along global X,
/// y along global Y, from the panel corner), its thickness, its opening and
/// its placement in the model. The one rule the plate solve and the model
/// views share (ADR 0035).
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SlabPanel {
    pub length: f64,
    pub width: f64,
    pub thickness: f64,
    /// `[x0, x1, y0, y1]` in panel coordinates.
    pub opening: Option<[f64; 4]>,
    pub opening_basis: OpeningBasis,
    /// The panel corner in the model; z is the mid-surface.
    pub placement: Option<[f64; 3]>,
}

impl SlabPanel {
    /// Mid-surface corners in model coordinates, counter-clockwise from the
    /// panel corner, of the outline and of the opening. None until placed.
    pub fn world_corners(&self) -> Option<([[f64; 3]; 4], Option<[[f64; 3]; 4]>)> {
        let [px, py, pz] = self.placement?;
        let ring = |x0: f64, x1: f64, y0: f64, y1: f64| {
            [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(|[x, y]| [px + x, py + y, pz])
        };
        Some((
            ring(0., self.length, 0., self.width),
            self.opening.map(|[x0, x1, y0, y1]| ring(x0, x1, y0, y1)),
        ))
    }
}

impl DesignPreview {
    /// The panel of a slab draft; None for every other kind.
    pub fn slab_panel(&self) -> Option<SlabPanel> {
        if self.kind != "slab" {
            return None;
        }
        let v = &self.inputs;
        let (length, width) = (v["length"], v["width"]);
        let (ox, oy) = (v["openingLength"], v["openingWidth"]);
        let (opening, opening_basis) = match &self.plate {
            Some(plate) => (
                plate.include_opening.then(|| {
                    let (x0, y0) = (plate.inputs["openingX"], plate.inputs["openingY"]);
                    [x0, x0 + ox, y0, y0 + oy]
                }),
                OpeningBasis::Analysed,
            ),
            None => (
                Some([
                    (length - ox) / 2.,
                    (length + ox) / 2.,
                    (width - oy) / 2.,
                    (width + oy) / 2.,
                ]),
                OpeningBasis::Illustrative,
            ),
        };
        Some(SlabPanel {
            length,
            width,
            thickness: v["thickness"],
            opening,
            opening_basis,
            placement: self.plate.as_ref().and_then(|p| p.placement),
        })
    }

    /// Drafts bound to an analytical member (rather than a support).
    pub fn binds_member(&self) -> bool {
        matches!(self.kind.as_str(), "rcBeam" | "rcColumn" | "singlePlate" | "compositeBeam")
    }

    pub fn validate(&self) -> Result<()> {
        if let Some(c) = &self.composite {
            if self.kind != "compositeBeam" {
                return Err(err("INVALID_SCHEMA", "Composite inputs apply only to composite beam drafts"));
            }
            c.validate()?;
        }
        if let Some(c) = &self.connection {
            if self.kind != "singlePlate" {
                return Err(err(
                    "INVALID_SCHEMA",
                    "Connection inputs apply only to single-plate connection drafts",
                ));
            }
            c.validate()?;
        }
        if let Some(m) = &self.mechanics {
            if !matches!(self.kind.as_str(), "rcBeam" | "rcColumn") {
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
        if let Some(c) = &self.code_inputs {
            c.validate(&self.kind)?;
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
            "singlePlate" => &[
                "rows",
                "columns",
                "pitch",
                "gauge",
                "plateThickness",
                "plateFy",
                "plateFu",
                "lev",
                "lehPlate",
                "a",
                "lehBeam",
                "underrun",
                "topOffset",
                "weldSize",
                "fexx",
            ],
            "compositeBeam" => &[
                "slabThickness",
                "ribHeight",
                "ribWidth",
                "ribPitch",
                "concreteStrength",
                "concreteDensity",
                "studDiameter",
                "studFu",
                "studLength",
                "studsPerRow",
                "studRowSpacing",
                "firstStudRow",
                "studTransverseSpacing",
                "sideLeft",
                "sideRight",
                "constructionLb",
                "constructionCb",
                "camber",
            ],
            _ => return Err(err("INVALID_SCHEMA", "Unknown design preview kind")),
        };
        // Inputs that may be zero (the beam length underrun; camber; a
        // continuously braced construction stage).
        let zero_ok: &[&str] = match self.kind.as_str() {
            "singlePlate" => &["underrun"],
            "compositeBeam" => &["camber", "constructionLb"],
            _ => &[],
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
                self.inputs.get(*k).is_none_or(|v| {
                    !v.is_finite() || *v < 0.0 || (*v == 0.0 && !zero_ok.contains(k))
                })
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
        if self.kind == "compositeBeam" {
            let n = self.inputs["studsPerRow"];
            if n.fract() != 0.0 || !(1.0..=3.0).contains(&n) {
                return Err(err("INVALID_SCHEMA", "Studs per row must be 1, 2 or 3"));
            }
            if self.inputs["ribHeight"] >= self.inputs["slabThickness"] {
                return Err(err("INVALID_SCHEMA", "The deck ribs must be shallower than the slab"));
            }
            if self.inputs["studLength"] >= self.inputs["slabThickness"] {
                return Err(err("INVALID_SCHEMA", "The studs must lie within the slab"));
            }
            return Ok(());
        }
        if self.kind == "singlePlate" {
            let (rows, cols) = (self.inputs["rows"], self.inputs["columns"]);
            if rows.fract() != 0.0 || !(2.0..=12.0).contains(&rows) {
                return Err(err("INVALID_SCHEMA", "Bolt rows must be an integer from 2 to 12"));
            }
            if cols.fract() != 0.0 || !(1.0..=2.0).contains(&cols) {
                return Err(err("INVALID_SCHEMA", "Bolt lines must be 1 or 2"));
            }
            if self.inputs["plateFu"] < self.inputs["plateFy"] {
                return Err(err("INVALID_SCHEMA", "Plate Fu must not be below Fy"));
            }
            return Ok(());
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
        if let Some(plate) = &self.plate {
            let (lx, ly) = (self.inputs["length"], self.inputs["width"]);
            let tol = 1e-9 * lx.max(ly);
            for (k, c) in plate.columns.iter().enumerate() {
                if !((-tol..=lx + tol).contains(&c.x) && (-tol..=ly + tol).contains(&c.y)) {
                    return Err(err(
                        "INVALID_SCHEMA",
                        format!("Column {} lies outside the slab panel", k + 1),
                    ));
                }
            }
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
    /// Lateral-torsional bracing points (normalised stations strictly inside
    /// the member) for bracing "points": each segment between them and the
    /// member ends is checked with its own Lb and Cb (schema 1.6.0).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub bracing_points: Vec<f64>,
}

/// Most bracing points on one member.
pub const MAX_BRACING_POINTS: usize = 20;

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
        if !["notProvided", "continuous", "unbraced", "points"].contains(&self.bracing.as_str()) {
            return Err(err("INVALID_SCHEMA", "Unknown bracing assumption"));
        }
        let points = self.bracing == "points";
        if points
            != !self.bracing_points.is_empty()
            || self.bracing_points.len() > MAX_BRACING_POINTS
            || self.bracing_points.iter().any(|t| !(t.is_finite() && *t > 0. && *t < 1.))
            || self.bracing_points.windows(2).any(|w| w[1] <= w[0])
        {
            return Err(err(
                "INVALID_SCHEMA",
                format!(
                    "Bracing \"points\" needs 1–{MAX_BRACING_POINTS} increasing stations strictly between 0 and 1, and only that assumption takes them"
                ),
            ));
        }
        // With bracing points Lb is each segment's length: derived, not entered.
        let lb_derived = self.lb.value.is_none() && self.lb.source == DesignSource::Derived;
        if lb_derived != points {
            return Err(err(
                "INVALID_SCHEMA",
                "Lb is derived exactly when the member is braced at points",
            ));
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
            // Cb may be derived from the analysis (F1-1), and Lb from bracing
            // points: no stored value.
            let derived = (key == "Cb" || (key == "Lb" && points))
                && v.value.is_none()
                && v.source == DesignSource::Derived;
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
