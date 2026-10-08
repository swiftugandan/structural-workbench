//! Bar clashes and fit at RC beam–column joints (M16, ADR 0032).
//!
//! The drafts bound to members meeting at a node are placed on the
//! analytical centrelines (the beam section centred on its axis, the column
//! section on its own). Every longitudinal bar is a straight line through the
//! joint, so the distance between two bars is the distance between two
//! lines in space:
//!
//! - a beam bar and a column bar must keep the EN 1992-1-1 8.2(2) clear
//!   distance, max(k1 φ, d_g + k2, 20 mm) with the UK NA k1 = 1, k2 = 5 mm;
//! - top (or bottom) bars of two beams crossing at the joint may touch but
//!   must not intersect: their centrelines must be at least (φ1 + φ2)/2
//!   apart, otherwise one layer has to move.
//!
//! Bars are assumed to run through the joint (continuous or anchored past
//! the far column bars). This is geometry only: where the bars stop, laps and
//! the anchorage inside the joint are the engineer's.

use serde_json::{Value, json};

const K1: f64 = 1.0;
const K2: f64 = 0.005;
const FLOOR: f64 = 0.020;

#[derive(Debug, Clone, PartialEq)]
pub struct JointBeam {
    /// The draft's id and the analytical member it is bound to.
    pub id: String,
    pub member: String,
    /// Unit vector along the beam, away from the joint.
    pub axis: [f64; 3],
    /// Unit vectors of the beam's local y (across the width) and z (to the top face).
    pub lateral: [f64; 3],
    pub up: [f64; 3],
    pub width: f64,
    pub depth: f64,
    /// Nominal cover to the links.
    pub cover: f64,
    pub link: f64,
    pub top: (f64, usize),
    pub bottom: (f64, usize),
    pub aggregate: Option<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct JointColumn {
    pub id: String,
    pub member: String,
    /// Unit vector along the column.
    pub axis: [f64; 3],
    /// Unit vectors of the column's local y (width) and z (depth).
    pub y: [f64; 3],
    pub z: [f64; 3],
    /// Bar centres (y, z) from the section centre.
    pub bars: Vec<[f64; 2]>,
    pub diameter: f64,
    pub aggregate: Option<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Joint {
    pub node: String,
    pub position: [f64; 3],
    pub column: Option<JointColumn>,
    pub beams: Vec<JointBeam>,
}

fn add(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
fn scale(a: [f64; 3], k: f64) -> [f64; 3] {
    [a[0] * k, a[1] * k, a[2] * k]
}
fn sub(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn cross(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
fn norm(a: [f64; 3]) -> f64 {
    dot(a, a).sqrt()
}

/// Distance between two lines; None when they are parallel.
pub fn line_distance(p1: [f64; 3], d1: [f64; 3], p2: [f64; 3], d2: [f64; 3]) -> Option<f64> {
    let n = cross(d1, d2);
    let len = norm(n);
    (len > 1e-9).then(|| dot(sub(p2, p1), n).abs() / len)
}

/// Bar centres across a row of `n` bars in a section of `width`.
pub fn row_offsets(width: f64, cover: f64, link: f64, phi: f64, n: usize) -> Vec<f64> {
    let half = width / 2.0 - cover - link - phi / 2.0;
    match n {
        0 => vec![],
        1 => vec![0.0],
        _ => (0..n)
            .map(|k| -half + 2.0 * half * k as f64 / (n - 1) as f64)
            .collect(),
    }
}

/// One beam row: (face name, diameter, line points).
fn beam_rows(j: &Joint, b: &JointBeam) -> Vec<(&'static str, f64, Vec<[f64; 3]>)> {
    let mut out = vec![];
    for (face, (phi, n), sign) in [("top", b.top, 1.0), ("bottom", b.bottom, -1.0)] {
        let level = sign * (b.depth / 2.0 - b.cover - b.link - phi / 2.0);
        let points = row_offsets(b.width, b.cover, b.link, phi, n)
            .into_iter()
            .map(|o| add(add(j.position, scale(b.lateral, o)), scale(b.up, level)))
            .collect();
        out.push((face, phi, points));
    }
    out
}

/// 8.2(2) clear distance between bars of diameters a and b.
fn clear_minimum(a: f64, b: f64, dg: Option<f64>) -> f64 {
    let phi = a.max(b);
    match dg {
        Some(g) => (K1 * phi).max(g + K2).max(FLOOR),
        None => (K1 * phi).max(FLOOR),
    }
}

/// Clashes at one joint.
pub fn check(j: &Joint) -> Value {
    let mut clashes = vec![];
    let mut checked = 0usize;
    let mut aggregate_missing = false;
    // Beam bars against the column bars (8.2(2)).
    if let Some(c) = &j.column {
        for b in &j.beams {
            let dg = match (b.aggregate, c.aggregate) {
                (Some(x), Some(y)) => Some(x.max(y)),
                (Some(x), None) | (None, Some(x)) => Some(x),
                (None, None) => {
                    aggregate_missing = true;
                    None
                }
            };
            for (face, phi, points) in beam_rows(j, b) {
                for (k, p) in points.iter().enumerate() {
                    for (m, bar) in c.bars.iter().enumerate() {
                        let q = add(add(j.position, scale(c.y, bar[0])), scale(c.z, bar[1]));
                        let Some(dist) = line_distance(*p, b.axis, q, c.axis) else {
                            continue;
                        };
                        checked += 1;
                        let need = (phi + c.diameter) / 2.0 + clear_minimum(phi, c.diameter, dg);
                        if dist < need - 1e-9 {
                            clashes.push(json!({"kind": "beamColumn", "clause": "8.2(2)",
                                "beam": b.id, "beamMember": b.member, "column": c.id, "columnMember": c.member,
                                "face": face, "beamBar": k + 1, "columnBar": m + 1,
                                "distance": dist, "required": need, "shortfall": need - dist}));
                        }
                    }
                }
            }
        }
    }
    // Crossing beams: bars at the same face must not intersect.
    for (i, a) in j.beams.iter().enumerate() {
        for b in &j.beams[i + 1..] {
            if norm(cross(a.axis, b.axis)) < 1e-6 {
                continue; // collinear beams: continuous or lapped bars, not a crossing
            }
            let (ra, rb) = (beam_rows(j, a), beam_rows(j, b));
            // One entry per beam pair and face, at the closest crossing.
            for ((face, pa, la), (_, pb, lb)) in ra.iter().zip(&rb) {
                let mut closest = f64::INFINITY;
                for p in la {
                    for q in lb {
                        if let Some(dist) = line_distance(*p, a.axis, *q, b.axis) {
                            checked += 1;
                            closest = closest.min(dist);
                        }
                    }
                }
                let need = (pa + pb) / 2.0;
                if closest < need - 1e-9 {
                    clashes.push(
                        json!({"kind": "beamBeam", "beam": a.id, "beamMember": a.member,
                        "other": b.id, "otherMember": b.member, "face": face,
                        "distance": closest, "required": need, "shortfall": need - closest}),
                    );
                }
            }
        }
    }
    let status = if !clashes.is_empty() {
        "clash"
    } else if aggregate_missing {
        "indeterminate"
    } else {
        "clear"
    };
    json!({"node": j.node, "column": j.column.as_ref().map(|c| c.id.clone()), "beams": j.beams.iter().map(|b| b.id.clone()).collect::<Vec<_>>(),
        "status": status, "pairsChecked": checked, "clashes": clashes,
        "notes": if aggregate_missing { vec!["Enter the aggregate size on the drafts: without it the 8.2(2) clear distance uses max(φ, 20 mm)"] } else { vec![] }})
}

#[cfg(test)]
mod tests {
    use super::*;

    fn beam(id: &str, axis: [f64; 3], lateral: [f64; 3], depth: f64) -> JointBeam {
        JointBeam {
            id: id.into(),
            member: format!("m-{id}"),
            axis,
            lateral,
            up: [0.0, 0.0, 1.0],
            width: 0.3,
            depth,
            cover: 0.03,
            link: 0.01,
            top: (0.02, 3),
            bottom: (0.016, 2),
            aggregate: Some(0.02),
        }
    }

    fn column(bars: Vec<[f64; 2]>) -> JointColumn {
        JointColumn {
            id: "C".into(),
            member: "m-C".into(),
            axis: [0.0, 0.0, 1.0],
            y: [1.0, 0.0, 0.0],
            z: [0.0, 1.0, 0.0],
            bars,
            diameter: 0.025,
            aggregate: Some(0.02),
        }
    }

    #[test]
    fn skew_line_distance_by_hand() {
        let d = line_distance(
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [0.0, 0.3, 0.4],
            [0.0, 0.0, 1.0],
        )
        .unwrap();
        assert!((d - 0.3).abs() < 1e-15);
        assert!(
            line_distance([0.0; 3], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [2.0, 0.0, 0.0]).is_none()
        );
        // Offsets: three Ø20 in 300 mm with 30 + 10 mm: ±(150 − 50) = ±100 mm.
        assert_eq!(row_offsets(0.3, 0.03, 0.01, 0.02, 3), vec![-0.1, 0.0, 0.1]);
    }

    #[test]
    fn crossing_beams_of_equal_depth_clash_and_a_lowered_layer_clears() {
        let j = Joint {
            node: "n".into(),
            position: [0.0; 3],
            column: None,
            beams: vec![
                beam("B1", [1.0, 0.0, 0.0], [0.0, 1.0, 0.0], 0.6),
                beam("B2", [0.0, 1.0, 0.0], [-1.0, 0.0, 0.0], 0.6),
            ],
        };
        let r = check(&j);
        assert_eq!(r["status"], "clash");
        // Same levels: top and bottom rows intersect (distance 0).
        assert!(
            r["clashes"]
                .as_array()
                .unwrap()
                .iter()
                .all(|c| c["kind"] == "beamBeam" && c["distance"].as_f64().unwrap() < 1e-12)
        );
        // B2 deeper by exactly φ (20 mm) at the top: its top bars sit 20 mm
        // higher, which is (φ1 + φ2)/2 = 20 mm: they touch, not intersect.
        let mut j2 = j.clone();
        j2.beams[1].depth = 0.64;
        j2.beams[1].bottom = (0.016, 0);
        let r = check(&j2);
        let tops: Vec<&Value> = r["clashes"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|c| c["face"] == "top")
            .collect();
        assert!(tops.is_empty(), "{r}");
    }

    #[test]
    fn beam_bars_against_column_bars_need_the_clear_distance() {
        // A 400 mm column with Ø25 corners at ±(200 − 30 − 10 − 12.5) = ±147.5.
        let corner = 0.2 - 0.03 - 0.01 - 0.0125;
        let bars = vec![
            [-corner, -corner],
            [corner, -corner],
            [-corner, corner],
            [corner, corner],
        ];
        let j = Joint {
            node: "n".into(),
            position: [0.0; 3],
            column: Some(column(bars.clone())),
            beams: vec![beam("B1", [1.0, 0.0, 0.0], [0.0, 1.0, 0.0], 0.6)],
        };
        // B1's outer top bars at y = ±100 mm; column bars at y = ±147.5 mm:
        // 47.5 mm between centres against (20 + 25)/2 + max(25, 25, 20) = 47.5.
        let r = check(&j);
        let top: Vec<&Value> = r["clashes"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|c| c["face"] == "top")
            .collect();
        assert!(top.is_empty(), "exactly at the limit: {r}");
        // A wider beam pushes its outer bars to ±125 mm: a clash of 25 mm.
        let mut j2 = j.clone();
        j2.beams[0].width = 0.35;
        let r = check(&j2);
        let c = r["clashes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["face"] == "top")
            .unwrap();
        assert!(
            (c["shortfall"].as_f64().unwrap() - 0.025).abs() < 1e-12,
            "{c}"
        );
        // Without the aggregate the joint is indeterminate when nothing clashes.
        let mut j3 = j.clone();
        j3.beams[0].aggregate = None;
        if let Some(c) = j3.column.as_mut() {
            c.aggregate = None;
        }
        j3.beams[0].width = 0.25;
        assert_eq!(check(&j3)["status"], "indeterminate");
    }
}
