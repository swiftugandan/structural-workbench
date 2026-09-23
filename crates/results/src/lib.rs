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
