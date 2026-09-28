//! stability-v1 elastic buckling against the independent oracle
//! (`fixtures/stability/stability-oracle.json`, `docs/formulations/stability.md`).
use serde_json::{Value, json};
use workbench_assembly::{StabilitySettings, elastic_buckling};
use workbench_model::Project;

fn oracle() -> Value {
    serde_json::from_str(
        &std::fs::read_to_string("../../fixtures/stability/stability-oracle.json").unwrap(),
    )
    .unwrap()
}

fn project(
    mode: &str,
    nodes: Value,
    members: Value,
    supports: Value,
    loads: Value,
    section: Value,
) -> Project {
    let p = json!({
        "schemaVersion": "1.0.0", "id": "stability", "name": "stability", "revision": 0,
        "displayUnits": "engineeringMetric", "analysisMode": mode, "gravity": [0, 0, -9.80665],
        "materials": [{"id": "mat1", "name": "steel", "E": 210e9, "nu": 0.3, "density": 0}],
        "sections": section,
        "nodes": nodes, "members": members, "supports": supports,
        "loadCases": [{"id": "LC1", "name": "Reference", "category": "other"}],
        "loads": loads, "combinations": [],
        "analysisSettings": {"type": "linearStatic", "formulation": "eulerBernoulli3D",
            "mergeTolerance": 1e-6, "timeoutMs": 30000, "memoryLimitMiB": 512},
        "metadata": {"description": "stability-v1 oracle case", "createdBy": "tests"}
    });
    Project::parse(&p.to_string()).unwrap()
}

fn node(id: &str, x: f64, y: f64, z: f64) -> Value {
    json!({"id": id, "position": [x, y, z]})
}
fn member(id: &str, a: &str, b: &str, sec: &str, local_y: [f64; 3]) -> Value {
    json!({"id": id, "start": a, "end": b, "material": "mat1", "section": sec, "localY": local_y,
           "releaseStart": {"my": false, "mz": false}, "releaseEnd": {"my": false, "mz": false}})
}
fn support(id: &str, n: &str, fixed: [bool; 6]) -> Value {
    json!({"id": id, "node": n, "fixed": fixed, "prescribed": [0, 0, 0, 0, 0, 0]})
}
fn nodal(id: &str, n: &str, values: [f64; 6]) -> Value {
    json!({"id": id, "case": "LC1", "type": "nodal", "node": n, "values": values})
}

const P_REF: f64 = 1e3;

/// Spatial strut along X, local y = global Y, so Iz bends in Y and Iy in Z.
fn strut(case: &Value, axial: f64) -> Project {
    let (l, a, iy, iz, j) = (
        case["L"].as_f64().unwrap(),
        case["A"].as_f64().unwrap(),
        case["Iy"].as_f64().unwrap(),
        case["Iz"].as_f64().unwrap(),
        case["J"].as_f64().unwrap(),
    );
    let (start, end) = match case["ends"].as_str().unwrap() {
        "pinnedPinned" => (
            [true, true, true, true, false, false],
            [false, true, true, false, false, false],
        ),
        "fixedFree" => ([true; 6], [false; 6]),
        "fixedFixed" => ([true; 6], [false, true, true, true, true, true]),
        "fixedPinned" => ([true; 6], [false, true, true, false, false, false]),
        e => panic!("{e}"),
    };
    project(
        "spatial",
        json!([node("n1", 0., 0., 0.), node("n2", l, 0., 0.)]),
        json!([member("m1", "n1", "n2", "sec1", [0., 1., 0.])]),
        json!([support("s1", "n1", start), support("s2", "n2", end)]),
        json!([nodal("l1", "n2", [axial, 0., 0., 0., 0., 0.])]),
        json!([{"id": "sec1", "name": "strut", "A": a, "Iy": iy, "Iz": iz, "J": j, "cy": 0.1, "cz": 0.1,
                "provenance": "stability-v1 oracle strut"}]),
    )
}

fn settings(subdivisions: usize, modes: usize) -> StabilitySettings {
    StabilitySettings {
        subdivisions,
        modes,
    }
}

#[test]
fn euler_struts_converge_from_above_to_the_closed_form() {
    for case in oracle()["euler"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let exact = case["PcrWeak"].as_f64().unwrap() / P_REF;
        let p = strut(case, -P_REF);
        // A single fixed–fixed element has no free transverse DOF: nothing can
        // buckle, and that is reported rather than invented.
        let levels: &[usize] = if case["ends"] == "fixedFixed" {
            let r = elastic_buckling(&p, "LC1", &settings(1, 1)).unwrap();
            assert!(r.modes.is_empty(), "{id} one element");
            assert_eq!(r.diagnostics[0]["code"], "NO_POSITIVE_CRITICAL_FACTOR");
            &[2, 4, 8, 16]
        } else {
            &[1, 2, 4, 8, 16]
        };
        let mut errors = vec![];
        for &n in levels {
            let r = elastic_buckling(&p, "LC1", &settings(n, 1)).unwrap();
            errors.push(r.modes[0].factor / exact - 1.);
        }
        let last = errors.len() - 1;
        // Monotone from above; the 16-element error within 1e-4; the 8→16
        // ratio confirms the convergence order.
        for w in errors.windows(2) {
            assert!(
                w[0] > w[1] && w[1] > 0.,
                "{id} not monotone from above: {errors:?}"
            );
        }
        assert!(errors[last] <= 1e-4, "{id} 16 elements: {errors:?}");
        assert!(
            errors[last - 1] / errors[last] >= 8.,
            "{id} order: {errors:?}"
        );
    }
}

/// Modal assurance criterion between two sampled shapes.
fn mac(a: &[f64], b: &[f64]) -> f64 {
    let d = |x: &[f64], y: &[f64]| x.iter().zip(y).map(|(p, q)| p * q).sum::<f64>();
    d(a, b).powi(2) / (d(a, a) * d(b, b))
}

#[test]
fn both_bending_planes_appear_with_their_own_loads_and_shapes() {
    // S-EUL-PLANE on the pinned strut: weak plane (Iy, displacement in Z) first,
    // strong plane (Iz, displacement in Y) among the first five, each with a
    // half-sine shape.
    let case = &oracle()["euler"][0];
    assert_eq!(case["ends"], "pinnedPinned");
    let r = elastic_buckling(&strut(case, -P_REF), "LC1", &settings(16, 5)).unwrap();
    let l = case["L"].as_f64().unwrap();
    let plane_mode = |axis: usize| {
        r.modes
            .iter()
            .find(|m| {
                let s = &m.members[0].stations;
                let (along, across) = (
                    s.iter()
                        .map(|x| x.displacement[axis].abs())
                        .fold(0., f64::max),
                    s.iter()
                        .map(|x| x.displacement[3 - axis].abs())
                        .fold(0., f64::max),
                );
                along > 0.5 && across < 1e-6
            })
            .unwrap()
    };
    for (axis, key) in [(2, "PcrWeak"), (1, "PcrStrong")] {
        let m = plane_mode(axis);
        let exact = case[key].as_f64().unwrap() / P_REF;
        assert!(
            (m.factor / exact - 1.).abs() <= 1e-4,
            "{key}: {} vs {exact}",
            m.factor
        );
        let s = &m.members[0].stations;
        let shape: Vec<f64> = s.iter().map(|x| x.displacement[axis]).collect();
        let sine: Vec<f64> = s
            .iter()
            .map(|x| (std::f64::consts::PI * x.position[0] / l).sin())
            .collect();
        assert!(
            mac(&shape, &sine) >= 0.999,
            "{key} MAC {}",
            mac(&shape, &sine)
        );
    }
    assert!(r.modes[0].factor < plane_mode(1).factor);
}

#[test]
fn mode_shapes_are_normalised_to_a_unit_positive_peak() {
    let case = &oracle()["euler"][1];
    let r = elastic_buckling(&strut(case, -P_REF), "LC1", &settings(8, 3)).unwrap();
    for m in &r.modes {
        let peak = m
            .members
            .iter()
            .flat_map(|x| &x.stations)
            .flat_map(|s| s.displacement)
            .fold(0f64, |a, b| if b.abs() > a.abs() { b } else { a });
        assert!((peak - 1.).abs() < 1e-12, "peak {peak}");
    }
    assert_eq!(
        r.disclosures,
        [
            "FLEXURAL_ONLY",
            "NOT_A_RESISTANCE_CHECK",
            "LINEAR_REFERENCE_STATE"
        ]
    );
    let sturm = &r.numerical_checks["sturm"];
    assert_eq!(
        sturm["negativePivots"].as_u64().unwrap() as usize,
        r.modes.len() - 1
    );
}

fn portal(p_top: f64) -> Project {
    let o = oracle();
    let pb = &o["portalBuckling"];
    let (h, b) = (
        pb["geometry"]["h"].as_f64().unwrap(),
        pb["geometry"]["b"].as_f64().unwrap(),
    );
    let sec = |id: &str, part: &Value| {
        json!({"id": id, "name": id, "A": part["A"], "Iy": part["I"], "Iz": part["I"], "J": 1e-4,
               "cy": 0.1, "cz": 0.1, "provenance": "stability-v1 oracle portal"})
    };
    project(
        "planarXZ",
        json!([
            node("bl", 0., 0., 0.),
            node("br", b, 0., 0.),
            node("tl", 0., 0., h),
            node("tr", b, 0., h)
        ]),
        json!([
            member("cl", "bl", "tl", "col", [0., 1., 0.]),
            member("cr", "br", "tr", "col", [0., 1., 0.]),
            member("bm", "tl", "tr", "beam", [0., 1., 0.]),
        ]),
        json!([
            support("sl", "bl", [true; 6]),
            support("sr", "br", [true; 6])
        ]),
        json!([
            nodal("l1", "tl", [0., 0., p_top, 0., 0., 0.]),
            nodal("l2", "tr", [0., 0., p_top, 0., 0., 0.])
        ]),
        json!([sec("col", &pb["column"]), sec("beam", &pb["beam"])]),
    )
}

#[test]
fn portal_sway_buckling_matches_the_characteristic_equation() {
    let exact = oracle()["portalBuckling"]["PcrPerColumn"].as_f64().unwrap() / P_REF;
    let r = elastic_buckling(&portal(-P_REF), "LC1", &settings(8, 2)).unwrap();
    let first = &r.modes[0];
    assert!(
        (first.factor / exact - 1.).abs() <= 1e-4,
        "{} vs {exact}",
        first.factor
    );
    // The first mode is the sway mode: both column tops translate equally in X.
    let top = |id: &str| {
        let i = first.node_ids.iter().position(|n| n == id).unwrap();
        first.node_displacements[i * 6]
    };
    assert!((top("tl") - top("tr")).abs() < 1e-6 * top("tl").abs() && top("tl").abs() > 0.5);
}

#[test]
fn reversing_the_reference_load_negates_the_spectrum() {
    // S-SIGN: gravity reversed puts the columns in tension.
    let down = elastic_buckling(&portal(-P_REF), "LC1", &settings(8, 2)).unwrap();
    let up = elastic_buckling(&portal(P_REF), "LC1", &settings(8, 2)).unwrap();
    assert!(up.modes.is_empty());
    assert_eq!(up.diagnostics[0]["code"], "NO_POSITIVE_CRITICAL_FACTOR");
    assert!((up.negative_factors[0] + down.modes[0].factor).abs() <= 1e-9 * down.modes[0].factor);
}

#[test]
fn a_strut_in_tension_has_no_critical_factor() {
    // S-REV: tension only; the reversed load reproduces S-EUL-1.
    let case = &oracle()["euler"][0];
    let r = elastic_buckling(&strut(case, P_REF), "LC1", &settings(16, 1)).unwrap();
    assert!(r.modes.is_empty());
    assert_eq!(r.diagnostics[0]["code"], "NO_POSITIVE_CRITICAL_FACTOR");
    let exact = case["PcrWeak"].as_f64().unwrap() / P_REF;
    assert!(
        (r.negative_factors[0] / -exact - 1.).abs() <= 1e-4,
        "{:?}",
        r.negative_factors
    );
}

#[test]
fn releases_envelopes_and_bad_settings_are_rejected() {
    let case = &oracle()["euler"][0];
    let p = strut(case, -P_REF);
    let code = |r: Result<_, workbench_model::Diagnostic>| {
        r.map(|_: workbench_results::BucklingAnalysis| ())
            .unwrap_err()
            .code
    };
    assert_eq!(
        code(elastic_buckling(&p, "__envelope__", &settings(8, 1))),
        "INVALID_LOAD"
    );
    assert_eq!(
        code(elastic_buckling(&p, "LC1", &settings(0, 1))),
        "INVALID_SETTINGS"
    );
    assert_eq!(
        code(elastic_buckling(&p, "LC1", &settings(8, 21))),
        "INVALID_SETTINGS"
    );
    let mut released = p.clone();
    released.members[0].release_end.mz = true;
    assert_eq!(
        code(elastic_buckling(&released, "LC1", &settings(8, 1))),
        "STABILITY_RELEASES_UNSUPPORTED"
    );
}

#[test]
fn settings_enter_the_result_identity() {
    let case = &oracle()["euler"][0];
    let p = strut(case, -P_REF);
    let a = elastic_buckling(&p, "LC1", &settings(8, 1)).unwrap();
    let b = elastic_buckling(&p, "LC1", &settings(16, 1)).unwrap();
    assert_eq!(a.model_hash, b.model_hash);
    assert_ne!(a.settings_hash, b.settings_hash);
    assert_ne!(a.result_id, b.result_id);
}
