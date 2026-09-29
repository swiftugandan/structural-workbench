//! Sparse complex-symmetric LDLᵀ (response-v1): against dense elimination,
//! the real sparse factor, and the breakdown-free guarantee at resonance.
use sprs::{CsMat, TriMat};
use workbench_solver::complex::{C64, ComplexPencil};
use workbench_solver::{LinearSolver, SparseLdl};

/// A deterministic pseudo-random stream.
struct Lcg(u64);
impl Lcg {
    fn next(&mut self) -> f64 {
        self.0 = self
            .0
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        ((self.0 >> 11) as f64 / (1u64 << 53) as f64) * 2. - 1.
    }
}

/// A banded SPD "stiffness" and a diagonal "mass" with some zero entries.
fn stiffness_and_mass(n: usize, seed: u64) -> (CsMat<f64>, CsMat<f64>) {
    let mut rng = Lcg(seed);
    let mut k = vec![vec![0.; n]; n];
    for i in 0..n {
        for j in i + 1..(i + 4).min(n) {
            let v = rng.next();
            k[i][j] = v;
            k[j][i] = v;
        }
    }
    for i in 0..n {
        let row: f64 = k[i].iter().map(|v| v.abs()).sum();
        k[i][i] = row + 0.5 + rng.next().abs();
    }
    // A long-range coupling so the ordering matters.
    k[0][n - 1] = 0.3;
    k[n - 1][0] = 0.3;
    k[0][0] += 0.3;
    k[n - 1][n - 1] += 0.3;
    let mut tk = TriMat::new((n, n));
    let mut tm = TriMat::new((n, n));
    for i in 0..n {
        for j in 0..n {
            if k[i][j] != 0. {
                tk.add_triplet(i, j, k[i][j]);
            }
        }
        if i % 3 != 2 {
            tm.add_triplet(i, i, 1. + rng.next().abs());
        }
    }
    (tk.to_csc(), tm.to_csc())
}

fn dense(a: &CsMat<f64>) -> Vec<Vec<f64>> {
    let mut d = vec![vec![0.; a.cols()]; a.rows()];
    for (col, v) in a.outer_iterator().enumerate() {
        for (row, x) in v.iter() {
            d[row][col] += *x;
        }
    }
    d
}

/// Dense complex Gaussian elimination with partial pivoting.
fn dense_solve(mut a: Vec<Vec<C64>>, mut b: Vec<C64>) -> Vec<C64> {
    let n = b.len();
    for p in 0..n {
        let piv = (p..n)
            .max_by(|&x, &y| a[x][p].abs().total_cmp(&a[y][p].abs()))
            .unwrap();
        a.swap(p, piv);
        b.swap(p, piv);
        for r in p + 1..n {
            let f = a[r][p] / a[p][p];
            for c in p..n {
                let v = a[p][c];
                a[r][c] -= f * v;
            }
            let v = b[p];
            b[r] -= f * v;
        }
    }
    let mut x = vec![C64::ZERO; n];
    for p in (0..n).rev() {
        let mut s = b[p];
        for c in p + 1..n {
            s -= a[p][c] * x[c];
        }
        x[p] = s / a[p][p];
    }
    x
}

#[test]
fn damped_pencil_matches_dense_elimination_across_resonance() {
    let n = 40;
    let (k, m) = stiffness_and_mass(n, 7);
    let pencil = ComplexPencil::new(&[&k, &m], 1 << 30).unwrap();
    let (kd, md) = (dense(&k), dense(&m));
    let mut rng = Lcg(11);
    let b: Vec<C64> = (0..n).map(|_| C64::new(rng.next(), rng.next())).collect();
    let (a0, a1) = (0.05, 0.002);
    for omega in [0.01, 0.7, 1.0, 1.3, 2.5, 9.0] {
        // Z = (1 + iΩa1) K − (Ω² − iΩa0) M
        let ck = C64::new(1., omega * a1);
        let cm = C64::new(-omega * omega, omega * a0);
        let f = pencil.factor(&[ck, cm]).unwrap();
        let (x, residual) = f.solve(&b);
        assert!(residual <= 1e-12, "Ω = {omega}: residual {residual}");
        let z: Vec<Vec<C64>> = (0..n)
            .map(|i| {
                (0..n)
                    .map(|j| ck.scale(kd[i][j]) + cm.scale(md[i][j]))
                    .collect()
            })
            .collect();
        let want = dense_solve(z, b.clone());
        let scale = want.iter().map(|v| v.abs()).fold(0., f64::max);
        let worst = x
            .iter()
            .zip(&want)
            .map(|(a, c)| (*a - *c).abs())
            .fold(0., f64::max);
        assert!(
            worst <= 1e-11 * scale,
            "Ω = {omega}: {worst:e} of {scale:e}"
        );
    }
    assert!(pencil.factor_nnz() > 0 && pencil.order() == n);
}

#[test]
fn a_real_pencil_agrees_with_the_real_sparse_factor() {
    let n = 60;
    let (k, _) = stiffness_and_mass(n, 3);
    let pencil = ComplexPencil::new(&[&k], 1 << 30).unwrap();
    let f = pencil.factor(&[C64::real(1.)]).unwrap();
    let mut rng = Lcg(5);
    let b: Vec<f64> = (0..n).map(|_| rng.next()).collect();
    let (x, residual) = f.solve(&b.iter().map(|v| C64::real(*v)).collect::<Vec<_>>());
    let real = SparseLdl.solve(&k, &b, 1 << 30).unwrap();
    assert!(residual <= 1e-13);
    for (a, c) in x.iter().zip(&real.values) {
        assert!((a.re - c).abs() <= 1e-12 * c.abs().max(1.) && a.im == 0.);
    }
}

/// With no damping the pencil K − Ω²M at an eigenvalue is singular. With a
/// stiffness-proportional term the imaginary part is positive definite and
/// the factorisation goes through at the same frequency.
#[test]
fn stiffness_proportional_damping_keeps_resonance_factorisable() {
    // Two DOFs: K = [[2, -1], [-1, 1]], M = I; ω² = (3 ± √5)/2.
    let mut t = TriMat::new((2, 2));
    for (i, j, v) in [(0, 0, 2.), (0, 1, -1.), (1, 0, -1.), (1, 1, 1.)] {
        t.add_triplet(i, j, v);
    }
    let k: CsMat<f64> = t.to_csc();
    let m: CsMat<f64> = CsMat::eye(2);
    let pencil = ComplexPencil::new(&[&k, &m], 1 << 20).unwrap();
    let w = ((3. - 5f64.sqrt()) / 2.).sqrt();
    let undamped = pencil.factor(&[C64::real(1.), C64::real(-w * w)]);
    // Exactly singular up to round-off: either refused or a tiny pivot.
    if let Ok(f) = &undamped {
        assert!(f.min_pivot < 1e-12, "{}", f.min_pivot);
    }
    let damped = pencil
        .factor(&[C64::new(1., w * 0.01), C64::real(-w * w)])
        .unwrap();
    let (x, residual) = damped.solve(&[C64::real(1.), C64::ZERO]);
    assert!(residual <= 1e-12 && x.iter().all(|v| v.is_finite()));
    assert!(damped.min_pivot > 1e-4);
}

#[test]
fn a_singular_stiffness_is_refused_and_the_budget_is_enforced() {
    // A free-free spring: K singular, no damping, zero frequency.
    let mut t = TriMat::new((2, 2));
    for (i, j, v) in [(0, 0, 1.), (0, 1, -1.), (1, 0, -1.), (1, 1, 1.)] {
        t.add_triplet(i, j, v);
    }
    let k: CsMat<f64> = t.to_csc();
    let pencil = ComplexPencil::new(&[&k], 1 << 20).unwrap();
    assert_eq!(
        pencil.factor(&[C64::real(1.)]).err().unwrap().code,
        "UNSTABLE_MODEL"
    );
    let (big, _) = stiffness_and_mass(200, 1);
    assert_eq!(
        ComplexPencil::new(&[&big], 100).err().unwrap().code,
        "MEMORY_LIMIT"
    );
}
