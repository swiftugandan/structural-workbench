//! EN 1992-1-1:2004 rectangular RC column checks with the UK National Annex
//! (2009), M12 / ADR 0027: effective length and slenderness (5.8.3), geometric
//! imperfections (5.2), second order effects by nominal curvature (5.8.8),
//! biaxial bending against the exact section resistance (5.8.9, 6.1),
//! minimum eccentricity (6.1(4)), shear with axial compression (6.2), and
//! column detailing (9.5.2, 9.5.3, 4.4.1). Clause reading in
//! `docs/code-profiles/ec2-uk-na/dossier-column.md`.
//!
//! Every engineering choice the code leaves to the designer (braced or not,
//! end restraint flexibilities, effective creep ratio, durability cover,
//! aggregate) comes from `RcColumnDetailing`. A check that needs a missing
//! input is indeterminate and names it.

use serde_json::{Value, json};

use super::detailing::{SPACING_FLOOR, SPACING_K1, SPACING_K2, cover_for, indeterminate};
use super::{ES, Ec2Ndp};
use crate::profile::{CheckOutcome, CheckStatus};
use crate::rc_column::{Column, ColumnBar, ColumnInputs, ColumnSection, StrainLimits};
use crate::rc_section::{ConcreteLaw, SteelLaw};

/// UK NA 5.2(5): θ0, the recommended 1/200.
const THETA_0: f64 = 1. / 200.;
/// 5.8.8.3(3): n_bal.
const N_BAL: f64 = 0.4;
/// 5.8.8.2(4): c for a constant cross section (≈ π²).
const CURVATURE_FACTOR: f64 = 10.;
/// 5.8.3.2(3) note: recommended minimum relative flexibility.
const K_MIN: f64 = 0.1;
/// UK NA 9.5.2(1): φ_min.
const PHI_MIN: f64 = 0.012;
/// 9.5.2(3): A_s,max outside laps (recommended, UK NA).
const AS_MAX_RATIO: f64 = 0.04;
/// 9.5.3(6): no compression bar further than this from a restrained bar.
const RESTRAINED_DISTANCE: f64 = 0.150;
/// Table 3.1 / 3.1.7(1): parabola-rectangle for fck ≤ 50 MPa.
const EPS_C2: f64 = 0.002;
const EPS_CU2: f64 = 0.0035;

/// The engineer's inputs for the column checks (schema 1.8.0 `codeInputs`).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct RcColumnDetailing {
    pub exposure_class: Option<String>,
    pub cover_durability: Option<f64>,
    pub aggregate_size: Option<f64>,
    pub braced: Option<bool>,
    /// k1, k2 for bending about local y (buckling across the depth h).
    pub restraint_y: Option<[f64; 2]>,
    /// k1, k2 for bending about local z (buckling across the width b).
    pub restraint_z: Option<[f64; 2]>,
    pub creep_ratio: Option<f64>,
}

/// A rectangular RC column: width b along local y, depth h along local z,
/// bars at their section coordinates, one perimeter link.
#[derive(Debug, Clone)]
pub struct RcColumnContext {
    pub width: f64,
    pub depth: f64,
    pub cover_to_link: f64,
    pub fck: f64,
    pub fyk: f64,
    pub bar_diameter: f64,
    pub bars_along_width: u32,
    pub bars_along_depth: u32,
    pub link_diameter: f64,
    pub link_spacing: f64,
    pub bars: Vec<ColumnBar>,
    /// Member length between end nodes, taken as the clear height l.
    pub length: f64,
    /// Whether loads act along the member between its ends.
    pub transverse_load: bool,
    pub detailing: RcColumnDetailing,
}

/// First-order actions of one combination: N compression positive, the
/// frame's local end moments (internal, same sign = tension on the same side)
/// and the largest moment and shear magnitudes along the member.
#[derive(Debug, Clone, Default)]
pub struct ColumnActions {
    pub n_ed: f64,
    pub my_ends: [f64; 2],
    pub mz_ends: [f64; 2],
    pub my_max: f64,
    pub mz_max: f64,
    pub vy_max: f64,
    pub vz_max: f64,
    pub combination_id: String,
}

#[derive(Clone, Copy, PartialEq)]
enum Axis {
    Y,
    Z,
}

impl Axis {
    fn name(self) -> &'static str {
        match self {
            Axis::Y => "y",
            Axis::Z => "z",
        }
    }
}

/// One direction's design moments: with the imperfection and minimum
/// eccentricity applied in this direction, and without them.
struct AxisDesign {
    with_imperfection: f64,
    without_imperfection: f64,
    detail: Value,
}

pub(crate) fn design_strengths(ndp: &Ec2Ndp, c: &RcColumnContext) -> (f64, f64) {
    (ndp.alpha_cc_flexure * c.fck / ndp.gamma_c, c.fyk / ndp.gamma_s)
}

fn steel_area(c: &RcColumnContext) -> f64 {
    c.bars.iter().map(|b| b.area).sum()
}

/// 5.8.3.2(3): effective length from the end flexibilities (5.15)/(5.16).
pub fn effective_length(l: f64, k: [f64; 2], braced: bool) -> f64 {
    let [k1, k2] = k.map(|x| x.max(K_MIN));
    if braced {
        0.5 * l * ((1. + k1 / (0.45 + k1)) * (1. + k2 / (0.45 + k2))).sqrt()
    } else {
        l * (1. + 10. * k1 * k2 / (k1 + k2)).sqrt().max((1. + k1 / (1. + k1)) * (1. + k2 / (1. + k2)))
    }
}

/// 5.8.3.1 (5.13N), recommended per UK NA: λ_lim = 20 A B C / √n.
pub fn lambda_lim(creep: Option<f64>, omega: f64, rm: f64, n: f64) -> f64 {
    let a = creep.map_or(0.7, |phi| 1. / (1. + 0.2 * phi));
    let b = (1. + 2. * omega).sqrt();
    let c = 1.7 - rm;
    if n > 0. { 20. * a * b * c / n.sqrt() } else { f64::INFINITY }
}

/// 5.8.8.3: 1/r = K_r K_φ ε_yd / (0.45 d).
pub fn curvature(fck: f64, fyd: f64, lambda: f64, creep: f64, omega: f64, n: f64, d: f64) -> (f64, f64, f64) {
    let nu = 1. + omega;
    let kr = ((nu - n) / (nu - N_BAL)).min(1.);
    let beta = 0.35 + fck / 1e6 / 200. - lambda / 150.;
    let kphi = (1. + beta * creep).max(1.);
    (kr * kphi * (fyd / ES) / (0.45 * d), kr, kphi)
}

fn axis_design(ndp: &Ec2Ndp, c: &RcColumnContext, a: &ColumnActions, axis: Axis) -> Result<AxisDesign, String> {
    let (h, ends, m_max, restraint) = match axis {
        Axis::Y => (c.depth, a.my_ends, a.my_max, c.detailing.restraint_y),
        Axis::Z => (c.width, a.mz_ends, a.mz_max, c.detailing.restraint_z),
    };
    let braced = c.detailing.braced.ok_or("Enter whether the column is braced against sway (5.8.3.2(3))")?;
    let k = restraint.ok_or_else(|| {
        format!("Enter the end restraint flexibilities k1, k2 for bending about {} (5.8.3.2(3))", axis.name())
    })?;
    let (fcd, fyd) = design_strengths(ndp, c);
    let ac = c.width * c.depth;
    let n_ed = a.n_ed;
    let n = n_ed / (ac * fcd);
    let omega = steel_area(c) * fyd / (ac * fcd);
    let l0 = effective_length(c.length, k, braced);
    let i = h / 12f64.sqrt();
    let lambda = l0 / i;
    // M02 is the larger end moment; r_m > 0 when both give tension on the same side.
    let (m02, m01) = if ends[0].abs() >= ends[1].abs() { (ends[0], ends[1]) } else { (ends[1], ends[0]) };
    let rm_from_ends = if m02 != 0. { m01 / m02 } else { 1. };
    // 5.8.3.1(1) note: r_m = 1 for unbraced members and where the first order
    // moments arise from transverse loading.
    let rm = if !braced || c.transverse_load { 1. } else { rm_from_ends };
    let lim = lambda_lim(c.detailing.creep_ratio, omega, rm, n);
    let compression = n_ed > 0.;
    let slender = compression && lambda >= lim;
    // 5.2(5)-(7): isolated member, m = 1, e_i = θ_i l0/2.
    let alpha_h = (2. / c.length.sqrt()).clamp(2. / 3., 1.);
    let theta_i = THETA_0 * alpha_h;
    let ei = if compression { theta_i * l0 / 2. } else { 0. };
    // 6.1(4): e0 = h/30, not less than 20 mm, for compression.
    let e0 = if compression { (h / 30.).max(0.020) } else { 0. };
    let (e2, curvature_detail) = if slender {
        let creep = c.detailing.creep_ratio.ok_or(
            "Enter the effective creep ratio φ_ef (5.8.4): the column is slender and K_φ (5.8.8.3(4)) needs it",
        )?;
        // 5.8.8.3(2): d = h/2 + i_s with i_s the radius of gyration of the bars.
        let coord = |b: &ColumnBar| if axis == Axis::Y { b.z } else { b.y };
        let is = (c.bars.iter().map(|b| b.area * coord(b).powi(2)).sum::<f64>() / steel_area(c)).sqrt();
        let d = h / 2. + is;
        let (inv_r, kr, kphi) = curvature(c.fck, fyd, lambda, creep, omega, n, d);
        let e2 = inv_r * l0 * l0 / CURVATURE_FACTOR;
        (e2, json!({"d": d, "iS": is, "kr": kr, "kphi": kphi, "inverseRadius": inv_r, "c": CURVATURE_FACTOR}))
    } else {
        (0., Value::Null)
    };
    let m2 = n_ed.max(0.) * e2;
    let design = |imperfection: bool| {
        let shift = if imperfection { n_ed.max(0.) * ei } else { 0. };
        // 5.8.8.2(2): end moments including the imperfection, M02 ≥ M01.
        let m02a = m02.abs() + shift;
        let m01s = if m02 != 0. { m01 * m02.signum() } else { 0. } + shift;
        let minimum = if imperfection { n_ed.max(0.) * e0 } else { 0. };
        let mid = if !braced {
            // Unbraced: first and second order maxima coincide at the end.
            m02a + m2
        } else if c.transverse_load {
            m_max.abs() + shift + m2
        } else {
            // M0e = 0.6 M02 + 0.4 M01 ≥ 0.4 M02 (5.32); M01 + M2/2 near the end.
            ((0.6 * m02a + 0.4 * m01s).max(0.4 * m02a) + m2).max(m01s.abs() + 0.5 * m2)
        };
        mid.max(m02a).max(minimum)
    };
    Ok(AxisDesign {
        with_imperfection: design(true),
        without_imperfection: design(false),
        detail: json!({"axis": axis.name(), "braced": braced, "k": k, "kUsed": k.map(|x| x.max(K_MIN)),
            "clearHeight": c.length, "l0": l0, "i": i, "lambda": lambda, "lambdaLim": lim.is_finite().then_some(lim),
            "n": n, "omega": omega, "rm": rm, "m01": m01, "m02": m02, "slender": slender,
            "thetaI": theta_i, "ei": ei, "e0": e0, "e2": e2, "m2": m2, "curvature": curvature_detail,
            "mEdWithImperfection": design(true), "mEdWithoutImperfection": design(false)}),
    })
}

/// The section with the EC2 parabola-rectangle (3.1.7(1), fck ≤ 50 MPa),
/// steel with a horizontal top branch (3.2.7(2)b) and the 6.1(5) limit ε_c2
/// for uniform compression.
pub fn section(ndp: &Ec2Ndp, c: &RcColumnContext) -> workbench_model::Result<Column> {
    let (fcd, fyd) = design_strengths(ndp, c);
    Column::new(ColumnInputs {
        section: ColumnSection { width: c.width, depth: c.depth, bars: c.bars.clone() },
        concrete: ConcreteLaw::ParabolaRectangle { peak: fcd, strain_at_peak: EPS_C2, ultimate_strain: EPS_CU2, exponent: 2. },
        steel: SteelLaw { yield_strength: fyd, modulus: ES },
        limits: StrainLimits { full_compression_strain: EPS_C2, steel_strain_limit: None },
    })
}

/// 5.8.9(2): imperfections (and the 6.1(4) minimum eccentricity) in one
/// direction at a time, second order in each direction where slender; the
/// design moment vector is checked against the exact biaxial resistance
/// M_Rd(N_Ed, θ) of the section (5.8.9(1), 6.1), not the (5.39) interpolation.
fn biaxial(ndp: &Ec2Ndp, c: &RcColumnContext, a: &ColumnActions) -> Vec<CheckOutcome> {
    let clause = "5.2, 5.8.3, 5.8.8, 5.8.9, 6.1";
    let ids = ["ec2.column.biaxial.y", "ec2.column.biaxial.z"];
    let (y, z) = match (axis_design(ndp, c, a, Axis::Y), axis_design(ndp, c, a, Axis::Z)) {
        (Ok(y), Ok(z)) => (y, z),
        (Err(r), _) | (_, Err(r)) => return ids.iter().map(|id| indeterminate(id, clause, r.clone())).collect(),
    };
    let column = match section(ndp, c) {
        Ok(col) => col,
        Err(e) => return ids.iter().map(|id| CheckOutcome::unsupported(id, clause, e.message.clone())).collect(),
    };
    let range = column.axial_range();
    [(ids[0], y.with_imperfection, z.without_imperfection, "y"), (ids[1], y.without_imperfection, z.with_imperfection, "z")]
        .into_iter()
        .map(|(id, my, mz, imperfect)| {
            let detail = json!({"imperfectionAbout": imperfect, "nEd": a.n_ed, "myEd": my, "mzEd": mz,
                "axialRange": {"squash": range.squash, "tension": range.tension},
                "y": y.detail, "z": z.detail, "combinationId": a.combination_id,
                "law": "parabolaRectangle", "epsilonC2": EPS_C2, "epsilonCu2": EPS_CU2});
            match column.check(a.n_ed, my, mz) {
                Ok(chk) => match chk.utilisation.filter(|u| u.is_finite()) {
                    Some(u) => {
                        let mut out = CheckOutcome::result(
                            id,
                            clause,
                            if u <= 1. + 1e-12 { CheckStatus::Pass } else { CheckStatus::Fail },
                            chk.m_ed,
                            chk.capacity.as_ref().map_or(chk.m_ed / u.max(1e-300), |cap| cap.m_rd),
                            "N m",
                            detail,
                            format!("N_Ed {:.0} N, M_Ed ({my:.0}, {mz:.0}) N m with imperfection about {imperfect}", a.n_ed),
                        );
                        out.utilisation = Some(u);
                        out
                    }
                    None => CheckOutcome::result(
                        id,
                        clause,
                        CheckStatus::Fail,
                        a.n_ed,
                        if a.n_ed >= 0. { range.squash } else { range.tension },
                        "N",
                        detail,
                        "N_Ed lies outside the section's axial resistance",
                    ),
                },
                Err(e) => CheckOutcome::unsupported(id, clause, e.message),
            }
        })
        .collect()
}

/// 6.2.2/6.2.3 in each direction with σ_cp = N_Ed/A_c (≤ 0.2 f_cd), the
/// perimeter link giving two legs, α_cw = 1 (UK NA 6.2.3(3), non-prestressed).
fn shear(ndp: &Ec2Ndp, c: &RcColumnContext, a: &ColumnActions) -> Vec<CheckOutcome> {
    let (fcd, fyd) = design_strengths(ndp, c);
    let fcd_shear = ndp.alpha_cc_shear * c.fck / ndp.gamma_c;
    let fck = c.fck / 1e6;
    let bar_area = std::f64::consts::PI * c.bar_diameter.powi(2) / 4.;
    let sigma_cp = (a.n_ed / (c.width * c.depth)).min(0.2 * fcd);
    // Shear along z (V_z) is resisted by the width b with depth d across h.
    [("ec2.column.shear.z", a.vz_max, c.width, c.depth, c.bars_along_width),
     ("ec2.column.shear.y", a.vy_max, c.depth, c.width, c.bars_along_depth)]
        .into_iter()
        .map(|(id, ved, bw, h, bars)| {
            let d = h - c.cover_to_link - c.link_diameter - c.bar_diameter / 2.;
            let asl = bars as f64 * bar_area;
            let k = (1. + (0.2 / d).sqrt()).min(2.);
            let rho = (asl / (bw * d)).min(0.02);
            let crdc = ndp.crdc_numerator / ndp.gamma_c;
            let vmin = 0.035 * k.powf(1.5) * fck.sqrt();
            let k1 = 0.15;
            let v_c = (crdc * k * (100. * rho * fck).cbrt() + k1 * sigma_cp / 1e6).max(vmin + k1 * sigma_cp / 1e6);
            let vrdc = v_c * 1e6 * bw * d;
            let z = 0.9 * d;
            let asw_s = 2. * std::f64::consts::PI * c.link_diameter.powi(2) / 4. / c.link_spacing;
            let nu1 = 0.6 * (1. - fck / 250.);
            let aa = asw_s * z * fyd;
            let cc = bw * z * nu1 * fcd_shear;
            let cot = ((cc / aa - 1.).max(0.)).sqrt().clamp(ndp.cot_theta_min, ndp.cot_theta_max);
            let cap = ndp.v_rd_max_bw2_cap.map(|kk| kk * (bw * 1e3).powi(2));
            let vrdmax = cap.map_or(cc * cot / (1. + cot * cot), |m| (cc * cot / (1. + cot * cot)).min(m));
            let vrd_links = (aa * cot).min(vrdmax);
            let resistance = vrdc.max(vrd_links);
            CheckOutcome::result(
                id,
                "6.2.2(1), 6.2.3; UK NA 6.2.3(3)",
                if ved.abs() <= resistance { CheckStatus::Pass } else { CheckStatus::Fail },
                ved.abs(),
                resistance,
                "N",
                json!({"bw": bw, "d": d, "k": k, "rhoL": rho, "sigmaCp": sigma_cp, "VRdc": vrdc, "z": z,
                       "AswOverS": asw_s, "nu1": nu1, "alphaCw": 1.0, "cotTheta": cot, "VRdmax": vrdmax,
                       "VRdLinks": vrd_links, "ukVRdMaxCap": cap,
                       "assumptions": ["Longitudinal bars are continuous through the section, so ρ_l counts the tension-face bars",
                                       "The perimeter link gives two legs in each direction"]}),
                if ved.abs() <= vrdc { "V_Ed ≤ V_Rd,c" } else { "V_Ed carried by the links: V_Rd = min(V_Rd,s, V_Rd,max)" },
            )
        })
        .collect()
}

/// 9.5.2: bar diameter, A_s,min = max(0.10 N_Ed/f_yd, 0.002 A_c), A_s,max = 0.04 A_c.
fn longitudinal(ndp: &Ec2Ndp, c: &RcColumnContext, a: &ColumnActions) -> Vec<CheckOutcome> {
    let (_, fyd) = design_strengths(ndp, c);
    let ac = c.width * c.depth;
    let area = steel_area(c);
    let as_min = (0.10 * a.n_ed.max(0.) / fyd).max(0.002 * ac);
    let as_max = AS_MAX_RATIO * ac;
    vec![
        CheckOutcome::result(
            "ec2.column.bar-diameter",
            "9.5.2(1); UK NA φ_min = 12 mm",
            if c.bar_diameter >= PHI_MIN - 1e-12 { CheckStatus::Pass } else { CheckStatus::Fail },
            PHI_MIN,
            c.bar_diameter,
            "m",
            json!({"phiMin": PHI_MIN}),
            "Demand is φ_min, resistance the bar diameter",
        ),
        CheckOutcome::result(
            "ec2.column.as-min",
            "9.5.2(2)",
            if area >= as_min { CheckStatus::Pass } else { CheckStatus::Fail },
            as_min,
            area,
            "m2",
            json!({"nEd": a.n_ed, "fyd": fyd, "ac": ac}),
            "Demand is A_s,min, resistance the provided area",
        ),
        CheckOutcome::result(
            "ec2.column.as-max",
            "9.5.2(3)",
            if area <= as_max { CheckStatus::Pass } else { CheckStatus::Fail },
            area,
            as_max,
            "m2",
            json!({"ratio": AS_MAX_RATIO, "ac": ac, "note": "Outside laps; 0.08 A_c applies at laps"}),
            "Demand is the provided area, resistance A_s,max",
        ),
    ]
}

/// 9.5.3: link diameter ≥ max(6 mm, φ/4); spacing ≤ min(20 φ, b, 400 mm)
/// (reduced by 0.6 near beams, slabs and laps, 9.5.3(4)); every bar within
/// 150 mm of a restrained bar (9.5.3(6)), with only the corners restrained by
/// the single perimeter link.
fn transverse(c: &RcColumnContext) -> Vec<CheckOutcome> {
    let phi_t = (0.006f64).max(c.bar_diameter / 4.);
    let s_max = (20. * c.bar_diameter).min(c.width.min(c.depth)).min(0.400);
    let inset = c.cover_to_link + c.link_diameter + c.bar_diameter / 2.;
    let pitch = |n: u32, side: f64| if n > 1 { (side - 2. * inset) / (n - 1) as f64 } else { 0. };
    // The furthest bar from a corner along each face: the middle of the face.
    let far = |n: u32, side: f64| {
        let p = pitch(n, side);
        (1..n.saturating_sub(1)).map(|i| (i as f64 * p).min((n - 1 - i) as f64 * p)).fold(0., f64::max)
    };
    let worst = far(c.bars_along_width, c.width).max(far(c.bars_along_depth, c.depth));
    vec![
        CheckOutcome::result(
            "ec2.column.links",
            "9.5.3(1), (3); UK NA s_cl,tmax",
            if c.link_diameter >= phi_t - 1e-12 && c.link_spacing <= s_max + 1e-12 { CheckStatus::Pass } else { CheckStatus::Fail },
            (phi_t / c.link_diameter).max(c.link_spacing / s_max),
            1.,
            "-",
            json!({"phiTMin": phi_t, "linkDiameter": c.link_diameter, "sClTMax": s_max, "linkSpacing": c.link_spacing,
                   "reducedNearBeamsAndLaps": 0.6 * s_max,
                   "note": "Within max(b, h) of a beam or slab and at laps of bars over 14 mm, 9.5.3(4) reduces s_cl,tmax by 0.6"}),
            "Demand is the larger of φ_t,min/φ_t and s/s_cl,tmax",
        ),
        CheckOutcome::result(
            "ec2.column.restraint",
            "9.5.3(6)",
            if worst <= RESTRAINED_DISTANCE + 1e-12 { CheckStatus::Pass } else { CheckStatus::Fail },
            worst,
            RESTRAINED_DISTANCE,
            "m",
            json!({"restrainedBars": "corners (one perimeter link)", "pitchWidth": pitch(c.bars_along_width, c.width),
                   "pitchDepth": pitch(c.bars_along_depth, c.depth)}),
            "Demand is the largest distance from a bar to the nearest restrained (corner) bar",
        ),
    ]
}

/// 8.2(2) clear spacing between adjacent bars along each face.
fn bar_spacing(c: &RcColumnContext) -> CheckOutcome {
    let clause = "8.2(2); UK NA 8.2(2)";
    let Some(dg) = c.detailing.aggregate_size else {
        return indeterminate("ec2.bar-spacing", clause, "Enter the maximum aggregate size");
    };
    let inset = c.cover_to_link + c.link_diameter + c.bar_diameter / 2.;
    let clear = |n: u32, side: f64| (side - 2. * inset) / (n - 1) as f64 - c.bar_diameter;
    let gap = clear(c.bars_along_width, c.width).min(clear(c.bars_along_depth, c.depth));
    let min = (SPACING_K1 * c.bar_diameter).max(dg + SPACING_K2).max(SPACING_FLOOR);
    CheckOutcome::result(
        "ec2.bar-spacing",
        clause,
        if gap >= min - 1e-12 { CheckStatus::Pass } else { CheckStatus::Fail },
        min,
        gap,
        "m",
        json!({"clearSpacing": gap, "minimum": min, "aggregateSize": dg}),
        "Demand is the minimum clear gap, resistance the smallest gap between adjacent bars",
    )
}

/// Every column check for one combination.
pub fn checks(ndp: &Ec2Ndp, c: &RcColumnContext, a: &ColumnActions) -> Vec<CheckOutcome> {
    if c.fck > 50e6 {
        return vec![CheckOutcome::unsupported(
            "ec2.column.biaxial.y",
            "3.1.7(1)",
            "fck > 50 MPa needs the Table 3.1 strain values for higher classes; not in this profile",
        )];
    }
    let mut out = biaxial(ndp, c, a);
    out.extend(shear(ndp, c, a));
    out.extend(longitudinal(ndp, c, a));
    out.extend(transverse(c));
    out.push(cover_for(c.cover_to_link, c.link_diameter, c.bar_diameter, c.detailing.cover_durability, c.detailing.aggregate_size));
    out.push(bar_spacing(c));
    out
}
