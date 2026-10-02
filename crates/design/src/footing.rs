//! Contact pressure under a rigid rectangular base on tensionless linear
//! ground (M11, ADR 0028). Code-agnostic mechanics: the ground pressure is
//! q(x, y) = max(0, p0 + px x + py y) over the base L × B centred at the
//! origin (x along L, y along B), with ∫q = N, ∫q y = N e_y, ∫q x = N e_x for
//! a downward resultant N at (e_x, e_y). Full contact is the closed form; a
//! resultant outside the kern is solved by Newton's method on (p0, px, py)
//! with exact polygon integrals of the contact region (the boundary terms
//! vanish because q = 0 there, so the Jacobian is ∫ φ φᵀ over the contact
//! area). A resultant on or outside the base edge has no equilibrium and is
//! refused. See docs/formulations/footing.md.

use serde::Serialize;
use workbench_model::{Result, err};

/// A polygon as counter-clockwise vertices.
pub type Polygon = Vec<[f64; 2]>;

#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Plane {
    pub p0: f64,
    pub px: f64,
    pub py: f64,
}

impl Plane {
    pub fn at(&self, x: f64, y: f64) -> f64 {
        self.p0 + self.px * x + self.py * y
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Contact {
    pub plane: Plane,
    /// "full" or "partial".
    pub state: &'static str,
    pub contact_area: f64,
    pub contact_fraction: f64,
    pub q_max: f64,
    pub q_min: f64,
    /// Corner pressures (−L/2,−B/2), (L/2,−B/2), (L/2,B/2), (−L/2,B/2), clipped at 0.
    pub corners: [f64; 4],
    pub iterations: u32,
    pub residual: f64,
    pub contact_polygon: Polygon,
}

/// ∫ over a polygon of [1, x, y, x², xy, y²] (Green's theorem, exact).
pub fn moments(poly: &[[f64; 2]]) -> [f64; 6] {
    let mut m = [0.; 6];
    let n = poly.len();
    for i in 0..n {
        let [x0, y0] = poly[i];
        let [x1, y1] = poly[(i + 1) % n];
        let c = x0 * y1 - x1 * y0;
        m[0] += c / 2.;
        m[1] += c * (x0 + x1) / 6.;
        m[2] += c * (y0 + y1) / 6.;
        m[3] += c * (x0 * x0 + x0 * x1 + x1 * x1) / 12.;
        m[4] += c * (x0 * y1 + 2. * x0 * y0 + 2. * x1 * y1 + x1 * y0) / 24.;
        m[5] += c * (y0 * y0 + y0 * y1 + y1 * y1) / 12.;
    }
    m
}

/// The part of `poly` where a + b x + c y ≥ 0 (Sutherland–Hodgman, one edge).
pub fn clip(poly: &[[f64; 2]], a: f64, b: f64, c: f64) -> Polygon {
    let f = |p: [f64; 2]| a + b * p[0] + c * p[1];
    let mut out = vec![];
    let n = poly.len();
    for i in 0..n {
        let (p, q) = (poly[i], poly[(i + 1) % n]);
        let (fp, fq) = (f(p), f(q));
        if fp >= 0. {
            out.push(p);
        }
        if (fp >= 0.) != (fq >= 0.) {
            let t = fp / (fp - fq);
            out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
        }
    }
    out
}

pub fn rectangle(l: f64, b: f64) -> Polygon {
    vec![[-l / 2., -b / 2.], [l / 2., -b / 2.], [l / 2., b / 2.], [-l / 2., b / 2.]]
}

/// ∫ q [1, x, y] over `region` for the plane, and the Jacobian ∫ φ φᵀ.
fn resultants(region: &[[f64; 2]], p: &Plane) -> ([f64; 3], [[f64; 3]; 3]) {
    let m = moments(region);
    let j = [[m[0], m[1], m[2]], [m[1], m[3], m[4]], [m[2], m[4], m[5]]];
    let v = [p.p0, p.px, p.py];
    let r = [0, 1, 2].map(|i| (0..3).map(|k| j[i][k] * v[k]).sum());
    (r, j)
}

fn solve3(a: [[f64; 3]; 3], b: [f64; 3]) -> Option<[f64; 3]> {
    let det = |m: [[f64; 3]; 3]| {
        m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
            + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    };
    let d = det(a);
    if d.abs() < 1e-300 {
        return None;
    }
    let col = |k: usize| {
        let mut m = a;
        for r in 0..3 {
            m[r][k] = b[r];
        }
        det(m) / d
    };
    Some([col(0), col(1), col(2)])
}

/// The pressure under an L × B base for a downward resultant `n` (> 0) at
/// (e_x, e_y) from the centre.
pub fn contact(l: f64, b: f64, n: f64, ex: f64, ey: f64) -> Result<Contact> {
    if !(l > 0. && b > 0. && n.is_finite()) {
        return Err(err("INVALID_SETTINGS", "Base dimensions must be positive and actions finite"));
    }
    if n <= 0. {
        return Err(err("UNSUPPORTED_FEATURE", "No downward force on the base: no ground contact (tension is not resisted)"));
    }
    if !(ex.is_finite() && ey.is_finite()) {
        return Err(err("INVALID_SETTINGS", "Base dimensions must be positive and actions finite"));
    }
    if ex.abs() >= l / 2. || ey.abs() >= b / 2. {
        return Err(err("UNSTABLE_MODEL", "The resultant lies on or outside the base: no contact equilibrium"));
    }
    let base = rectangle(l, b);
    let area = l * b;
    let target = [n, n * ex, n * ey];
    // Full contact (closed form): q = N/A + 12 N e_x x/(B L³) + 12 N e_y y/(L B³).
    let full = Plane { p0: n / area, px: 12. * n * ex / (b * l.powi(3)), py: 12. * n * ey / (l * b.powi(3)) };
    let corner_min = [[-1., -1.], [1., -1.], [1., 1.], [-1., 1.]]
        .iter()
        .map(|s| full.at(s[0] * l / 2., s[1] * b / 2.))
        .fold(f64::INFINITY, f64::min);
    let (plane, iterations, region) = if corner_min >= 0. {
        (full, 0, base.clone())
    } else {
        let mut p = full;
        let mut it = 0;
        loop {
            it += 1;
            let region = clip(&base, p.p0, p.px, p.py);
            let (r, j) = resultants(&region, &p);
            let f = [r[0] - target[0], r[1] - target[1], r[2] - target[2]];
            let scale = n.abs() * (1. + l.max(b));
            if (f[0].abs() + f[1].abs() + f[2].abs()) <= 1e-13 * scale {
                break (p, it, region);
            }
            if it > 200 {
                return Err(err("NONCONVERGENCE", "Contact iteration did not converge"));
            }
            let step = solve3(j, f).ok_or_else(|| err("NONCONVERGENCE", "Singular contact region"))?;
            // Damped Newton: halve until the residual decreases.
            let norm = |q: &Plane| {
                let reg = clip(&base, q.p0, q.px, q.py);
                let (rr, _) = resultants(&reg, q);
                (rr[0] - target[0]).abs() + (rr[1] - target[1]).abs() + (rr[2] - target[2]).abs()
            };
            let before = f[0].abs() + f[1].abs() + f[2].abs();
            let mut t = 1.;
            let mut next = p;
            for _ in 0..40 {
                next = Plane { p0: p.p0 - t * step[0], px: p.px - t * step[1], py: p.py - t * step[2] };
                if norm(&next) < before {
                    break;
                }
                t /= 2.;
            }
            p = next;
        }
    };
    let corners = [[-1., -1.], [1., -1.], [1., 1.], [-1., 1.]].map(|s| plane.at(s[0] * l / 2., s[1] * b / 2.).max(0.));
    let (r, _) = resultants(&region, &plane);
    let contact_area = moments(&region)[0];
    Ok(Contact {
        plane,
        state: if iterations == 0 { "full" } else { "partial" },
        contact_area,
        contact_fraction: contact_area / area,
        q_max: corners.iter().cloned().fold(0., f64::max),
        q_min: corners.iter().cloned().fold(f64::INFINITY, f64::min),
        corners,
        iterations,
        residual: ((r[0] - target[0]).abs() + (r[1] - target[1]).abs() + (r[2] - target[2]).abs()) / n,
        contact_polygon: region,
    })
}

/// ∫ q and ∫ q x, ∫ q y over the part of the contact region inside `poly`.
pub fn load_within(c: &Contact, poly: &[[f64; 2]]) -> [f64; 3] {
    let mut region: Polygon = poly.to_vec();
    // Clip by the contact half-plane, then by each edge of the contact polygon's
    // bounding rectangle is unnecessary: the plane clip suffices on the base.
    region = clip(&region, c.plane.p0, c.plane.px, c.plane.py);
    if region.len() < 3 {
        return [0.; 3];
    }
    resultants(&region, &c.plane).0
}
