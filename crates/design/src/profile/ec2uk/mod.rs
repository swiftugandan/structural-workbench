//! EN 1992-1-1:2004 (+AC:2008/AC:2010) with the UK National Annex (2009):
//! rectangular RC beams (M08-B2). Clause reading and parameter provenance:
//! `docs/code-profiles/ec2-uk-na/dossier-beam.md`; decisions: ADR 0015.
//!
//! The profile is registered **disabled**. A1:2014 and NA+A2:2014 are not
//! held, so every run also carries unsupported companion checks and can never
//! report an overall pass.

#[cfg(test)]
mod fixture_tests;

use serde_json::json;

use super::{
    CheckOutcome, CheckStatus, CodeProfile, DesignDemand, MemberContext, PROFILE_EC2_UK_NA,
    ProfileApplicability, ProfileMetadata, RcBeamContext, RcFace,
};
use crate::rc_section::{self, BarLayer, ConcreteLaw, RcRectangle, SteelLaw, TensionState};

/// Nationally determined parameters used by this profile. Every value is a
/// dossier row; see `dossier-beam.md` for clause and provenance.
#[derive(Debug, Clone, PartialEq)]
pub struct Ec2Ndp {
    pub label: &'static str,
    /// 2.4.2.4(1), persistent and transient.
    pub gamma_c: f64,
    pub gamma_s: f64,
    /// 3.1.6(1)P for compression in flexure.
    pub alpha_cc_flexure: f64,
    /// 3.1.6(1)P for shear (ADR 0015: UK profile uses the permitted 0.85).
    pub alpha_cc_shear: f64,
    /// 6.2.2(1): C_Rd,c = crdc_numerator / γc.
    pub crdc_numerator: f64,
    /// 6.2.3(2).
    pub cot_theta_min: f64,
    pub cot_theta_max: f64,
}

impl Ec2Ndp {
    /// UK National Annex incorporating Amendment No. 1 (2009), Table NA.1.
    pub fn uk_na_2009() -> Self {
        Self {
            label: "UK NA to BS EN 1992-1-1:2004 incl. NA Amd 1 (2009)",
            gamma_c: 1.5,
            gamma_s: 1.15,
            alpha_cc_flexure: 0.85,
            alpha_cc_shear: 0.85,
            crdc_numerator: 0.18,
            cot_theta_min: 1.0,
            cot_theta_max: 2.5,
        }
    }

    /// EN 1992-1-1 recommended values (used by the JRC89037 examples).
    pub fn eu_recommended() -> Self {
        Self {
            label: "EN 1992-1-1:2004 recommended values",
            alpha_cc_flexure: 1.0,
            alpha_cc_shear: 1.0,
            ..Self::uk_na_2009()
        }
    }
}

/// Constants taken unchanged by the UK NA in this scope (dossier rows).
const ES: f64 = 200e9; // 3.2.7(4)
const K1: f64 = 0.15; // 6.2.2(1); only multiplies σcp, which is zero in scope
const AS_MAX_RATIO: f64 = 0.04; // 9.2.1.1(3)

#[derive(Debug, Clone)]
pub struct Ec2UkNaProfile {
    pub ndp: Ec2Ndp,
    pub enabled: bool,
}

impl Default for Ec2UkNaProfile {
    fn default() -> Self {
        Self { ndp: Ec2Ndp::uk_na_2009(), enabled: false }
    }
}

impl CodeProfile for Ec2UkNaProfile {
    fn metadata(&self) -> ProfileMetadata {
        ProfileMetadata {
            id: PROFILE_EC2_UK_NA.into(),
            standard: "EN 1992-1-1 with UK National Annex".into(),
            edition: "2004 incl. AC:2008/AC:2010; NA incl. Amd 1 (2009)".into(),
            design_method: "Partial factors (ULS)".into(),
            jurisdiction: Some("GB".into()),
            enabled: self.enabled,
            resource_gate: "R-EC2-EN-1992-1-1-2004+R-EC2-UK-NA-2009+A1:2014+NA+A2:2014".into(),
            supported_section_families: vec!["RC rectangle".into()],
            supported_checks: vec![
                "flexure".into(),
                "as-min".into(),
                "as-max".into(),
                "shear".into(),
                "links-min".into(),
                "links-spacing".into(),
            ],
            limitations: vec![
                "Disabled: A1:2014 and NA+A2:2014 are not held, so no clause is reconciled with them".into(),
                "Rectangular sections, fck <= 50 MPa, vertical links only".into(),
                "Pure bending about local y with shear Vz: N, T, Vy and Mz must be zero".into(),
                "Anchorage, serviceability, cover and bar spacing are not implemented; overall never passes".into(),
                "UK NA VRd,max <= 200 bw^2 cap not applied (units not stated in the NA)".into(),
            ],
        }
    }

    fn applicability(&self, ctx: &MemberContext) -> ProfileApplicability {
        let Some(rc) = ctx.rc_beam.as_ref() else {
            return ProfileApplicability::Unsupported(
                "A rectangular RC beam description is required for the EC2 beam profile".into(),
            );
        };
        if ctx.torsion_present {
            return ProfileApplicability::Unsupported("Torsion (6.3) is outside the EC2 beam scope".into());
        }
        if !(rc.width > 0. && rc.depth > 0. && rc.cover_to_link >= 0.) {
            return ProfileApplicability::Unsupported("Section width, depth and cover must be positive".into());
        }
        if !(rc.fck > 0. && rc.fck <= 50e6) {
            return ProfileApplicability::Unsupported(
                "Only fck <= 50 MPa is reconciled against an example (dossier)".into(),
            );
        }
        if !(rc.fyk > 0. && rc.fyk <= 600e6) {
            return ProfileApplicability::Unsupported("fyk must lie in (0, 600] MPa (3.2.2(3)P)".into());
        }
        if rc.rows.iter().any(|r| !(r.area > 0. && r.centroid_from_face > 0. && r.centroid_from_face < rc.depth)) {
            return ProfileApplicability::Unsupported("Every bar row needs a positive area inside the section".into());
        }
        ProfileApplicability::Applicable
    }

    fn run_checks(&self, demand: &DesignDemand, ctx: &MemberContext) -> Vec<CheckOutcome> {
        let Some(rc) = ctx.rc_beam.as_ref() else {
            return vec![CheckOutcome::unsupported("profile.section", "scope", "RC beam description missing")];
        };
        let mut checks = Vec::new();
        if demand.n != 0. || demand.t != 0. || demand.vy != 0. || demand.mz != 0. {
            checks.push(CheckOutcome::unsupported(
                "ec2.actions",
                "6.1, 6.2, 6.3",
                "Axial force, torsion or weak-axis actions are present; only My with Vz is supported",
            ));
        } else {
            // ADR 0014: My < 0 compresses the top face (sagging), My > 0 the bottom (hogging).
            let compression = if demand.my < 0. {
                Some(RcFace::Top)
            } else if demand.my > 0. {
                Some(RcFace::Bottom)
            } else {
                None
            };
            if let Some(face) = compression {
                checks.push(flexure(&self.ndp, rc, face, demand.my.abs()));
                checks.push(as_min(rc, face));
            }
            checks.extend(as_max(rc));
            if demand.vz != 0. {
                checks.push(shear(&self.ndp, rc, compression, demand.vz.abs()));
            }
            checks.push(links_min(rc));
            checks.push(links_spacing(rc, compression));
        }
        checks.extend(companions());
        checks
    }
}

fn opposite(face: RcFace) -> RcFace {
    match face {
        RcFace::Top => RcFace::Bottom,
        RcFace::Bottom => RcFace::Top,
    }
}

fn face_name(face: RcFace) -> &'static str {
    match face {
        RcFace::Top => "top",
        RcFace::Bottom => "bottom",
    }
}

/// Bar layers with depths measured from `compression` (kernel convention).
fn layers(rc: &RcBeamContext, compression: RcFace) -> Vec<BarLayer> {
    rc.rows
        .iter()
        .map(|r| BarLayer {
            depth: if r.face == compression { r.centroid_from_face } else { rc.depth - r.centroid_from_face },
            area: r.area,
        })
        .collect()
}

/// Tension steel area and its centroid depth from the compression face.
fn tension(rc: &RcBeamContext, compression: RcFace) -> Option<(f64, f64)> {
    let rows: Vec<_> = rc.rows.iter().filter(|r| r.face == opposite(compression)).collect();
    let area: f64 = rows.iter().map(|r| r.area).sum();
    (area > 0.).then(|| (area, rows.iter().map(|r| r.area * (rc.depth - r.centroid_from_face)).sum::<f64>() / area))
}

/// 3.1.7(3) block parameters and Table 3.1 εcu3, fck <= 50 MPa (applicability).
fn block() -> (f64, f64, f64) {
    (0.8, 1.0, 0.0035)
}

/// 6.1: M_Rd from the code-agnostic kernel with the 3.1.7(3) block and 3.2.7(2)(b) steel.
fn flexure(ndp: &Ec2Ndp, rc: &RcBeamContext, compression: RcFace, med: f64) -> CheckOutcome {
    let clause = "6.1, 3.1.7(3), 3.2.7(2)b";
    let state = if compression == RcFace::Top { "sagging" } else { "hogging" };
    let fcd = ndp.alpha_cc_flexure * rc.fck / ndp.gamma_c;
    let fyd = rc.fyk / ndp.gamma_s;
    let (lambda, eta, ecu3) = block();
    if tension(rc, compression).is_none() {
        // 6.1(2)P ignores concrete tension, so with no tension steel M_Rd = 0.
        return CheckOutcome::result(
            "ec2.flexure",
            clause,
            CheckStatus::Fail,
            med,
            0.,
            "N m",
            json!({"state": state, "compressionFace": face_name(compression)}),
            format!("No tension reinforcement on the {} face", face_name(opposite(compression))),
        );
    }
    let law = ConcreteLaw::RectangularBlock { intensity: eta * fcd, depth_ratio: lambda, ultimate_strain: ecu3 };
    let steel = SteelLaw { yield_strength: fyd, modulus: ES };
    match rc_section::ultimate(&RcRectangle { width: rc.width, depth: rc.depth }, &layers(rc, compression), &steel, &law) {
        Ok(u) => CheckOutcome::result(
            "ec2.flexure",
            clause,
            if med <= u.moment { CheckStatus::Pass } else { CheckStatus::Fail },
            med,
            u.moment,
            "N m",
            json!({"state": state, "compressionFace": face_name(compression), "fcd": fcd, "fyd": fyd,
                   "lambda": lambda, "eta": eta, "epsilonCu3": ecu3, "neutralAxisDepth": u.neutral_axis_depth,
                   "depthRatio": u.depth_ratio,
                   "tensionSteelYields": matches!(u.classification, TensionState::TensionYielded),
                   "ndp": ndp.label}),
            format!("{state}: M_Ed {med:.1} N m vs M_Rd {:.1} N m", u.moment),
        ),
        Err(e) => CheckOutcome::unsupported("ec2.flexure", clause, e.message),
    }
}

/// 9.2.1.1(1): As >= max(0.26 fctm/fyk bt d, 0.0013 bt d), fctm from Table 3.1.
fn as_min(rc: &RcBeamContext, compression: RcFace) -> CheckOutcome {
    let clause = "9.2.1.1(1), Table 3.1";
    let Some((area, d)) = tension(rc, compression) else {
        return CheckOutcome::unsupported("ec2.as-min", clause, "No tension reinforcement: section is unreinforced (Section 12)");
    };
    let fctm = 0.30 * (rc.fck / 1e6).powf(2. / 3.) * 1e6;
    let required = (0.26 * fctm / rc.fyk * rc.width * d).max(0.0013 * rc.width * d);
    CheckOutcome::result(
        "ec2.as-min",
        clause,
        if area >= required { CheckStatus::Pass } else { CheckStatus::Fail },
        required,
        area,
        "m2",
        json!({"tensionFace": face_name(opposite(compression)), "fctm": fctm, "bt": rc.width, "d": d}),
        "Demand is As,min, resistance is the provided tension area",
    )
}

/// 9.2.1.1(3): tension and compression areas each <= 0.04 Ac outside laps.
fn as_max(rc: &RcBeamContext) -> Vec<CheckOutcome> {
    let limit = AS_MAX_RATIO * rc.width * rc.depth;
    [RcFace::Top, RcFace::Bottom]
        .into_iter()
        .filter_map(|face| {
            let area: f64 = rc.rows.iter().filter(|r| r.face == face).map(|r| r.area).sum();
            (area > 0.).then(|| {
                CheckOutcome::result(
                    &format!("ec2.as-max.{}", face_name(face)),
                    "9.2.1.1(3)",
                    if area <= limit { CheckStatus::Pass } else { CheckStatus::Fail },
                    area,
                    limit,
                    "m2",
                    json!({"face": face_name(face), "Ac": rc.width * rc.depth}),
                    "Outside lap locations",
                )
            })
        })
        .collect()
}

/// Effective depth for shear: the tension face of the bending state, or the
/// smaller effective depth of the two faces when there is no bending.
fn shear_depth(rc: &RcBeamContext, compression: Option<RcFace>) -> Option<(f64, f64)> {
    match compression {
        Some(face) => tension(rc, face),
        None => [RcFace::Top, RcFace::Bottom]
            .into_iter()
            .filter_map(|f| tension(rc, f))
            .min_by(|a, b| a.1.total_cmp(&b.1)),
    }
}

/// 6.2.2(1) and 6.2.3(3) for vertical links, with θ chosen in the NDP range
/// to maximise min(V_Rd,s, V_Rd,max).
fn shear(ndp: &Ec2Ndp, rc: &RcBeamContext, compression: Option<RcFace>, ved: f64) -> CheckOutcome {
    let Some((asl, d)) = shear_depth(rc, compression) else {
        return CheckOutcome::unsupported("ec2.shear", "6.2", "No longitudinal tension reinforcement defines d");
    };
    let (fck_mpa, bw_mm, d_mm) = (rc.fck / 1e6, rc.width * 1e3, d * 1e3);
    let crdc = ndp.crdc_numerator / ndp.gamma_c;
    let k = (1. + (200. / d_mm).sqrt()).min(2.0);
    // Fig. 6.3: Asl counts only when anchored l_bd + d beyond the section.
    let anchored = rc.tension_steel_anchored == Some(true);
    let rho = if anchored { (asl / (rc.width * d)).min(0.02) } else { 0. };
    let vmin = 0.035 * k.powf(1.5) * fck_mpa.sqrt();
    let v_62a = crdc * k * (100. * rho * fck_mpa).cbrt();
    let vrdc = v_62a.max(vmin) * bw_mm * d_mm; // N (σcp = 0 in scope, so K1 σcp vanishes)
    let mut intermediates = json!({"d": d, "k": k, "CRdc": crdc, "rhoL": rho, "tensionSteelAnchored": rc.tension_steel_anchored,
        "vmin": vmin, "VRdc": vrdc, "k1": K1, "sigmaCp": 0.0, "ndp": ndp.label,
        "assumptions": ["V_Ed used at the station without the 6.2.1(8) or 6.2.2(6) reductions",
                        "UK NA VRd,max <= 200 bw^2 cap not applied (units not stated)"]});
    let Some(links) = rc.links.as_ref() else {
        return CheckOutcome::result(
            "ec2.shear",
            "6.2.2(1)",
            if ved <= vrdc { CheckStatus::Pass } else { CheckStatus::Fail },
            ved,
            vrdc,
            "N",
            intermediates,
            if ved <= vrdc { "V_Ed <= V_Rd,c without design shear reinforcement" } else { "Design shear reinforcement required (6.2.1(5))" },
        );
    };
    let z = 0.9 * d; // 6.2.3(1)
    let fywd = links.fyk / ndp.gamma_s;
    let fcd = ndp.alpha_cc_shear * rc.fck / ndp.gamma_c;
    let nu1 = 0.6 * (1. - fck_mpa / 250.); // 6.6N; UK ν(1 - 0.5 cos 90°) = ν
    let asw_s = links.legs as f64 * std::f64::consts::PI * links.diameter.powi(2) / 4. / links.spacing;
    let a = asw_s * z * fywd; // V_Rd,s = a cot θ
    let c = bw_mm / 1e3 * z * nu1 * fcd; // V_Rd,max = c cot θ / (1 + cot² θ), α_cw = 1
    // min(a cotθ, c cotθ/(1+cot²θ)) peaks where they meet: cot²θ = c/a - 1.
    let cot = ((c / a - 1.).max(0.)).sqrt().clamp(ndp.cot_theta_min, ndp.cot_theta_max);
    let vrds = a * cot;
    let vrdmax = c * cot / (1. + cot * cot);
    let vrd = vrds.min(vrdmax);
    intermediates["z"] = json!(z);
    intermediates["fywd"] = json!(fywd);
    intermediates["fcd"] = json!(fcd);
    intermediates["nu1"] = json!(nu1);
    intermediates["AswOverS"] = json!(asw_s);
    intermediates["cotTheta"] = json!(cot);
    intermediates["VRds"] = json!(vrds);
    intermediates["VRdmax"] = json!(vrdmax);
    CheckOutcome::result(
        "ec2.shear",
        "6.2.3(1)-(3)",
        if ved <= vrd { CheckStatus::Pass } else { CheckStatus::Fail },
        ved,
        vrd,
        "N",
        intermediates,
        format!("Vertical links, cot θ = {cot:.4}; V_Rd = min(V_Rd,s, V_Rd,max)"),
    )
}

/// 6.2.1(4) and 9.2.2(5): beams need at least ρw,min of links.
fn links_min(rc: &RcBeamContext) -> CheckOutcome {
    let clause = "6.2.1(4), 9.2.2(5)";
    let Some(links) = rc.links.as_ref() else {
        return CheckOutcome::result(
            "ec2.links-min",
            clause,
            CheckStatus::Fail,
            0.08 * (rc.fck / 1e6).sqrt() / (rc.fyk / 1e6),
            0.,
            "-",
            json!({}),
            "Beams require minimum shear reinforcement; none provided",
        );
    };
    let rho_w = links.legs as f64 * std::f64::consts::PI * links.diameter.powi(2) / 4. / (links.spacing * rc.width);
    let rho_min = 0.08 * (rc.fck / 1e6).sqrt() / (links.fyk / 1e6);
    CheckOutcome::result(
        "ec2.links-min",
        clause,
        if rho_w >= rho_min { CheckStatus::Pass } else { CheckStatus::Fail },
        rho_min,
        rho_w,
        "-",
        json!({"rhoW": rho_w, "rhoWMin": rho_min}),
        "Demand is ρw,min, resistance is the provided ρw (α = 90°)",
    )
}

/// 9.2.2(6) and (8): longitudinal and transverse link spacing.
fn links_spacing(rc: &RcBeamContext, compression: Option<RcFace>) -> CheckOutcome {
    let clause = "9.2.2(6), 9.2.2(8)";
    let Some(links) = rc.links.as_ref() else {
        return CheckOutcome::unsupported("ec2.links-spacing", clause, "No links provided");
    };
    let Some((_, d)) = shear_depth(rc, compression) else {
        return CheckOutcome::unsupported("ec2.links-spacing", clause, "No longitudinal tension reinforcement defines d");
    };
    if links.legs < 2 {
        return CheckOutcome::unsupported("ec2.links-spacing", clause, "Single-leg links are outside scope");
    }
    let sl_max = 0.75 * d; // (1 + cot 90°)
    let st = (rc.width - 2. * rc.cover_to_link - links.diameter) / (links.legs as f64 - 1.);
    let st_max = (0.75 * d).min(0.6);
    let ok = links.spacing <= sl_max && st <= st_max;
    let governing = (links.spacing / sl_max).max(st / st_max);
    CheckOutcome::result(
        "ec2.links-spacing",
        clause,
        if ok { CheckStatus::Pass } else { CheckStatus::Fail },
        governing,
        1.,
        "-",
        json!({"sl": links.spacing, "slMax": sl_max, "st": st, "stMax": st_max, "d": d}),
        "Demand is the larger of s/s_l,max and s_t/s_t,max",
    )
}

/// Mandatory companions that are not implemented. They keep the overall
/// status from ever reaching pass.
fn companions() -> Vec<CheckOutcome> {
    vec![
        CheckOutcome::unsupported("ec2.anchorage", "8, 9.2.1.3-9.2.1.5", "Anchorage and curtailment are not implemented"),
        CheckOutcome::unsupported("ec2.serviceability", "7", "Stress limits, crack control and deflection are not implemented"),
        CheckOutcome::unsupported("ec2.cover-spacing", "4.4, 8.2", "Cover and bar spacing rules are not implemented"),
        CheckOutcome::unsupported("ec2.amendments", "A1:2014, NA+A2:2014", "Not held; no clause is reconciled with the current amendments"),
    ]
}
