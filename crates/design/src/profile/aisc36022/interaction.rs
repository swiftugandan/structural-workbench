//! Spec Chapter H — H1 interaction for doubly-symmetric members (LRFD).

use serde_json::json;

use crate::profile::{CheckOutcome, CheckStatus};

#[derive(Debug, Clone, PartialEq)]
pub struct InteractionResult {
    pub pr_over_pc: f64,
    pub equation: &'static str,
    pub ratio: f64,
}

/// H1-1a / H1-1b using required and available strengths (consistent force/moment units).
pub fn evaluate_h1(
    pr: f64,
    pc: f64,
    mrx: f64,
    mcx: f64,
    mry: f64,
    mcy: f64,
) -> Result<InteractionResult, String> {
    if pc <= 0.0 || mcx <= 0.0 || mcy <= 0.0 {
        return Err("H1 requires positive Pc, Mcx and Mcy".into());
    }
    let pr_over_pc = pr / pc;
    if pr_over_pc >= 0.2 {
        let ratio = pr_over_pc + (8.0 / 9.0) * (mrx / mcx + mry / mcy);
        Ok(InteractionResult {
            pr_over_pc,
            equation: "H1-1a",
            ratio,
        })
    } else {
        let ratio = pr_over_pc / 2.0 + (mrx / mcx + mry / mcy);
        Ok(InteractionResult {
            pr_over_pc,
            equation: "H1-1b",
            ratio,
        })
    }
}

pub fn check_h1(
    pr: f64,
    pc: f64,
    mrx: f64,
    mcx: f64,
    mry: f64,
    mcy: f64,
) -> CheckOutcome {
    match evaluate_h1(pr, pc, mrx, mcx, mry, mcy) {
        Ok(r) => {
            let status = if r.ratio <= 1.0 {
                CheckStatus::Pass
            } else {
                CheckStatus::Fail
            };
            CheckOutcome::result(
                "interaction-H1",
                r.equation,
                status,
                r.ratio,
                1.0,
                "-",
                json!({
                    "Pr_over_Pc": r.pr_over_pc,
                    "Mrx_over_Mcx": mrx / mcx,
                    "Mry_over_Mcy": mry / mcy,
                    "interactionRatio": r.ratio,
                    "equation": r.equation,
                }),
                format!("Interaction {} ratio = {:.4}", r.equation, r.ratio),
            )
        }
        Err(message) => CheckOutcome::unsupported("interaction-H1", "H1", message),
    }
}
