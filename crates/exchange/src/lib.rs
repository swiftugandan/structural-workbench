pub fn import(s: &str) -> workbench_model::Result<workbench_model::Project> {
    workbench_model::Project::parse(s)
}
pub fn export(p: &workbench_model::Project) -> String {
    serde_json::to_string_pretty(p).expect("validated model")
}
