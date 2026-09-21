use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberResult {
    pub id: String,
    pub length: f64,
    pub end_actions: Vec<f64>,
    pub samples: Vec<Sample>,
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
