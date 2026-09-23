//! Spec Table B4.1a classification for doubly-symmetric W shapes (compression).

use serde_json::json;

use crate::profile::{CheckOutcome, CheckStatus, WSectionProps};

#[derive(Debug, Clone, PartialEq)]
pub struct ClassificationResult {
    pub flanges_nonslender: bool,
    pub web_nonslender: bool,
    pub lambda_r_flange: f64,
    pub lambda_r_web: f64,
}

/// Compression element classification (Table B4.1a Cases 1 and 5).
pub fn classify_compression_w(section: &WSectionProps, fy: f64) -> ClassificationResult {
    let e = if section.e > 0.0 {
        section.e
    } else {
        200e9
    };
    let sqrt_efy = (e / fy).sqrt();
    let lambda_r_flange = 0.56 * sqrt_efy;
    let lambda_r_web = 1.49 * sqrt_efy;
    ClassificationResult {
        flanges_nonslender: section.bf_over_2tf <= lambda_r_flange,
        web_nonslender: section.h_over_tw <= lambda_r_web,
        lambda_r_flange,
        lambda_r_web,
    }
}

pub fn check_classification(section: &WSectionProps, fy: f64) -> CheckOutcome {
    let r = classify_compression_w(section, fy);
    let ok = r.flanges_nonslender && r.web_nonslender;
    CheckOutcome::result(
        "classification",
        "B4.1a",
        if ok {
            CheckStatus::Pass
        } else {
            CheckStatus::Fail
        },
        0.0,
        1.0,
        "-",
        json!({
            "bf_over_2tf": section.bf_over_2tf,
            "h_over_tw": section.h_over_tw,
            "lambda_r_flange": r.lambda_r_flange,
            "lambda_r_web": r.lambda_r_web,
            "flanges_nonslender": r.flanges_nonslender,
            "web_nonslender": r.web_nonslender,
        }),
        if ok {
            "Flanges and web are nonslender for compression"
        } else {
            "Slender compression elements outside M07-C nonslender path"
        },
    )
}
