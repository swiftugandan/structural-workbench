//! Solid rectangular section properties (principal axes, Saint-Venant torsion).
//!
//! Local y is the width direction; local z is the depth direction — matching
//! catalogue extreme-fibre conventions (cy = half-width, cz = half-depth).

use crate::{Result, err};
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RectangularSection {
    #[serde(rename = "A")]
    pub a: f64,
    #[serde(rename = "Iy")]
    pub iy: f64,
    #[serde(rename = "Iz")]
    pub iz: f64,
    #[serde(rename = "J")]
    pub j: f64,
    pub cy: f64,
    pub cz: f64,
    pub width: f64,
    pub depth: f64,
    pub j_source: &'static str,
    pub provenance: String,
}

/// Saint-Venant torsion constant for a solid rectangle with sides `a ≥ b > 0`.
///
/// Approximate closed form (Roark / Timoshenko handbook form):
/// `J = a b³ [1/3 − 0.21 (b/a) (1 − b⁴/(12 a⁴))]`.
pub fn solid_rectangle_j(a: f64, b: f64) -> f64 {
    let (long, short) = if a >= b { (a, b) } else { (b, a) };
    let ratio = short / long;
    let beta = 1.0 / 3.0 - 0.21 * ratio * (1.0 - ratio.powi(4) / 12.0);
    long * short.powi(3) * beta
}

/// Compute properties for a solid rectangle of width (along local y) and depth
/// (along local z). Optional `custom_j` replaces the Saint-Venant estimate.
pub fn solid_rectangle(width: f64, depth: f64, custom_j: Option<f64>) -> Result<RectangularSection> {
    if !(width.is_finite() && depth.is_finite() && width > 0.0 && depth > 0.0) {
        return Err(err(
            "INVALID_SECTION",
            "Rectangle width and depth must be finite and positive",
        ));
    }
    if let Some(j) = custom_j {
        if !(j.is_finite() && j > 0.0) {
            return Err(err(
                "INVALID_SECTION",
                "Custom torsion constant J must be finite and positive",
            ));
        }
    }
    let a = width * depth;
    let iy = width * depth.powi(3) / 12.0;
    let iz = depth * width.powi(3) / 12.0;
    let (j, j_source) = match custom_j {
        Some(j) => (j, "custom"),
        None => (solid_rectangle_j(width, depth), "saintVenant"),
    };
    let provenance = match custom_j {
        Some(_) => format!(
            "Computed solid rectangle {width:.6} m (local y) × {depth:.6} m (local z); custom J"
        ),
        None => format!(
            "Computed solid rectangle {width:.6} m (local y) × {depth:.6} m (local z); Saint-Venant J"
        ),
    };
    Ok(RectangularSection {
        a,
        iy,
        iz,
        j,
        cy: width / 2.0,
        cz: depth / 2.0,
        width,
        depth,
        j_source,
        provenance,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn square_matches_exact_second_moments() {
        let s = solid_rectangle(0.1, 0.1, None).unwrap();
        assert!((s.a - 0.01).abs() < 1e-15);
        assert!((s.iy - 8.333_333_333_333_333e-6).abs() < 1e-18);
        assert!((s.iz - s.iy).abs() < 1e-18);
        assert!((s.cy - 0.05).abs() < 1e-15);
        assert!((s.cz - 0.05).abs() < 1e-15);
        // a=b=0.1 → J = 0.1⁴ × (1/3 − 0.21×(1−1/12)) = 1e-4 × 0.140833…
        let expected_j = 0.1_f64.powi(4) * (1.0 / 3.0 - 0.21 * (1.0 - 1.0 / 12.0));
        assert!((s.j - expected_j).abs() < 1e-18);
        assert_eq!(s.j_source, "saintVenant");
    }

    #[test]
    fn rectangle_swaps_inertias_with_axes() {
        let s = solid_rectangle(0.05, 0.2, None).unwrap();
        assert!((s.iy - 0.05 * 0.2_f64.powi(3) / 12.0).abs() < 1e-18);
        assert!((s.iz - 0.2 * 0.05_f64.powi(3) / 12.0).abs() < 1e-18);
        assert!(s.iy > s.iz);
        assert!((s.cy - 0.025).abs() < 1e-15);
        assert!((s.cz - 0.1).abs() < 1e-15);
    }

    #[test]
    fn custom_j_overrides_saint_venant() {
        let s = solid_rectangle(0.1, 0.2, Some(1.5e-6)).unwrap();
        assert!((s.j - 1.5e-6).abs() < 1e-18);
        assert_eq!(s.j_source, "custom");
        assert!(s.provenance.contains("custom J"));
    }

    #[test]
    fn rejects_non_positive() {
        assert!(solid_rectangle(0.0, 0.1, None).is_err());
        assert!(solid_rectangle(0.1, -1.0, None).is_err());
        assert!(solid_rectangle(0.1, 0.1, Some(0.0)).is_err());
    }
}
