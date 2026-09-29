//! Elastic buckling eigenproblem (stability-v1, `docs/formulations/stability.md`).
//!
//! Finds the smallest positive λ with (K + λ K_G) φ = 0, K symmetric positive
//! definite and K_G symmetric indefinite, by block subspace iteration on
//! K⁻¹(−K_G), whose eigenvalues are μ = 1/λ. The projected problem is solved
//! rank-revealingly (K_G is often low rank), and a Sturm count of K + σK_G
//! proves no positive mode below the reported ones was missed.
//!
//! Free vibration (dynamics-v1) is the same pencil with K_G = −M: see
//! `vibration`.

use crate::{Factor, matvec};
use sprs::{CsMat, TriMat};
use workbench_model::{Result, err};

pub struct BucklingModes {
    /// Positive critical factors, ascending.
    pub factors: Vec<f64>,
    /// Free-DOF mode shapes, K-normalised, one per factor.
    pub shapes: Vec<Vec<f64>>,
    /// Negative factors found in the converged subspace, ascending in magnitude:
    /// buckling that would need the reference load reversed.
    pub negative_factors: Vec<f64>,
    /// ‖Kφ + λK_Gφ‖∞ / ‖Kφ‖∞ per reported mode.
    pub residuals: Vec<f64>,
    pub iterations: usize,
    pub block_size: usize,
    pub sturm: Option<Sturm>,
}

pub struct Sturm {
    pub sigma: f64,
    pub negative_pivots: usize,
}

const MAX_ITERATIONS: usize = 200;
const VALUE_TOL: f64 = 1e-10;
const RESIDUAL_TOL: f64 = 1e-8;

/// Cyclic Jacobi eigen-decomposition of a small dense symmetric matrix.
/// Returns eigenvalues and column eigenvectors (`vectors[i][k]` is component i
/// of vector k), unsorted.
pub fn symmetric_eigen(a: &[Vec<f64>]) -> (Vec<f64>, Vec<Vec<f64>>) {
    let n = a.len();
    let mut m = a.to_vec();
    let mut v = (0..n)
        .map(|i| {
            (0..n)
                .map(|j| if i == j { 1. } else { 0. })
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    let norm = m.iter().flatten().map(|x| x * x).sum::<f64>().sqrt();
    for _ in 0..100 {
        let off = (0..n)
            .flat_map(|i| (0..n).filter(move |&j| j != i).map(move |j| (i, j)))
            .map(|(i, j)| m[i][j] * m[i][j])
            .sum::<f64>()
            .sqrt();
        if off <= 1e-15 * norm || norm == 0. {
            break;
        }
        for p in 0..n {
            for q in p + 1..n {
                if m[p][q] == 0. {
                    continue;
                }
                let theta = (m[q][q] - m[p][p]) / (2. * m[p][q]);
                let t = theta.signum() / (theta.abs() + (theta * theta + 1.).sqrt());
                let t = if theta == 0. { 1. } else { t };
                let c = 1. / (t * t + 1.).sqrt();
                let s = t * c;
                for k in 0..n {
                    let (mkp, mkq) = (m[k][p], m[k][q]);
                    m[k][p] = c * mkp - s * mkq;
                    m[k][q] = s * mkp + c * mkq;
                }
                for k in 0..n {
                    let (mpk, mqk) = (m[p][k], m[q][k]);
                    m[p][k] = c * mpk - s * mqk;
                    m[q][k] = s * mpk + c * mqk;
                }
                for k in 0..n {
                    let (vkp, vkq) = (v[k][p], v[k][q]);
                    v[k][p] = c * vkp - s * vkq;
                    v[k][q] = s * vkp + c * vkq;
                }
            }
        }
    }
    ((0..n).map(|i| m[i][i]).collect(), v)
}

fn dot(a: &[f64], b: &[f64]) -> f64 {
    a.iter().zip(b).map(|(x, y)| x * y).sum()
}
fn inf(v: &[f64]) -> f64 {
    v.iter().map(|x| x.abs()).fold(0., f64::max)
}

/// Deterministic fill vector: a fixed linear congruential sequence.
fn fill_vector(n: usize, seed: u64) -> Vec<f64> {
    let mut s = seed
        .wrapping_mul(6364136223846793005)
        .wrapping_add(1442695040888963407);
    (0..n)
        .map(|_| {
            s = s
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            ((s >> 11) as f64 / (1u64 << 53) as f64) - 0.5
        })
        .collect()
}

/// Start block: the −K_G diagonal pattern, unit vectors at the DOFs with the
/// largest |K_G,ii| / K_ii, then fill vectors (Bathe's choice, deterministic).
fn start_block(k: &CsMat<f64>, kg: &CsMat<f64>, p: usize) -> Vec<Vec<f64>> {
    let n = k.rows();
    let diag = |a: &CsMat<f64>, i| *a.get(i, i).unwrap_or(&0.);
    let mut block = vec![(0..n).map(|i| diag(kg, i).abs()).collect::<Vec<_>>()];
    let mut ratio: Vec<(f64, usize)> = (0..n)
        .map(|i| (diag(kg, i).abs() / diag(k, i).max(f64::MIN_POSITIVE), i))
        .collect();
    ratio.sort_by(|a, b| b.0.total_cmp(&a.0).then(a.1.cmp(&b.1)));
    for &(r, i) in ratio.iter().take(p.saturating_sub(2)) {
        if r == 0. {
            break;
        }
        let mut e = vec![0.; n];
        e[i] = 1.;
        block.push(e);
    }
    let mut seed = 1;
    while block.len() < p {
        block.push(fill_vector(n, seed));
        seed += 1;
    }
    block.truncate(p);
    block
}

struct Ritz {
    /// μ = 1/λ, one per retained direction.
    mu: Vec<f64>,
    /// K-orthonormal Ritz vectors.
    vectors: Vec<Vec<f64>>,
}

/// K-orthonormal basis of span(Y) by modified Gram–Schmidt applied twice
/// ("twice is enough"), dropping directions that lose all but 1e-8 of their
/// K-norm. Returns the basis W and K W.
fn k_orthonormalize(k: &CsMat<f64>, y: &[Vec<f64>]) -> (Vec<Vec<f64>>, Vec<Vec<f64>>) {
    let mut w: Vec<Vec<f64>> = vec![];
    let mut kw: Vec<Vec<f64>> = vec![];
    for v in y {
        let mut v = v.clone();
        let original = dot(&v, &matvec(k, &v)).sqrt();
        if !(original > 0.) {
            continue;
        }
        for _ in 0..2 {
            for (wj, kwj) in w.iter().zip(&kw) {
                let c = dot(&v, kwj);
                for (vi, wi) in v.iter_mut().zip(wj) {
                    *vi -= c * wi;
                }
            }
        }
        let kv = matvec(k, &v);
        let norm = dot(&v, &kv).sqrt();
        if norm <= 1e-8 * original {
            continue;
        }
        w.push(v.iter().map(|x| x / norm).collect());
        kw.push(kv.iter().map(|x| x / norm).collect());
    }
    (w, kw)
}

/// Rayleigh–Ritz of the pencil (−K_G, K) on span(Y). The basis is
/// K-orthonormalised first, so the projected problem is a standard symmetric
/// one; rank-deficient iterates (low-rank K_G) simply give fewer directions.
fn rayleigh_ritz(k: &CsMat<f64>, kg: &CsMat<f64>, y: &[Vec<f64>]) -> Ritz {
    let (w, _) = k_orthonormalize(k, y);
    let m = w.len();
    let gw: Vec<Vec<f64>> = w.iter().map(|v| matvec(kg, v)).collect();
    let a: Vec<Vec<f64>> = (0..m)
        .map(|i| {
            (0..m)
                .map(|j| -0.5 * (dot(&w[i], &gw[j]) + dot(&w[j], &gw[i])))
                .collect()
        })
        .collect();
    let (mu, av) = symmetric_eigen(&a);
    let n = k.rows();
    let vectors = (0..m)
        .map(|c| {
            let mut v = vec![0.; n];
            for (x, wx) in w.iter().enumerate() {
                let coef = av[x][c];
                for (vi, wi) in v.iter_mut().zip(wx) {
                    *vi += coef * wi;
                }
            }
            v
        })
        .collect();
    Ritz { mu, vectors }
}

/// Smallest `q` positive critical factors of (K + λK_G)φ = 0.
///
/// `compression` states whether any element carries axial compression. Without
/// it K_G is positive semidefinite and no positive factor exists; with it, a
/// block that finds none is enlarged until it spans the whole space, so "none"
/// is only ever reported when it is proven.
pub fn buckling(
    k: &CsMat<f64>,
    kg: &CsMat<f64>,
    q: usize,
    compression: bool,
    budget: usize,
) -> Result<BucklingModes> {
    let n = k.rows();
    let factor = Factor::new(k, budget, true)?;
    let mut p = n.min((2 * q).max(q + 8));
    loop {
        let modes = iterate(k, kg, &factor, q, p)?;
        if modes.factors.is_empty() {
            if !compression || p >= n {
                return Ok(modes);
            }
            p = n.min(2 * p);
            continue;
        }
        // Sturm check just below the highest reported factor: every positive
        // λ < σ must have been reported. (A shift above λ_q would also count
        // repeats of λ_q beyond the q requested, which are not missed modes.)
        // The shifted matrix is indefinite and factored without pivoting; an
        // exact zero pivot moves the shift further below λ_q (Bathe's practice).
        let top = *modes.factors.last().unwrap();
        let mut counted = None;
        for offset in [1e-6, 1e-5, 1e-4] {
            let sigma = top * (1. - offset);
            match Factor::new(&add(k, kg, sigma), budget, false) {
                Ok(f) => {
                    counted = Some((sigma, f.negative_pivots()));
                    break;
                }
                Err(e) if e.code == "SINGULAR_SHIFT" => continue,
                Err(e) => return Err(e),
            }
        }
        let Some((sigma, sturm)) = counted else {
            return Err(err("STURM_MISMATCH", "Every Sturm shift hit a zero pivot"));
        };
        let reported = modes.factors.iter().filter(|&&f| f < sigma).count();
        if sturm == reported {
            return Ok(BucklingModes {
                sturm: Some(Sturm {
                    sigma,
                    negative_pivots: sturm,
                }),
                ..modes
            });
        }
        if p >= n {
            return Err(err(
                "STURM_MISMATCH",
                format!("{sturm} factors below {sigma:e} by Sturm count, {reported} found"),
            ));
        }
        p = n.min(2 * p);
    }
}

pub struct VibrationModes {
    /// ω² ascending (rad²/s²), one per mode with mass.
    pub omega_squared: Vec<f64>,
    /// Free-DOF shapes, M-normalised (φᵀMφ = 1).
    pub shapes: Vec<Vec<f64>>,
    /// ‖Kφ − ω²Mφ‖∞ / ‖Kφ‖∞ per mode.
    pub residuals: Vec<f64>,
    pub iterations: usize,
    pub block_size: usize,
    pub sturm: Option<Sturm>,
}

/// Smallest `q` natural frequencies of K φ = ω² M φ (dynamics-v1), K
/// positive definite and M positive semidefinite.
///
/// This is the buckling pencil with K_G = −M and λ = ω², solved by the same
/// subspace iteration and Sturm check (K − σM). Massless directions have
/// μ = 1/λ = 0 and are never reported. Shapes come back K-normalised
/// (φᵀKφ = 1, so φᵀMφ = 1/ω²) and are rescaled to φᵀMφ = 1.
pub fn vibration(k: &CsMat<f64>, m: &CsMat<f64>, q: usize, budget: usize) -> Result<VibrationModes> {
    let negated = m.map(|v| -v);
    let solved = buckling(k, &negated, q, true, budget)?;
    if !solved.negative_factors.is_empty() {
        return Err(err(
            "INVALID_MASS",
            "The mass matrix is not positive semidefinite",
        ));
    }
    let shapes = solved
        .shapes
        .iter()
        .zip(&solved.factors)
        .map(|(phi, w2)| phi.iter().map(|x| x * w2.sqrt()).collect())
        .collect();
    Ok(VibrationModes {
        omega_squared: solved.factors,
        shapes,
        residuals: solved.residuals,
        iterations: solved.iterations,
        block_size: solved.block_size,
        sturm: solved.sturm,
    })
}

fn add(a: &CsMat<f64>, b: &CsMat<f64>, s: f64) -> CsMat<f64> {
    let mut t = TriMat::new((a.rows(), a.cols()));
    for (m, f) in [(a, 1.), (b, s)] {
        for (col, vec) in m.outer_iterator().enumerate() {
            for (row, v) in vec.iter() {
                t.add_triplet(row, col, v * f);
            }
        }
    }
    t.to_csc()
}

fn iterate(
    k: &CsMat<f64>,
    kg: &CsMat<f64>,
    factor: &Factor,
    q: usize,
    p: usize,
) -> Result<BucklingModes> {
    let n = k.rows();
    let mut x = start_block(k, kg, p);
    let mut previous: Vec<f64> = vec![];
    let mut seed = 1000;
    for iteration in 1..=MAX_ITERATIONS {
        let mut y: Vec<Vec<f64>> = x
            .iter()
            .map(|v| factor.solve(&matvec(kg, v).iter().map(|g| -g).collect::<Vec<_>>()))
            .collect();
        if y.iter().all(|v| inf(v) == 0.) {
            // No axial force on any free DOF: nothing can buckle.
            return Ok(BucklingModes {
                factors: vec![],
                shapes: vec![],
                negative_factors: vec![],
                residuals: vec![],
                iterations: iteration,
                block_size: p,
                sturm: None,
            });
        }
        // Keep the block full rank: replace null iterates with fill vectors.
        for v in y.iter_mut() {
            if inf(v) == 0. {
                *v = fill_vector(n, seed);
                seed += 1;
            }
        }
        let ritz = rayleigh_ritz(k, kg, &y);
        // Order by |μ| descending: the subspace converges to the largest |μ|.
        let mut order: Vec<usize> = (0..ritz.mu.len()).collect();
        order.sort_by(|&a, &b| ritz.mu[b].abs().total_cmp(&ritz.mu[a].abs()));
        x = order.iter().map(|&i| ritz.vectors[i].clone()).collect();
        while x.len() < p {
            x.push(fill_vector(n, seed));
            seed += 1;
        }
        // Track the leading positive and negative values together, so a
        // tension-only state converges too (on negatives alone). Values below
        // 1e-12 of the largest are null directions of K_G (numerically zero,
        // with noise signs) and belong to neither set.
        let tiny = 1e-12 * ritz.mu.iter().map(|m| m.abs()).fold(0., f64::max);
        let values = |positive: bool| {
            order
                .iter()
                .map(|&i| ritz.mu[i])
                .filter(move |&m| if positive { m > tiny } else { m < -tiny })
                .take(q)
        };
        let tracked: Vec<f64> = values(true).chain(values(false)).collect();
        let converged = !tracked.is_empty()
            && tracked.len() == previous.len()
            && tracked
                .iter()
                .zip(&previous)
                .all(|(a, b)| ((a - b) / a).abs() <= VALUE_TOL);
        previous = tracked;
        if !converged {
            continue;
        }
        // Values settle about quadratically faster than vectors, so modes are
        // accepted only once their own residuals pass.
        let mut factors = vec![];
        let mut shapes = vec![];
        let mut residuals = vec![];
        let mut negative_factors = vec![];
        for &i in &order {
            let mu = ritz.mu[i];
            if mu > tiny && factors.len() < q {
                let lambda = 1. / mu;
                let phi = &ritz.vectors[i];
                let kp = matvec(k, phi);
                let gp = matvec(kg, phi);
                let r: Vec<f64> = kp.iter().zip(&gp).map(|(a, b)| a + lambda * b).collect();
                factors.push(lambda);
                shapes.push(phi.clone());
                residuals.push(inf(&r) / inf(&kp));
            } else if mu < -tiny {
                negative_factors.push(1. / mu);
            }
        }
        if !residuals.iter().all(|r| *r <= RESIDUAL_TOL) {
            continue;
        }
        negative_factors.sort_by(|a, b| a.abs().total_cmp(&b.abs()));
        return Ok(BucklingModes {
            factors,
            shapes,
            negative_factors,
            residuals,
            iterations: iteration,
            block_size: p,
            sturm: None,
        });
    }
    Err(err(
        "NONCONVERGED",
        format!("Subspace iteration did not converge in {MAX_ITERATIONS} iterations"),
    ))
}
