//! Spec Chapter G — major-axis shear for W-shapes under G2.1(a) (LRFD).

use serde_json::json;

use crate::profile::{CheckOutcome, CheckStatus, WSectionProps};

const PHI_V_G21A: f64 = 1.00;

#[derive(Debug, Clone, PartialEq)]
pub struct ShearResult {
    pub aw: f64,
    pub cv1: f64,
    pub vn: f64,
    pub phi_v_vn: f64,
}

/// Aw = d tw; Cv1 = 1.0 for G2.1(a); Vn = 0.6 Fy Aw Cv1.
pub fn evaluate_shear_major_g21a(section: &WSectionProps, fy: f64) -> ShearResult {
    let aw = section.d * section.tw;
    let cv1 = 1.0;
    let vn = 0.6 * fy * aw * cv1;
    ShearResult {
        aw,
        cv1,
        vn,
        phi_v_vn: PHI_V_G21A * vn,
    }
}

pub fn check_shear_major(section: &WSectionProps, fy: f64, vu: f64) -> CheckOutcome {
    if section.d <= 0.0 || section.tw <= 0.0 {
        return CheckOutcome::unsupported(
            "shear",
            "G2.1",
            "d and tw are required for major-axis shear",
        );
    }
    let r = evaluate_shear_major_g21a(section, fy);
    let status = if vu <= r.phi_v_vn {
        CheckStatus::Pass
    } else {
        CheckStatus::Fail
    };
    CheckOutcome::result(
        "shear",
        "G2.1",
        status,
        vu,
        r.phi_v_vn,
        "N",
        json!({
            "Aw": r.aw,
            "Cv1": r.cv1,
            "Vn": r.vn,
            "phi_v": PHI_V_G21A,
        }),
        "Major-axis shear with Cv1 = 1.0 (G2.1(a))",
    )
}
