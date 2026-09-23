//! Compile-time verification of locked AISC resources + S2 fixture corpus.
//!
//! Private PDFs are not required in CI. Presence of `resources.lock.json`
//! entries and reconstituted fixtures is the gate. Optional native vault hash
//! checks run only when local PDFs exist.

use serde_json::Value;

const LOCK_JSON: &str = include_str!("../../../../../resources.lock.json");
const MANIFEST_JSON: &str =
    include_str!("../../../../../fixtures/design/aisc-360-22-lrfd/manifest.json");

// Ensure each seed file is present in the tree (compile fails if missing).
const _S2_D1: &str =
    include_str!("../../../../../fixtures/design/aisc-360-22-lrfd/S2-D1-tension-W8x21.json");
const _S2_E1C: &str = include_str!(
    "../../../../../fixtures/design/aisc-360-22-lrfd/S2-E1C-compression-W14x132.json"
);
const _S2_F11B: &str =
    include_str!("../../../../../fixtures/design/aisc-360-22-lrfd/S2-F11B-flexure-W18x50.json");
const _S2_G1B: &str =
    include_str!("../../../../../fixtures/design/aisc-360-22-lrfd/S2-G1B-shear-W24x62.json");
const _S2_H1B: &str = include_str!(
    "../../../../../fixtures/design/aisc-360-22-lrfd/S2-H1B-interaction-W14x99.json"
);

const REQUIRED_LOCK_IDS: &[&str] = &["R-CODE-STEEL", "R-STEEL-EXAMPLES"];

fn is_sha256_hex(s: &str) -> bool {
    s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit())
}

/// Validate committed lock + fixture manifest text.
pub fn verify_lock_and_manifest(lock_text: &str, manifest_text: &str) -> Result<(), String> {
    let lock: Value =
        serde_json::from_str(lock_text).map_err(|e| format!("resources.lock.json: {e}"))?;
    let unresolved = lock["unresolved"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let acquired = lock["acquired"]
        .as_array()
        .ok_or_else(|| "resources.lock.json missing acquired[]".to_string())?;

    for id in REQUIRED_LOCK_IDS {
        if unresolved.iter().any(|v| v.as_str() == Some(id)) {
            return Err(format!("{id} is still listed in resources.lock unresolved[]"));
        }
        let entry = acquired
            .iter()
            .find(|e| e["id"].as_str() == Some(id))
            .ok_or_else(|| format!("{id} missing from resources.lock acquired[]"))?;
        let hash = entry["contentHashSha256"]
            .as_str()
            .ok_or_else(|| format!("{id} missing contentHashSha256"))?;
        if !is_sha256_hex(hash) {
            return Err(format!("{id} contentHashSha256 is not a 64-char hex digest"));
        }
    }

    let manifest: Value =
        serde_json::from_str(manifest_text).map_err(|e| format!("S2 manifest: {e}"))?;
    if manifest["profileId"].as_str() != Some("aisc-360-22-lrfd") {
        return Err("S2 manifest profileId mismatch".into());
    }
    let fixtures = manifest["fixtures"]
        .as_array()
        .ok_or_else(|| "S2 manifest missing fixtures[]".to_string())?;
    if fixtures.len() < 5 {
        return Err(format!(
            "S2 manifest expected ≥5 fixtures, found {}",
            fixtures.len()
        ));
    }
    for id in REQUIRED_LOCK_IDS {
        let lock_ids = manifest["sourceEdition"]["lockIds"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        if !lock_ids.iter().any(|v| v.as_str() == Some(id)) {
            return Err(format!("S2 manifest sourceEdition.lockIds missing {id}"));
        }
    }
    Ok(())
}

/// True when committed lock + S2 fixture corpus verify (no private PDF required).
pub fn aisc_s2_resources_verified() -> bool {
    verify_lock_and_manifest(LOCK_JSON, MANIFEST_JSON).is_ok()
}

/// If local vault PDFs exist, confirm their SHA-256 matches the lock.
pub fn verify_vault_pdfs_if_present(repo_root: &std::path::Path) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    use std::fs;

    let lock: Value =
        serde_json::from_str(LOCK_JSON).map_err(|e| format!("resources.lock.json: {e}"))?;
    let acquired = lock["acquired"].as_array().cloned().unwrap_or_default();

    for id in REQUIRED_LOCK_IDS {
        let entry = acquired
            .iter()
            .find(|e| e["id"].as_str() == Some(id))
            .ok_or_else(|| format!("{id} missing from lock"))?;
        let rel = entry["localPath"]
            .as_str()
            .ok_or_else(|| format!("{id} missing localPath"))?;
        let path = repo_root.join(rel);
        if !path.is_file() {
            continue; // CI / machines without private vault
        }
        let expected = entry["contentHashSha256"]
            .as_str()
            .ok_or_else(|| format!("{id} missing contentHashSha256"))?;
        let bytes = fs::read(&path).map_err(|e| format!("read {}: {e}", path.display()))?;
        let actual = format!("{:x}", Sha256::digest(&bytes));
        if actual != expected {
            return Err(format!(
                "{id} vault hash mismatch for {}: expected {expected}, got {actual}",
                path.display()
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn committed_lock_and_manifest_verify() {
        verify_lock_and_manifest(LOCK_JSON, MANIFEST_JSON).unwrap();
        assert!(aisc_s2_resources_verified());
    }

    #[test]
    fn vault_pdfs_match_lock_when_present() {
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
        verify_vault_pdfs_if_present(&root).unwrap();
    }
}
