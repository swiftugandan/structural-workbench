use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberResult {
    pub id: String,
    pub length: f64,
    pub end_actions: Vec<f64>,
    pub samples: Vec<Sample>,
    /// Authoritative stations for peaks/jumps (ends, extrema, discontinuities).
    #[serde(default)]
    pub key_stations: Vec<KeyStation>,
    /// Elastic longitudinal fibre stress screen (mechanics-v1). Not a code check.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stress_screen: Option<StressScreen>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StressScreen {
    /// Maximum corner longitudinal stress (Pa, tension positive).
    pub max_pa: f64,
    /// Minimum corner longitudinal stress (Pa).
    pub min_pa: f64,
    pub station: f64,
    pub disclaimer: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sample {
    pub station: f64,
    pub position: [f64; 3],
    pub displacement: [f64; 3],
    pub actions: [f64; 6],
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyStation {
    /// Normalised station along the member, 0..1.
    pub station: f64,
    /// "end" | "extremum" | "discontinuity"
    pub kind: String,
    /// Components this station is authoritative for (e.g. ["Mz"]).
    pub components: Vec<String>,
    pub actions: [f64; 6],
    /// One-sided value at a discontinuity: "left" | "right".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub side: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Analysis {
    pub result_id: String,
    pub schema_version: String,
    pub analysis_type: String,
    pub converged: bool,
    pub case_or_combination_id: String,
    pub buffer_descriptors: Vec<serde_json::Value>,
    pub model_hash: String,
    pub settings_hash: String,
    pub solver_build_hash: String,
    pub case_id: String,
    pub source_revision: u64,
    pub node_ids: Vec<String>,
    pub node_displacements: Vec<f64>,
    pub reaction_support_ids: Vec<String>,
    pub reactions: Vec<f64>,
    pub generated_constraint_reactions: Vec<serde_json::Value>,
    pub members: Vec<MemberResult>,
    pub numerical_checks: serde_json::Value,
    pub diagnostics: Vec<serde_json::Value>,
}

/// One observed extreme for a single scalar response, with governing provenance.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvenanceExtreme {
    pub value: f64,
    pub case_or_combination_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub member_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub station: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub side: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub support_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentEnvelope {
    pub component: String,
    pub max: ProvenanceExtreme,
    pub min: ProvenanceExtreme,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberEnvelope {
    pub id: String,
    pub actions: Vec<ComponentEnvelope>,
    /// Along-member displacement extremes from display samples (not a simultaneous set).
    #[serde(default)]
    pub displacements: Vec<ComponentEnvelope>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeEnvelope {
    pub id: String,
    pub displacements: Vec<ComponentEnvelope>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportEnvelope {
    pub id: String,
    pub reactions: Vec<ComponentEnvelope>,
}

/// Independent per-scalar max/min over solved cases/combinations.
/// Not a simultaneous force vector — see diagnostics.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Envelope {
    pub result_id: String,
    pub schema_version: String,
    pub analysis_type: String,
    pub model_hash: String,
    pub settings_hash: String,
    pub solver_build_hash: String,
    pub source_revision: u64,
    pub case_or_combination_ids: Vec<String>,
    pub members: Vec<MemberEnvelope>,
    pub nodes: Vec<NodeEnvelope>,
    pub supports: Vec<SupportEnvelope>,
    pub diagnostics: Vec<serde_json::Value>,
}

/// Elastic buckling result (stability-v1). A critical factor is an elastic load
/// multiplier of the idealised model, never a member resistance or code verdict.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BucklingAnalysis {
    pub result_id: String,
    pub schema_version: String,
    /// Always "elasticBuckling".
    pub analysis_type: String,
    pub converged: bool,
    pub case_or_combination_id: String,
    pub model_hash: String,
    pub settings_hash: String,
    pub solver_build_hash: String,
    pub source_revision: u64,
    pub subdivisions: usize,
    pub requested_modes: usize,
    /// Positive critical factors, ascending, with normalised shapes.
    pub modes: Vec<BucklingMode>,
    /// Negative factors found (buckling under the reversed reference load),
    /// ascending in magnitude. Never critical factors.
    pub negative_factors: Vec<f64>,
    /// Axial force of the linear reference state per physical member segment.
    pub reference_axial_forces: Vec<MemberAxialForces>,
    pub numerical_checks: serde_json::Value,
    /// e.g. FLEXURAL_ONLY, NOT_A_RESISTANCE_CHECK.
    pub disclosures: Vec<String>,
    pub diagnostics: Vec<serde_json::Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BucklingMode {
    pub factor: f64,
    /// Relative residual ‖Kφ + λK_Gφ‖∞ / ‖Kφ‖∞.
    pub residual: f64,
    /// Physical node ids, in project order, with six components each.
    pub node_ids: Vec<String>,
    /// Shape normalised so the largest absolute translation over the whole
    /// analysis mesh is 1 and positive. Rotations share that scale.
    pub node_displacements: Vec<f64>,
    /// Translations along each physical member at every analysis node.
    pub members: Vec<MemberModeShape>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberModeShape {
    pub id: String,
    pub stations: Vec<ModeStation>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModeStation {
    pub station: f64,
    pub position: [f64; 3],
    pub displacement: [f64; 3],
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberAxialForces {
    pub id: String,
    /// Constant axial force per analysis segment [t0, t1] (tension positive, N).
    pub segments: Vec<AxialSegment>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AxialSegment {
    pub t0: f64,
    pub t1: f64,
    pub n: f64,
}

/// Modal analysis result (dynamics-v1, `docs/formulations/modal.md`).
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModalAnalysis {
    pub result_id: String,
    pub schema_version: String,
    /// Always "modal".
    pub analysis_type: String,
    pub converged: bool,
    pub model_hash: String,
    pub settings_hash: String,
    pub solver_build_hash: String,
    pub source_revision: u64,
    pub subdivisions: usize,
    /// "consistent" or "lumped".
    pub mass_matrix: String,
    pub requested_modes: usize,
    /// Ascending frequency.
    pub modes: Vec<VibrationMode>,
    pub mass: ModalMass,
    /// Global X, Y and Z, in that order.
    pub participation: Vec<DirectionParticipation>,
    pub numerical_checks: serde_json::Value,
    pub disclosures: Vec<String>,
    pub diagnostics: Vec<serde_json::Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VibrationMode {
    /// 1-based, in ascending frequency.
    pub mode: usize,
    /// Circular frequency (rad/s).
    pub omega: f64,
    /// Hz.
    pub frequency: f64,
    /// s.
    pub period: f64,
    /// ‖Kφ − ω²Mφ‖∞ / ‖Kφ‖∞.
    pub residual: f64,
    /// Γ = φᵀ M r for X, Y, Z with φ M-normalised and signed like the
    /// displayed shape (kg^½).
    pub participation_factor: [f64; 3],
    /// Γ² (kg).
    pub effective_mass: [f64; 3],
    /// Γ² over the participating mass; null where that mass is zero.
    pub effective_mass_ratio: [Option<f64>; 3],
    pub cumulative_ratio: [Option<f64>; 3],
    /// Physical node ids, in project order, with six components each.
    pub node_ids: Vec<String>,
    /// Shape scaled so the largest translation over the mesh is +1.
    pub node_displacements: Vec<f64>,
    pub members: Vec<MemberModeShape>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModalMass {
    /// Mass contributed by each declared source after deduplication (kg).
    pub sources: Vec<SourceMass>,
    /// Their sum (kg), acting in each global translation.
    pub total: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceMass {
    pub id: String,
    pub kind: String,
    pub mass: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectionParticipation {
    /// "X", "Y" or "Z".
    pub direction: String,
    /// rᵀ M r over the free DOFs (kg).
    pub participating_mass: f64,
    /// Total mass minus the participating mass: mass held by restraints (kg).
    pub non_participating_mass: f64,
    /// Sum of the reported modes' ratios; null where nothing participates.
    pub cumulative_ratio: Option<f64>,
    /// Mass fraction in modes not computed.
    pub omitted_ratio: Option<f64>,
    pub target: f64,
    /// Null where nothing participates in this direction.
    pub achieved: Option<bool>,
}

/// Rayleigh damping C = a₀M + a₁K (response-v1), with the ratio and the two
/// frequencies it was derived from when entered that way.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RayleighDamping {
    pub a0: f64,
    pub a1: f64,
    pub ratio: Option<f64>,
    /// Hz.
    pub frequencies: Option<[f64; 2]>,
}

/// Steady-state response at one forcing frequency: complex amplitudes,
/// u(t) = Re(U e^{iΩt}), for the load case applied as F cos(Ωt).
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarmonicFrequency {
    /// Hz.
    pub frequency: f64,
    /// rad/s.
    pub omega: f64,
    /// The Rayleigh ratio at this frequency, a₀/(2Ω) + a₁Ω/2.
    pub damping_ratio: f64,
    /// ‖ZU − F‖∞ / ‖F‖∞.
    pub residual: f64,
    /// Six per node (node order of `nodeIds`): real and imaginary parts.
    pub displacement_re: Vec<f64>,
    pub displacement_im: Vec<f64>,
    /// Six per support (order of `supportIds`).
    pub reaction_re: Vec<f64>,
    pub reaction_im: Vec<f64>,
}

/// Harmonic (steady-state) response of one case or combination
/// (response-v1, `docs/formulations/response.md`).
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HarmonicResponse {
    pub result_id: String,
    pub schema_version: String,
    /// Always "harmonic".
    pub analysis_type: String,
    pub converged: bool,
    pub model_hash: String,
    pub settings_hash: String,
    pub solver_build_hash: String,
    pub source_revision: u64,
    pub case_id: String,
    pub subdivisions: usize,
    pub mass_matrix: String,
    pub damping: RayleighDamping,
    pub node_ids: Vec<String>,
    pub support_ids: Vec<String>,
    pub frequencies: Vec<HarmonicFrequency>,
    pub numerical_checks: serde_json::Value,
    pub disclosures: Vec<String>,
    pub diagnostics: Vec<serde_json::Value>,
}

/// One mode's contribution to a response-spectrum analysis.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectrumMode {
    pub mode: usize,
    pub omega: f64,
    pub frequency: f64,
    pub period: f64,
    /// Spectral pseudo-acceleration at the period, × scale (m/s²).
    pub sa: f64,
    /// Γ in the excitation direction (φ M-normalised).
    pub participation_factor: f64,
    /// Γ² (kg).
    pub effective_mass: f64,
    pub effective_mass_ratio: Option<f64>,
    /// Γ² × s × Sa (N), the modal base shear in the excitation direction.
    pub base_shear: f64,
}

/// Combined section-action magnitudes at one mesh node of a member.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectrumStation {
    pub station: f64,
    /// "left" / "right" of an interior mesh node; absent at member ends.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side: Option<String>,
    /// |N|, |Vy|, |Vz|, |T|, |My|, |Mz| in member local axes.
    pub actions: [f64; 6],
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectrumMember {
    pub id: String,
    pub stations: Vec<SpectrumStation>,
}

/// Response-spectrum analysis with a user spectrum (response-v1).
/// Combined values are non-negative peak magnitudes.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectrumResponse {
    pub result_id: String,
    pub schema_version: String,
    /// Always "responseSpectrum".
    pub analysis_type: String,
    pub converged: bool,
    pub model_hash: String,
    pub settings_hash: String,
    pub solver_build_hash: String,
    pub source_revision: u64,
    pub spectrum_id: String,
    /// "X", "Y" or "Z".
    pub direction: String,
    pub scale: f64,
    /// "srss" or "cqc".
    pub combination: String,
    pub damping_ratio: f64,
    pub subdivisions: usize,
    pub mass_matrix: String,
    pub requested_modes: usize,
    pub modes: Vec<SpectrumMode>,
    pub participation: DirectionParticipation,
    pub node_ids: Vec<String>,
    /// Six magnitudes per node.
    pub node_displacements: Vec<f64>,
    pub support_ids: Vec<String>,
    /// Six magnitudes per support.
    pub reactions: Vec<f64>,
    /// Combined |ΣFx|, |ΣFy|, |ΣFz| of the support reactions.
    pub base_reaction: [f64; 3],
    pub members: Vec<SpectrumMember>,
    pub numerical_checks: serde_json::Value,
    pub disclosures: Vec<String>,
    pub diagnostics: Vec<serde_json::Value>,
}
