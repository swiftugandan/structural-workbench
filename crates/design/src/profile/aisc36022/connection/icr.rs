//! Instantaneous centre of rotation (ICR) strength of an eccentrically loaded
//! bolt group with the Crawford–Kulak load–deformation relation
//! R = R_ult (1 − e^(−10Δ))^0.55, Δ in inches, Δ_max = 0.34 in at the bolt
//! farthest from the centre (Crawford and Kulak, 1971, J. Struct. Div. ASCE
//! 97(ST3)). This is the method the AISC Specification's User Notes to J2.4
//! and J3.7 refer to; its tabulated coefficients (Manual Tables 7-6/7-7) are
//! not held, so the solver is verified against the C values quoted in the held
//! Design Examples v16 (ADR 0030, `docs/formulations/connection.md`).
//!
//! Coordinates are SI (m). The result is the coefficient C = P/R_ult: the
//! group strength in units of one bolt's strength.

use super::super::units::IN_TO_M;

/// Δ_max = 0.34 in.
pub const DELTA_MAX: f64 = 0.34 * IN_TO_M;
/// The exponent 10 Δ with Δ in inches, per metre.
const DECAY: f64 = 10.0 / IN_TO_M;

/// Normalised bolt force at deformation `delta` (m).
pub fn bolt_force(delta: f64) -> f64 {
    (1.0 - (-DECAY * delta).exp()).powf(0.55)
}

#[derive(Debug, Clone, PartialEq)]
pub struct Icr {
    /// P / R_ult.
    pub c: f64,
    /// Instantaneous centre (m); None for a concentric load (pure translation).
    pub centre: Option<[f64; 2]>,
    /// Bolt forces on the group, normalised by R_ult.
    pub forces: Vec<[f64; 2]>,
    /// Equilibrium residuals, normalised by C: force along the load, force
    /// across it and moment about the centre.
    pub residual: [f64; 3],
    pub iterations: usize,
}

struct State {
    force: [f64; 2],
    moment: f64,
    forces: Vec<[f64; 2]>,
}

/// Bolt resistance for a rigid rotation about `ic`: each bolt deforms in
/// proportion to its distance, perpendicular to its radius.
fn state(bolts: &[[f64; 2]], ic: [f64; 2]) -> State {
    let radii: Vec<f64> = bolts
        .iter()
        .map(|b| (b[0] - ic[0]).hypot(b[1] - ic[1]))
        .collect();
    let r_max = radii.iter().cloned().fold(0.0, f64::max);
    let mut force = [0.0; 2];
    let mut moment = 0.0;
    let mut forces = Vec::with_capacity(bolts.len());
    for (b, &r) in bolts.iter().zip(&radii) {
        let f = bolt_force(DELTA_MAX * r / r_max);
        // Counter-clockwise tangent at the bolt.
        let d = [-(b[1] - ic[1]) / r, (b[0] - ic[0]) / r];
        force[0] += f * d[0];
        force[1] += f * d[1];
        moment += f * r;
        forces.push([f * d[0], f * d[1]]);
    }
    State {
        force,
        moment,
        forces,
    }
}

/// Residual of the signed equilibrium about a trial centre: with the rotation
/// sense set by the load's moment about the centre, the bolt resultant must
/// equal P u, where P balances the moment. Returns (residual / P, P).
fn residual(bolts: &[[f64; 2]], point: [f64; 2], dir: [f64; 2], ic: [f64; 2]) -> ([f64; 2], f64) {
    let s = state(bolts, ic);
    let rel = [point[0] - ic[0], point[1] - ic[1]];
    let cross = rel[0] * dir[1] - rel[1] * dir[0];
    let sense = cross.signum();
    let p = s.moment / cross.abs();
    (
        [
            (sense * s.force[0] - p * dir[0]) / p,
            (sense * s.force[1] - p * dir[1]) / p,
        ],
        p,
    )
}

/// Damped Newton from `start`; Some(centre) when converged.
fn newton(
    bolts: &[[f64; 2]],
    point: [f64; 2],
    dir: [f64; 2],
    start: [f64; 2],
    span: f64,
) -> Option<([f64; 2], usize)> {
    let norm = |v: [f64; 2]| v[0].abs().max(v[1].abs());
    let mut ic = start;
    let mut r = residual(bolts, point, dir, ic).0;
    for it in 0..200 {
        if !norm(r).is_finite() {
            return None;
        }
        // As the centre runs off to infinity the residual of the translation
        // limit tends to zero: that is an asymptote, not a solution.
        if ic[0].hypot(ic[1]) > 1e3 * span {
            return None;
        }
        if norm(r) <= 1e-13 {
            return Some((ic, it));
        }
        let h = 1e-7 * span;
        let mut jac = [[0.0; 2]; 2];
        for k in 0..2 {
            let mut p = ic;
            p[k] += h;
            let rp = residual(bolts, point, dir, p).0;
            jac[0][k] = (rp[0] - r[0]) / h;
            jac[1][k] = (rp[1] - r[1]) / h;
        }
        let det = jac[0][0] * jac[1][1] - jac[0][1] * jac[1][0];
        if det == 0.0 || !det.is_finite() {
            return None;
        }
        let dx = [
            -(jac[1][1] * r[0] - jac[0][1] * r[1]) / det,
            -(-jac[1][0] * r[0] + jac[0][0] * r[1]) / det,
        ];
        let mut step = 1.0;
        loop {
            let trial = [ic[0] + step * dx[0], ic[1] + step * dx[1]];
            let rt = residual(bolts, point, dir, trial).0;
            if norm(rt) < norm(r) {
                ic = trial;
                r = rt;
                break;
            }
            step *= 0.5;
            if step < 1e-10 {
                return None;
            }
        }
    }
    None
}

/// Group coefficient for a load along unit `dir` whose line passes through
/// `point`, both relative to the bolt group centroid. Bolt positions are
/// relative to the centroid too. None when no centre satisfies equilibrium
/// (never reported as a strength).
pub fn solve(bolts: &[[f64; 2]], point: [f64; 2], dir: [f64; 2]) -> Option<Icr> {
    let n = bolts.len() as f64;
    let span = bolts
        .iter()
        .map(|b| b[0].hypot(b[1]))
        .fold(0.0, f64::max)
        .max(1e-3);
    // Signed perpendicular distance from the centroid to the load line.
    let e = point[0] * dir[1] - point[1] * dir[0];
    if e.abs() <= 1e-9 * span || bolts.len() == 1 {
        // Pure translation: every bolt at Δ_max, the limit of C as e → 0.
        return Some(Icr {
            c: n * bolt_force(DELTA_MAX),
            centre: None,
            forces: bolts.iter().map(|_| dir).collect(),
            residual: [0.0; 3],
            iterations: 0,
        });
    }
    // The centre lies on the perpendicular to the load through the centroid,
    // on the side away from the load. Start from the elastic distance
    // r0 = Σr²/(n e), then from multiples of it.
    let polar: f64 = bolts.iter().map(|b| b[0] * b[0] + b[1] * b[1]).sum();
    let r0 = polar / (n * e.abs());
    let perp = [dir[1], -dir[0]];
    let side = -e.signum();
    let (ic, iterations) = [1.0, 0.5, 2.0, 0.25, 4.0, 0.1, 10.0].iter().find_map(|k| {
        newton(
            bolts,
            point,
            dir,
            [side * k * r0 * perp[0], side * k * r0 * perp[1]],
            span,
        )
    })?;
    let s = state(bolts, ic);
    let (_, c) = residual(bolts, point, dir, ic);
    let rel = [point[0] - ic[0], point[1] - ic[1]];
    let cross = rel[0] * dir[1] - rel[1] * dir[0];
    let sense = cross.signum();
    // Bolt forces on the group resisting the load, and the three equilibrium
    // residuals normalised by C.
    let forces: Vec<[f64; 2]> = s
        .forces
        .iter()
        .map(|f| [sense * f[0], sense * f[1]])
        .collect();
    let sum = forces
        .iter()
        .fold([0.0, 0.0], |a, f| [a[0] + f[0], a[1] + f[1]]);
    Some(Icr {
        c,
        centre: Some(ic),
        residual: [
            (sum[0] * dir[0] + sum[1] * dir[1] - c) / c,
            (sum[0] * dir[1] - sum[1] * dir[0]) / c,
            (c * cross.abs() - s.moment) / (c * cross.abs()),
        ],
        forces,
        iterations,
    })
}

/// Bolts of one vertical row of `n` at pitch `s`, centred on the origin
/// (x = 0, y up).
pub fn vertical_row(n: usize, s: f64) -> Vec<[f64; 2]> {
    (0..n)
        .map(|i| [0.0, ((n as f64 - 1.0) / 2.0 - i as f64) * s])
        .collect()
}

/// C′ for a pure moment: M / (R_ult) with the centre at the centroid.
pub fn moment_only(bolts: &[[f64; 2]]) -> f64 {
    state(bolts, [0.0, 0.0]).moment
}
