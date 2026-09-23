//! Spec Chapter F — compact W major-axis flexure, continuous brace (F2 yielding).

use serde_json::json;

use crate::profile::{CheckOutcome, CheckStatus, WSectionProps};

const PHI_B: f64 = 0.90;

#[derive(Debug, Clone, PartialEq)]
pub struct FlexureResult {
    pub mp: f64,
    pub mn: f64,
    pub phi_b_mn: f64,
}

/// Continuously braced compact doubly-symmetric I-shape: Mn = Mp = Fy Zx (F2-1).
pub fn evaluate_flexure_major_yielding(section: &WSectionProps, fy: f64) -> FlexureResult {
    let mp = fy * section.zx;
    FlexureResult {
        mp,
        mn: mp,
        phi_b_mn: PHI_B * mp,
    }
}

pub fn check_flexure_major_continuous(
    section: &WSectionProps,
    fy: f64,
    lb: f64,
    mu: f64,
) -> CheckOutcome {
    if lb > f64::EPSILON {
        return CheckOutcome::unsupported(
            "flexure",
            "F2",
            "Lateral-torsional buckling (Lb > 0) is outside the continuous-brace F2 yielding path",
        );
    }
    if section.zx <= 0.0 {
        return CheckOutcome::unsupported(
            "flexure",
            "F2-1",
            "Zx is required for major-axis flexural yielding",
        );
    }
    let r = evaluate_flexure_major_yielding(section, fy);
    let status = if mu <= r.phi_b_mn {
        CheckStatus::Pass
    } else {
        CheckStatus::Fail
    };
    CheckOutcome::result(
        "flexure",
        "F2-1",
        status,
        mu,
        r.phi_b_mn,
        "N·m",
        json!({
            "Mp": r.mp,
            "Mn": r.mn,
            "phi_b": PHI_B,
            "Lb": lb,
            "limitState": "yielding",
        }),
        "Major-axis flexural yielding (continuously braced compact W)",
    )
}
