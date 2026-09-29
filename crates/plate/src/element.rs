//! Flat four-node shell element (plate-v1, `docs/formulations/plate.md`):
//! bilinear plane-stress membrane plus the MITC4 Reissner–Mindlin plate.
//!
//! Node order is counter-clockwise, natural corners (−1,−1), (1,−1), (1,1),
//! (−1,1). Each node carries [u, v, w, rx, ry]; the normal rotations are
//! βx = ry and βy = −rx.

pub const NODE_DOFS: usize = 5;
pub const DOFS: usize = 4 * NODE_DOFS;
pub type Matrix = [[f64; DOFS]; DOFS];
pub type Vector = [f64; DOFS];

const CORNERS: [[f64; 2]; 4] = [[-1., -1.], [1., -1.], [1., 1.], [-1., 1.]];
const GAUSS: f64 = 0.577_350_269_189_625_8;
const SHEAR_CORRECTION: f64 = 5. / 6.;

#[derive(Clone, Copy, Debug)]
pub struct PlateMaterial {
    /// Young's modulus (Pa).
    pub e: f64,
    pub nu: f64,
    /// Thickness (m).
    pub t: f64,
}

impl PlateMaterial {
    /// Flexural rigidity D = E t³ / (12(1 − ν²)).
    pub fn rigidity(&self) -> f64 {
        self.e * self.t.powi(3) / (12. * (1. - self.nu * self.nu))
    }
    fn membrane_rigidity(&self) -> f64 {
        self.e * self.t / (1. - self.nu * self.nu)
    }
    fn shear_rigidity(&self) -> f64 {
        SHEAR_CORRECTION * self.e / (2. * (1. + self.nu)) * self.t
    }
}

/// Element actions at a point: membrane forces (N/m), moments (N m/m,
/// sagging positive), transverse shear forces (N/m).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Actions {
    pub nx: f64,
    pub ny: f64,
    pub nxy: f64,
    pub mx: f64,
    pub my: f64,
    pub mxy: f64,
    pub qx: f64,
    pub qy: f64,
}

fn shape(r: f64, s: f64) -> [f64; 4] {
    std::array::from_fn(|i| 0.25 * (1. + r * CORNERS[i][0]) * (1. + s * CORNERS[i][1]))
}

/// dN/dr and dN/ds.
fn shape_derivatives(r: f64, s: f64) -> [[f64; 4]; 2] {
    [
        std::array::from_fn(|i| 0.25 * CORNERS[i][0] * (1. + s * CORNERS[i][1])),
        std::array::from_fn(|i| 0.25 * CORNERS[i][1] * (1. + r * CORNERS[i][0])),
    ]
}

/// Jacobian J = [[∂x/∂r, ∂y/∂r], [∂x/∂s, ∂y/∂s]] and its determinant.
fn jacobian(xy: &[[f64; 2]; 4], r: f64, s: f64) -> ([[f64; 2]; 2], f64) {
    let d = shape_derivatives(r, s);
    let j: [[f64; 2]; 2] =
        std::array::from_fn(|a| std::array::from_fn(|b| (0..4).map(|i| d[a][i] * xy[i][b]).sum()));
    (j, j[0][0] * j[1][1] - j[0][1] * j[1][0])
}

fn inverse(j: &[[f64; 2]; 2], det: f64) -> [[f64; 2]; 2] {
    [
        [j[1][1] / det, -j[0][1] / det],
        [-j[1][0] / det, j[0][0] / det],
    ]
}

/// Cartesian derivatives dN/dx, dN/dy.
fn cartesian(xy: &[[f64; 2]; 4], r: f64, s: f64) -> ([[f64; 4]; 2], f64) {
    let (j, det) = jacobian(xy, r, s);
    let inv = inverse(&j, det);
    let d = shape_derivatives(r, s);
    (
        std::array::from_fn(|a| std::array::from_fn(|i| inv[a][0] * d[0][i] + inv[a][1] * d[1][i])),
        det,
    )
}

fn dof(node: usize, k: usize) -> usize {
    node * NODE_DOFS + k
}
const U: usize = 0;
const V: usize = 1;
const W: usize = 2;
const RX: usize = 3;
const RY: usize = 4;

/// Membrane strains [εx, εy, γxy].
fn membrane_b(dn: &[[f64; 4]; 2]) -> [Vector; 3] {
    let mut b = [[0.; DOFS]; 3];
    for i in 0..4 {
        b[0][dof(i, U)] = dn[0][i];
        b[1][dof(i, V)] = dn[1][i];
        b[2][dof(i, U)] = dn[1][i];
        b[2][dof(i, V)] = dn[0][i];
    }
    b
}

/// Curvatures [κx, κy, κxy] with βx = ry, βy = −rx.
fn bending_b(dn: &[[f64; 4]; 2]) -> [Vector; 3] {
    let mut b = [[0.; DOFS]; 3];
    for i in 0..4 {
        b[0][dof(i, RY)] = dn[0][i];
        b[1][dof(i, RX)] = -dn[1][i];
        b[2][dof(i, RY)] = dn[1][i];
        b[2][dof(i, RX)] = -dn[0][i];
    }
    b
}

/// Covariant transverse shear strain along r (a = 0) or s (a = 1) at a point:
/// e = ∂w/∂a + g_a · β.
fn covariant_shear(xy: &[[f64; 2]; 4], r: f64, s: f64, a: usize) -> Vector {
    let (j, _) = jacobian(xy, r, s);
    let d = shape_derivatives(r, s);
    let n = shape(r, s);
    let mut row = [0.; DOFS];
    for i in 0..4 {
        row[dof(i, W)] = d[a][i];
        row[dof(i, RY)] = j[a][0] * n[i];
        row[dof(i, RX)] = -j[a][1] * n[i];
    }
    row
}

/// MITC4 Cartesian shear strains [γxz, γyz] at (r, s): covariant strains tied
/// at the edge midpoints, interpolated, then mapped with J⁻¹.
fn shear_b(xy: &[[f64; 2]; 4], r: f64, s: f64) -> [Vector; 2] {
    let (ea, ec) = (
        covariant_shear(xy, 0., 1., 0),
        covariant_shear(xy, 0., -1., 0),
    );
    let (ed, eb) = (
        covariant_shear(xy, 1., 0., 1),
        covariant_shear(xy, -1., 0., 1),
    );
    let er: Vector = std::array::from_fn(|k| 0.5 * (1. + s) * ea[k] + 0.5 * (1. - s) * ec[k]);
    let es: Vector = std::array::from_fn(|k| 0.5 * (1. + r) * ed[k] + 0.5 * (1. - r) * eb[k]);
    let (j, det) = jacobian(xy, r, s);
    let inv = inverse(&j, det);
    [
        std::array::from_fn(|k| inv[0][0] * er[k] + inv[0][1] * es[k]),
        std::array::from_fn(|k| inv[1][0] * er[k] + inv[1][1] * es[k]),
    ]
}

fn plane_matrix(nu: f64) -> [[f64; 3]; 3] {
    [[1., nu, 0.], [nu, 1., 0.], [0., 0., (1. - nu) / 2.]]
}

fn add_btdb<const N: usize>(k: &mut Matrix, b: &[Vector; N], d: &[[f64; N]; N], scale: f64) {
    for p in 0..N {
        for q in 0..N {
            let c = d[p][q] * scale;
            if c == 0. {
                continue;
            }
            for x in 0..DOFS {
                if b[p][x] == 0. {
                    continue;
                }
                for y in 0..DOFS {
                    k[x][y] += b[p][x] * c * b[q][y];
                }
            }
        }
    }
}

fn gauss_points() -> [[f64; 2]; 4] {
    [
        [-GAUSS, -GAUSS],
        [GAUSS, -GAUSS],
        [GAUSS, GAUSS],
        [-GAUSS, GAUSS],
    ]
}

/// Element stiffness in global XY axes (the element is flat and horizontal).
pub fn stiffness(xy: &[[f64; 2]; 4], m: &PlateMaterial) -> Matrix {
    let mut k = [[0.; DOFS]; DOFS];
    let plane = plane_matrix(m.nu);
    let membrane: [[f64; 3]; 3] = plane.map(|row| row.map(|v| v * m.membrane_rigidity()));
    let bending: [[f64; 3]; 3] = plane.map(|row| row.map(|v| v * m.rigidity()));
    let shear = [[m.shear_rigidity(), 0.], [0., m.shear_rigidity()]];
    for [r, s] in gauss_points() {
        let (dn, det) = cartesian(xy, r, s);
        add_btdb(&mut k, &membrane_b(&dn), &membrane, det);
        add_btdb(&mut k, &bending_b(&dn), &bending, det);
        add_btdb(&mut k, &shear_b(xy, r, s), &shear, det);
    }
    // BᵀDB is symmetric; make the rounded sum exactly so for the LDLᵀ factor.
    for x in 0..DOFS {
        for y in x + 1..DOFS {
            let v = 0.5 * (k[x][y] + k[y][x]);
            k[x][y] = v;
            k[y][x] = v;
        }
    }
    k
}

/// Consistent nodal load of a uniform pressure q (> 0 downward).
pub fn pressure_load(xy: &[[f64; 2]; 4], q: f64) -> Vector {
    let mut f = [0.; DOFS];
    for [r, s] in gauss_points() {
        let (_, det) = jacobian(xy, r, s);
        let n = shape(r, s);
        for i in 0..4 {
            f[dof(i, W)] -= q * n[i] * det;
        }
    }
    f
}

/// Element area.
pub fn area(xy: &[[f64; 2]; 4]) -> f64 {
    gauss_points()
        .iter()
        .map(|&[r, s]| jacobian(xy, r, s).1)
        .sum()
}

/// Actions at natural point (r, s) from the element displacements.
pub fn actions(xy: &[[f64; 2]; 4], m: &PlateMaterial, d: &Vector, r: f64, s: f64) -> Actions {
    let (dn, _) = cartesian(xy, r, s);
    let apply = |b: &Vector| -> f64 { b.iter().zip(d).map(|(x, y)| x * y).sum() };
    let [ex, ey, gxy] = membrane_b(&dn).map(|b| apply(&b));
    let [kx, ky, kxy] = bending_b(&dn).map(|b| apply(&b));
    let [gx, gy] = shear_b(xy, r, s).map(|b| apply(&b));
    let (a, dd, nu) = (m.membrane_rigidity(), m.rigidity(), m.nu);
    Actions {
        nx: a * (ex + nu * ey),
        ny: a * (ey + nu * ex),
        nxy: a * (1. - nu) / 2. * gxy,
        mx: -dd * (kx + nu * ky),
        my: -dd * (ky + nu * kx),
        mxy: -dd * (1. - nu) / 2. * kxy,
        qx: m.shear_rigidity() * gx,
        qy: m.shear_rigidity() * gy,
    }
}
