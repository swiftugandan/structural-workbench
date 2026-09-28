use sprs::{CsMat, TriMat};
use workbench_model::{Result, err};
pub struct Solution {
    pub values: Vec<f64>,
    pub residual: f64,
    pub min_pivot: f64,
    pub nnz: usize,
    pub factor_nnz_estimate: usize,
}
pub trait LinearSolver {
    fn solve(&self, a: &CsMat<f64>, b: &[f64], budget: usize) -> Result<Solution>;
}

/// Conservative bytes for a sparse LDL attempt: matrix + estimated factor fill,
/// never pretending a building frame is dense. Dense n² remains a hard ceiling.
fn sparse_budget_bytes(n: usize, nnz: usize) -> Option<usize> {
    let dense_triangle = n.checked_mul(n.saturating_add(1) / 2)?;
    // 3D framed grids typically fill far less than dense; 48× nnz is a cautious multiplier.
    let factor = nnz.checked_mul(48)?.min(dense_triangle);
    let entries = nnz.checked_add(factor)?;
    entries
        .checked_mul(16)?
        .checked_add(n.checked_mul(64)?)
}
pub struct SparseLdl;
impl LinearSolver for SparseLdl {
    fn solve(&self, a: &CsMat<f64>, b: &[f64], budget: usize) -> Result<Solution> {
        let n = b.len();
        if n == 0 {
            return Ok(Solution {
                values: vec![],
                residual: 0.,
                min_pivot: 1.,
                nnz: 0,
                factor_nnz_estimate: 0,
            });
        }
        let factor_nnz_estimate = a
            .nnz()
            .saturating_mul(48)
            .min(n.saturating_mul(n.saturating_add(1) / 2));
        let estimate = sparse_budget_bytes(n, a.nnz()).unwrap_or(usize::MAX);
        if estimate > budget {
            return Err(err(
                "MEMORY_LIMIT",
                "Conservative sparse fill estimate exceeds memory budget",
            ));
        }
        let mut scale = vec![0.; n];
        for i in 0..n {
            let d = *a.get(i, i).unwrap_or(&0.);
            if d <= 0. || !d.is_finite() {
                return Err(err(
                    "UNSTABLE_MODEL",
                    format!("Unrestrained active DOF {i}"),
                ));
            }
            scale[i] = 1. / d.sqrt();
        }
        let mut tri = TriMat::new((n, n));
        for (col, vec) in a.outer_iterator().enumerate() {
            for (row, v) in vec.iter() {
                tri.add_triplet(row, col, v * (scale[row] * scale[col]));
            }
        }
        let scaled = tri.to_csc();
        let f: Vec<_> = b.iter().zip(&scale).map(|(v, s)| v * s).collect();
        // sprs-ldl's fill-reducing ordering asserts n > 1, so a single active
        // DOF is factorised directly: the scaled 1×1 matrix is its own D.
        let (y, min) = if n == 1 {
            let d = *scaled.get(0, 0).unwrap_or(&0.);
            (vec![f[0] / d], d)
        } else {
            let factor = sprs_ldl::Ldl::new().numeric(scaled.view()).map_err(|e| {
                err(
                    "UNSTABLE_MODEL",
                    format!("Sparse factorisation failed: {e:?}"),
                )
            })?;
            let min = factor.d().iter().copied().fold(f64::INFINITY, f64::min);
            (factor.solve(&f), min)
        };
        if min < 1e-12 || !min.is_finite() {
            return Err(err(
                "UNSTABLE_MODEL",
                format!(
                    "Nonpositive or near-zero scaled pivot {min:e}; check supports and connectivity"
                ),
            ));
        }
        let mut residual = f.iter().map(|v| -v).collect::<Vec<_>>();
        let mut rows = vec![0.; n];
        for (col, vec) in scaled.outer_iterator().enumerate() {
            for (row, v) in vec.iter() {
                residual[row] += v * y[col];
                rows[row] += v.abs();
            }
        }
        let inf = |v: &[f64]| v.iter().map(|x| x.abs()).fold(0., f64::max);
        let den = inf(&rows) * inf(&y) + inf(&f);
        let eta = if den == 0. { 0. } else { inf(&residual) / den };
        if !eta.is_finite() || eta > 1e-8 {
            return Err(err("RESIDUAL_FAILURE", format!("Scaled residual {eta:e}")));
        }
        let values: Vec<_> = y.iter().zip(scale).map(|(v, s)| v * s).collect();
        workbench_model::finite(&values)?;
        Ok(Solution {
            values,
            residual: eta,
            min_pivot: min,
            nnz: a.nnz(),
            factor_nnz_estimate,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn matrix(n: usize, entries: &[(usize, usize, f64)]) -> CsMat<f64> {
        let mut t = TriMat::new((n, n));
        for &(r, c, v) in entries {
            t.add_triplet(r, c, v);
        }
        t.to_csc()
    }

    #[test]
    fn single_active_dof_solves_without_the_sparse_ordering() {
        // k = 4e6, f = -2e3  →  u = -5e-4 exactly representable path.
        let s = SparseLdl.solve(&matrix(1, &[(0, 0, 4e6)]), &[-2e3], usize::MAX).unwrap();
        assert!((s.values[0] - -5e-4).abs() <= 1e-18, "{}", s.values[0]);
        assert!(s.residual <= 1e-15);
        assert!((s.min_pivot - 1.).abs() <= 1e-15);
        // The same safety checks still apply to one DOF.
        assert!(SparseLdl.solve(&matrix(1, &[(0, 0, 0.)]), &[1.], usize::MAX).is_err());
    }

    #[test]
    fn two_dof_path_is_unchanged() {
        // [[2, -1], [-1, 2]] u = [1, 0]  →  u = [2/3, 1/3].
        let a = matrix(2, &[(0, 0, 2.), (0, 1, -1.), (1, 0, -1.), (1, 1, 2.)]);
        let s = SparseLdl.solve(&a, &[1., 0.], usize::MAX).unwrap();
        assert!((s.values[0] - 2. / 3.).abs() <= 1e-15 && (s.values[1] - 1. / 3.).abs() <= 1e-15);
    }
    #[test]
    fn sparse_budget_allows_framed_scale_but_rejects_near_dense() {
        // ~27k free DOFs with a few hundred thousand matrix entries stays under 512 MiB / 2.
        let budget = 512usize * 1024 * 1024 / 2;
        assert!(sparse_budget_bytes(27_000, 330_000).unwrap() < budget);
        // Near-dense pathological fill still exceeds the same budget.
        assert!(sparse_budget_bytes(8_000, 8_000 * 4_000).unwrap() > budget);
    }
}
