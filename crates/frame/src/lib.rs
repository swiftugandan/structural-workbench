use workbench_model::{Material, Section};
pub type Matrix = [[f64; 12]; 12];
pub fn stiffness(l: f64, m: &Material, s: &Section) -> Matrix {
    let mut k = [[0.; 12]; 12];
    for (a, b, v) in [
        (0, 6, m.e * s.a / l),
        (3, 9, m.e / (2. * (1. + m.nu)) * s.j / l),
    ] {
        k[a][a] = v;
        k[b][b] = v;
        k[a][b] = -v;
        k[b][a] = -v;
    }
    let b = [
        [12., 6. * l, -12., 6. * l],
        [6. * l, 4. * l * l, -6. * l, 2. * l * l],
        [-12., -6. * l, 12., -6. * l],
        [6. * l, 2. * l * l, -6. * l, 4. * l * l],
    ];
    for (ids, inertia, signs) in [
        ([1, 5, 7, 11], s.iz, [1., 1., 1., 1.]),
        ([2, 4, 8, 10], s.iy, [1., -1., 1., -1.]),
    ] {
        for i in 0..4 {
            for j in 0..4 {
                k[ids[i]][ids[j]] = m.e * inertia / l.powi(3) * b[i][j] * signs[i] * signs[j];
            }
        }
    }
    k
}
pub fn transform(k: &Matrix, r: [[f64; 3]; 3]) -> Matrix {
    let mut g = [[0.; 12]; 12];
    for i in 0..12 {
        for j in i..12 {
            for a in 0..3 {
                for b in 0..3 {
                    g[i][j] += r[a][i % 3] * k[i / 3 * 3 + a][j / 3 * 3 + b] * r[b][j % 3];
                }
            }
            g[j][i] = g[i][j];
        }
    }
    g
}
pub fn uniform(l: f64, q: [f64; 3]) -> [f64; 12] {
    let mut f = [0.; 12];
    for a in 0..3 {
        f[a] = q[a] * l / 2.;
        f[a + 6] = f[a];
    }
    f[5] = q[1] * l * l / 12.;
    f[11] = -f[5];
    f[4] = -q[2] * l * l / 12.;
    f[10] = -f[4];
    f
}
pub fn mul(k: &Matrix, d: &[f64; 12]) -> [f64; 12] {
    std::array::from_fn(|i| (0..12).map(|j| k[i][j] * d[j]).sum())
}
