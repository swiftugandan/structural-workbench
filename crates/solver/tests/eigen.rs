use sprs::{CsMat, TriMat};
use workbench_solver::eigen::{buckling, symmetric_eigen};

const BUDGET: usize = usize::MAX;

fn csc(n: usize, entries: &[(usize, usize, f64)]) -> CsMat<f64> {
    let mut t = TriMat::new((n, n));
    for &(r, c, v) in entries {
        t.add_triplet(r, c, v);
    }
    t.to_csc()
}
fn chain(n: usize, k: f64) -> CsMat<f64> {
    let mut e = vec![];
    for i in 0..n {
        e.push((i, i, 2. * k));
        if i + 1 < n {
            e.push((i, i + 1, -k));
            e.push((i + 1, i, -k));
        }
    }
    csc(n, &e)
}
fn diagonal(values: &[f64]) -> CsMat<f64> {
    csc(
        values.len(),
        &values
            .iter()
            .enumerate()
            .map(|(i, &v)| (i, i, v))
            .collect::<Vec<_>>(),
    )
}

#[test]
fn jacobi_recovers_a_known_spectrum() {
    // [[2,1,0],[1,2,1],[0,1,2]] has eigenvalues 2 - sqrt2, 2, 2 + sqrt2.
    let a = vec![vec![2., 1., 0.], vec![1., 2., 1.], vec![0., 1., 2.]];
    let (mut v, _) = symmetric_eigen(&a);
    v.sort_by(f64::total_cmp);
    let r = 2f64.sqrt();
    for (x, y) in v.iter().zip([2. - r, 2., 2. + r]) {
        assert!((x - y).abs() < 1e-14, "{v:?}");
    }
}

#[test]
fn chain_with_uniform_compression_matches_the_closed_form() {
    // (K - λ g I) φ = 0 with K = k·tridiag(-1, 2, -1):
    // λ_j = k (2 - 2 cos(jπ/(n+1))) / g.
    let (n, k, g) = (60, 3e6, 2e3);
    let modes = buckling(&chain(n, k), &diagonal(&vec![-g; n]), 5, true, BUDGET).unwrap();
    assert_eq!(modes.factors.len(), 5);
    for (j, f) in modes.factors.iter().enumerate() {
        let exact =
            k * (2. - 2. * ((j + 1) as f64 * std::f64::consts::PI / (n + 1) as f64).cos()) / g;
        assert!((f / exact - 1.).abs() < 1e-10, "mode {j}: {f} vs {exact}");
    }
    assert!(modes.residuals.iter().all(|r| *r < 1e-8));
    // Sturm shift sits just below λ₅: exactly the four lower factors precede it.
    let sturm = modes.sturm.unwrap();
    assert!(sturm.sigma < modes.factors[4] && sturm.sigma > modes.factors[3]);
    assert_eq!(sturm.negative_pivots, 4);
    assert!(modes.negative_factors.is_empty());
}

#[test]
fn repeated_factors_are_all_found() {
    // K = I, K_G = -I: every factor is 1, a fully repeated spectrum.
    let n = 20;
    let modes = buckling(
        &diagonal(&vec![1.; n]),
        &diagonal(&vec![-1.; n]),
        4,
        true,
        BUDGET,
    );
    let modes = modes.unwrap();
    assert_eq!(modes.factors.len(), 4);
    assert!(
        modes.factors.iter().all(|f| (f - 1.).abs() < 1e-12),
        "{:?}",
        modes.factors
    );
}

#[test]
fn tension_only_has_no_positive_factor_and_reports_the_reversal() {
    let (n, k, g) = (30, 1e6, 5e2);
    let modes = buckling(&chain(n, k), &diagonal(&vec![g; n]), 3, false, BUDGET).unwrap();
    assert!(modes.factors.is_empty());
    let exact = -k * (2. - 2. * (std::f64::consts::PI / (n + 1) as f64).cos()) / g;
    assert!(
        (modes.negative_factors[0] / exact - 1.).abs() < 1e-10,
        "{:?}",
        modes.negative_factors
    );
}

#[test]
fn reversing_the_reference_load_negates_the_spectrum() {
    let (n, k, g) = (40, 2e6, 1e3);
    let fwd = buckling(&chain(n, k), &diagonal(&vec![-g; n]), 3, true, BUDGET).unwrap();
    let rev = buckling(&chain(n, k), &diagonal(&vec![g; n]), 3, false, BUDGET).unwrap();
    assert_eq!(fwd.factors.len(), 3);
    for (a, b) in fwd.factors.iter().zip(&rev.negative_factors) {
        assert!((a + b).abs() < 1e-10 * a, "{a} {b}");
    }
}

/// Dense reference: μ = eig(L⁻¹ (−K_G) L⁻ᵗ), λ = 1/μ, with K = L Lᵗ.
fn dense_reference(k: &[Vec<f64>], kg: &[Vec<f64>]) -> Vec<f64> {
    let n = k.len();
    let mut l = vec![vec![0.; n]; n];
    for i in 0..n {
        for j in 0..=i {
            let s: f64 = (0..j).map(|m| l[i][m] * l[j][m]).sum();
            l[i][j] = if i == j {
                (k[i][i] - s).sqrt()
            } else {
                (k[i][j] - s) / l[j][j]
            };
        }
    }
    let solve_lower = |b: Vec<f64>| {
        let mut x = vec![0.; n];
        for i in 0..n {
            x[i] = (b[i] - (0..i).map(|m| l[i][m] * x[m]).sum::<f64>()) / l[i][i];
        }
        x
    };
    // Columns of X = L⁻¹(−K_G); then C = L⁻¹ Xᵗ is symmetric.
    let x: Vec<Vec<f64>> = (0..n)
        .map(|c| solve_lower((0..n).map(|r| -kg[r][c]).collect()))
        .collect();
    let c: Vec<Vec<f64>> = (0..n)
        .map(|r| solve_lower((0..n).map(|col| x[col][r]).collect()))
        .collect();
    let (mu, _) = symmetric_eigen(&c);
    let mut lambda: Vec<f64> = mu.iter().filter(|m| **m > 1e-12).map(|m| 1. / m).collect();
    lambda.sort_by(f64::total_cmp);
    lambda
}

#[test]
fn low_rank_mixed_sign_geometric_stiffness_matches_a_dense_reference() {
    // Only four DOFs carry a geometric term, two compressed and two in
    // tension: the iterates are rank deficient and the spectrum mixed.
    let n = 14;
    let k = chain(n, 1e5);
    let mut g = vec![0.; n];
    (g[3], g[4], g[9], g[10]) = (-4e2, -1e2, 3e2, 2e2);
    let modes = buckling(&k, &diagonal(&g), 2, true, BUDGET).unwrap();
    let kd: Vec<Vec<f64>> = (0..n)
        .map(|i| (0..n).map(|j| *k.get(i, j).unwrap_or(&0.)).collect())
        .collect();
    let gd: Vec<Vec<f64>> = (0..n)
        .map(|i| (0..n).map(|j| if i == j { g[i] } else { 0. }).collect())
        .collect();
    let reference = dense_reference(&kd, &gd);
    assert_eq!(
        modes.factors.len(),
        2,
        "{:?} vs {reference:?}",
        modes.factors
    );
    for (a, b) in modes.factors.iter().zip(&reference) {
        assert!((a / b - 1.).abs() < 1e-10, "{a} vs {b}");
    }
    assert_eq!(modes.sturm.unwrap().negative_pivots, 1);
    assert!(!modes.negative_factors.is_empty());
}

#[test]
fn no_axial_force_means_nothing_to_report() {
    let modes = buckling(&chain(10, 1e5), &diagonal(&[0.; 10]), 3, false, BUDGET).unwrap();
    assert!(modes.factors.is_empty() && modes.negative_factors.is_empty());
}

#[test]
fn inertia_counts_negative_eigenvalues_of_an_indefinite_matrix() {
    use workbench_solver::Factor;
    // Tridiagonal 2,-1 chain shifted by 2.9: eigenvalues 2 - 2cos(jπ/(n+1)) - 2.9.
    let n = 11;
    let mut e = vec![];
    for i in 0..n {
        e.push((i, i, 2. - 2.9));
        if i + 1 < n {
            e.push((i, i + 1, -1.));
            e.push((i + 1, i, -1.));
        }
    }
    let f = Factor::new(&csc(n, &e), BUDGET, false).unwrap();
    let expected = (1..=n)
        .filter(|&j| 2. - 2. * (j as f64 * std::f64::consts::PI / (n + 1) as f64).cos() - 2.9 < 0.)
        .count();
    assert_eq!(f.negative_pivots(), expected);
    assert!(expected > 0 && expected < n);
}

#[test]
fn a_weak_compressive_mode_behind_strong_tension_modes_is_still_found() {
    // Thirty DOFs in strong tension give large negative |μ|; one DOF in weak
    // compression gives the only positive factor, far down the |μ| ordering.
    // The initial block misses it, so the solver must enlarge the block
    // rather than report that nothing buckles.
    let n = 40;
    let k = chain(n, 1e5);
    let mut g = vec![0.; n];
    for gi in g.iter_mut().take(30) {
        *gi = 5e4;
    }
    g[35] = -1e2;
    let modes = buckling(&k, &diagonal(&g), 1, true, BUDGET).unwrap();
    let kd: Vec<Vec<f64>> = (0..n)
        .map(|i| (0..n).map(|j| *k.get(i, j).unwrap_or(&0.)).collect())
        .collect();
    let gd: Vec<Vec<f64>> = (0..n)
        .map(|i| (0..n).map(|j| if i == j { g[i] } else { 0. }).collect())
        .collect();
    let reference = dense_reference(&kd, &gd);
    assert_eq!(reference.len(), 1);
    assert_eq!(modes.factors.len(), 1, "{modes:?}", modes = modes.factors);
    assert!((modes.factors[0] / reference[0] - 1.).abs() < 1e-10);
    assert!(modes.block_size > 10, "block {}", modes.block_size);
}
