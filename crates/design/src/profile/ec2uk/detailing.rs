//! EN 1992-1-1:2004 detailing and serviceability checks for rectangular RC
//! beams with the UK National Annex (2009): cover (4.4.1), bar spacing
//! (8.2), anchorage (8.4), minimum crack-control steel (7.3.2), crack control
//! without direct calculation (7.3.3) and span/effective depth (7.4.2).
//! ADR 0026; clause reading in `docs/code-profiles/ec2-uk-na/dossier-beam.md`.
//!
//! Every input the engineer must choose (durability cover, aggregate size,
//! exposure, structural system, partitions, the quasi-permanent combination)
//! comes from `RcBeamDetailing`. A check whose input is missing reports
//! indeterminate and names the input; nothing is assumed.

use serde_json::json;

use super::{Ec2Ndp, ES, face_name, opposite, tension};
use crate::profile::{CheckOutcome, CheckStatus, RcBeamContext, RcFace};
use crate::rc_section::{self, BarLayer, ConcreteLaw, RcRectangle, SteelLaw};

/// UK NA 4.4.1.3(1)P: Δc_dev.
const DELTA_C_DEV: f64 = 0.010;
/// 4.4.1.2(2): c_min is at least 10 mm.
const C_MIN_FLOOR: f64 = 0.010;
/// UK NA 8.2(2): k1 = 1, k2 = 5 mm; and the 20 mm floor.
const SPACING_K1: f64 = 1.0;
const SPACING_K2: f64 = 0.005;
const SPACING_FLOOR: f64 = 0.020;
/// UK NA 3.1.6(2)P: α_ct.
const ALPHA_CT: f64 = 1.0;
/// UK NA Table NA.4: reinforced members, quasi-permanent combination. The
/// 0.3 mm cell spans XC2 to XS3; X0 and XC1 are 0.3 mm (appearance).
const EXPOSURE_CLASSES: &[&str] = &[
    "X0", "XC1", "XC2", "XC3", "XC4", "XD1", "XD2", "XD3", "XS1", "XS2", "XS3",
];
const W_MAX_RC: f64 = 0.3e-3;

/// An input the engineer must provide is missing: the check names it.
fn indeterminate(id: &str, clause: &str, reason: impl Into<String>) -> CheckOutcome {
    CheckOutcome { status: CheckStatus::Indeterminate, ..CheckOutcome::unsupported(id, clause, reason) }
}

/// Table 3.1 (fck ≤ 50 MPa): fctm, fctk,0.05 and Ecm in Pa.
pub(crate) fn table_3_1(fck: f64) -> (f64, f64, f64) {
    let fck_mpa = fck / 1e6;
    let fctm = 0.30 * fck_mpa.powf(2. / 3.) * 1e6;
    let ecm = 22. * ((fck_mpa + 8.) / 10.).powf(0.3) * 1e9;
    (fctm, 0.7 * fctm, ecm)
}

fn row(rc: &RcBeamContext, face: RcFace) -> Option<&crate::profile::RcBarRow> {
    rc.rows.iter().find(|r| r.face == face)
}

/// Clear spacing between bars of one layer across the width.
fn clear_spacing(rc: &RcBeamContext, diameter: f64, count: u32) -> Option<f64> {
    let link = rc.links.as_ref().map_or(0., |l| l.diameter);
    (count >= 2).then(|| {
        (rc.width - 2. * (rc.cover_to_link + link) - count as f64 * diameter) / (count as f64 - 1.)
    })
}

/// 4.4.1.2 and 4.4.1.3: c_nom = max(c_min,b, c_min,dur, 10 mm) + Δc_dev for
/// the links and for the main bars (Δc_dur,γ, Δc_dur,st, Δc_dur,add = 0,
/// UK NA 4.4.1.2(6)-(8)).
pub fn cover(rc: &RcBeamContext) -> CheckOutcome {
    let clause = "4.4.1.2, 4.4.1.3; UK NA 4.4.1.2(5), 4.4.1.3(1)P";
    let (Some(c_dur), Some(dg)) = (rc.detailing.cover_durability, rc.detailing.aggregate_size) else {
        return indeterminate(
            "ec2.cover",
            clause,
            "Enter c_min,dur for the exposure class (BS 8500-1 Tables A.4/A.5, UK NA 4.4.1.2(5)) and the maximum aggregate size",
        );
    };
    let link = rc.links.as_ref().map_or(0., |l| l.diameter);
    let bar = rc.rows.iter().filter_map(|r| r.bars.map(|b| b.diameter)).fold(0., f64::max);
    // 4.4.1.2(3) Table 4.2: c_min,b = bar diameter (separated bars), +5 mm when dg > 32 mm.
    let aggregate = if dg > 0.032 { 0.005 } else { 0. };
    let required = |phi: f64| (phi + aggregate).max(c_dur).max(C_MIN_FLOOR) + DELTA_C_DEV;
    let (link_req, bar_req) = (required(link), required(bar));
    let (link_prov, bar_prov) = (rc.cover_to_link, rc.cover_to_link + link);
    let ratio = (link_req / link_prov).max(bar_req / bar_prov);
    CheckOutcome::result(
        "ec2.cover",
        clause,
        if link_prov >= link_req - 1e-12 && bar_prov >= bar_req - 1e-12 { CheckStatus::Pass } else { CheckStatus::Fail },
        ratio,
        1.,
        "-",
        json!({"cMinDur": c_dur, "aggregateSize": dg, "deltaCDev": DELTA_C_DEV,
               "links": {"diameter": link, "cNomRequired": link_req, "provided": link_prov},
               "mainBars": {"diameter": bar, "cNomRequired": bar_req, "provided": bar_prov}}),
        "Demand is the larger of c_nom,required/c_provided for the links and the main bars",
    )
}

/// 8.2(2): clear distance ≥ max(k1 φ, dg + k2, 20 mm) in every row.
pub fn bar_spacing(rc: &RcBeamContext) -> CheckOutcome {
    let clause = "8.2(2); UK NA 8.2(2)";
    let Some(dg) = rc.detailing.aggregate_size else {
        return indeterminate("ec2.bar-spacing", clause, "Enter the maximum aggregate size");
    };
    let mut rows = vec![];
    let mut worst: f64 = 0.;
    for r in &rc.rows {
        let Some(b) = r.bars else {
            return indeterminate("ec2.bar-spacing", clause, "Bar diameters and counts are needed for every row");
        };
        let Some(clear) = clear_spacing(rc, b.diameter, b.count) else { continue };
        let min = (SPACING_K1 * b.diameter).max(dg + SPACING_K2).max(SPACING_FLOOR);
        worst = worst.max(min / clear.max(1e-12));
        rows.push(json!({"face": face_name(r.face), "clearSpacing": clear, "minimum": min, "diameter": b.diameter, "count": b.count}));
    }
    if rows.is_empty() {
        return indeterminate("ec2.bar-spacing", clause, "Single-bar rows have no spacing to check");
    }
    CheckOutcome::result(
        "ec2.bar-spacing",
        clause,
        if worst <= 1. + 1e-12 { CheckStatus::Pass } else { CheckStatus::Fail },
        worst,
        1.,
        "-",
        json!({"rows": rows, "k1": SPACING_K1, "k2": SPACING_K2, "aggregateSize": dg}),
        "Demand is the largest s_min/s_clear",
    )
}

/// 8.4.2-8.4.4 design anchorage lengths of straight ribbed bars.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Anchorage {
    pub fbd: f64,
    pub lb_rqd: f64,
    pub alpha2: f64,
    pub lbd_tension: f64,
    pub lbd_compression: f64,
}

/// `good` is the Figure 8.2 bond condition; `cd` is Figure 8.3's c_d for
/// straight bars. α1 = 1 (straight), α3 = α4 = α5 = 1 (confinement and
/// transverse pressure conservatively ignored); σsd = fyd.
pub fn anchorage_length(ndp: &Ec2Ndp, fck: f64, fyk: f64, phi: f64, good: bool, cd: f64) -> Anchorage {
    let (_, fctk005, _) = table_3_1(fck);
    let fctd = ALPHA_CT * fctk005 / ndp.gamma_c;
    let eta1 = if good { 1.0 } else { 0.7 };
    let eta2 = if phi <= 0.032 { 1.0 } else { (132. - phi * 1e3) / 100. };
    let fbd = 2.25 * eta1 * eta2 * fctd;
    let sigma_sd = fyk / ndp.gamma_s;
    let lb_rqd = phi / 4. * sigma_sd / fbd;
    let alpha2 = (1. - 0.15 * (cd - phi) / phi).clamp(0.7, 1.0);
    let lb_min_t = (0.3 * lb_rqd).max(10. * phi).max(0.100);
    let lb_min_c = (0.6 * lb_rqd).max(10. * phi).max(0.100);
    Anchorage { fbd, lb_rqd, alpha2, lbd_tension: (alpha2 * lb_rqd).max(lb_min_t), lbd_compression: lb_rqd.max(lb_min_c) }
}

/// 8.4: design anchorage lengths of the tension bars at this station. The
/// check passes once the engineer confirms the bars extend at least l_bd (+ d
/// for shear, Fig. 6.3) beyond the section.
pub fn anchorage(ndp: &Ec2Ndp, rc: &RcBeamContext, compression: RcFace) -> CheckOutcome {
    let clause = "8.4.2, 8.4.3, 8.4.4, Table 8.2";
    let face = opposite(compression);
    let Some(b) = row(rc, face).and_then(|r| r.bars) else {
        return indeterminate("ec2.anchorage", clause, "Bar diameters are needed for the tension row");
    };
    let link = rc.links.as_ref().map_or(0., |l| l.diameter);
    // Figure 8.2: bottom bars are in good conditions; top bars only when h ≤ 250 mm.
    let good = face == RcFace::Bottom || rc.depth <= 0.250;
    let cover = rc.cover_to_link + link;
    let cd = match clear_spacing(rc, b.diameter, b.count) {
        Some(a) => (a / 2.).min(cover),
        None => cover,
    };
    let a = anchorage_length(ndp, rc.fck, rc.fyk, b.diameter, good, cd);
    let detail = json!({"face": face_name(face), "diameter": b.diameter, "bondCondition": if good {"good"} else {"poor"},
        "fbd": a.fbd, "lbRqd": a.lb_rqd, "cd": cd, "alpha2": a.alpha2, "lbdTension": a.lbd_tension,
        "lbdCompression": a.lbd_compression, "sigmaSd": rc.fyk / ndp.gamma_s,
        "assumptions": ["Straight bars (α1 = 1)", "α3 = α4 = α5 = 1: confinement and transverse pressure ignored", "σsd = fyd"]});
    match rc.tension_steel_anchored {
        Some(true) => {
            // The engineer's confirmation, not a measured length: l_bd is the
            // demand, with no resistance or ratio.
            let mut c = CheckOutcome::result(
                "ec2.anchorage",
                clause,
                CheckStatus::Pass,
                a.lbd_tension,
                a.lbd_tension,
                "m",
                detail,
                format!("Confirmed: the {} bars extend at least l_bd = {:.0} mm beyond the section", face_name(face), a.lbd_tension * 1e3),
            );
            c.resistance = None;
            c.utilisation = None;
            c
        }
        _ => {
            let mut c = indeterminate(
                "ec2.anchorage",
                clause,
                format!("Confirm the {} bars extend at least l_bd = {:.0} mm beyond the section", face_name(face), a.lbd_tension * 1e3),
            );
            c.intermediates = detail;
            c
        }
    }
}

/// 7.3.2(2) with (7.2), σc = 0: As,min σs = kc k fct,eff Act, σs = fyk,
/// kc = 0.4, k from 1.0 (h ≤ 300 mm) to 0.65 (h ≥ 800 mm), fct,eff = fctm,
/// Act = b h/2 for a rectangle in bending.
pub fn crack_minimum(rc: &RcBeamContext, compression: RcFace) -> CheckOutcome {
    let clause = "7.3.2(2), (7.1), (7.2)";
    let Some((area, _)) = tension(rc, compression) else {
        return CheckOutcome::result("ec2.crack-min", clause, CheckStatus::Fail, 1., 0., "m2", json!({}), "No tension reinforcement");
    };
    let (fctm, _, _) = table_3_1(rc.fck);
    let h_mm = rc.depth * 1e3;
    let k = if h_mm <= 300. { 1.0 } else if h_mm >= 800. { 0.65 } else { 1.0 - 0.35 * (h_mm - 300.) / 500. };
    let act = rc.width * rc.depth / 2.;
    let required = 0.4 * k * fctm * act / rc.fyk;
    CheckOutcome::result(
        "ec2.crack-min",
        clause,
        if area >= required { CheckStatus::Pass } else { CheckStatus::Fail },
        required,
        area,
        "m2",
        json!({"kc": 0.4, "k": k, "fctEff": fctm, "Act": act, "sigmaS": rc.fyk, "tensionFace": face_name(opposite(compression))}),
        "Demand is As,min for crack control, resistance is the provided tension area",
    )
}

/// Tensile steel stress of the cracked elastic section under `m`, with
/// αe = Es/Ecm (short-term) and compression steel included.
pub fn cracked_stress(rc: &RcBeamContext, compression: RcFace, m: f64) -> Option<(f64, f64)> {
    let (_, _, ecm) = table_3_1(rc.fck);
    let ae = ES / ecm;
    let (as_t, d) = tension(rc, compression)?;
    let comp: Vec<(f64, f64)> = rc.rows.iter().filter(|r| r.face == compression).map(|r| (r.area, r.centroid_from_face)).collect();
    // First moment about the neutral axis at depth x is zero.
    let f = |x: f64| {
        rc.width * x * x / 2. + comp.iter().map(|(a, d2)| (ae - 1.) * a * (x - d2)).sum::<f64>() - ae * as_t * (d - x)
    };
    let (mut lo, mut hi) = (0., d);
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        if f(mid) > 0. { hi = mid } else { lo = mid }
    }
    let x = 0.5 * (lo + hi);
    let icr = rc.width * x.powi(3) / 3.
        + comp.iter().map(|(a, d2)| (ae - 1.) * a * (x - d2).powi(2)).sum::<f64>()
        + ae * as_t * (d - x).powi(2);
    Some((ae * m.abs() * (d - x) / icr, x))
}

/// Tables 7.2N and 7.3N (rows: σs in MPa; columns wk = 0.4, 0.3, 0.2 mm).
pub(crate) const TABLE_7_2N: &[(f64, [Option<f64>; 3])] = &[
    (160., [Some(40.), Some(32.), Some(25.)]),
    (200., [Some(32.), Some(25.), Some(16.)]),
    (240., [Some(20.), Some(16.), Some(12.)]),
    (280., [Some(16.), Some(12.), Some(8.)]),
    (320., [Some(12.), Some(10.), Some(6.)]),
    (360., [Some(10.), Some(8.), Some(5.)]),
    (400., [Some(8.), Some(6.), Some(4.)]),
    (450., [Some(6.), Some(5.), None]),
];
pub(crate) const TABLE_7_3N: &[(f64, [Option<f64>; 3])] = &[
    (160., [Some(300.), Some(300.), Some(200.)]),
    (200., [Some(300.), Some(250.), Some(150.)]),
    (240., [Some(250.), Some(200.), Some(100.)]),
    (280., [Some(200.), Some(150.), Some(50.)]),
    (320., [Some(150.), Some(100.), None]),
    (360., [Some(100.), Some(50.), None]),
];

/// The table value for σs, taken from the first row at or above σs (no
/// interpolation, conservative). `None` beyond the table.
pub fn table_value(table: &[(f64, [Option<f64>; 3])], sigma_mpa: f64, wk: f64) -> Option<f64> {
    let col = if wk >= 0.4e-3 - 1e-12 { 0 } else if wk >= 0.3e-3 - 1e-12 { 1 } else { 2 };
    table.iter().find(|(s, _)| sigma_mpa <= *s + 1e-9).and_then(|(_, v)| v[col])
}

/// 7.3.3(2) Note: cracking caused mainly by loading is controlled when the
/// bar size meets Table 7.2N (modified by (7.6N)) or the bar spacing meets
/// Table 7.3N, with σs from a cracked section under the quasi-permanent
/// combination (UK NA Table NA.4: w_max = 0.3 mm for reinforced members).
pub fn crack_control(rc: &RcBeamContext, compression: RcFace) -> CheckOutcome {
    let clause = "7.3.3, Tables 7.2N/7.3N, (7.6N); UK NA Table NA.4";
    let det = &rc.detailing;
    let Some(exposure) = det.exposure_class.as_deref() else {
        return indeterminate("ec2.crack-control", clause, "Enter the exposure class");
    };
    if !EXPOSURE_CLASSES.contains(&exposure) {
        return indeterminate("ec2.crack-control", clause, format!("Unknown exposure class {exposure}"));
    }
    let Some(m) = det.quasi_permanent_moment else {
        return indeterminate("ec2.crack-control", clause, "Choose the quasi-permanent combination for crack control");
    };
    let face = opposite(compression);
    let Some(b) = row(rc, face).and_then(|r| r.bars) else {
        return indeterminate("ec2.crack-control", clause, "Bar diameters are needed for the tension row");
    };
    let Some((sigma, x)) = cracked_stress(rc, compression, m) else {
        return indeterminate("ec2.crack-control", clause, "No tension reinforcement");
    };
    let (fctm, _, ecm) = table_3_1(rc.fck);
    let (_, d) = tension(rc, compression).unwrap();
    let sigma_mpa = sigma / 1e6;
    // (7.6N) bending: φs = φ*s (fct,eff/2.9) kc hcr / (2(h − d)), kc = 0.4, hcr = h/2.
    let adjust = (fctm / 1e6 / 2.9) * 0.4 * (rc.depth / 2.) / (2. * (rc.depth - d));
    let phi_max = table_value(TABLE_7_2N, sigma_mpa, W_MAX_RC).map(|v| v * 1e-3 * adjust);
    let s_max = table_value(TABLE_7_3N, sigma_mpa, W_MAX_RC).map(|v| v * 1e-3);
    let spacing = clear_spacing(rc, b.diameter, b.count).map(|a| a + b.diameter);
    let by_size = phi_max.is_some_and(|p| b.diameter <= p + 1e-12);
    let by_spacing = match (s_max, spacing) {
        (Some(s), Some(sp)) => sp <= s + 1e-12,
        _ => false,
    };
    let ok = by_size || by_spacing;
    let ratio = [phi_max.map(|p| b.diameter / p), s_max.zip(spacing).map(|(s, sp)| sp / s)]
        .into_iter()
        .flatten()
        .fold(f64::INFINITY, f64::min);
    CheckOutcome::result(
        "ec2.crack-control",
        clause,
        if ok { CheckStatus::Pass } else { CheckStatus::Fail },
        // Beyond both tables: report σs against the largest tabulated stress.
        if ratio.is_finite() { ratio } else { sigma_mpa / 360. },
        1.,
        "-",
        json!({"exposureClass": exposure, "wMax": W_MAX_RC, "quasiPermanentMoment": m,
               "quasiPermanentCombination": det.quasi_permanent_combination,
               "sigmaS": sigma, "neutralAxisDepth": x, "alphaE": ES / ecm, "Ecm": ecm, "fctEff": fctm,
               "diameter": b.diameter, "maxDiameter": phi_max, "barSpacing": spacing, "maxSpacing": s_max,
               "adjustment76N": adjust, "bySize": by_size, "bySpacing": by_spacing,
               "assumptions": ["σs from the cracked elastic section with αe = Es/Ecm",
                               "Table values from the first row at or above σs (no interpolation)",
                               "(7.6N) with kc = 0.4 and hcr = h/2"]}),
        "Demand is the smaller of φ/φs,max and s/s_max; either table satisfied passes",
    )
}

/// Table NA.5 K values.
fn k_factor(system: &str) -> Option<f64> {
    Some(match system {
        "simplySupported" => 1.0,
        "endSpan" => 1.3,
        "interiorSpan" => 1.5,
        "cantilever" => 0.4,
        _ => return None,
    })
}

/// (7.16a)/(7.16b): basic limiting span/effective depth, fck in MPa.
pub fn basic_span_depth(k: f64, fck_mpa: f64, rho: f64, rho_c: f64) -> f64 {
    let rho0 = fck_mpa.sqrt() * 1e-3;
    if rho <= rho0 {
        k * (11. + 1.5 * fck_mpa.sqrt() * rho0 / rho + 3.2 * fck_mpa.sqrt() * (rho0 / rho - 1.).powf(1.5))
    } else {
        k * (11. + 1.5 * fck_mpa.sqrt() * rho0 / (rho - rho_c) + fck_mpa.sqrt() / 12. * (rho_c / rho0).sqrt())
    }
}

/// Tension steel area required to resist `med` at ULS with the provided
/// compression steel, by bisection on the tension area.
pub fn as_required(ndp: &Ec2Ndp, rc: &RcBeamContext, compression: RcFace, med: f64) -> Option<f64> {
    let (_, d) = tension(rc, compression)?;
    let fcd = ndp.alpha_cc_flexure * rc.fck / ndp.gamma_c;
    let law = ConcreteLaw::RectangularBlock { intensity: fcd, depth_ratio: 0.8, ultimate_strain: 0.0035 };
    let steel = SteelLaw { yield_strength: rc.fyk / ndp.gamma_s, modulus: ES };
    let section = RcRectangle { width: rc.width, depth: rc.depth };
    let comp: Vec<BarLayer> = rc
        .rows
        .iter()
        .filter(|r| r.face == compression)
        .map(|r| BarLayer { depth: r.centroid_from_face, area: r.area })
        .collect();
    let mrd = |a: f64| {
        let mut layers = comp.clone();
        layers.push(BarLayer { depth: d, area: a });
        rc_section::ultimate(&section, &layers, &steel, &law).ok().map(|u| u.moment)
    };
    let (mut lo, mut hi) = (0., 0.04 * rc.width * rc.depth);
    if mrd(hi)? < med {
        return None;
    }
    for _ in 0..100 {
        let mid = 0.5 * (lo + hi);
        if mrd(mid).is_some_and(|m| m >= med) { hi = mid } else { lo = mid }
    }
    Some(hi)
}

/// 7.4.2: span/effective depth with UK NA Table NA.5 K, the (7.17)
/// adjustment 500/(fyk As,req/As,prov) capped at 1.5 (NA Note 5), 7/leff for
/// spans over 7 m supporting sensitive partitions, and l/d ≤ 40K (Note 6).
/// Checked at mid-span (sagging) or, for cantilevers, at the support.
pub fn deflection(ndp: &Ec2Ndp, rc: &RcBeamContext, compression: RcFace, med: f64) -> Option<CheckOutcome> {
    let clause = "7.4.2, (7.16a/b), (7.17); UK NA Table NA.5";
    let det = &rc.detailing;
    let Some(system) = det.structural_system.as_deref() else {
        return (compression == RcFace::Top)
            .then(|| indeterminate("ec2.deflection", clause, "Choose the structural system (simply supported, end span, interior span or cantilever)"));
    };
    let Some(k) = k_factor(system) else {
        return Some(indeterminate("ec2.deflection", clause, format!("Unknown structural system {system}")));
    };
    let governs = if system == "cantilever" { compression == RcFace::Bottom } else { compression == RcFace::Top };
    if !governs {
        return None;
    }
    let Some(span) = det.span else {
        return Some(indeterminate("ec2.deflection", clause, "The span is unknown"));
    };
    if span > 7. && det.partitions_sensitive.is_none() {
        return Some(indeterminate("ec2.deflection", clause, "State whether the member supports partitions liable to damage (span > 7 m)"));
    }
    let (as_prov, d) = tension(rc, compression)?;
    let Some(as_req) = as_required(ndp, rc, compression, med) else {
        return Some(CheckOutcome::result(
            "ec2.deflection",
            clause,
            CheckStatus::Fail,
            span / d,
            0.,
            "-",
            json!({}),
            "The ULS moment exceeds the capacity of any tension area up to 4 %",
        ));
    };
    let fck = rc.fck / 1e6;
    let rho = as_req / (rc.width * d);
    let basic = basic_span_depth(k, fck, rho, 0.);
    let stress = (500. / (rc.fyk / 1e6 * as_req / as_prov)).min(1.5);
    let partitions = if span > 7. && det.partitions_sensitive == Some(true) { 7. / span } else { 1. };
    let allowed = (basic * stress * partitions).min(40. * k);
    let actual = span / d;
    Some(CheckOutcome::result(
        "ec2.deflection",
        clause,
        if actual <= allowed { CheckStatus::Pass } else { CheckStatus::Fail },
        actual,
        allowed,
        "-",
        json!({"structuralSystem": system, "K": k, "span": span, "d": d, "rho": rho, "rho0": fck.sqrt() * 1e-3,
               "rhoPrime": 0.0, "AsReq": as_req, "AsProv": as_prov, "basicLimit": basic, "stressFactor": stress,
               "partitionFactor": partitions, "cap40K": 40. * k,
               "assumptions": ["ρ' = 0 (conservative for 7.16b)", "Span taken as the member length", "Rectangular section (no flange factor)"]}),
        "Demand is span/d, resistance the limiting span/d",
    ))
}
