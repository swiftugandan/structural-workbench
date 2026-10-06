//! M13 single-plate connection against the held AISC Design Examples v16
//! (II.A-17A, II.A-17B, II.A-19A) and the C values they quote.

use serde_json::Value;

use super::super::units::{IN_TO_M, KIP_TO_N, KSI_TO_PA};
use super::*;
use crate::profile::{CheckOutcome, CheckStatus};

const KIP_IN: f64 = KIP_TO_N * IN_TO_M;

fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../../../../../fixtures/design/aisc-360-22-lrfd/connection-single-plate.published.json"
    ))
    .unwrap()
}

fn f(v: &Value) -> f64 {
    v.as_f64().unwrap_or_else(|| panic!("not a number: {v}"))
}

fn inch(v: &Value) -> f64 {
    f(v) * IN_TO_M
}

fn ksi(v: &Value) -> f64 {
    f(v) * KSI_TO_PA
}

fn bolts_of(c: &Value) -> Vec<[f64; 2]> {
    let (n, cols) = (
        c["rows"].as_u64().unwrap() as usize,
        c["columns"].as_u64().unwrap() as usize,
    );
    let (s, g) = (inch(&c["pitch"]), inch(&c["gauge"]));
    (0..cols)
        .flat_map(|j| {
            icr::vertical_row(n, s)
                .into_iter()
                .map(move |q| [j as f64 * g - g * (cols as f64 - 1.0) / 2.0, q[1]])
        })
        .collect()
}

fn c_at(bolts: &[[f64; 2]], e: f64, angle: f64) -> f64 {
    let t = angle.to_radians();
    icr::solve(bolts, [-e * IN_TO_M, 0.0], [t.sin(), -t.cos()])
        .unwrap()
        .c
}

#[test]
fn icr_reproduces_the_published_c_values() {
    for c in fixture()["icr"]["cases"].as_array().unwrap() {
        let bolts = bolts_of(c);
        let angle = f(&c["angle"]);
        let grid: Vec<f64> = c["grid"].as_array().unwrap().iter().map(f).collect();
        let e = f(&c["e"]);
        let at = |x: f64| (c_at(&bolts, x, angle) * 100.0).round() / 100.0;
        let interpolated = if grid[0] == grid[1] {
            at(grid[0])
        } else {
            at(grid[0]) + (e - grid[0]) / (grid[1] - grid[0]) * (at(grid[1]) - at(grid[0]))
        };
        let want = f(&c["C"]);
        assert!(
            (interpolated - want).abs() <= 0.0101,
            "{}: C {interpolated} vs {want}",
            c["example"]
        );
        // The exact solution at e itself is close to the table interpolation.
        let exact = c_at(&bolts, e, angle);
        assert!(
            (exact - want).abs() <= 0.02,
            "{}: exact C {exact} vs {want}",
            c["example"]
        );
    }
    for c in fixture()["icr"]["momentOnly"].as_array().unwrap() {
        let cp = icr::moment_only(&bolts_of(c)) / IN_TO_M;
        assert!((cp - f(&c["Cprime"])).abs() <= f(&c["rounding"]), "C' {cp}");
    }
}

#[test]
fn icr_is_in_equilibrium() {
    // Every solution balances the load: force along and across it, and the
    // moment about the centre, to 1e-9 of C.
    for (n, cols, e, angle) in [
        (2, 1, 1.0, 0.0),
        (4, 1, 3.0, 0.0),
        (7, 1, 6.0, 45.0),
        (5, 2, 9.0, 75.0),
        (12, 1, 2.0, 15.0),
        (5, 1, 2.5, 60.0),
        (5, 1, 2.5, 89.0),
    ] {
        let s = 3.0 * IN_TO_M;
        let bolts: Vec<[f64; 2]> = (0..cols)
            .flat_map(|j| {
                icr::vertical_row(n, s)
                    .into_iter()
                    .map(move |q| [j as f64 * s - s * (cols as f64 - 1.0) / 2.0, q[1]])
            })
            .collect();
        let t = f64::to_radians(angle);
        let r = icr::solve(&bolts, [-e * IN_TO_M, 0.0], [t.sin(), -t.cos()]).unwrap();
        assert!(
            r.residual.iter().all(|x| x.abs() <= 1e-9),
            "{n}x{cols} e={e} θ={angle}: {:?}",
            r.residual
        );
        assert!(r.c > 0.0 && r.c < (n * cols) as f64);
        // Σ bolt forces = C along the load.
        let sum = r
            .forces
            .iter()
            .fold([0.0, 0.0], |a, b| [a[0] + b[0], a[1] + b[1]]);
        assert!(
            (sum[0] - r.c * t.sin()).abs() <= 1e-9 * r.c
                && (sum[1] + r.c * t.cos()).abs() <= 1e-9 * r.c
        );
    }
    // Concentric load: pure translation, every bolt at Δ_max; C is continuous
    // as the eccentricity vanishes.
    let bolts = icr::vertical_row(4, 0.076);
    let c0 = icr::solve(&bolts, [0.0, 0.0], [0.0, -1.0]).unwrap().c;
    assert!((c0 - 4.0 * icr::bolt_force(icr::DELTA_MAX)).abs() < 1e-15);
    let small = icr::solve(&bolts, [-1e-4, 0.0], [0.0, -1.0]).unwrap().c;
    assert!((small - c0).abs() < 1e-3 * c0, "{small} vs {c0}");
}

/// The connection of an example in SI.
fn example(name: &str) -> (SinglePlate, Beam, Support, ConnectionActions, Value) {
    let x = &fixture()["examples"][name];
    let i = &x["inputs"];
    let group = if i["group"] == "group150" {
        BoltGroup::Group150
    } else {
        BoltGroup::Group120
    };
    let bolt = Bolt::new(
        i["bolt"].as_str().unwrap(),
        group,
        i["threadsExcluded"].as_bool().unwrap(),
    )
    .unwrap();
    let plate = SinglePlate {
        bolt,
        rows: i["rows"].as_u64().unwrap() as usize,
        columns: i["columns"].as_u64().unwrap() as usize,
        pitch: inch(&i["pitch"]),
        gauge: i.get("gauge").map_or(0.0, inch),
        thickness: inch(&i["tp"]),
        fy: ksi(&i["plateFy"]),
        fu: ksi(&i["plateFu"]),
        elastic_modulus: 29000.0 * KSI_TO_PA,
        lev: inch(&i["lev"]),
        leh_plate: inch(&i["lehPlate"]),
        a: inch(&i["a"]),
        leh_beam: inch(&i["lehBeam"]),
        underrun: inch(&i["underrun"]),
        top_offset: inch(&i["topOffset"]),
        weld: inch(&i["weld"]),
        fexx: ksi(&i["FEXX"]),
        deformation_considered: i["deformationConsidered"].as_bool().unwrap(),
        braced_against_rotation: Some(true),
    };
    let b = &i["beam"];
    let beam = Beam {
        designation: b["designation"].as_str().unwrap().into(),
        d: inch(&b["d"]),
        tw: inch(&b["tw"]),
        tf: inch(&b["tf"]),
        ag: f(&b["A"]) * IN_TO_M * IN_TO_M,
        kdes: inch(&b["kdes"]),
        fy: ksi(&b["Fy"]),
        fu: ksi(&b["Fu"]),
    };
    let s = &i["support"];
    let kind = match s["kind"].as_str().unwrap() {
        "columnWeb" => SupportKind::ColumnWeb,
        "girderWeb" => SupportKind::GirderWeb,
        _ => SupportKind::ColumnFlange,
    };
    let support = Support {
        designation: s["designation"].as_str().unwrap().into(),
        kind,
        thickness: inch(&s["t"]),
        fu: ksi(&s["Fu"]),
        flange_width: s.get("bf").map_or(0.0, inch),
        web_thickness: s.get("tw").map_or(0.0, inch),
    };
    let actions = ConnectionActions {
        v: f(&i["Vu"]) * KIP_TO_N,
        n: f(&i["Nu"]) * KIP_TO_N,
        ..Default::default()
    };
    (plate, beam, support, actions, x["published"].clone())
}

fn check<'a>(d: &'a SinglePlateDesign, id: &str) -> &'a CheckOutcome {
    d.checks
        .iter()
        .find(|c| c.check_id == id)
        .unwrap_or_else(|| panic!("no check {id}"))
}

fn compare(published: &Value, key: &str, got: f64) {
    let p = &published[key];
    let (want, tol) = (f(&p["value"]), f(&p["rounding"]));
    if (got - want).abs() > tol + 1e-9 {
        MISMATCHES.with(|m| {
            m.borrow_mut()
                .push(format!("{key}: {got} vs {want} ± {tol}"))
        });
    }
}

thread_local! {
    static MISMATCHES: std::cell::RefCell<Vec<String>> = const { std::cell::RefCell::new(vec![]) };
}

/// Fails with every mismatch of the example at once.
fn no_mismatches() {
    MISMATCHES.with(|m| {
        let m = m.borrow();
        assert!(m.is_empty(), "{}", m.join("\n"));
    });
}

fn bolt_value(d: &SinglePlateDesign, row: usize, key: &str) -> f64 {
    let bolts = check(d, "connection.boltGroup").intermediates["perBolt"]
        .as_array()
        .unwrap();
    f(&bolts.iter().find(|b| b["row"] == row).unwrap()[key])
}

#[test]
fn ii_a_17a_limit_states() {
    let (plate, beam, support, actions, p) = example("II.A-17A");
    let d = design(&plate, &beam, &support, &actions);
    let k = |v: f64| v / KIP_TO_N;
    compare(&p, "boltShear", k(bolt_value(&d, 1, "phiRnShear")));
    compare(
        &p,
        "plateEdgeTearout",
        k(bolt_value(&d, 4, "phiRnPlateTearout")),
    );
    compare(
        &p,
        "plateBearing",
        k(bolt_value(&d, 2, "phiRnPlateBearing")),
    );
    compare(&p, "webBearing", k(bolt_value(&d, 2, "phiRnWebBearing")));
    compare(
        &p,
        "plateShearYield",
        k(check(&d, "connection.plate.shearYield").resistance.unwrap()),
    );
    compare(
        &p,
        "plateShearRupture",
        k(check(&d, "connection.plate.shearRupture")
            .resistance
            .unwrap()),
    );
    let bs = check(&d, "connection.plate.blockShear");
    compare(&p, "plateBlockShear", k(bs.resistance.unwrap()));
    let in2 = |v: &Value| f(v) / IN_TO_M / IN_TO_M;
    compare(&p, "blockAgv", in2(&bs.intermediates["Agv"]));
    compare(&p, "blockAnv", in2(&bs.intermediates["Anv"]));
    compare(&p, "blockAnt", in2(&bs.intermediates["Ant"]));
    compare(
        &p,
        "supportTmin",
        f(&check(&d, "connection.support.thickness").intermediates["tmin"]) / IN_TO_M,
    );
    no_mismatches();
    // The documented discrepancy: the general method (e = a = 3 in.) gives
    // C = 2.81 and φR_n = 46.4 kips < 49.6 kips.
    let g = check(&d, "connection.boltGroup");
    assert!((f(&g.intermediates["C"]) - 2.81).abs() < 0.01);
    assert!((g.resistance.unwrap() / KIP_TO_N - 46.4).abs() < 0.1);
    assert_eq!(g.status, CheckStatus::Fail);
}

#[test]
fn ii_a_17b_limit_states() {
    let (plate, beam, support, actions, p) = example("II.A-17B");
    let d = design(&plate, &beam, &support, &actions);
    let k = |v: f64| v / KIP_TO_N;
    let kin = |v: f64| v / KIP_IN;
    let r = |id: &str| check(&d, id).resistance.unwrap();
    compare(
        &p,
        "resultant",
        k(check(&d, "connection.boltGroup").demand.unwrap()),
    );
    compare(&p, "boltShear", k(bolt_value(&d, 1, "phiRnShear")));
    compare(&p, "webTearout", k(bolt_value(&d, 3, "phiRnWebTearout")));
    compare(&p, "webBearing", k(bolt_value(&d, 3, "phiRnWebBearing")));
    compare(
        &p,
        "supportShearRupture",
        k(r("connection.support.shearRupture")),
    );
    compare(&p, "plateShearYield", k(r("connection.plate.shearYield")));
    compare(
        &p,
        "plateTensionYield",
        k(r("connection.plate.tensionYield")),
    );
    let fl = check(&d, "connection.plate.flexure");
    compare(&p, "Mu", kin(fl.demand.unwrap()));
    let in3 = |v: &Value| f(v) / IN_TO_M.powi(3);
    compare(&p, "Z", in3(&fl.intermediates["Z"]));
    compare(&p, "S", in3(&fl.intermediates["S"]));
    compare(&p, "MnYield", kin(f(&fl.intermediates["MnYield"])));
    compare(&p, "LbDOverT2", f(&fl.intermediates["LbDOverT2"]));
    compare(&p, "phiMn", kin(fl.resistance.unwrap()));
    compare(
        &p,
        "interactionYield",
        check(&d, "connection.plate.interactionYield")
            .demand
            .unwrap(),
    );
    compare(
        &p,
        "plateShearRupture",
        k(r("connection.plate.shearRupture")),
    );
    compare(
        &p,
        "plateTensionRupture",
        k(r("connection.plate.tensionRupture")),
    );
    let rup = check(&d, "connection.plate.flexuralRupture");
    compare(&p, "Znet", in3(&rup.intermediates["Znet"]));
    compare(&p, "phiMnRupture", kin(rup.resistance.unwrap()));
    compare(
        &p,
        "interactionRupture",
        check(&d, "connection.plate.interactionRupture")
            .demand
            .unwrap(),
    );
    let bsi = check(&d, "connection.plate.blockShearInteraction");
    compare(
        &p,
        "blockShearShear",
        k(f(&bsi.intermediates["phiRnShear"])),
    );
    compare(
        &p,
        "blockShearAxial",
        k(f(&bsi.intermediates["phiRnAxial"])),
    );
    compare(&p, "blockShearInteraction", bsi.demand.unwrap());
    compare(&p, "beamShearYield", k(r("connection.beam.shearYield")));
    compare(&p, "beamTensionYield", k(r("connection.beam.tensionYield")));
    let btr = check(&d, "connection.beam.tensionRupture");
    compare(&p, "beamU", f(&btr.intermediates["U"]));
    compare(&p, "beamTensionRupture", k(btr.resistance.unwrap()));
    compare(&p, "beamBlockShear", k(r("connection.beam.blockShear")));
    no_mismatches();
    // The example takes C at 30° (4.07, 98.9 kips) as conservative for the
    // actual 38.7°. Solved directly, C(38.7°) = 4.0596 is 0.05 % below
    // C(30°) = 4.0618: C has a shallow minimum near 40° for this group.
    let g = check(&d, "connection.boltGroup");
    let c = f(&g.intermediates["C"]);
    assert!((c - 4.0596).abs() < 1e-3 && c < c_at(&icr::vertical_row(5, 3.0 * IN_TO_M), 2.5, 30.0));
    assert!((g.resistance.unwrap() / KIP_TO_N - 98.9).abs() < 0.1);
    // Every limit state of the example passes. The plate ductility limit of
    // Manual Eq. 10-6, which the example (Manual Part 12) does not evaluate
    // and which the workbench applies to every geometry, fails: documented.
    let failing: Vec<&str> = d
        .checks
        .iter()
        .filter(|c| c.status != CheckStatus::Pass)
        .map(|c| c.check_id.as_str())
        .collect();
    assert_eq!(failing, ["connection.plate.ductility"]);
}

#[test]
fn ii_a_19a_limit_states() {
    let (plate, beam, support, actions, p) = example("II.A-19A");
    let d = design(&plate, &beam, &support, &actions);
    let k = |v: f64| v / KIP_TO_N;
    let kin = |v: f64| v / KIP_IN;
    let r = |id: &str| check(&d, id).resistance.unwrap();
    compare(&p, "boltShear", k(bolt_value(&d, 1, "phiRnShear")));
    compare(&p, "webBearing", k(bolt_value(&d, 2, "phiRnWebBearing")));
    compare(
        &p,
        "plateBearing",
        k(bolt_value(&d, 2, "phiRnPlateBearing")),
    );
    compare(
        &p,
        "plateEdgeTearout",
        k(bolt_value(&d, 4, "phiRnPlateTearout")),
    );
    let duct = check(&d, "connection.plate.ductility");
    compare(&p, "Mmax", kin(f(&duct.intermediates["Mmax"])));
    compare(&p, "tmax", f(&duct.intermediates["tmax"]) / IN_TO_M);
    compare(&p, "plateShearYield", k(r("connection.plate.shearYield")));
    compare(
        &p,
        "plateShearRupture",
        k(r("connection.plate.shearRupture")),
    );
    let bs = check(&d, "connection.plate.blockShear");
    let in2 = |v: &Value| f(v) / IN_TO_M / IN_TO_M;
    compare(&p, "blockAgv", in2(&bs.intermediates["Agv"]));
    compare(&p, "blockAnv", in2(&bs.intermediates["Anv"]));
    compare(&p, "blockAnt", in2(&bs.intermediates["Ant"]));
    compare(&p, "plateBlockShear", k(bs.resistance.unwrap()));
    let fl = check(&d, "connection.plate.flexure");
    compare(&p, "Mu", kin(fl.demand.unwrap()));
    let in3 = |v: &Value| f(v) / IN_TO_M.powi(3);
    compare(&p, "Z", in3(&fl.intermediates["Z"]));
    compare(&p, "S", in3(&fl.intermediates["S"]));
    compare(&p, "phiMn", kin(fl.resistance.unwrap()));
    compare(&p, "LbDOverT2", f(&fl.intermediates["LbDOverT2"]));
    compare(
        &p,
        "interactionYield",
        check(&d, "connection.plate.interactionYield")
            .demand
            .unwrap(),
    );
    let rup = check(&d, "connection.plate.flexuralRupture");
    compare(&p, "Znet", in3(&rup.intermediates["Znet"]));
    compare(&p, "phiMnRupture", kin(rup.resistance.unwrap()));
    compare(
        &p,
        "supportTmin",
        f(&check(&d, "connection.support.thickness").intermediates["tmin"]) / IN_TO_M,
    );
    no_mismatches();
    // C at e = 10.5 in. for two lines of four bolts.
    let g = check(&d, "connection.boltGroup");
    assert!((f(&g.intermediates["C"]) - 2.33).abs() < 0.02);
    assert!(
        d.checks.iter().all(|c| c.status == CheckStatus::Pass),
        "{:#?}",
        d.checks
            .iter()
            .filter(|c| c.status != CheckStatus::Pass)
            .collect::<Vec<_>>()
    );
}

#[test]
fn net_plastic_modulus_from_geometry() {
    // Even and odd hole counts, against the strip sum by hand.
    let (t, l, h) = (0.5, 14.5, 1.0);
    let ys = [-6.0, -3.0, 0.0, 3.0, 6.0];
    let hand = t * l * l / 4.0 - t * h * (6.0 + 3.0 + 3.0 + 6.0) - t * h * h / 4.0;
    assert!((single_plate::z_net(t, l, h, &ys) - hand).abs() < 1e-12);
    let ys = [-4.5, -1.5, 1.5, 4.5];
    assert!(
        (single_plate::z_net(0.5, 12.0, 0.875, &ys) - (18.0 - 0.5 * 0.875 * 12.0)).abs() < 1e-12
    );
}

#[test]
fn unsupported_conditions_are_never_passed() {
    let (plate, beam, support, actions, _) = example("II.A-19A");
    // Moment through the end.
    let d = design(
        &plate,
        &beam,
        &support,
        &ConnectionActions { m: 5e3, ..actions },
    );
    assert_eq!(
        check(&d, "connection.momentTransfer").status,
        CheckStatus::Unsupported
    );
    // Compression and out-of-plane actions.
    let d = design(
        &plate,
        &beam,
        &support,
        &ConnectionActions {
            n: -50e3,
            v_minor: 1e3,
            ..actions
        },
    );
    assert_eq!(
        check(&d, "connection.compression").status,
        CheckStatus::Unsupported
    );
    assert_eq!(
        check(&d, "connection.outOfPlane").status,
        CheckStatus::Unsupported
    );
    // Rotation bracing not confirmed: the interaction is indeterminate.
    let d = design(
        &SinglePlate {
            braced_against_rotation: None,
            ..plate.clone()
        },
        &beam,
        &support,
        &actions,
    );
    assert_eq!(
        check(&d, "connection.plate.interactionYield").status,
        CheckStatus::Indeterminate
    );
    let d = design(
        &SinglePlate {
            braced_against_rotation: Some(false),
            ..plate.clone()
        },
        &beam,
        &support,
        &actions,
    );
    assert_eq!(
        check(&d, "connection.plate.interactionYield").status,
        CheckStatus::Unsupported
    );
    // A beam that does not clear the column flange tips.
    let d = design(
        &SinglePlate {
            a: 3.0 * IN_TO_M,
            ..plate
        },
        &beam,
        &support,
        &actions,
    );
    assert_eq!(check(&d, "connection.fit").status, CheckStatus::Fail);
}

#[test]
fn uplift_reverses_the_tearout_edges() {
    let (plate, beam, support, actions, _) = example("II.A-17A");
    let up = design(
        &plate,
        &beam,
        &support,
        &ConnectionActions {
            v: -actions.v,
            ..actions
        },
    );
    let down = design(&plate, &beam, &support, &actions);
    // Down: the plate's bottom bolt is at the edge; up: the top bolt.
    assert!(bolt_value(&down, 4, "lcPlate") < bolt_value(&down, 1, "lcPlate"));
    assert!(bolt_value(&up, 1, "lcPlate") < bolt_value(&up, 4, "lcPlate"));
    let (a, b) = (
        check(&up, "connection.boltGroup"),
        check(&down, "connection.boltGroup"),
    );
    assert!((a.resistance.unwrap() - b.resistance.unwrap()).abs() < 1e-6 * b.resistance.unwrap());
}

#[test]
fn bolt_tables() {
    let b = Bolt::new("3/4", BoltGroup::Group120, false).unwrap();
    assert!((b.hole() / IN_TO_M - 13.0 / 16.0).abs() < 1e-12);
    assert!((b.min_edge() / IN_TO_M - 1.0).abs() < 1e-12);
    assert!((b.fnv() / KSI_TO_PA - 54.0).abs() < 1e-12);
    let m = Bolt::new("M20", BoltGroup::Group150, true).unwrap();
    assert!((m.hole() - 0.022).abs() < 1e-12 && (m.min_edge() - 0.026).abs() < 1e-12);
    assert!((m.fnv() - 580e6).abs() < 1e-6 && (m.net_hole() - 0.024).abs() < 1e-12);
    assert!(Bolt::new("5/16", BoltGroup::Group120, false).is_none());
}

#[test]
fn matches_the_independent_oracle() {
    let oracle: Value = serde_json::from_str(include_str!(
        "../../../../../../fixtures/design/aisc-360-22-lrfd/connection-oracle.json"
    ))
    .unwrap();
    let tol = f(&oracle["tolerance"]);
    for case in oracle["cases"].as_array().unwrap() {
        let c = &case["inputs"];
        let group = if c["group"] == "group150" {
            BoltGroup::Group150
        } else {
            BoltGroup::Group120
        };
        let plate = SinglePlate {
            bolt: Bolt::new(
                c["bolt"].as_str().unwrap(),
                group,
                c["threadsExcluded"].as_bool().unwrap(),
            )
            .unwrap(),
            rows: c["rows"].as_u64().unwrap() as usize,
            columns: c["columns"].as_u64().unwrap() as usize,
            pitch: f(&c["pitch"]),
            gauge: f(&c["gauge"]),
            thickness: f(&c["tp"]),
            fy: f(&c["plateFy"]),
            fu: f(&c["plateFu"]),
            elastic_modulus: f(&c["E"]),
            lev: f(&c["lev"]),
            leh_plate: f(&c["lehPlate"]),
            a: f(&c["a"]),
            leh_beam: f(&c["lehBeam"]),
            underrun: f(&c["underrun"]),
            top_offset: f(&c["topOffset"]),
            weld: f(&c["weld"]),
            fexx: f(&c["FEXX"]),
            deformation_considered: c["deformationConsidered"].as_bool().unwrap(),
            braced_against_rotation: Some(true),
        };
        let b = &c["beam"];
        let beam = Beam {
            designation: "oracle".into(),
            d: f(&b["d"]),
            tw: f(&b["tw"]),
            tf: f(&b["tf"]),
            ag: f(&b["A"]),
            kdes: f(&b["kdes"]),
            fy: f(&b["Fy"]),
            fu: f(&b["Fu"]),
        };
        let s = &c["support"];
        let support = Support {
            designation: "oracle".into(),
            kind: serde_json::from_value(s["kind"].clone()).unwrap(),
            thickness: f(&s["t"]),
            fu: f(&s["Fu"]),
            flange_width: f(&s["bf"]),
            web_thickness: f(&s["tw"]),
        };
        let d = design(
            &plate,
            &beam,
            &support,
            &ConnectionActions {
                v: f(&c["V"]),
                n: f(&c["N"]),
                ..Default::default()
            },
        );
        let id = c["id"].as_str().unwrap();
        let g = check(&d, "connection.boltGroup");
        assert!(
            (f(&g.intermediates["C"]) - f(&case["C"])).abs() <= tol * f(&case["C"]),
            "{id}: C"
        );
        let expected = case["checks"].as_object().unwrap();
        for (key, want) in expected {
            let got = check(&d, key);
            for (field, value) in [("demand", got.demand), ("resistance", got.resistance)] {
                let (g, w) = (value.unwrap(), f(&want[field]));
                assert!(
                    (g - w).abs() <= tol * w.abs().max(1e-12),
                    "{id} {key} {field}: {g} vs {w}"
                );
            }
        }
        // Every value-bearing check the kernel reports is in the oracle.
        for c in &d.checks {
            if c.demand.is_some()
                && ![
                    "connection.momentTransfer",
                    "connection.spacing",
                    "connection.edgeDistance",
                    "connection.fit",
                    "connection.weld.size",
                ]
                .contains(&c.check_id.as_str())
            {
                assert!(
                    expected.contains_key(&c.check_id),
                    "{id}: {} not in the oracle",
                    c.check_id
                );
            }
        }
    }
}
