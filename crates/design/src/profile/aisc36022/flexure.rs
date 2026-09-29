//! Spec Chapter F — major-axis flexure of doubly symmetric W-shapes with
//! compact webs (F2, F3).
//!
//! Implemented limit states, each with published Design Example fixtures
//! (`docs/code-profiles/aisc-360-22-lrfd/dossier-S3.md`):
//! - yielding, F2-1;
//! - compression flange local buckling of noncompact flanges, F3-1;
//! - lateral-torsional buckling, F2-2 (inelastic) and F2-3/F2-4 (elastic),
//!   which F3.1 also applies to noncompact-flange shapes.
//!
//! Slender flanges (F3-2), noncompact or slender webs (F4, F5) and missing
//! classification or torsional properties are UNSUPPORTED, never a pass.

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

/// Limiting flange slenderness ratios λpf, λrf (Table B4.1b Case 10).
pub fn flange_limits(e: f64, fy: f64) -> (f64, f64) {
    ((0.38) * (e / fy).sqrt(), (e / fy).sqrt())
}

/// Compression flange local buckling of a noncompact flange (F3-1):
/// Mn = Mp − (Mp − 0.7 Fy Sx)(λ − λpf)/(λrf − λpf).
pub fn evaluate_flange_local_buckling(section: &WSectionProps, fy: f64) -> f64 {
    let mp = fy * section.zx;
    let (lpf, lrf) = flange_limits(section.e, fy);
    let lambda = section.bf_over_2tf;
    mp - (mp - 0.7 * fy * section.sx) * (lambda - lpf) / (lrf - lpf)
}

/// Lateral-torsional buckling quantities of a doubly symmetric I-shape (c = 1).
#[derive(Debug, Clone, PartialEq)]
pub struct Ltb {
    /// Distance between flange centroids, d − tf (m).
    pub ho: f64,
    /// Effective radius of gyration, rts² = √(Iy Cw)/Sx with Cw = Iy ho²/4 (m).
    pub rts: f64,
    /// Limiting unbraced length for yielding (F2-5, m).
    pub lp: f64,
    /// Limiting unbraced length for inelastic LTB (F2-6, m).
    pub lr: f64,
    /// Nominal strength for the LTB limit state (N·m), capped at Mp; None when Lb ≤ Lp.
    pub mn: Option<f64>,
    /// Elastic critical stress (F2-4), only when Lb > Lr.
    pub fcr: Option<f64>,
    /// "none" | "inelastic" | "elastic".
    pub branch: &'static str,
}

pub fn evaluate_ltb(section: &WSectionProps, fy: f64, lb: f64, cb: f64) -> Ltb {
    let e = section.e;
    let mp = fy * section.zx;
    let ho = section.d - section.tf;
    let rts = (section.iy * ho / (2.0 * section.sx)).sqrt();
    let lp = 1.76 * section.ry * (e / fy).sqrt();
    let jc = section.j / (section.sx * ho);
    let lr = 1.95 * rts * e / (0.7 * fy)
        * (jc + (jc * jc + 6.76 * (0.7 * fy / e).powi(2)).sqrt()).sqrt();
    let (mn, fcr, branch) = if lb <= lp {
        (None, None, "none")
    } else if lb <= lr {
        let m = cb * (mp - (mp - 0.7 * fy * section.sx) * (lb - lp) / (lr - lp));
        (Some(m.min(mp)), None, "inelastic")
    } else {
        let s = lb / rts;
        let fcr = cb * std::f64::consts::PI.powi(2) * e / (s * s) * (1.0 + 0.078 * jc * s * s).sqrt();
        (Some((fcr * section.sx).min(mp)), Some(fcr), "elastic")
    };
    Ltb {
        ho,
        rts,
        lp,
        lr,
        mn,
        fcr,
        branch,
    }
}

/// Major-axis flexure of a doubly symmetric W-shape: the least of yielding,
/// flange local buckling and lateral-torsional buckling for the given
/// unbraced length and Cb.
pub fn check_flexure_major(
    section: &WSectionProps,
    fy: f64,
    lb: f64,
    cb: f64,
    mu: f64,
) -> CheckOutcome {
    let unsupported = |clause: &str, why: &str| CheckOutcome::unsupported("flexure", clause, why);
    if !(section.zx > 0.0 && section.sx > 0.0) {
        return unsupported("F2", "Zx and Sx are required for major-axis flexure");
    }
    if !(section.bf_over_2tf > 0.0 && section.h_over_tw > 0.0) {
        return unsupported(
            "B4.1b",
            "Flange bf/2tf and web h/tw are required to classify the section for flexure",
        );
    }
    let e = section.e;
    let lambda_pw = 3.76 * (e / fy).sqrt();
    if section.h_over_tw > lambda_pw {
        return unsupported(
            "F4",
            "Noncompact or slender webs (F4, F5) are outside the validated flexure scope",
        );
    }
    let (lpf, lrf) = flange_limits(e, fy);
    let lambda = section.bf_over_2tf;
    if lambda > lrf {
        return unsupported(
            "F3-2",
            "Slender compression flanges (F3-2) are outside the validated flexure scope",
        );
    }
    if !(lb.is_finite() && lb >= 0.0) {
        return unsupported("F2", "The unbraced length Lb must be zero or positive");
    }
    let mp = evaluate_flexure_major_yielding(section, fy).mp;
    let noncompact_flange = lambda > lpf;
    let (local_mn, local_clause, local_state) = if noncompact_flange {
        (
            evaluate_flange_local_buckling(section, fy),
            "F3-1",
            "compression flange local buckling",
        )
    } else {
        (mp, "F2-1", "yielding")
    };
    let mut values = json!({
        "Mp": mp,
        "phi_b": PHI_B,
        "Lb": lb,
        "lambda_f": lambda,
        "lambda_pf": lpf,
        "lambda_rf": lrf,
        "h_over_tw": section.h_over_tw,
        "lambda_pw": lambda_pw,
        "flange": if noncompact_flange { "noncompact" } else { "compact" },
        "M_local": local_mn,
    });
    let (mn, clause, state) = if lb > 0.0 {
        if !(section.iy > 0.0 && section.j > 0.0 && section.ry > 0.0 && section.d > section.tf && section.tf > 0.0) {
            return unsupported(
                "F2.2",
                "Lateral-torsional buckling (Lb > 0) needs Iy, J, ry, d and tf",
            );
        }
        if !(cb.is_finite() && cb >= 1.0) {
            return unsupported("F1", "Cb must be at least 1.0 (Spec Eq. F1-1)");
        }
        let ltb = evaluate_ltb(section, fy, lb, cb);
        values["Cb"] = json!(cb);
        values["ho"] = json!(ltb.ho);
        values["rts"] = json!(ltb.rts);
        values["Lp"] = json!(ltb.lp);
        values["Lr"] = json!(ltb.lr);
        values["ltbBranch"] = json!(ltb.branch);
        if let Some(fcr) = ltb.fcr {
            values["Fcr"] = json!(fcr);
        }
        match ltb.mn {
            Some(m) => {
                values["M_ltb"] = json!(m);
                if m < local_mn {
                    let clause = if ltb.branch == "elastic" { "F2-3" } else { "F2-2" };
                    (m, clause, "lateral-torsional buckling")
                } else {
                    (local_mn, local_clause, local_state)
                }
            }
            None => (local_mn, local_clause, local_state),
        }
    } else {
        (local_mn, local_clause, local_state)
    };
    values["Mn"] = json!(mn);
    values["limitState"] = json!(state);
    let phi_b_mn = PHI_B * mn;
    let status = if mu <= phi_b_mn {
        CheckStatus::Pass
    } else {
        CheckStatus::Fail
    };
    CheckOutcome::result(
        "flexure",
        clause,
        status,
        mu,
        phi_b_mn,
        "N·m",
        values,
        &format!("Major-axis flexure of a compact-web W: {state} governs"),
    )
}
