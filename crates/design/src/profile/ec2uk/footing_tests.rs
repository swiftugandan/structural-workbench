//! Pad footing contact and EC2 design against the independent oracle
//! (tools/oracles/footing_oracle.py), the JRC89037 footing B-2 figures and
//! closed forms for a concentric pad.
use serde_json::Value;

use super::footing::*;
use super::*;
use crate::footing::{contact, moments, rectangle};

fn reconciliation() -> Value {
    serde_json::from_str(include_str!("../../../../../fixtures/design/ec2-uk-na/footing.reconciliation.json")).unwrap()
}

fn f(v: &Value) -> f64 {
    v.as_f64().unwrap()
}

#[test]
fn polygon_moments_are_exact_for_a_rectangle() {
    let m = moments(&rectangle(2.4, 2.1));
    let (l, b): (f64, f64) = (2.4, 2.1);
    assert!((m[0] - l * b).abs() < 1e-14);
    assert!(m[1].abs() < 1e-14 && m[2].abs() < 1e-14 && m[4].abs() < 1e-14);
    assert!((m[3] - b * l.powi(3) / 12.).abs() < 1e-14);
    assert!((m[5] - l * b.powi(3) / 12.).abs() < 1e-14);
}

#[test]
fn contact_matches_the_independent_oracle() {
    let r = reconciliation();
    assert!(r["failures"].as_array().unwrap().is_empty());
    for case in r["contact"].as_array().unwrap() {
        let i = &case["input"];
        let k = contact(f(&i["L"]), f(&i["B"]), f(&i["N"]), f(&i["ex"]), f(&i["ey"])).unwrap();
        let id = i["id"].as_str().unwrap();
        assert_eq!(k.state, case["state"].as_str().unwrap(), "{id}");
        let want: Vec<f64> = case["corners"].as_array().unwrap().iter().map(f).collect();
        let scale = want.iter().cloned().fold(0., f64::max);
        let tol = f(&case["tolerance"]);
        for (g, w) in k.corners.iter().zip(&want) {
            assert!((g - w).abs() <= tol * scale, "{id}: {:?} vs {want:?}", k.corners);
        }
        // Equilibrium of the solved plane.
        assert!(k.residual < 1e-12, "{id} residual {}", k.residual);
        if let Some(len) = case["contactLength"].as_f64() {
            close(k.contact_area, len * f(&i["B"]), 1e-12, id);
        }
    }
}

fn close(got: f64, want: f64, rel: f64, what: &str) {
    assert!((got - want).abs() <= rel * want.abs().max(1e-12), "{what}: {got} vs {want}");
}

#[test]
fn contact_refuses_uplift_and_a_resultant_off_the_base() {
    assert_eq!(contact(2., 2., -1e5, 0., 0.).unwrap_err().code, "UNSUPPORTED_FEATURE");
    assert_eq!(contact(2., 2., 1e5, 1.0, 0.).unwrap_err().code, "UNSTABLE_MODEL");
    assert_eq!(contact(2., 2., 1e5, 0.2, -1.2).unwrap_err().code, "UNSTABLE_MODEL");
    // On the kern edge the far corners carry exactly zero: still full contact.
    let k = contact(2.4, 2.1, 1.2e6, 0.4, 0.).unwrap();
    assert_eq!(k.state, "full");
    assert!(k.q_min.abs() < 1e-9);
}

fn pad(l: f64, b: f64, h: f64, column: f64) -> PadFootingContext {
    PadFootingContext {
        length: l,
        width: b,
        thickness: h,
        cover: 0.05,
        column_x: column,
        column_y: column,
        fck: 30e6,
        fyk: 500e6,
        bearing_pressure: 400e3,
        embedment: 1.0,
        soil_unit_weight: 18e3,
        detailing: PadFootingDetailing {
            exposure_class: Some("XC2".into()),
            cover_durability: Some(0.025),
            aggregate_size: Some(0.020),
            cast_on_blinding: Some(true),
        },
    }
}

fn actions(n: f64, mx: f64, my: f64) -> FootingActions {
    FootingActions { n, mx, my, hx: 0., hy: 0., combination_id: "ULS".into() }
}

#[test]
fn jrc_footing_b2_tie_force_and_anchorage() {
    let r = reconciliation();
    let j = &r["jrc"];
    // The report's base: 2.0 m square, 0.5 m column, σ'_Ed = 1418 kN/m², z_i = 0.662 m.
    let c = pad(2.0, 2.0, 0.8, 0.5);
    let k = contact(2.0, 2.0, 1418e3 * 4., 0., 0.).unwrap();
    let d = Dir::of(&c, true);
    let (fs_max, x) = tie_max(&k, d, 0.662);
    close(fs_max, f(&j["FsMax"]), 1e-9, "F_s,max");
    close(x, f(&j["xAtMax"]), 1e-6, "x at max");
    close(tie_force(&k, d, 0.662, 0.4, true), f(&j["FsAtXmin"]), 1e-12, "F_s(h/2)");
    // l_b needed with 17 Ø16 and the report's l_bd = 500 mm.
    let fyd = 500e6 / 1.15;
    let area = 17. * std::f64::consts::PI * 0.016f64.powi(2) / 4.;
    close(0.5 * f(&j["FsAtXmin"]) / (area * fyd), f(&j["lbRequiredPhi16"]), 1e-12, "l_b");
    // The report's "l_b + c_nom = 400 mm ≤ x_min = 400 mm" holds only after
    // rounding: unrounded it is 400.3 mm, so straight Ø16 bars miss h/2 by
    // 0.3 mm (JRC-B2-FOOTING-ANCHORAGE-ROUNDING). The design applies the
    // condition unrounded.
    let needed = f(&j["lbRequiredPhi16"]) + 0.04;
    assert!(needed > 0.4 && needed < 0.4005, "{needed}");
}

#[test]
fn concentric_pad_by_hand() {
    let c = pad(2.4, 2.4, 0.6, 0.4);
    let n = 2.0e6;
    let out = design(&Ec2Ndp::uk_na_2009(), &c, &actions(n, 0., 0.), Some(&actions(1.4e6, 0., 0.)));
    let get = |id: &str| out.checks.iter().find(|x| x.check_id == id).unwrap_or_else(|| panic!("{id}")).clone();
    for x in &out.checks {
        assert_ne!(x.status, CheckStatus::Fail, "{} {}", x.check_id, x.message);
    }
    let q = n / (2.4 * 2.4);
    let cant: f64 = 1.2 - 0.2;
    let (bx, by) = (out.bars_x.unwrap(), out.bars_y.unwrap());
    // Face moment q B c²/2 in both directions.
    let fx = get("ec2.footing.flexure.x");
    close(f(&fx.intermediates["faceMoment"]), q * 2.4 * cant * cant / 2., 1e-12, "M_face");
    // Tie force (9.8.2.2): F_s,max = q B e²/(2 z_i) with e = L/2 − 0.35 a.
    let e = 1.2 - 0.35 * 0.4;
    let zi = 0.9 * bx.effective_depth;
    close(f(&fx.intermediates["tieForceMax"]), q * 2.4 * e * e / 2. / zi, 1e-9, "F_s,max");
    // The bars cover the largest requirement, at ≤ min(3h, 400 mm).
    assert!(bx.area >= f(&fx.intermediates["asRequired"]) - 1e-12);
    assert!(bx.spacing <= 0.4 + 1e-12 && by.spacing <= 0.4 + 1e-12);
    // y bars sit on the x bars.
    close(by.effective_depth, 0.6 - 0.05 - bx.diameter - by.diameter / 2., 1e-12, "d_y");
    // One-way shear at d from the face: q B (c − d).
    let sx = get("ec2.footing.shear.x");
    close(sx.demand.unwrap(), q * 2.4 * (cant - bx.effective_depth), 1e-12, "V at d");
    // Punching at the critical perimeter: (N − q A(a))/(u d), A = c² + 4ac + πa².
    let p = get("ec2.footing.punching");
    let crit = &p.intermediates["critical"];
    let (a, d) = (f(&crit["a"]), f(&p.intermediates["d"]));
    let area = 0.16 + 4. * a * 0.4 + std::f64::consts::PI * a * a;
    let u = 1.6 + 2. * std::f64::consts::PI * a;
    close(f(&crit["vEd"]), (n - q * area) / (u * d) / 1e6, 1e-12, "v_Ed");
    // Bearing: (N + self-weight + overburden)/A against the allowable input.
    let b = get("ec2.footing.bearing");
    let n_b = 1.4e6 + 25e3 * 2.4 * 2.4 * 0.6 + 18e3 * 0.4 * (2.4 * 2.4 - 0.16);
    close(b.demand.unwrap(), n_b / (2.4 * 2.4), 1e-12, "q bearing");
}

#[test]
fn eccentric_pad_partial_contact_and_refusals() {
    let c = pad(2.4, 2.1, 0.6, 0.4);
    // e_x = M_y/N = 0.7 m > L/6: partial contact, still designed.
    let out = design(&Ec2Ndp::uk_na_2009(), &c, &actions(1.2e6, 0., 0.84e6), None);
    let k = out.checks.iter().find(|x| x.check_id == "ec2.footing.contact").unwrap();
    assert_eq!(k.intermediates["contact"]["state"], "partial");
    assert!(out.bars_x.is_some());
    // Without a bearing combination the bearing check names it.
    let b = out.checks.iter().find(|x| x.check_id == "ec2.footing.bearing").unwrap();
    assert_eq!(b.status, CheckStatus::Indeterminate);
    // A resultant off the base: no contact equilibrium, no design.
    let out = design(&Ec2Ndp::uk_na_2009(), &c, &actions(1.2e6, 0., 1.5e6), None);
    let k = out.checks.iter().find(|x| x.check_id == "ec2.footing.contact").unwrap();
    assert_eq!(k.status, CheckStatus::Fail);
    assert!(out.bars_x.is_none());
    // Missing casting surface: the 4.4.1.3(4) minimum cannot be chosen.
    let mut c = pad(2.4, 2.4, 0.6, 0.4);
    c.detailing.cast_on_blinding = None;
    let out = design(&Ec2Ndp::uk_na_2009(), &c, &actions(2.0e6, 0., 0.), None);
    let cc = out.checks.iter().find(|x| x.check_id == "ec2.footing.cast-cover").unwrap();
    assert_eq!(cc.status, CheckStatus::Indeterminate);
    // Cast against soil needs 75 mm: 50 mm fails.
    c.detailing.cast_on_blinding = Some(false);
    let out = design(&Ec2Ndp::uk_na_2009(), &c, &actions(2.0e6, 0., 0.), None);
    assert_eq!(out.checks.iter().find(|x| x.check_id == "ec2.footing.cast-cover").unwrap().status, CheckStatus::Fail);
}

#[test]
fn a_thin_base_fails_punching_or_shear() {
    let c = pad(2.4, 2.4, 0.25, 0.3);
    let out = design(&Ec2Ndp::uk_na_2009(), &c, &actions(2.0e6, 0., 0.), None);
    assert!(out.checks.iter().any(|x| x.status == CheckStatus::Fail), "{:?}", out.checks.iter().map(|x| (&x.check_id, x.status.as_str())).collect::<Vec<_>>());
}
