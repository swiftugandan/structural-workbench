//! Oracle-model builders shared by the stability-v1 kernel tests.
#![allow(dead_code)]
use serde_json::{Value, json};
use workbench_model::Project;

pub fn oracle() -> Value {
    serde_json::from_str(
        &std::fs::read_to_string("../../fixtures/stability/stability-oracle.json").unwrap(),
    )
    .unwrap()
}

pub fn project(
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

pub fn node(id: &str, x: f64, y: f64, z: f64) -> Value {
    json!({"id": id, "position": [x, y, z]})
}
pub fn member(id: &str, a: &str, b: &str, sec: &str, local_y: [f64; 3]) -> Value {
    json!({"id": id, "start": a, "end": b, "material": "mat1", "section": sec, "localY": local_y,
           "releaseStart": {"my": false, "mz": false}, "releaseEnd": {"my": false, "mz": false}})
}
pub fn support(id: &str, n: &str, fixed: [bool; 6]) -> Value {
    json!({"id": id, "node": n, "fixed": fixed, "prescribed": [0, 0, 0, 0, 0, 0]})
}
pub fn nodal(id: &str, n: &str, values: [f64; 6]) -> Value {
    json!({"id": id, "case": "LC1", "type": "nodal", "node": n, "values": values})
}

pub const P_REF: f64 = 1e3;

/// Spatial strut along X, local y = global Y, so Iz bends in Y and Iy in Z.
pub fn strut(case: &Value, axial: f64) -> Project {
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

/// Fixed-base oracle portal (planar XZ) with loads at the column tops:
/// `[fx, fz]` at the left top and `fz` at the right top.
pub fn portal_loaded(left: [f64; 2], right_fz: f64) -> Project {
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
            nodal("l1", "tl", [left[0], 0., left[1], 0., 0., 0.]),
            nodal("l2", "tr", [0., 0., right_fz, 0., 0., 0.])
        ]),
        json!([sec("col", &pb["column"]), sec("beam", &pb["beam"])]),
    )
}

/// Portal with equal vertical loads `p_top` (negative = downward) at both tops.
pub fn portal(p_top: f64) -> Project {
    portal_loaded([0., p_top], p_top)
}
