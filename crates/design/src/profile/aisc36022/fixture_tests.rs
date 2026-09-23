//! Fixture regressions against `fixtures/design/aisc-360-22-lrfd/` published digits.
//!
//! Expected values are read from JSON reconstituted from Design Examples; clause
//! math under test lives in this crate and does not load the PDFs.

use std::fs;
use std::path::PathBuf;

use serde_json::Value;

use super::classification::classify_compression_w;
use super::compression::evaluate_compression;
use super::flexure::evaluate_flexure_major_yielding;
use super::interaction::evaluate_h1;
use super::shear::evaluate_shear_major_g21a;
use super::tension::evaluate_tension;
use super::units::{
    ft_to_m, in2_to_m2, in3_to_m3, in_to_m, kip_ft_to_nm, kip_to_n, ksi_to_pa, n_to_kip,
    nm_to_kip_ft, pa_to_ksi,
};
use crate::profile::{TensionEndProps, WSectionProps};

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
