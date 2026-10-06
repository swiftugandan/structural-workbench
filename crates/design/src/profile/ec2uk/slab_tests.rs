//! EC2 slab design against the JRC89037 3.2.2.3 punching example and hand
//! values for the mesh, shear and span/depth rules.
use serde_json::Value;

use super::slab::*;
use super::*;

fn published() -> Value {
    serde_json::from_str(include_str!("../../../../../fixtures/design/ec2-uk-na/jrc-punching-b2.published.json")).unwrap()
}

fn f(v: &Value) -> f64 {
    v.as_f64().unwrap()
}

fn close(got: f64, want: f64, tol: f64, what: &str) {
    assert!((got - want).abs() <= tol, "{what}: {got} vs {want}");
}

#[test]
fn jrc_column_b2_punching() {
    let pubd = published();
    let (i, p) = (&pubd["inputs"], &pubd["published"]);
    let d = (f(&i["dy"]) + f(&i["dz"])) / 2.;
    let r = punching_internal(&Ec2Ndp::eu_recommended(), f(&i["VEd"]), f(&i["beta"]), 0.5, 0.5, d, f(&i["rhoL"]), 25e6, 500e6);
    let at = |key: &str| (f(&p[key]["value"]), f(&p[key]["scale"]), f(&p[key]["rounding"]));
    for (key, got) in [
        ("d", d),
        ("u1", f(&r.detail["u1"])),
        ("vEd1", f(&r.detail["vEd1"]) * 1e6),
        ("vRdc", f(&r.detail["vRdc"]) * 1e6),
        ("vmin", f(&r.detail["vmin"]) * 1e6),
        ("vEd0", f(&r.detail["vEd0"]) * 1e6),
        ("fywdEf", f(&r.detail["reinforcement"]["fywdEf"])),
        ("sr", f(&r.detail["reinforcement"]["sr"])),
    ] {
        let (want, scale, rounding) = at(key);
        close(got * scale, want, rounding, key);
    }
    // Reinforcement is required but within 2 v_Rd,c (UK NA): a pass with A_sw stated.
    assert_eq!(r.status, CheckStatus::Pass);
    assert!(r.message.contains("Punching reinforcement required"));
    // A_sw and u_out unrounded; the published values follow from the report's
    // rounded v_Ed = 1.22 and v_Rd,c = 0.66 MPa (JRC-B2-PUNCHING-ROUNDED-STRESSES).
    let reinf = &r.detail["reinforcement"];
    let (u1, vrdc, v1) = (f(&r.detail["u1"]), f(&r.detail["vRdc"]), f(&r.detail["vEd1"]));
    let sr = f(&reinf["sr"]);
    close(f(&reinf["aswPerPerimeter"]), (v1 - 0.75 * vrdc) * u1 * sr / (1.5 * 291.), 1e-15, "A_sw unrounded");
    let (v_r, c_r) = (f(&i["vEd1Rounded"]) / 1e6, f(&i["vRdcRounded"]) / 1e6);
    let (want, scale, rounding) = at("AswPerPerimeter");
    close((v_r - 0.75 * c_r) * u1 * sr / (1.5 * 291.) * scale, want, rounding, "A_sw published");
    let u_out_r = 1.15 * 705e3 / (c_r * 1e6 * d);
    let (want, scale, rounding) = at("uOut");
    close(u_out_r * scale, want, rounding, "u_out published");
    let (want, scale, rounding) = at("aOut");
    close((u_out_r - 2.0) / (2. * std::f64::consts::PI) * scale, want, rounding, "a_out published");
    close(f(&reinf["uOut"]), 1.15 * 705e3 / (vrdc * 1e6 * d), 1e-9, "u_out unrounded");
}

fn panel(elements: Vec<SlabElement>) -> SlabContext {
    SlabContext {
        lx: 6.,
        ly: 5.,
        thickness: 0.225,
        cover: 0.03,
        fck: 30e6,
        fyk: 500e6,
        opening: None,
        elements,
        columns: vec![],
        detailing: SlabDetailing {
            exposure_class: Some("XC1".into()),
            cover_durability: Some(0.015),
            aggregate_size: Some(0.02),
            structural_system: Some("simplySupported".into()),
            partitions_sensitive: Some(false),
            column_size: None,
        },
    }
}

fn element(m: [f64; 4], qx: f64, qy: f64) -> SlabElement {
    SlabElement { x0: 0., x1: 1., y0: 0., y1: 1., design: m, qx, qy }
}

#[test]
fn mesh_covers_the_largest_demand_with_the_least_steel() {
    let c = panel(vec![element([40e3, 25e3, 0., 0.], 30e3, 20e3), element([10e3, 5e3, 0., 0.], 5e3, 5e3)]);
    let out = design(&Ec2Ndp::uk_na_2009(), &c);
    let bx = out.layers[0].unwrap();
    // A_s for 40 kN m/m on d by the rectangular block, closed form.
    let (fcd, fyd) = (0.85 * 30e6 / 1.5, 500e6 / 1.15);
    let d = bx.effective_depth;
    let qa = fyd * fyd * 0.4 / (0.8 * fcd);
    let want = (fyd * d - ((fyd * d).powi(2) - 4. * qa * 40e3).sqrt()) / (2. * qa);
    close(out.required[0][0], want, 1e-15, "A_s,req");
    assert!(bx.area >= want);
    // The next wider spacing of the same bar would not cover it (least steel).
    let wider = std::f64::consts::PI * bx.diameter.powi(2) / 4. / (bx.spacing + 0.025);
    let fctm = super::detailing::table_3_1(30e6).0;
    let need = want.max((0.26 * fctm / 500e6).max(0.0013) * d);
    assert!(wider < need || bx.spacing + 0.025 > 0.4 - 1e-12);
    // No hogging anywhere: no top layers and no top checks.
    assert!(out.layers[2].is_none() && out.layers[3].is_none());
    assert!(!out.checks.iter().any(|x| x.check_id.contains("topX")));
    // Y bars sit on the X bars.
    close(out.layers[1].unwrap().effective_depth, 0.225 - 0.03 - bx.diameter - out.layers[1].unwrap().diameter / 2., 1e-15, "d_y");
}

#[test]
fn span_depth_by_hand() {
    let c = panel(vec![element([40e3, 25e3, 0., 0.], 30e3, 20e3)]);
    let out = design(&Ec2Ndp::uk_na_2009(), &c);
    let dfl = out.checks.iter().find(|x| x.check_id == "ec2.slab.deflection").unwrap();
    // Two-way slab: the shorter span (5 m, along y) with the bottom Y steel; K = 1.0.
    assert_eq!(dfl.intermediates["direction"], "y");
    let by = out.layers[1].unwrap();
    let rho = out.required[0][1] / by.effective_depth;
    let basic = super::detailing::basic_span_depth(1.0, 30., rho, 0.);
    let stress = (by.area / out.required[0][1]).min(1.5);
    close(dfl.resistance.unwrap(), (basic * stress).min(40.), 1e-12, "limit");
    close(dfl.demand.unwrap(), 5. / by.effective_depth, 1e-12, "l/d");
    // A flat slab uses the longer span and K = 1.2.
    let mut c = panel(vec![element([40e3, 25e3, 0., 0.], 30e3, 20e3)]);
    c.detailing.structural_system = Some("flatSlab".into());
    let out = design(&Ec2Ndp::uk_na_2009(), &c);
    let dfl = out.checks.iter().find(|x| x.check_id == "ec2.slab.deflection").unwrap();
    assert_eq!(dfl.intermediates["direction"], "x");
    assert_eq!(dfl.intermediates["K"], 1.2);
    // f_yk ≠ 500 MPa scales the stress factor by 500/f_yk.
    let mut c = panel(vec![element([40e3, 25e3, 0., 0.], 30e3, 20e3)]);
    c.fyk = 460e6;
    let out = design(&Ec2Ndp::uk_na_2009(), &c);
    let dfl = out.checks.iter().find(|x| x.check_id == "ec2.slab.deflection").unwrap();
    let by = out.layers[1].unwrap();
    let want = (500. / 460. * by.area / out.required[0][1]).min(1.5);
    close(f(&dfl.intermediates["stressFactor"]), want, 1e-12, "stress factor at 460 MPa");
}

#[test]
fn shear_uses_the_weaker_face() {
    let c = panel(vec![element([40e3, 25e3, 0., 0.], 60e3, 10e3)]);
    let out = design(&Ec2Ndp::uk_na_2009(), &c);
    let s = out.checks.iter().find(|x| x.check_id == "ec2.slab.shear").unwrap();
    // No top steel: ρ_l = 0 and v_min governs.
    let crit = &s.intermediates["critical"];
    assert_eq!(f(&crit["rhoL"]), 0.);
    let d = f(&crit["d"]);
    let k = (1. + (0.2 / d).sqrt()).min(2.);
    close(f(&crit["vRdc"]), 0.035 * k.powf(1.5) * 30f64.sqrt() * 1e6 * d, 1e-9, "v_min d");
}

#[test]
fn punching_needs_inputs_and_refuses_unsupported_positions() {
    let mut c = panel(vec![element([40e3, 25e3, 30e3, 30e3], 30e3, 20e3)]);
    c.columns = vec![SlabColumnSupport { x: 3., y: 2.5, reaction: 400e3 }];
    let out = design(&Ec2Ndp::uk_na_2009(), &c);
    let p = out.checks.iter().find(|x| x.check_id.starts_with("ec2.slab.punching")).unwrap();
    assert_eq!(p.status, CheckStatus::Indeterminate);
    c.detailing.column_size = Some([0.4, 0.4]);
    let out = design(&Ec2Ndp::uk_na_2009(), &c);
    let p = out.checks.iter().find(|x| x.check_id == "ec2.slab.punching.1").unwrap();
    assert_ne!(p.status, CheckStatus::Indeterminate);
    assert_eq!(p.intermediates["position"], "internal");
    // An edge column and a column near the opening are reported unsupported.
    c.columns = vec![SlabColumnSupport { x: 0.25, y: 2.5, reaction: 200e3 }];
    let out = design(&Ec2Ndp::uk_na_2009(), &c);
    assert_eq!(out.checks.iter().find(|x| x.check_id == "ec2.slab.punching.1").unwrap().status, CheckStatus::Unsupported);
    c.columns = vec![SlabColumnSupport { x: 3., y: 2.5, reaction: 400e3 }];
    c.opening = Some([3.5, 4.0, 2.0, 3.0]);
    let out = design(&Ec2Ndp::uk_na_2009(), &c);
    assert_eq!(out.checks.iter().find(|x| x.check_id == "ec2.slab.punching.1").unwrap().status, CheckStatus::Unsupported);
    // An internal column in uplift is refused, never punched with |V|.
    c.opening = None;
    c.columns = vec![SlabColumnSupport { x: 3., y: 2.5, reaction: -100e3 }];
    let out = design(&Ec2Ndp::uk_na_2009(), &c);
    let p = out.checks.iter().find(|x| x.check_id == "ec2.slab.punching.1").unwrap();
    assert_eq!(p.status, CheckStatus::Unsupported);
    assert!(p.message.contains("uplift"), "{}", p.message);
}
