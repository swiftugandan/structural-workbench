//! EC2 column checks against the independent oracle
//! (tools/oracles/ec2_column_oracle.py), the JRC89037 Column B2 figures that
//! reconcile, and hand values for the boundaries and detailing rules.
use serde_json::Value;

use super::column::*;
use super::*;
use crate::rc_column::ColumnBar;

fn reconciliation() -> Value {
    serde_json::from_str(include_str!("../../../../../fixtures/design/ec2-uk-na/column.reconciliation.json")).unwrap()
}

fn f(v: &Value) -> f64 {
    v.as_f64().unwrap()
}

/// The oracle's bar layout: evenly spaced on each face, inset cover + link + φ/2.
fn bars(b: f64, h: f64, cover: f64, link: f64, phi: f64, nw: u32, nd: u32) -> Vec<ColumnBar> {
    let inset = cover + link + phi / 2.;
    let (a, c) = (b / 2. - inset, h / 2. - inset);
    let area = std::f64::consts::PI * phi * phi / 4.;
    let at = |k: u32, n: u32, half: f64| -half + 2. * half * k as f64 / (n - 1) as f64;
    let mut out = vec![];
    for z in [-c, c] {
        for k in 0..nw {
            out.push(ColumnBar { y: at(k, nw, a), z, area });
        }
    }
    for y in [-a, a] {
        for k in 1..nd - 1 {
            out.push(ColumnBar { y, z: at(k, nd, c), area });
        }
    }
    out
}

fn context(i: &Value) -> (RcColumnContext, ColumnActions) {
    let pair = |v: &Value| [f(&v[0]), f(&v[1])];
    let (b, h, cover, link, phi) = (f(&i["b"]), f(&i["h"]), f(&i["cover"]), f(&i["link"]), f(&i["phi"]));
    let (nw, nd) = (i["nw"].as_u64().unwrap() as u32, i["nd"].as_u64().unwrap() as u32);
    let c = RcColumnContext {
        width: b,
        depth: h,
        cover_to_link: cover,
        fck: f(&i["fck"]),
        fyk: f(&i["fyk"]),
        bar_diameter: phi,
        bars_along_width: nw,
        bars_along_depth: nd,
        link_diameter: link,
        link_spacing: 0.25,
        bars: bars(b, h, cover, link, phi, nw, nd),
        length: f(&i["length"]),
        transverse_load: i["transverse"].as_bool().unwrap(),
        detailing: RcColumnDetailing {
            exposure_class: Some("XC1".into()),
            cover_durability: Some(0.015),
            aggregate_size: Some(0.02),
            braced: i["braced"].as_bool(),
            restraint_y: Some(pair(&i["ky"])),
            restraint_z: Some(pair(&i["kz"])),
            creep_ratio: i["creep"].as_f64(),
        },
    };
    let a = ColumnActions {
        n_ed: f(&i["NEd"]),
        my_ends: pair(&i["myEnds"]),
        mz_ends: pair(&i["mzEnds"]),
        my_max: f(&i["myMax"]),
        mz_max: f(&i["mzMax"]),
        vy_max: 0.,
        vz_max: 0.,
        combination_id: "ULS".into(),
    };
    (c, a)
}

fn close(got: f64, want: f64, rel: f64, what: &str) {
    assert!((got - want).abs() <= rel * want.abs().max(1e-12), "{what}: {got} vs {want}");
}

#[test]
fn design_moments_match_the_independent_oracle() {
    let r = reconciliation();
    assert!(r["failures"].as_array().unwrap().is_empty());
    let ndp = Ec2Ndp::uk_na_2009();
    for case in r["cases"].as_array().unwrap() {
        let (c, a) = context(&case["input"]);
        let checks = checks(&ndp, &c, &a);
        let y_case = checks.iter().find(|x| x.check_id == "ec2.column.biaxial.y").unwrap();
        let id = case["input"]["id"].as_str().unwrap();
        for axis in ["y", "z"] {
            let got = &y_case.intermediates[axis];
            let want = &case[axis];
            for key in ["l0", "lambda", "ei", "e0", "e2", "rm", "mEdWithImperfection", "mEdWithoutImperfection"] {
                close(f(&got[key]), f(&want[key]), 1e-9, &format!("{id} {axis} {key}"));
            }
            match want["lambdaLim"].as_f64() {
                Some(l) => close(f(&got["lambdaLim"]), l, 1e-9, &format!("{id} {axis} λlim")),
                None => assert!(got["lambdaLim"].is_null()),
            }
            assert_eq!(got["slender"], want["slender"], "{id} {axis}");
        }
        // 5.8.9(2): case y carries the imperfection about y only, case z about z only.
        let z_case = checks.iter().find(|x| x.check_id == "ec2.column.biaxial.z").unwrap();
        close(f(&y_case.intermediates["myEd"]), f(&case["y"]["mEdWithImperfection"]), 1e-12, id);
        close(f(&y_case.intermediates["mzEd"]), f(&case["z"]["mEdWithoutImperfection"]), 1e-12, id);
        close(f(&z_case.intermediates["myEd"]), f(&case["y"]["mEdWithoutImperfection"]), 1e-12, id);
        close(f(&z_case.intermediates["mzEd"]), f(&case["z"]["mEdWithImperfection"]), 1e-12, id);
    }
}

#[test]
fn jrc_column_b2_figures_that_reconcile() {
    let r = reconciliation();
    let pubd: Value =
        serde_json::from_str(include_str!("../../../../../fixtures/design/ec2-uk-na/jrc-column-b2.published.json")).unwrap();
    let p = &pubd["published"];
    // l0 by (5.15), braced, k1 = k2 = 0.53, l = 4 m.
    let l0 = effective_length(4.0, [0.53, 0.53], true);
    assert!((l0 - f(&p["l0"]["value"])).abs() <= f(&p["l0"]["rounding"]), "{l0}");
    close(l0, f(&r["jrc"]["l0"]), 1e-12, "oracle l0");
    // λ_lim with the report's defaults A = 0.7, B = 1.1 (ω giving B), C = 0.7.
    let n = 4384e3 / (0.25 * 30e6 / 1.5);
    let omega_b = (1.1f64.powi(2) - 1.) / 2.;
    let lim = lambda_lim(None, omega_b, 1.0, n);
    assert!((lim - f(&p["lambdaLim"]["value"])).abs() <= f(&p["lambdaLim"]["rounding"]), "{lim}");
    // K_r (5.36) with the report's assumed ρ = 0.03.
    let omega = 0.03 * (500e6 / 1.15) / (30e6 / 1.5);
    let (_, kr, _) = curvature(30e6, 500e6 / 1.15, 21.5, 0., omega, n, 0.454);
    assert!((kr - f(&p["Kr"]["value"])).abs() <= f(&p["Kr"]["rounding"]), "{kr}");
    // Every documented discrepancy disagrees with the code text (checked by the oracle).
    assert_eq!(r["discrepancies"].as_array().unwrap().len(), 4);
}

fn square(length: f64, n_ed: f64, my: [f64; 2]) -> (RcColumnContext, ColumnActions) {
    let (c, mut a) = context(&reconciliation()["cases"][0]["input"]);
    let c = RcColumnContext { length, ..c };
    a.n_ed = n_ed;
    a.my_ends = my;
    a.my_max = my[0].abs().max(my[1].abs());
    (c, a)
}

fn axis_detail(c: &RcColumnContext, a: &ColumnActions) -> Value {
    let checks = checks(&Ec2Ndp::uk_na_2009(), c, a);
    checks.iter().find(|x| x.check_id == "ec2.column.biaxial.y").unwrap().intermediates["y"].clone()
}

#[test]
fn second_order_starts_at_lambda_lim() {
    // Bisect the length at which λ reaches λ_lim (λ_lim does not depend on the length).
    let (mut lo, mut hi) = (2.0, 12.0);
    for _ in 0..80 {
        let mid = 0.5 * (lo + hi);
        let (c, a) = square(mid, 2.0e6, [60e3, 40e3]);
        if axis_detail(&c, &a)["slender"].as_bool().unwrap() { hi = mid } else { lo = mid }
    }
    let (c, a) = square(lo, 2.0e6, [60e3, 40e3]);
    let below = axis_detail(&c, &a);
    let (c, a) = square(hi, 2.0e6, [60e3, 40e3]);
    let above = axis_detail(&c, &a);
    assert_eq!(below["e2"], 0.0);
    assert!(f(&above["e2"]) > 0.);
    close(f(&below["lambda"]), f(&below["lambdaLim"]), 1e-9, "λ at the boundary");
    // Above the boundary M2 = N e2 is added to the equivalent moment.
    assert!(f(&above["mEdWithImperfection"]) > f(&below["mEdWithImperfection"]));
}

#[test]
fn minimum_eccentricity_governs_small_moments() {
    // 6.1(4): e0 = max(h/30, 20 mm) = 20 mm for 400 mm; N e0 = 60 kN m.
    let (c, a) = square(2.5, 3.0e6, [1e3, 0.]);
    let d = axis_detail(&c, &a);
    close(f(&d["mEdWithImperfection"]), 3.0e6 * 0.020, 1e-12, "N e0");
    // Without the imperfection direction the minimum is not applied (5.8.9(2)).
    close(f(&d["mEdWithoutImperfection"]), 1e3, 1e-12, "first order");
    // A deeper section: e0 = h/30.
    let (mut c, a) = square(2.5, 3.0e6, [1e3, 0.]);
    c.depth = 0.9;
    c.bars = bars(0.4, 0.9, 0.03, 0.01, 0.025, 3, 3);
    close(f(&axis_detail(&c, &a)["e0"]), 0.9 / 30., 1e-12, "h/30");
}

#[test]
fn missing_inputs_are_named_not_assumed() {
    let (mut c, a) = square(8.0, 2.0e6, [60e3, 40e3]);
    c.detailing.braced = None;
    let out = checks(&Ec2Ndp::uk_na_2009(), &c, &a);
    let b = out.iter().find(|x| x.check_id == "ec2.column.biaxial.y").unwrap();
    assert_eq!(b.status, CheckStatus::Indeterminate);
    assert!(b.message.contains("braced"));
    // A slender column needs φ_ef for K_φ.
    let (mut c, a) = square(8.0, 2.0e6, [60e3, 40e3]);
    c.detailing.creep_ratio = None;
    let out = checks(&Ec2Ndp::uk_na_2009(), &c, &a);
    let b = out.iter().find(|x| x.check_id == "ec2.column.biaxial.y").unwrap();
    assert_eq!(b.status, CheckStatus::Indeterminate);
    assert!(b.message.contains("φ_ef"));
    // A short column does not: λ_lim then uses A = 0.7 (5.13N).
    let (mut c, a) = square(2.5, 2.0e6, [60e3, 40e3]);
    c.detailing.creep_ratio = None;
    let out = checks(&Ec2Ndp::uk_na_2009(), &c, &a);
    assert_ne!(out.iter().find(|x| x.check_id == "ec2.column.biaxial.y").unwrap().status, CheckStatus::Indeterminate);
}

#[test]
fn column_detailing_by_hand() {
    let (c, a) = square(4.0, 2.0e6, [60e3, 40e3]);
    let out = checks(&Ec2Ndp::uk_na_2009(), &c, &a);
    let get = |id: &str| out.iter().find(|x| x.check_id == id).unwrap().clone();
    // 9.5.2: A_s,min = max(0.10 N/f_yd, 0.002 A_c) = max(460, 320) mm².
    close(get("ec2.column.as-min").demand.unwrap(), 0.10 * 2.0e6 / (500e6 / 1.15), 1e-12, "As,min");
    close(get("ec2.column.as-max").resistance.unwrap(), 0.04 * 0.16, 1e-12, "As,max");
    assert_eq!(get("ec2.column.bar-diameter").status, CheckStatus::Pass);
    // 9.5.3: s_cl,tmax = min(20 × 25, 400, 400) = 400 mm; φ_t ≥ max(6, 25/4) mm.
    let links = get("ec2.column.links");
    close(f(&links.intermediates["sClTMax"]), 0.4, 1e-12, "s_cl,tmax");
    close(f(&links.intermediates["phiTMin"]), 0.00625, 1e-12, "φ_t,min");
    // 9.5.3(6): three bars a face at (400 − 2 × 52.5)/2 = 147.5 mm from the corners.
    let r = get("ec2.column.restraint");
    close(r.demand.unwrap(), 0.1475, 1e-12, "distance");
    assert_eq!(r.status, CheckStatus::Pass);
    // Four bars along a 600 mm depth: (600 − 105)/3 = 165 mm > 150 mm.
    let (mut c, a) = square(4.0, 2.0e6, [60e3, 40e3]);
    c.depth = 0.6;
    c.bars_along_depth = 4;
    c.bars = bars(0.4, 0.6, 0.03, 0.01, 0.025, 3, 4);
    let out = checks(&Ec2Ndp::uk_na_2009(), &c, &a);
    assert_eq!(out.iter().find(|x| x.check_id == "ec2.column.restraint").unwrap().status, CheckStatus::Fail);
}

#[test]
fn column_shear_with_axial_compression_by_hand() {
    let (c, mut a) = square(4.0, 2.0e6, [60e3, 40e3]);
    a.vz_max = 150e3;
    let out = checks(&Ec2Ndp::uk_na_2009(), &c, &a);
    let s = out.iter().find(|x| x.check_id == "ec2.column.shear.z").unwrap();
    // d = 400 − 30 − 10 − 12.5 = 347.5 mm; 3 Ø25 on the tension face.
    let d: f64 = 0.3475;
    let k = 1. + (200. / 347.5f64).sqrt();
    let rho = 3. * std::f64::consts::PI * 0.025f64.powi(2) / 4. / (0.4 * d);
    let sigma_cp = (2.0e6 / 0.16f64).min(0.2 * 0.85 * 30e6 / 1.5) / 1e6;
    let v = (0.12 * k * (100. * rho * 30.).cbrt() + 0.15 * sigma_cp).max(0.035 * k.powf(1.5) * 30f64.sqrt() + 0.15 * sigma_cp);
    close(f(&s.intermediates["VRdc"]), v * 1e6 * 0.4 * d, 1e-12, "V_Rd,c");
    assert_eq!(s.status, CheckStatus::Pass);
}
