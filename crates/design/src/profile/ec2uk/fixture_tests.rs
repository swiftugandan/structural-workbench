//! EC2 beam profile against independent expectations: the JRC89037 published
//! figures and the pure-Python oracle targets in
//! `fixtures/design/ec2-uk-na/jrc-axis2-beam.reconciliation.json`.
use serde_json::Value;

use super::*;
use crate::profile::{DesignDemand, MemberContext, RcBarRow, RcLinks, RcBeamContext, RcFace};

fn published() -> Value {
    serde_json::from_str(include_str!("../../../../../fixtures/design/ec2-uk-na/jrc-axis2-beam.published.json")).unwrap()
}

fn targets(set: &str) -> Value {
    let r: Value = serde_json::from_str(include_str!(
        "../../../../../fixtures/design/ec2-uk-na/jrc-axis2-beam.reconciliation.json"
    ))
    .unwrap();
    assert!(r["failures"].as_array().unwrap().is_empty(), "oracle reconciliation must be clean");
    r["designCheckTargets"]["values"][set].clone()
}

fn f(v: &Value) -> f64 {
    v.as_f64().unwrap()
}

/// JRC beam axis 2 web: bw = 250, h = 400, d = 372 mm, C25/30, B500.
fn jrc_beam(rows: Vec<RcBarRow>, links: Option<RcLinks>) -> MemberContext {
    let p = published();
    let s = &p["section"];
    MemberContext {
        member_id: "jrc-axis2".into(),
        section_family: "RC rectangle".into(),
        rc_beam: Some(RcBeamContext {
            width: f(&s["bw_mm"]) / 1e3,
            depth: f(&s["h_mm"]) / 1e3,
            cover_to_link: f(&p["materials"]["cnom_mm"]) / 1e3,
            fck: f(&p["materials"]["fck_MPa"]) * 1e6,
            fyk: f(&p["materials"]["fyk_MPa"]) * 1e6,
            rows,
            links,
            tension_steel_anchored: Some(true),
        }),
        ..Default::default()
    }
}

fn row(face: RcFace, area_mm2: f64) -> RcBarRow {
    // Centroid at h - d = 28 mm from its face.
    RcBarRow { face, area: area_mm2 / 1e6, centroid_from_face: 0.028 }
}

fn links(diameter_mm: f64, spacing_mm: f64) -> Option<RcLinks> {
    Some(RcLinks { legs: 2, diameter: diameter_mm / 1e3, spacing: spacing_mm / 1e3, fyk: 500e6 })
}

fn demand(my: f64, vz: f64) -> DesignDemand {
    DesignDemand { my, vz, combination_id: "ULS".into(), station: 0.5, ..Default::default() }
}

fn check<'a>(checks: &'a [CheckOutcome], id: &str) -> &'a CheckOutcome {
    checks.iter().find(|c| c.check_id == id).unwrap_or_else(|| panic!("missing {id}: {checks:#?}"))
}

fn close(got: f64, want: f64, rel: f64, what: &str) {
    assert!((got - want).abs() <= rel * want.abs(), "{what}: {got} vs {want}");
}

fn profile(ndp: Ec2Ndp) -> Ec2UkNaProfile {
    Ec2UkNaProfile { ndp, enabled: false }
}

#[test]
fn support_b_hogging_flexure_matches_oracle_for_both_ndp_sets() {
    // Top row in tension (hogging, My > 0), As = JRC A_s,req 947 mm², singly reinforced.
    for (set, ndp) in [("EU", Ec2Ndp::eu_recommended()), ("UK-NA-2009", Ec2Ndp::uk_na_2009())] {
        let t = targets(set);
        let ctx = jrc_beam(vec![row(RcFace::Top, 947.)], None);
        let checks = profile(ndp).run_checks(&demand(100e3, 0.), &ctx);
        let fl = check(&checks, "ec2.flexure");
        let want = f(&t["flexureSinglyReinforced"]["JRC-A2-FLEX-SUPPORT-B"]["MRdAtJrcAs_kNm"]) * 1e3;
        close(fl.resistance.unwrap(), want, 1e-9, &format!("{set} M_Rd"));
        assert_eq!(fl.intermediates["compressionFace"], "bottom");
        assert_eq!(fl.status, CheckStatus::Pass);
    }
    // EU set also reproduces the published design moment within published rounding.
    let ctx = jrc_beam(vec![row(RcFace::Top, 947.)], None);
    let fl = profile(Ec2Ndp::eu_recommended()).run_checks(&demand(132.9e3, 0.), &ctx);
    close(check(&fl, "ec2.flexure").resistance.unwrap(), 132.9e3, 0.005, "JRC M_Ed");
}

#[test]
fn shear_with_links_matches_oracle_on_both_theta_branches() {
    for set in ["EU", "UK-NA-2009"] {
        let ndp = if set == "EU" { Ec2Ndp::eu_recommended() } else { Ec2Ndp::uk_na_2009() };
        let t = targets(set);
        // Branch 1: 2 x 6 mm at 175 mm clamps at cot θ = 2.5 (JRC support A provision).
        // Branch 2: 2 x 10 mm at 100 mm gives an interior optimum.
        for (key, dia, spacing) in [("linksProvided", 6., 175.), ("linksHeavy2x10at100", 10., 100.)] {
            let ctx = jrc_beam(vec![row(RcFace::Bottom, 565.), row(RcFace::Top, 226.)], links(dia, spacing));
            let checks = profile(ndp.clone()).run_checks(&demand(-50e3, 115.52e3), &ctx);
            let sh = check(&checks, "ec2.shear");
            let w = &t[key];
            // The oracle grid search resolves cot θ to ~1e-5, the closed form is exact.
            close(sh.resistance.unwrap(), f(&w["VRd_kN"]) * 1e3, 1e-5, &format!("{set} {key} V_Rd"));
            close(f(&sh.intermediates["cotTheta"]), f(&w["cotTheta"]), 1e-4, &format!("{set} {key} cot θ"));
            close(f(&sh.intermediates["fcd"]), f(&t["fcdShear_MPa"]) * 1e6, 1e-12, &format!("{set} fcd"));
        }
    }
}

#[test]
fn shear_without_links_uses_vrdc_and_published_jrc_value() {
    let ctx = jrc_beam(vec![row(RcFace::Bottom, 565.)], None);
    let checks = profile(Ec2Ndp::eu_recommended()).run_checks(&demand(-50e3, 115.52e3), &ctx);
    let sh = check(&checks, "ec2.shear");
    // JRC published V_Rd,c = 47.90 kN with rho_l from 565 mm² (anchored).
    close(sh.resistance.unwrap(), 47.90e3, 0.005, "V_Rd,c");
    assert_eq!(sh.status, CheckStatus::Fail, "115.52 kN exceeds V_Rd,c: links required");
    assert_eq!(check(&checks, "ec2.links-min").status, CheckStatus::Fail);
}

#[test]
fn unconfirmed_anchorage_excludes_asl_and_falls_to_vmin() {
    let mut ctx = jrc_beam(vec![row(RcFace::Bottom, 565.)], None);
    ctx.rc_beam.as_mut().unwrap().tension_steel_anchored = None;
    let checks = profile(Ec2Ndp::uk_na_2009()).run_checks(&demand(-50e3, 30e3), &ctx);
    let sh = check(&checks, "ec2.shear");
    assert_eq!(sh.intermediates["rhoL"], 0.0);
    // (6.2.b): v_min b_w d with k = 1 + sqrt(200/372), fck = 25.
    let k: f64 = 1. + (200f64 / 372.).sqrt();
    close(sh.resistance.unwrap(), 0.035 * k.powf(1.5) * 5. * 250. * 372., 1e-12, "v_min");
}

#[test]
fn reinforcement_limits_match_oracle() {
    let t = targets("UK-NA-2009");
    let ctx = jrc_beam(vec![row(RcFace::Bottom, 565.), row(RcFace::Top, 226.)], links(6., 175.));
    let checks = profile(Ec2Ndp::uk_na_2009()).run_checks(&demand(-50e3, 100e3), &ctx);
    let amin = check(&checks, "ec2.as-min");
    close(amin.demand.unwrap(), f(&t["AsMin_mm2"]) / 1e6, 1e-12, "As,min");
    close(check(&checks, "ec2.as-max.bottom").resistance.unwrap(), f(&t["AsMax_mm2"]) / 1e6, 1e-12, "As,max");
    let lm = check(&checks, "ec2.links-min");
    close(lm.demand.unwrap(), f(&t["rhoWMin"]), 1e-12, "rho_w,min");
    let sp = check(&checks, "ec2.links-spacing");
    close(f(&sp.intermediates["slMax"]), f(&t["slMax_mm"]) / 1e3, 1e-12, "s_l,max");
    close(f(&sp.intermediates["stMax"]), f(&t["stMax_mm"]) / 1e3, 1e-12, "s_t,max");
    assert_eq!(sp.status, CheckStatus::Pass);
}

#[test]
fn sign_mapping_follows_adr_0014() {
    let ctx = jrc_beam(vec![row(RcFace::Bottom, 565.), row(RcFace::Top, 226.)], links(6., 175.));
    let p = profile(Ec2Ndp::uk_na_2009());
    let sag = p.run_checks(&demand(-20e3, 0.), &ctx);
    assert_eq!(check(&sag, "ec2.flexure").intermediates["compressionFace"], "top");
    assert_eq!(check(&sag, "ec2.as-min").intermediates["tensionFace"], "bottom");
    let hog = p.run_checks(&demand(20e3, 0.), &ctx);
    assert_eq!(check(&hog, "ec2.flexure").intermediates["compressionFace"], "bottom");
    // Different tension areas give different capacities.
    assert!(check(&sag, "ec2.flexure").resistance.unwrap() > check(&hog, "ec2.flexure").resistance.unwrap());
}

#[test]
fn out_of_scope_actions_and_companions_never_pass() {
    let ctx = jrc_beam(vec![row(RcFace::Bottom, 565.), row(RcFace::Top, 226.)], links(6., 175.));
    let p = profile(Ec2Ndp::uk_na_2009());
    let mut d = demand(-20e3, 10e3);
    d.n = 1.0;
    let checks = p.run_checks(&d, &ctx);
    assert_eq!(check(&checks, "ec2.actions").status, CheckStatus::Unsupported);
    assert!(checks.iter().all(|c| c.check_id != "ec2.flexure"));
    // A section that passes every implemented check still cannot pass overall.
    let ok = p.run_checks(&demand(-20e3, 10e3), &ctx);
    for id in ["ec2.flexure", "ec2.shear", "ec2.as-min", "ec2.links-min", "ec2.links-spacing"] {
        assert_eq!(check(&ok, id).status, CheckStatus::Pass, "{id}");
    }
    assert_eq!(crate::profile::DesignRun::overall_from_checks(&ok), CheckStatus::Unsupported);
    // No tension steel on the tension face: flexure fails with zero resistance.
    let bare = jrc_beam(vec![row(RcFace::Bottom, 565.)], links(6., 175.));
    let hog = p.run_checks(&demand(20e3, 0.), &bare);
    assert_eq!(check(&hog, "ec2.flexure").status, CheckStatus::Fail);
}

#[test]
fn applicability_rejects_out_of_scope_members() {
    let p = profile(Ec2Ndp::uk_na_2009());
    assert!(matches!(p.applicability(&MemberContext::default()), ProfileApplicability::Unsupported(_)));
    let mut ctx = jrc_beam(vec![row(RcFace::Bottom, 565.)], None);
    ctx.rc_beam.as_mut().unwrap().fck = 55e6;
    assert!(matches!(p.applicability(&ctx), ProfileApplicability::Unsupported(_)));
    let ctx = jrc_beam(vec![row(RcFace::Bottom, 565.)], None);
    assert_eq!(p.applicability(&ctx), ProfileApplicability::Applicable);
}
