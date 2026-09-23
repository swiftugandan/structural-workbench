//! Spec Chapter E — flexural buckling of nonslender W columns (E3, LRFD).

use serde_json::json;

use super::classification::classify_compression_w;
use crate::profile::{CheckOutcome, CheckStatus, WSectionProps};

const PHI_C: f64 = 0.90;
const PI: f64 = std::f64::consts::PI;

#[derive(Debug, Clone, PartialEq)]
pub struct CompressionResult {
    pub lc_over_r: f64,
    pub fe: f64,
    pub fcr: f64,
    pub pn: f64,
    pub phi_c_pn: f64,
    pub governing_axis: &'static str,
}

/// Effective length about each axis: Lc = K L (same units as length).
pub fn evaluate_compression(
    section: &WSectionProps,
    fy: f64,
    length: f64,
    kx: f64,
    ky: f64,
) -> Result<CompressionResult, String> {
    let class = classify_compression_w(section, fy);
    if !class.flanges_nonslender || !class.web_nonslender {
        return Err("Slender-element compression is outside M07-C E3 nonslender path".into());
    }
    let e = if section.e > 0.0 {
        section.e
    } else {
        200e9
    };
    let lc_x = kx * length;
    let lc_y = ky * length;
    let ratio_x = lc_x / section.rx;
    let ratio_y = lc_y / section.ry;
    let (lc_over_r, governing_axis) = if ratio_y >= ratio_x {
        (ratio_y, "y")
    } else {
        (ratio_x, "x")
    };
    let fe = (PI * PI * e) / (lc_over_r * lc_over_r);
    let fy_fe = fy / fe;
    let fcr = if fy_fe <= 2.25 {
        0.658_f64.powf(fy_fe) * fy
    } else {
        0.877 * fe
    };
    let pn = fcr * section.ag;
    Ok(CompressionResult {
        lc_over_r,
        fe,
        fcr,
        pn,
        phi_c_pn: PHI_C * pn,
        governing_axis,
    })
}

pub fn check_compression(
    section: &WSectionProps,
    fy: f64,
    length: f64,
    kx: f64,
    ky: f64,
    pu: f64,
) -> CheckOutcome {
    if section.ag <= 0.0 || section.rx <= 0.0 || section.ry <= 0.0 {
        return CheckOutcome::unsupported(
            "compression",
            "E3",
            "Ag, rx and ry are required for flexural-buckling compression",
        );
    }
    if section.bf_over_2tf <= 0.0 || section.h_over_tw <= 0.0 {
        return CheckOutcome::unsupported(
            "compression",
            "B4.1a",
            "bf/2tf and h/tw are required before E3 compression",
        );
    }
    match evaluate_compression(section, fy, length, kx, ky) {
        Ok(r) => {
            let status = if pu <= r.phi_c_pn {
                CheckStatus::Pass
            } else {
                CheckStatus::Fail
            };
            CheckOutcome::result(
                "compression",
                "E3",
                status,
                pu,
                r.phi_c_pn,
                "N",
                json!({
                    "Lc_over_r": r.lc_over_r,
                    "Fe": r.fe,
                    "Fcr": r.fcr,
                    "Pn": r.pn,
                    "phi_c": PHI_C,
                    "governing_axis": r.governing_axis,
                }),
                format!("Flexural buckling about {}-axis", r.governing_axis),
            )
        }
        Err(message) => CheckOutcome::unsupported("compression", "E3", message),
    }
}
