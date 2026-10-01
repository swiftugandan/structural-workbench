//! Compile-time verification of the EC2 UK profile's resources (ADR 0026):
//! the held edition's texts and the JRC89037 examples are locked with SHA-256
//! hashes, and the committed fixture manifest names them. Private PDFs are
//! not needed in CI.

use serde_json::Value;

const LOCK_JSON: &str = include_str!("../../../../../resources.lock.json");
const MANIFEST_JSON: &str = include_str!("../../../../../fixtures/design/ec2-uk-na/manifest.json");
const _BEAM: &str = include_str!("../../../../../fixtures/design/ec2-uk-na/jrc-axis2-beam.published.json");
const _RECONCILIATION: &str =
    include_str!("../../../../../fixtures/design/ec2-uk-na/jrc-axis2-beam.reconciliation.json");
const _DETAILING: &str = include_str!("../../../../../fixtures/design/ec2-uk-na/jrc-detailing.published.json");

const REQUIRED_LOCK_IDS: &[&str] = &["R-EC2-EN-1992-1-1-2004", "R-EC2-UK-NA-2009", "R-EC2-JRC-EXAMPLES"];

pub fn verify_lock_and_manifest(lock_text: &str, manifest_text: &str) -> Result<(), String> {
    let lock: Value = serde_json::from_str(lock_text).map_err(|e| format!("resources.lock.json: {e}"))?;
    let acquired = lock["acquired"].as_array().ok_or("resources.lock.json missing acquired[]")?;
    let unresolved = lock["unresolved"].as_array().cloned().unwrap_or_default();
    for id in REQUIRED_LOCK_IDS {
        if unresolved.iter().any(|v| v.as_str() == Some(id)) {
            return Err(format!("{id} is still unresolved"));
        }
        let entry = acquired.iter().find(|e| e["id"].as_str() == Some(id)).ok_or(format!("{id} is not acquired"))?;
        let hash = entry["contentHashSha256"].as_str().ok_or(format!("{id} has no contentHashSha256"))?;
        if !(hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit())) {
            return Err(format!("{id} contentHashSha256 is not a SHA-256 digest"));
        }
    }
    let manifest: Value = serde_json::from_str(manifest_text).map_err(|e| format!("EC2 manifest: {e}"))?;
    if manifest["profileId"].as_str() != Some("ec2-uk-na") {
        return Err("EC2 manifest profileId mismatch".into());
    }
    let ids = manifest["sourceEdition"]["lockIds"].as_array().cloned().unwrap_or_default();
    for id in REQUIRED_LOCK_IDS {
        if !ids.iter().any(|v| v.as_str() == Some(id)) {
            return Err(format!("EC2 manifest lockIds missing {id}"));
        }
    }
    let reconciliation: Value = serde_json::from_str(_RECONCILIATION).map_err(|e| format!("reconciliation: {e}"))?;
    if reconciliation["failures"].as_array().is_none_or(|f| !f.is_empty()) {
        return Err("The JRC beam reconciliation records failures".into());
    }
    Ok(())
}

/// True when the lock and the committed EC2 fixture corpus verify.
pub fn ec2_resources_verified() -> bool {
    verify_lock_and_manifest(LOCK_JSON, MANIFEST_JSON).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn committed_resources_verify() {
        assert_eq!(verify_lock_and_manifest(LOCK_JSON, MANIFEST_JSON), Ok(()));
    }

    #[test]
    fn a_missing_lock_hash_disables_the_profile() {
        let stripped = LOCK_JSON.replace("\"contentHashSha256\": \"06f6106355fb737bee2cb98870d2f3b7d80c3cded5b37400c8eb81dfbbbe954a\"", "\"x\": 1");
        assert!(verify_lock_and_manifest(&stripped, MANIFEST_JSON).is_err());
    }
}
