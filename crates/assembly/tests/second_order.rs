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
fn envelopes_and_bad_settings_are_rejected() {
    let case = &oracle()["secondOrder"][0];
    let model = lateral_portal(case["PPerColumn"].as_f64().unwrap());
    assert_eq!(
        second_order(&model, "__envelope__", &settings(8))
            .unwrap_err()
            .code,
        "INVALID_LOAD"
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

#[test]
fn a_portal_with_a_pinned_beam_sways_as_two_exact_beam_column_flagpoles() {
    // Fixed bases, beam pinned at both ends (hinge DOFs): each column is a
    // cantilever beam-column carrying P and half of H. Exact small-rotation
    // tip sway: Δ = (H/2)(tan kh − kh)/(P k), k = √(P/EI); first order
    // (H/2)h³/(3EI).
    let o = oracle();
    let pb = &o["portalBuckling"];
    let (h, e, i) = (
        pb["geometry"]["h"].as_f64().unwrap(),
        210e9,
        pb["column"]["I"].as_f64().unwrap(),
    );
    let hh = o["firstOrderSwayUnderH"]["H"].as_f64().unwrap();
    let pcr = std::f64::consts::PI.powi(2) * e * i / (4. * h * h);
    let p = 0.5 * pcr;
    let mut model = lateral_portal(p);
    model.members[2].release_start.my = true;
    model.members[2].release_end.my = true;
    let r = second_order(&model, "LC1", &settings(16)).unwrap();
    let k = (p / (e * i)).sqrt();
    let exact = 0.5 * hh * ((k * h).tan() - k * h) / (p * k);
    assert!(
        (sway(&r) / exact - 1.).abs() <= 1e-3,
        "{} vs {exact}",
        sway(&r)
    );
    let first = &r.numerical_checks["firstOrder"]["nodeDisplacements"];
    let tl = r.node_ids.iter().position(|n| n == "tl").unwrap();
    let first_exact = 0.5 * hh * h.powi(3) / (3. * e * i);
    assert!((first[tl * 6].as_f64().unwrap() / first_exact - 1.).abs() <= 1e-3);
    // The hinges carry no bending moment about the released axis.
    let beam = r.members.iter().find(|m| m.id == "bm").unwrap();
    let column_base = base_moment(&r);
    for end in [4, 10] {
        assert!(
            beam.end_actions[end].abs() <= 1e-9 * column_base,
            "{:?}",
            beam.end_actions
        );
    }
}

/// A member load reaching a support, with and without an end release: with
/// no axial force, second order is linear static exactly. Before the fix the
/// member load was counted twice in the reactions (EQUILIBRIUM_FAILURE) and
/// never reached a released end's hinge DOF.
#[test]
fn member_loads_at_supports_and_released_ends_match_linear_static() {
    for release in [false, true] {
        let p = serde_json::json!({
            "schemaVersion": "1.0.0", "id": "udl", "name": "udl", "revision": 0, "displayUnits": "SI",
            "analysisMode": "spatial", "gravity": [0, 0, -9.80665],
            "materials": [{"id": "mat1", "name": "s", "E": 210e9, "nu": 0.3, "density": 0}],
            "sections": [{"id": "sec1", "name": "s", "A": 1e-2, "Iy": 1e-4, "Iz": 2e-4, "J": 1e-5,
                "cy": 0.1, "cz": 0.1, "provenance": "test"}],
            "nodes": [{"id": "n1", "position": [0, 0, 0]}, {"id": "n2", "position": [6, 0, 0]}],
            "members": [{"id": "m1", "start": "n1", "end": "n2", "material": "mat1", "section": "sec1",
                "localY": [0, 1, 0], "releaseStart": {"my": false, "mz": false},
                "releaseEnd": {"my": release, "mz": release}}],
            "supports": [
                {"id": "s1", "node": "n1", "fixed": [true, true, true, true, true, true], "prescribed": [0, 0, 0, 0, 0, 0]},
                {"id": "s2", "node": "n2", "fixed": [true, true, true, true, true, true], "prescribed": [0, 0, 0, 0, 0, 0]}],
            "loadCases": [{"id": "LC1", "name": "udl", "category": "other"}],
            "loads": [{"id": "l1", "case": "LC1", "type": "uniform", "member": "m1", "axes": "global",
                "forcePerLength": [0, 0, -10000]}],
            "combinations": [],
            "analysisSettings": {"type": "linearStatic", "formulation": "eulerBernoulli3D",
                "mergeTolerance": 1e-6, "timeoutMs": 30000, "memoryLimitMiB": 512},
            "metadata": {"description": "test", "createdBy": "test"}
        });
        let p = Project::parse(&p.to_string()).unwrap();
        let linear = analyse(&p, "LC1").unwrap();
        for n in [1, 4] {
            let r = second_order(&p, "LC1", &settings(n)).unwrap();
            for (a, b) in r.reactions.iter().zip(&linear.reactions) {
                assert!(
                    (a - b).abs() <= 1e-9 * 60e3,
                    "release {release}, n {n}: {a} vs {b}"
                );
            }
            // Fixed–fixed: wL/2 and wL²/12; propped: 5wL/8, 3wL/8 and wL²/8.
            let (left, moment) = if release {
                (37_500., 45_000.)
            } else {
                (30_000., 30_000.)
            };
            assert!(
                (reaction(&r, "s1", 2) - left).abs() <= 1e-6,
                "release {release}, n {n}"
            );
            assert!((reaction(&r, "s1", 4).abs() - moment).abs() <= 1e-6);
            if release {
                assert!(reaction(&r, "s2", 4).abs() <= 1e-6);
            }
        }
    }
}
