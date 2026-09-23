//! Spec Chapter D — tension yielding and rupture (LRFD).

use serde_json::json;

use crate::profile::{CheckOutcome, CheckStatus, TensionEndProps, WSectionProps};

const PHI_T_YIELD: f64 = 0.90;
const PHI_T_RUPTURE: f64 = 0.75;

#[derive(Debug, Clone, PartialEq)]
pub struct TensionResult {
    pub pn_yield: f64,
    pub phi_pn_yield: f64,
    pub pn_rupture: f64,
    pub phi_pn_rupture: f64,
    pub u: f64,
    pub an: f64,
    pub ae: f64,
    pub governing_phi_pn: f64,
    pub governing: &'static str,
}

/// Shear lag U = max(1 − x̄/ℓ, U_floor, Case-7 floor when applicable).
pub fn shear_lag_u(end: &TensionEndProps, section: &WSectionProps) -> f64 {
    let mut u: f64 = 0.0;
    if let (Some(x), Some(ell)) = (end.x_bar, end.connection_length) {
        if ell > 0.0 {
            u = u.max(1.0 - x / ell);
        }
    }
    if let Some(floor) = end.u_floor {
        u = u.max(floor);
    }
    // Table D3.1 Case 7: ≥3 fasteners per line and bf < (2/3)d → U = 0.85
    if section.bf < (2.0 / 3.0) * section.d {
        u = u.max(0.85);
    }
    u
}

pub fn evaluate_tension(
    section: &WSectionProps,
    fy: f64,
    fu: f64,
    end: &TensionEndProps,
) -> TensionResult {
    let pn_yield = fy * section.ag;
    let phi_pn_yield = PHI_T_YIELD * pn_yield;

    let an = section.ag
        - end.hole_count as f64 * end.hole_deduction_width * section.tf;
    let u = shear_lag_u(end, section);
    let ae = an * u;
    let pn_rupture = fu * ae;
    let phi_pn_rupture = PHI_T_RUPTURE * pn_rupture;

    let (governing_phi_pn, governing) = if phi_pn_rupture <= phi_pn_yield {
        (phi_pn_rupture, "rupture")
    } else {
        (phi_pn_yield, "yielding")
    };

    TensionResult {
        pn_yield,
        phi_pn_yield,
        pn_rupture,
        phi_pn_rupture,
        u,
        an,
        ae,
        governing_phi_pn,
        governing,
    }
}

pub fn check_tension(
    section: &WSectionProps,
    fy: f64,
    fu: f64,
    end: &TensionEndProps,
    pu: f64,
) -> CheckOutcome {
    let r = evaluate_tension(section, fy, fu, end);
    let status = if pu <= r.governing_phi_pn {
        CheckStatus::Pass
    } else {
        CheckStatus::Fail
    };
    CheckOutcome::result(
        "tension",
        "D2/D3",
        status,
        pu,
        r.governing_phi_pn,
        "N",
        json!({
            "U": r.u,
            "An": r.an,
            "Ae": r.ae,
            "phi_t_Pn_yield": r.phi_pn_yield,
            "phi_t_Pn_rupture": r.phi_pn_rupture,
            "Pn_rupture": r.pn_rupture,
            "governing": r.governing,
            "phi_t_yield": PHI_T_YIELD,
            "phi_t_rupture": PHI_T_RUPTURE,
        }),
        format!("Tension governed by {}", r.governing),
    )
}
