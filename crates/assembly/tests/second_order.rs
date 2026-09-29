//! stability-v1 second-order analysis against the independent oracle
//! (`fixtures/stability/stability-oracle.json`, `docs/formulations/stability.md`).
mod common;
use common::{nodal, oracle, portal_loaded, strut};
use serde_json::json;
use workbench_assembly::{Imperfection, SecondOrderSettings, analyse, second_order};
use workbench_model::Project;
use workbench_results::Analysis;

fn settings(subdivisions: usize) -> SecondOrderSettings {
    SecondOrderSettings {
        subdivisions,
        imperfection: Imperfection::None,
    }
}

fn node_value(r: &Analysis, node: &str, dof: usize) -> f64 {
    let i = r.node_ids.iter().position(|n| n == node).unwrap();
    r.node_displacements[i * 6 + dof]
}
fn reaction(r: &Analysis, support: &str, dof: usize) -> f64 {
    let i = r
        .reaction_support_ids
        .iter()
        .position(|s| s == support)
        .unwrap();
    r.reactions[i * 6 + dof]
}

/// Lateral H at the left top and P at both tops, as in the oracle.
fn lateral_portal(p: f64) -> Project {
    let h = oracle()["firstOrderSwayUnderH"]["H"].as_f64().unwrap();
    portal_loaded([h, -p], -p)
}

fn sway(r: &Analysis) -> f64 {
    0.5 * (node_value(r, "tl", 0) + node_value(r, "tr", 0))
}
fn base_moment(r: &Analysis) -> f64 {
    0.5 * (reaction(r, "sl", 4).abs() + reaction(r, "sr", 4).abs())
}

#[test]
fn portal_p_delta_matches_the_exact_beam_column_solution() {
    // S-POR-PD at 0.2, 0.5, 0.8 Pcr: sway and base moment within 1e-3.
    for case in oracle()["secondOrder"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        if id == "S-NEAR" {
            continue;
        }
        let p = case["PPerColumn"].as_f64().unwrap();
        let r = second_order(&lateral_portal(p), "LC1", &settings(8)).unwrap();
        let exact = &case["exact"];
        let (s, m) = (
            exact["sway"].as_f64().unwrap(),
            exact["baseMomentMagnitude"].as_f64().unwrap(),
        );
        assert!(
            (sway(&r) / s - 1.).abs() <= 1e-3,
            "{id} sway {} vs {s}",
            sway(&r)
        );
        assert!(
            (base_moment(&r) / m - 1.).abs() <= 1e-3,
            "{id} base moment {} vs {m}",
            base_moment(&r)
        );
        assert_eq!(r.analysis_type, "secondOrder");
        assert!(r.numerical_checks["iterations"].as_u64().unwrap() >= 2);
    }
}

#[test]
fn near_critical_portal_converges_with_large_amplification() {
    // S-NEAR at 0.99 Pcr: within 1e-2 (r/(1-r) magnification), amplification >= 10.
    let o = oracle();
    let case = o["secondOrder"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["id"] == "S-NEAR")
        .unwrap();
    let p = case["PPerColumn"].as_f64().unwrap();
    let r = second_order(&lateral_portal(p), "LC1", &settings(8)).unwrap();
    let exact = &case["exact"];
    let s = exact["sway"].as_f64().unwrap();
    assert!(
        (sway(&r) / s - 1.).abs() <= 1e-2,
        "sway {} vs {s}",
        sway(&r)
    );
    let m = exact["baseMomentMagnitude"].as_f64().unwrap();
    assert!(
        (base_moment(&r) / m - 1.).abs() <= 1e-2,
        "moment {} vs {m}",
        base_moment(&r)
    );
    let linear = analyse(&lateral_portal(p), "LC1").unwrap();
    assert!(
        sway(&r) / sway(&linear) >= 10.,
        "amplification {}",
        sway(&r) / sway(&linear)
    );
}

#[test]
fn over_critical_portal_fails_without_a_response() {
    // S-OVER at 1.01 Pcr: the tangent loses positive definiteness.
    let p = oracle()["overCritical"]["PPerColumn"].as_f64().unwrap();
    let e = second_order(&lateral_portal(p), "LC1", &settings(8)).unwrap_err();
    assert_eq!(e.code, "NONCONVERGED");
    assert_eq!(
        e.details["reason"], "TANGENT_NOT_POSITIVE_DEFINITE",
        "{e:?}"
    );
    assert!(!e.details["history"].as_array().unwrap().is_empty());
}

#[test]
fn without_axial_force_second_order_is_the_linear_analysis() {
    // A cantilever with a transverse tip load has no axial force, so K_G = 0.
    let case = &oracle()["euler"][1];
    let mut p = strut(case, 0.);
    p.loads = vec![serde_json::from_value(nodal("l1", "n2", [0., 0., -5e3, 0., 0., 0.])).unwrap()];
    let linear = analyse(&p, "LC1").unwrap();
    let second = second_order(&p, "LC1", &settings(8)).unwrap();
    for (a, b) in linear
        .node_displacements
        .iter()
        .zip(&second.node_displacements)
    {
        assert!((a - b).abs() <= 1e-12 * a.abs().max(1e-9), "{a} vs {b}");
    }
    for (a, b) in linear.reactions.iter().zip(&second.reactions) {
        assert!((a - b).abs() <= 1e-9 * a.abs().max(1.), "{a} vs {b}");
    }
}

#[test]
fn equilibrium_holds_in_the_deformed_geometry() {
    // With nodal loads only, the constant-N idealisation is exact, so global
    // moment balance about the origin in the deformed geometry closes to the
    // iteration tolerance.
    let case = &oracle()["secondOrder"][2];
    let r = second_order(
        &lateral_portal(case["PPerColumn"].as_f64().unwrap()),
        "LC1",
        &settings(8),
    )
    .unwrap();
    let b = &r.numerical_checks["globalBalanceDeformed"];
    let scale = &r.numerical_checks["balanceScale"];
    for a in 0..3 {
        assert!(
            b[a].as_f64().unwrap().abs() <= 1e-8 * scale[0].as_f64().unwrap(),
            "force {b}"
        );
        assert!(
            b[a + 3].as_f64().unwrap().abs() <= 1e-8 * scale[1].as_f64().unwrap(),
            "moment {b}"
        );
    }
}

#[test]
fn sway_imperfection_is_explicit_and_listed() {
    // Gravity only: without an imperfection there is no sway; with one, the
    // equivalent forces are ratio x V at the loaded nodes and drive sway.
    let p = 0.5 * oracle()["portalBuckling"]["PcrPerColumn"].as_f64().unwrap();
    let model = portal_loaded([0., -p], -p);
    let plain = second_order(&model, "LC1", &settings(8)).unwrap();
    assert!(sway(&plain).abs() < 1e-12);
    let ratio = 1. / 200.;
    let imperfect = SecondOrderSettings {
        subdivisions: 8,
        imperfection: Imperfection::Sway {
            ratio,
            direction: [2., 0.],
        },
    };
    let r = second_order(&model, "LC1", &imperfect).unwrap();
    let listed = r.numerical_checks["imperfection"]["equivalentNodalForces"]
        .as_array()
        .unwrap();
    assert_eq!(listed.len(), 2);
    for f in listed {
        assert!(
            (f["force"][0].as_f64().unwrap() - ratio * p).abs() <= 1e-9 * p,
            "{f}"
        );
    }
    assert!(sway(&r) > 0.);
    assert_ne!(plain.settings_hash, r.settings_hash);
    // Invalid imperfections are refused.
    for bad in [
        Imperfection::Sway {
            ratio: 0.,
            direction: [1., 0.],
        },
        Imperfection::Sway {
            ratio: 0.2,
            direction: [1., 0.],
        },
        Imperfection::Sway {
            ratio: 0.01,
            direction: [0., 0.],
        },
    ] {
        let e = second_order(
            &model,
            "LC1",
            &SecondOrderSettings {
                subdivisions: 8,
                imperfection: bad,
            },
        )
        .unwrap_err();
        assert_eq!(e.code, "INVALID_SETTINGS");
    }
}

#[test]
fn releases_and_envelopes_are_rejected() {
    let case = &oracle()["secondOrder"][0];
    let model = lateral_portal(case["PPerColumn"].as_f64().unwrap());
    assert_eq!(
        second_order(&model, "__envelope__", &settings(8))
            .unwrap_err()
            .code,
        "INVALID_LOAD"
    );
    let mut released = model.clone();
    released.members[2].release_start.my = true;
    assert_eq!(
        second_order(&released, "LC1", &settings(8))
            .unwrap_err()
            .code,
        "STABILITY_RELEASES_UNSUPPORTED"
    );
    assert_eq!(
        second_order(&model, "LC1", &settings(33)).unwrap_err().code,
        "INVALID_SETTINGS"
    );
}

#[test]
fn member_results_carry_second_order_moments_on_the_physical_member() {
    let case = &oracle()["secondOrder"][2];
    let r = second_order(
        &lateral_portal(case["PPerColumn"].as_f64().unwrap()),
        "LC1",
        &settings(8),
    )
    .unwrap();
    let column = r.members.iter().find(|m| m.id == "cl").unwrap();
    // Stations run 0..1 over the physical member with ends as key stations.
    assert_eq!(column.samples.first().unwrap().station, 0.);
    assert_eq!(column.samples.last().unwrap().station, 1.);
    assert_eq!(column.key_stations.first().unwrap().kind, "end");
    assert_eq!(column.key_stations.last().unwrap().kind, "end");
    // The base section moment equals the support reaction moment.
    let base = column.key_stations.first().unwrap().actions[4];
    assert!(
        (base.abs() / reaction(&r, "sl", 4).abs() - 1.).abs() <= 1e-9,
        "{base} vs {}",
        reaction(&r, "sl", 4)
    );
    let _ = json!(null);
}

#[test]
fn column_moments_follow_the_exact_p_delta_shape() {
    // Interior moments include the P-δ term N (w - w_i): the column moment
    // shape M(x)/M(0) matches the exact beam-column solution, measured against
    // the base moment because M crosses zero near mid-height.
    for case in oracle()["secondOrder"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let tolerance = if id == "S-NEAR" { 1e-2 } else { 1e-3 };
        let p = case["PPerColumn"].as_f64().unwrap();
        let r = second_order(&lateral_portal(p), "LC1", &settings(8)).unwrap();
        let column = r.members.iter().find(|m| m.id == "cl").unwrap();
        let my_at = |t: f64| {
            column
                .key_stations
                .iter()
                .find(|k| (k.station - t).abs() < 1e-12)
                .unwrap()
                .actions[4]
        };
        let base = my_at(0.);
        for (t, expected) in case["exact"]["columnMomentOverBase"].as_object().unwrap() {
            let ratio = my_at(t.parse().unwrap()) / base;
            let expected = expected.as_f64().unwrap();
            assert!(
                (ratio - expected).abs() <= tolerance,
                "{id} x/h={t}: {ratio} vs {expected}"
            );
        }
    }
}

#[test]
fn the_first_order_record_is_the_linear_response_to_the_same_loads() {
    // Without an imperfection, iteration 0 is the linear analysis (exactly, for
    // nodal loads, although it runs on the subdivided mesh: 1e-10 allows for
    // rounding across the two meshes), so second-order over first-order sway
    // is the exact amplification.
    let case = oracle()["secondOrder"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["id"] == "S-POR-PD-050")
        .unwrap()
        .clone();
    let model = lateral_portal(case["PPerColumn"].as_f64().unwrap());
    let r = second_order(&model, "LC1", &settings(8)).unwrap();
    let linear = analyse(&model, "LC1").unwrap();
    let first = &r.numerical_checks["firstOrder"];
    for (i, a) in linear.node_displacements.iter().enumerate() {
        let b = first["nodeDisplacements"][i].as_f64().unwrap();
        assert!(
            (a - b).abs() <= 1e-10 * a.abs().max(1e-9),
            "{i}: {a} vs {b}"
        );
    }
    for (i, a) in linear.reactions.iter().enumerate() {
        let b = first["reactions"][i].as_f64().unwrap();
        assert!((a - b).abs() <= 1e-9 * a.abs().max(1.), "{i}: {a} vs {b}");
    }
    let first_sway = 0.5
        * (first["nodeDisplacements"][r.node_ids.iter().position(|n| n == "tl").unwrap() * 6]
            .as_f64()
            .unwrap()
            + first["nodeDisplacements"][r.node_ids.iter().position(|n| n == "tr").unwrap() * 6]
                .as_f64()
                .unwrap());
    let amplification = sway(&r) / first_sway;
    let exact = case["exact"]["amplification"].as_f64().unwrap();
    assert!(
        (amplification / exact - 1.).abs() <= 1e-3,
        "{amplification} vs {exact}"
    );
}
