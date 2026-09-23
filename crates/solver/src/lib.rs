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
        let factor = sprs_ldl::Ldl::new().numeric(scaled.view()).map_err(|e| {
            err(
                "UNSTABLE_MODEL",
                format!("Sparse factorisation failed: {e:?}"),
            )
        })?;
        let min = factor.d().iter().copied().fold(f64::INFINITY, f64::min);
        if min < 1e-12 || !min.is_finite() {
            return Err(err(
                "UNSTABLE_MODEL",
                format!(
                    "Nonpositive or near-zero scaled pivot {min:e}; check supports and connectivity"
                ),
            ));
        }
        let y = factor.solve(&f);
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
    #[test]
    fn sparse_budget_allows_framed_scale_but_rejects_near_dense() {
        // ~27k free DOFs with a few hundred thousand matrix entries stays under 512 MiB / 2.
        let budget = 512usize * 1024 * 1024 / 2;
        assert!(sparse_budget_bytes(27_000, 330_000).unwrap() < budget);
        // Near-dense pathological fill still exceeds the same budget.
        assert!(sparse_budget_bytes(8_000, 8_000 * 4_000).unwrap() > budget);
    }
}
