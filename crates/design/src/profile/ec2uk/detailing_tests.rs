//! EC2 detailing and serviceability checks against published values:
//! JRC89037 anchorage Tables 4.1.2-4.1.4 and span/depth worked values,
//! EN 1992-1-1 Tables 7.2N/7.3N, and closed forms for the cracked section
//! and the required steel.
use serde_json::Value;

use super::detailing::*;
use super::*;
use crate::profile::{DesignRun, RcBarRow, RcBars, RcBeamContext, RcBeamDetailing, RcLinks};

fn fixture() -> Value {
    serde_json::from_str(include_str!("../../../../../fixtures/design/ec2-uk-na/jrc-detailing.published.json")).unwrap()
}

#[test]
fn anchorage_lengths_reproduce_jrc_tables_4_1_2_to_4_1_4() {
    let ndp = Ec2Ndp::eu_recommended();
    let mut n = 0;
    for t in fixture()["anchorage"]["tables"].as_array().unwrap() {
        let (fck, fyk, cnom) = (t["fck"].as_f64().unwrap(), t["fyk"].as_f64().unwrap(), t["cNom"].as_f64().unwrap());
        for (phi, want) in t["lbdStraightMm"].as_object().unwrap() {
            let phi = phi.parse::<f64>().unwrap() / 1e3;
            let w: Vec<f64> = want.as_array().unwrap().iter().map(|v| v.as_f64().unwrap()).collect();
            let good = anchorage_length(&ndp, fck, fyk, phi, true, cnom);
            let poor = anchorage_length(&ndp, fck, fyk, phi, false, cnom);
            for (got, want, what) in [
                (good.lbd_tension, w[0], "tension good"),
                (poor.lbd_tension, w[1], "tension poor"),
                (good.lbd_compression, w[2], "compression good"),
                (poor.lbd_compression, w[3], "compression poor"),
            ] {
                assert!((got * 1e3 - want).abs() <= 1.0, "Table {} φ{} {what}: {:.1} vs {want}", t["table"], phi * 1e3, got * 1e3);
                n += 1;
            }
        }
    }
    assert_eq!(n, 84);
    // The UK NA keeps α_ct = 1.0 and γc, γs, so UK and EU lengths agree.
    let (uk, eu) = (
        anchorage_length(&Ec2Ndp::uk_na_2009(), 25e6, 500e6, 0.016, true, 0.03),
        anchorage_length(&ndp, 25e6, 500e6, 0.016, true, 0.03),
    );
    assert_eq!(uk, eu);
}

#[test]
fn span_depth_reproduces_jrc_worked_values() {
    let f = fixture();
    let slab = &f["spanDepth"][0];
    let basic = basic_span_depth(1.3, 25., slab["rho"].as_f64().unwrap(), 0.);
    assert!((basic - slab["basic"].as_f64().unwrap()).abs() <= 0.05, "{basic}");
    // The report scales its rounded 26.4 (26.4 x 310/241 = 33.96) and prints
    // 33.9: one published unit, per the fixture's tolerance policy.
    let adjusted = basic * 310. / (slab["sigmaS"].as_f64().unwrap() / 1e6);
    assert!((adjusted - slab["adjusted"].as_f64().unwrap()).abs() <= 0.1, "{adjusted}");
    let ribbed = &f["spanDepth"][1];
    let flanged = 0.8 * basic_span_depth(1.3, 25., ribbed["rho"].as_f64().unwrap(), 0.);
    assert!((flanged - ribbed["basicWithFlange"].as_f64().unwrap()).abs() <= 0.05, "{flanged}");
    // (7.16b) above ρ0 and continuity at ρ = ρ0.
    let rho0 = 5e-3;
    assert!((basic_span_depth(1.0, 25., rho0, 0.) - basic_span_depth(1.0, 25., rho0 + 1e-12, 0.)).abs() < 1e-6);
}

#[test]
fn crack_tables_are_the_code_tables_with_the_conservative_row() {
    let f = fixture();
    for (name, table) in [("7.2N", &f["tables7"]["7.2N"]), ("7.3N", &f["tables7"]["7.3N"])] {
        let rows: Vec<f64> = table["sigmaMpa"].as_array().unwrap().iter().map(|v| v.as_f64().unwrap()).collect();
        for (col, wk) in [("wk04", 0.4e-3), ("wk03", 0.3e-3), ("wk02", 0.2e-3)] {
            let vals = table[col].as_array().unwrap();
            for (k, s) in rows.iter().enumerate() {
                let got = table_value(if name == "7.2N" { &TABLE_7_2N_PUB } else { &TABLE_7_3N_PUB }, *s, wk);
                assert_eq!(got, vals[k].as_f64(), "{name} {s} {col}");
                // Between rows the next (higher-stress) row applies.
                if k + 1 < rows.len() {
                    let mid = table_value(if name == "7.2N" { &TABLE_7_2N_PUB } else { &TABLE_7_3N_PUB }, s + 1., wk);
                    assert_eq!(mid, vals[k + 1].as_f64(), "{name} between {s} and next");
                }
            }
        }
    }
}

// The tables the checks use, re-exported for the test above.
use super::detailing::{TABLE_7_2N as TABLE_7_2N_PUB, TABLE_7_3N as TABLE_7_3N_PUB};

fn beam(cover: f64, detailing: RcBeamDetailing) -> RcBeamContext {
    // 300 x 500, links φ8, 3 φ20 bottom and 2 φ12 top, C30/37, B500.
    let link = 0.008;
    let bottom = 3. * std::f64::consts::PI * 0.02f64.powi(2) / 4.;
    let top = 2. * std::f64::consts::PI * 0.012f64.powi(2) / 4.;
    RcBeamContext {
        width: 0.3,
        depth: 0.5,
        cover_to_link: cover,
        fck: 30e6,
        fyk: 500e6,
        rows: vec![
            RcBarRow { face: RcFace::Bottom, area: bottom, centroid_from_face: cover + link + 0.010, bars: Some(RcBars { diameter: 0.020, count: 3 }) },
            RcBarRow { face: RcFace::Top, area: top, centroid_from_face: cover + link + 0.006, bars: Some(RcBars { diameter: 0.012, count: 2 }) },
        ],
        links: Some(RcLinks { legs: 2, diameter: link, spacing: 0.2, fyk: 500e6 }),
        tension_steel_anchored: Some(true),
        detailing,
    }
}

fn inputs() -> RcBeamDetailing {
    RcBeamDetailing {
        exposure_class: Some("XC1".into()),
        cover_durability: Some(0.025),
        aggregate_size: Some(0.020),
        structural_system: Some("simplySupported".into()),
        partitions_sensitive: Some(false),
        span: Some(6.0),
        quasi_permanent_moment: Some(-100e3),
        quasi_permanent_combination: Some("QP".into()),
    }
}

#[test]
fn cover_and_spacing_follow_4_4_1_and_8_2() {
    // c_nom,req for links = max(8, 25, 10) + 10 = 35 mm; bars: max(20, 25, 10) + 10 = 35 mm.
    let short = cover(&beam(0.030, inputs()));
    assert_eq!(short.status, CheckStatus::Fail);
    assert!((short.intermediates["links"]["cNomRequired"].as_f64().unwrap() - 0.035).abs() < 1e-12);
    let ok = cover(&beam(0.035, inputs()));
    assert_eq!(ok.status, CheckStatus::Pass);
    assert!((ok.intermediates["mainBars"]["provided"].as_f64().unwrap() - 0.043).abs() < 1e-12);
    // Clear spacing (300 - 2(35 + 8) - 3 x 20)/2 = 77 mm >= max(20, 20 + 5, 20) = 25 mm.
    let s = bar_spacing(&beam(0.035, inputs()));
    assert_eq!(s.status, CheckStatus::Pass);
    let bottom = &s.intermediates["rows"][0];
    assert!((bottom["clearSpacing"].as_f64().unwrap() - 0.077).abs() < 1e-12);
    assert!((bottom["minimum"].as_f64().unwrap() - 0.025).abs() < 1e-12);
    // Aggregate over 32 mm adds 5 mm to c_min,b (Table 4.2).
    let mut big = inputs();
    big.aggregate_size = Some(0.040);
    big.cover_durability = Some(0.010);
    let c = cover(&beam(0.035, big));
    assert!((c.intermediates["mainBars"]["cNomRequired"].as_f64().unwrap() - 0.035).abs() < 1e-12);
    // Missing inputs are named, not assumed.
    let none = cover(&beam(0.035, RcBeamDetailing::default()));
    assert_eq!(none.status, CheckStatus::Indeterminate);
    assert!(none.message.contains("c_min,dur"));
}

#[test]
fn cracked_stress_matches_the_closed_form() {
    let rc = beam(0.035, inputs());
    let mut singly = rc.clone();
    singly.rows.retain(|r| r.face == RcFace::Bottom);
    let (sigma, x) = cracked_stress(&singly, RcFace::Top, 100e3).unwrap();
    let (_, _, ecm) = table_3_1(30e6);
    let ae = 200e9 / ecm;
    let (b, a) = (0.3, singly.rows[0].area);
    let d = 0.5 - singly.rows[0].centroid_from_face;
    let xc = (-ae * a + ((ae * a).powi(2) + 2. * b * ae * a * d).sqrt()) / b;
    let icr = b * xc.powi(3) / 3. + ae * a * (d - xc).powi(2);
    assert!((x - xc).abs() < 1e-12, "{x} {xc}");
    assert!((sigma / (ae * 100e3 * (d - xc) / icr) - 1.).abs() < 1e-9);
}

#[test]
fn required_steel_matches_the_rectangular_block_closed_form() {
    let ndp = Ec2Ndp::uk_na_2009();
    let mut rc = beam(0.035, inputs());
    rc.rows.retain(|r| r.face == RcFace::Bottom);
    let d = 0.5 - rc.rows[0].centroid_from_face;
    let (fcd, fyd, b) = (0.85 * 30e6 / 1.5, 500e6 / 1.15, 0.3);
    let m = 150e3;
    // M = As fyd (d - 0.4 x), x = As fyd / (0.8 b fcd): quadratic in As.
    let (qa, qb, qc) = (fyd * fyd * 0.4 / (0.8 * b * fcd), -fyd * d, m);
    let want = (-qb - (qb * qb - 4. * qa * qc).sqrt()) / (2. * qa);
    let got = as_required(&ndp, &rc, RcFace::Top, m).unwrap();
    assert!((got / want - 1.).abs() < 1e-6, "{got} vs {want}");
}

#[test]
fn a_fully_detailed_beam_passes_every_check() {
    let p = Ec2UkNaProfile { ndp: Ec2Ndp::uk_na_2009(), enabled: true };
    let ctx = MemberContext { rc_beam: Some(beam(0.035, inputs())), ..Default::default() };
    let d = DesignDemand { my: -150e3, vz: 80e3, combination_id: "ULS".into(), station: 0.5, ..Default::default() };
    let checks = p.run_checks(&d, &ctx);
    for c in &checks {
        assert_eq!(c.status, CheckStatus::Pass, "{} {}", c.check_id, c.message);
    }
    for id in ["ec2.cover", "ec2.bar-spacing", "ec2.anchorage", "ec2.crack-min", "ec2.crack-control", "ec2.deflection"] {
        assert!(checks.iter().any(|c| c.check_id == id), "{id}");
    }
    assert_eq!(DesignRun::overall_from_checks(&checks), CheckStatus::Pass);
    // Without the anchorage confirmation the run is indeterminate and states l_bd.
    let mut unconfirmed = beam(0.035, inputs());
    unconfirmed.tension_steel_anchored = None;
    let ctx = MemberContext { rc_beam: Some(unconfirmed), ..Default::default() };
    let checks = p.run_checks(&d, &ctx);
    let a = checks.iter().find(|c| c.check_id == "ec2.anchorage").unwrap();
    assert_eq!(a.status, CheckStatus::Indeterminate);
    assert!(a.message.contains("l_bd"));
    // A 9 m span over sensitive partitions tightens the limit by 7/9.
    let mut long = inputs();
    long.span = Some(9.0);
    long.partitions_sensitive = Some(true);
    let dfl = deflection(&p.ndp, &beam(0.035, long), RcFace::Top, 150e3).unwrap();
    assert!((dfl.intermediates["partitionFactor"].as_f64().unwrap() - 7. / 9.).abs() < 1e-12);
}

#[test]
fn flexure_crosses_the_balanced_boundary_by_the_closed_form() {
    // UK NA: fcd = 0.85 fck/1.5, λ = 0.8, η = 1, εcu3 = 0.0035, Es = 200 GPa.
    // Balanced x/d = εcu3/(εcu3 + fyd/Es). Below it the steel yields,
    // x = As fyd/(0.8 b fcd); above it σs = Es εcu3 (d - x)/x and
    // 0.8 b fcd x² + As Es εcu3 x - As Es εcu3 d = 0.
    let ndp = Ec2Ndp::uk_na_2009();
    let mut rc = beam(0.035, inputs());
    rc.rows.retain(|r| r.face == RcFace::Bottom);
    let (b, fcd, fyd, es, ecu) = (0.3, 0.85 * 30e6 / 1.5, 500e6 / 1.15, 200e9, 0.0035);
    let d = 0.5 - rc.rows[0].centroid_from_face;
    let x_bal = ecu / (ecu + fyd / es) * d;
    let as_bal = 0.8 * b * fcd * x_bal / fyd;
    let with = |area: f64| {
        let mut r = rc.clone();
        r.rows[0].area = area;
        super::flexure(&ndp, &r, RcFace::Top, 0.)
    };
    let under = with(0.95 * as_bal);
    let x = 0.95 * as_bal * fyd / (0.8 * b * fcd);
    assert_eq!(under.intermediates["tensionSteelYields"], true);
    assert!((under.resistance.unwrap() / (0.95 * as_bal * fyd * (d - 0.4 * x)) - 1.).abs() < 1e-9);
    for factor in [1.05, 2.0] {
        let area = factor * as_bal;
        let over = with(area);
        assert_eq!(over.intermediates["tensionSteelYields"], false, "{factor}");
        let (qa, qb, qc) = (0.8 * b * fcd, area * es * ecu, -area * es * ecu * d);
        let x = (-qb + (qb * qb - 4. * qa * qc).sqrt()) / (2. * qa);
        let want = 0.8 * b * fcd * x * (d - 0.4 * x);
        assert!((over.resistance.unwrap() / want - 1.).abs() < 1e-9, "{factor}: {:?} vs {want}", over.resistance);
    }
}

#[test]
fn uk_v_rd_max_cap_is_200_bw_squared_and_absent_from_the_eu_set() {
    // A 100 mm web 4 m deep, C50, dense links: at cot θ = 1 V_Rd,max from
    // 6.2.3 is 0.5 bw z ν1 fcd ≈ 2.4 MN, above 200 bw² = 2 MN, so the UK cap
    // governs; the EU set has no cap.
    let mut rc = beam(0.035, inputs());
    rc.width = 0.1;
    rc.depth = 4.0;
    rc.fck = 50e6;
    rc.rows.retain(|r| r.face == RcFace::Bottom);
    rc.rows[0].bars = Some(RcBars { diameter: 0.020, count: 2 });
    rc.links = Some(RcLinks { legs: 2, diameter: 0.012, spacing: 0.075, fyk: 500e6 });
    let uk = super::shear(&Ec2Ndp::uk_na_2009(), &rc, Some(RcFace::Top), 1e6);
    assert_eq!(uk.intermediates["ukVRdMaxCap"].as_f64(), Some(2e6));
    assert!((uk.intermediates["VRdmax"].as_f64().unwrap() - 2e6).abs() < 1e-6);
    let eu = super::shear(&Ec2Ndp::eu_recommended(), &rc, Some(RcFace::Top), 1e6);
    assert!(eu.intermediates["ukVRdMaxCap"].is_null());
    assert!(eu.intermediates["VRdmax"].as_f64().unwrap() > 2e6);
}
