//! Fixture regressions against `fixtures/design/aisc-360-22-lrfd/` published digits.
//!
//! Expected values are read from JSON reconstituted from Design Examples; clause
//! math under test lives in this crate and does not load the PDFs.

use std::fs;
use std::path::PathBuf;

use serde_json::Value;

use super::classification::classify_compression_w;
use super::compression::evaluate_compression;
use super::flexure::{
    check_flexure_major, evaluate_flange_local_buckling, evaluate_flexure_major_yielding,
    evaluate_ltb, flange_limits,
};
use super::interaction::evaluate_h1;
use super::shear::evaluate_shear_major_g21a;
use super::tension::evaluate_tension;
use super::units::{
    ft_to_m, in2_to_m2, in3_to_m3, in_to_m, kip_ft_to_nm, kip_to_n, ksi_to_pa, n_to_kip,
    nm_to_kip_ft, pa_to_ksi,
};
use crate::profile::{CheckStatus, TensionEndProps, WSectionProps};

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/design/aisc-360-22-lrfd")
}

fn load(name: &str) -> Value {
    let path = fixtures_dir().join(name);
    let text = fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    serde_json::from_str(&text).expect("parse fixture json")
}

fn near(actual: f64, expected: f64, rel: f64, abs: f64) {
    let tol = (expected.abs() * rel).max(abs);
    assert!(
        (actual - expected).abs() <= tol,
        "actual={actual} expected={expected} tol={tol}"
    );
}

#[test]
fn s2_d1_tension_matches_example() {
    let v = load("S2-D1-tension-W8x21.json");
    let sec = &v["section"];
    let end = &v["connection"];
    let section = WSectionProps {
        ag: in2_to_m2(sec["Ag_in2"].as_f64().unwrap()),
        bf: in_to_m(sec["bf_in"].as_f64().unwrap()),
        tf: in_to_m(sec["tf_in"].as_f64().unwrap()),
        d: in_to_m(sec["d_in"].as_f64().unwrap()),
        ry: in_to_m(sec["ry_in"].as_f64().unwrap()),
        e: ksi_to_pa(29_000.0),
        ..WSectionProps::default()
    };
    let fy = ksi_to_pa(sec["Fy_ksi"].as_f64().unwrap());
    let fu = ksi_to_pa(sec["Fu_ksi"].as_f64().unwrap());
    // ¾ in bolt → std hole 13/16 in; B4.3b uses dh + 1/16 = 7/8 in.
    let hole = in_to_m(0.875);
    let tension_end = TensionEndProps {
        u_floor: Some(
            (2.0 * sec["bf_in"].as_f64().unwrap() * sec["tf_in"].as_f64().unwrap())
                / sec["Ag_in2"].as_f64().unwrap(),
        ),
        x_bar: Some(in_to_m(0.831)),
        connection_length: Some(in_to_m(end["connectionLength_in"].as_f64().unwrap())),
        hole_count: 4,
        hole_deduction_width: hole,
    };
    let r = evaluate_tension(&section, fy, fu, &tension_end);
    let pubd = &v["published"];
    near(r.u, pubd["U"].as_f64().unwrap(), 0.005, 0.001);
    near(
        r.an / in2_to_m2(1.0),
        pubd["An_in2"].as_f64().unwrap(),
        0.005,
        0.02,
    );
    near(
        r.ae / in2_to_m2(1.0),
        pubd["Ae_in2"].as_f64().unwrap(),
        0.005,
        0.02,
    );
    near(
        n_to_kip(r.phi_pn_rupture),
        pubd["phi_t_Pn_rupture_kip"].as_f64().unwrap(),
        0.005,
        1.0,
    );
    near(
        n_to_kip(r.phi_pn_yield),
        pubd["phi_t_Pn_yield_kip"].as_f64().unwrap(),
        0.01,
        2.0,
    );
    assert_eq!(r.governing, "rupture");
    let pu = kip_to_n(v["loads"]["Pu_kip"].as_f64().unwrap());
    assert!(pu <= r.governing_phi_pn);
}

#[test]
fn s2_e1c_compression_matches_example() {
    let v = load("S2-E1C-compression-W14x132.json");
    let sec = &v["section"];
    let section = WSectionProps {
        ag: in2_to_m2(sec["Ag_in2"].as_f64().unwrap()),
        rx: in_to_m(sec["rx_in"].as_f64().unwrap()),
        ry: in_to_m(sec["ry_in"].as_f64().unwrap()),
        bf_over_2tf: sec["bf_over_2tf"].as_f64().unwrap(),
        h_over_tw: sec["h_over_tw"].as_f64().unwrap(),
        e: ksi_to_pa(sec["E_ksi"].as_f64().unwrap()),
        ..WSectionProps::default()
    };
    let fy = ksi_to_pa(sec["Fy_ksi"].as_f64().unwrap());
    let class = classify_compression_w(&section, fy);
    assert!(class.flanges_nonslender);
    assert!(class.web_nonslender);
    near(
        class.lambda_r_flange,
        v["published"]["lambda_r_flange"].as_f64().unwrap(),
        0.01,
        0.1,
    );
    near(
        class.lambda_r_web,
        v["published"]["lambda_r_web"].as_f64().unwrap(),
        0.01,
        0.2,
    );

    let length = ft_to_m(v["member"]["length_ft"].as_f64().unwrap());
    let r = evaluate_compression(&section, fy, length, 1.0, 1.0).unwrap();
    near(
        r.lc_over_r,
        v["published"]["Lc_over_ry"].as_f64().unwrap(),
        0.005,
        0.2,
    );
    near(
        pa_to_ksi(r.fcr) * 0.90,
        v["published"]["phi_c_Fn_ksi"].as_f64().unwrap(),
        0.01,
        0.3,
    );
    near(
        n_to_kip(r.phi_c_pn),
        v["published"]["phi_c_Pn_kip"].as_f64().unwrap(),
        0.01,
        3.0,
    );
    let pu = kip_to_n(v["loads"]["Pu_kip"].as_f64().unwrap());
    assert!(pu <= r.phi_c_pn);
}

#[test]
fn s2_f11b_flexure_matches_example() {
    let v = load("S2-F11B-flexure-W18x50.json");
    let sec = &v["section"];
    let section = WSectionProps {
        zx: in3_to_m3(sec["Zx_in3"].as_f64().unwrap()),
        e: ksi_to_pa(29_000.0),
        ..WSectionProps::default()
    };
    let fy = ksi_to_pa(sec["Fy_ksi"].as_f64().unwrap());
    let r = evaluate_flexure_major_yielding(&section, fy);
    near(
        nm_to_kip_ft(r.mp),
        v["published"]["Mp_kip_ft"].as_f64().unwrap(),
        0.005,
        1.0,
    );
    near(
        nm_to_kip_ft(r.phi_b_mn),
        v["published"]["phi_b_Mn_kip_ft"].as_f64().unwrap(),
        0.005,
        1.0,
    );
    let mu = kip_ft_to_nm(v["loads"]["Mu_kip_ft"].as_f64().unwrap());
    assert!(mu <= r.phi_b_mn);
}

#[test]
fn s2_g1b_shear_matches_example() {
    let v = load("S2-G1B-shear-W24x62.json");
    let sec = &v["section"];
    let section = WSectionProps {
        d: in_to_m(sec["d_in"].as_f64().unwrap()),
        tw: in_to_m(sec["tw_in"].as_f64().unwrap()),
        e: ksi_to_pa(29_000.0),
        ..WSectionProps::default()
    };
    let fy = ksi_to_pa(sec["Fy_ksi"].as_f64().unwrap());
    let r = evaluate_shear_major_g21a(&section, fy);
    near(
        r.aw / in2_to_m2(1.0),
        v["published"]["Aw_in2"].as_f64().unwrap(),
        0.005,
        0.05,
    );
    near(
        n_to_kip(r.vn),
        v["published"]["Vn_kip"].as_f64().unwrap(),
        0.005,
        1.0,
    );
    near(
        n_to_kip(r.phi_v_vn),
        v["published"]["phi_v_Vn_kip"].as_f64().unwrap(),
        0.005,
        1.0,
    );
    let vu = kip_to_n(v["loads"]["Vu_kip"].as_f64().unwrap());
    assert!(vu <= r.phi_v_vn);
}

#[test]
fn s2_h1b_interaction_matches_example() {
    let v = load("S2-H1B-interaction-W14x99.json");
    let pubd = &v["published"];
    let loads = &v["loads"];
    let r = evaluate_h1(
        kip_to_n(loads["Pu_kip"].as_f64().unwrap()),
        kip_to_n(pubd["phi_c_Pn_kip"].as_f64().unwrap()),
        kip_ft_to_nm(loads["Mux_kip_ft"].as_f64().unwrap()),
        kip_ft_to_nm(pubd["phi_b_Mnx_kip_ft"].as_f64().unwrap()),
        kip_ft_to_nm(loads["Muy_kip_ft"].as_f64().unwrap()),
        kip_ft_to_nm(pubd["phi_b_Mny_kip_ft"].as_f64().unwrap()),
    )
    .unwrap();
    assert_eq!(r.equation, "H1-1a");
    near(
        r.pr_over_pc,
        pubd["Pr_over_Pc"].as_f64().unwrap(),
        0.01,
        0.005,
    );
    near(
        r.ratio,
        pubd["interactionRatio"].as_f64().unwrap(),
        0.01,
        0.01,
    );
    assert!(r.ratio <= 1.0);
}

// ---- S3: lateral-torsional buckling (F2.2) and flange local buckling (F3) ----

fn in4_to_m4(v: f64) -> f64 {
    in_to_m(1.0).powi(4) * v
}

/// The W18×50 of Examples F.1-2B / F.1-3B from its fixture inputs.
fn w18x50(sec: &Value) -> WSectionProps {
    let f = |k: &str| sec[k].as_f64().unwrap();
    WSectionProps {
        zx: in3_to_m3(f("Zx_in3")),
        sx: in3_to_m3(f("Sx_in3")),
        ry: in_to_m(f("ry_in")),
        j: in4_to_m4(f("J_in4")),
        iy: in4_to_m4(f("Iy_in4")),
        d: in_to_m(f("d_in")),
        tf: in_to_m(f("tf_in")),
        bf_over_2tf: f("bf_over_2tf"),
        h_over_tw: f("h_over_tw"),
        e: ksi_to_pa(f("E_ksi")),
        ..WSectionProps::default()
    }
}

#[test]
fn s3_f12b_inelastic_ltb_matches_example() {
    let v = load("S3-F12B-ltb-inelastic-W18x50.json");
    let sec = &v["section"];
    let section = w18x50(sec);
    let fy = ksi_to_pa(sec["Fy_ksi"].as_f64().unwrap());
    let lb = ft_to_m(v["member"]["Lb_ft"].as_f64().unwrap());
    let cb = v["member"]["Cb"].as_f64().unwrap();
    let pubd = &v["published"];
    let ltb = evaluate_ltb(&section, fy, lb, cb);
    // Derived rts and ho reproduce the tabulated values.
    near(ltb.rts / in_to_m(1.0), sec["publishedRts_in"].as_f64().unwrap(), 0.005, 0.01);
    near(ltb.ho / in_to_m(1.0), sec["publishedHo_in"].as_f64().unwrap(), 0.005, 0.05);
    near(ltb.lp / in_to_m(1.0), pubd["Lp_in"].as_f64().unwrap(), 0.005, 0.5);
    near(ltb.lr / in_to_m(1.0), pubd["Lr_in"].as_f64().unwrap(), 0.005, 1.0);
    assert_eq!(ltb.branch, "inelastic");
    near(ltb.mn.unwrap() / (kip_to_n(1.0) * in_to_m(1.0)), pubd["Mn_kip_in"].as_f64().unwrap(), 0.005, 12.0);
    let mu = kip_ft_to_nm(v["loads"]["Mu_kip_ft"].as_f64().unwrap());
    let c = check_flexure_major(&section, fy, lb, cb, mu);
    assert_eq!(c.clause, "F2-2");
    assert_eq!(c.status, CheckStatus::Pass);
    near(nm_to_kip_ft(c.resistance.unwrap()), pubd["phi_b_Mn_kip_ft"].as_f64().unwrap(), 0.005, 1.0);
}

#[test]
fn s3_f13b_elastic_ltb_matches_example() {
    let v = load("S3-F13B-ltb-elastic-W18x50.json");
    let sec = &v["section"];
    let section = w18x50(sec);
    let fy = ksi_to_pa(sec["Fy_ksi"].as_f64().unwrap());
    let lb = ft_to_m(v["member"]["Lb_ft"].as_f64().unwrap());
    let cb = v["member"]["Cb"].as_f64().unwrap();
    let pubd = &v["published"];
    let ltb = evaluate_ltb(&section, fy, lb, cb);
    assert_eq!(ltb.branch, "elastic");
    near(ltb.lp / ft_to_m(1.0), pubd["Lp_ft"].as_f64().unwrap(), 0.005, 0.05);
    near(ltb.lr / ft_to_m(1.0), pubd["Lr_ft"].as_f64().unwrap(), 0.005, 0.1);
    near(pa_to_ksi(ltb.fcr.unwrap()), pubd["Fcr_ksi"].as_f64().unwrap(), 0.005, 0.1);
    near(ltb.mn.unwrap() / (kip_to_n(1.0) * in_to_m(1.0)), pubd["Mn_kip_in"].as_f64().unwrap(), 0.005, 12.0);
    let mu = kip_ft_to_nm(v["loads"]["Mu_kip_ft"].as_f64().unwrap());
    let c = check_flexure_major(&section, fy, lb, cb, mu);
    assert_eq!(c.clause, "F2-3");
    assert_eq!(c.status, CheckStatus::Pass);
    near(nm_to_kip_ft(c.resistance.unwrap()), pubd["phi_b_Mn_kip_ft"].as_f64().unwrap(), 0.005, 1.0);
    // Raising the demand above the published capacity fails, never passes.
    let over = kip_ft_to_nm(pubd["phi_b_Mn_kip_ft"].as_f64().unwrap() * 1.05);
    assert_eq!(check_flexure_major(&section, fy, lb, cb, over).status, CheckStatus::Fail);
}

#[test]
fn s3_f3b_noncompact_flange_local_buckling_matches_example() {
    let v = load("S3-F3B-flb-W21x48.json");
    let sec = &v["section"];
    let section = WSectionProps {
        zx: in3_to_m3(sec["Zx_in3"].as_f64().unwrap()),
        sx: in3_to_m3(sec["Sx_in3"].as_f64().unwrap()),
        bf_over_2tf: sec["bf_over_2tf"].as_f64().unwrap(),
        e: ksi_to_pa(sec["E_ksi"].as_f64().unwrap()),
        ..WSectionProps::default()
    };
    let fy = ksi_to_pa(sec["Fy_ksi"].as_f64().unwrap());
    let pubd = &v["published"];
    let (lpf, lrf) = flange_limits(section.e, fy);
    near(lpf, pubd["lambda_pf"].as_f64().unwrap(), 0.005, 0.01);
    near(lrf, pubd["lambda_rf"].as_f64().unwrap(), 0.005, 0.1);
    let mn = evaluate_flange_local_buckling(&section, fy);
    near(mn / (kip_to_n(1.0) * in_to_m(1.0)), pubd["Mn_kip_in"].as_f64().unwrap(), 0.005, 12.0);
    near(nm_to_kip_ft(0.9 * mn), pubd["phi_b_Mn_kip_ft"].as_f64().unwrap(), 0.005, 1.0);
    let mu = kip_ft_to_nm(v["loads"]["Mu_kip_ft"].as_f64().unwrap());
    assert!(mu <= 0.9 * mn);
}

#[test]
fn s3_full_check_routes_noncompact_flanges_through_f3_and_caps_ltb_at_mp() {
    // W14×99 (catalogue subset): bf/2tf 9.34 > λpf, compact web.
    let section = WSectionProps {
        zx: in3_to_m3(173.0),
        sx: in3_to_m3(157.0),
        ry: in_to_m(3.71),
        iy: in4_to_m4(402.0),
        j: in4_to_m4(5.37),
        d: in_to_m(14.2),
        tf: in_to_m(0.78),
        bf_over_2tf: 9.34,
        h_over_tw: 23.5,
        e: ksi_to_pa(29_000.0),
        ..WSectionProps::default()
    };
    let fy = ksi_to_pa(50.0);
    let c = check_flexure_major(&section, fy, 0.0, 1.0, 1.0);
    assert_eq!(c.clause, "F3-1");
    let flb = 0.9 * evaluate_flange_local_buckling(&section, fy);
    assert!((c.resistance.unwrap() - flb).abs() <= 1e-9 * flb);
    // A short unbraced length below Lp leaves F3-1 governing; a large Cb never lifts LTB above Mp.
    let ltb = evaluate_ltb(&section, fy, 0.5 * evaluate_ltb(&section, fy, 1.0, 1.0).lp, 1.0);
    assert!(ltb.mn.is_none());
    let lr = evaluate_ltb(&section, fy, 1.0, 1.0).lr;
    let capped = evaluate_ltb(&section, fy, 0.5 * lr, 3.0).mn.unwrap();
    assert!(capped <= fy * section.zx * (1.0 + 1e-12));
}

#[test]
fn s3_unsupported_flexure_stays_unsupported() {
    let base = WSectionProps {
        zx: in3_to_m3(101.0),
        sx: in3_to_m3(88.9),
        ry: in_to_m(1.65),
        iy: in4_to_m4(40.1),
        j: in4_to_m4(1.24),
        d: in_to_m(18.0),
        tf: in_to_m(0.57),
        bf_over_2tf: 6.57,
        h_over_tw: 45.2,
        e: ksi_to_pa(29_000.0),
        ..WSectionProps::default()
    };
    let fy = ksi_to_pa(50.0);
    let lb = ft_to_m(10.0);
    let unsupported = |s: &WSectionProps, lb: f64, cb: f64, clause: &str| {
        let c = check_flexure_major(s, fy, lb, cb, 1.0);
        assert_eq!(c.status, CheckStatus::Unsupported, "{clause}");
        assert_eq!(c.clause, clause);
    };
    unsupported(&WSectionProps { bf_over_2tf: 25.0, ..base.clone() }, 0.0, 1.0, "F3-2");
    unsupported(&WSectionProps { h_over_tw: 100.0, ..base.clone() }, 0.0, 1.0, "F4");
    unsupported(&WSectionProps { bf_over_2tf: 0.0, ..base.clone() }, 0.0, 1.0, "B4.1b");
    unsupported(&WSectionProps { j: 0.0, ..base.clone() }, lb, 1.0, "F2.2");
    unsupported(&base, lb, 0.9, "F1");
    // Lb = 0 on a compact section is plain yielding, as in S2-F11B.
    assert_eq!(check_flexure_major(&base, fy, 0.0, 1.0, 1.0).clause, "F2-1");
}
