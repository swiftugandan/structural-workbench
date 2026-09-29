//! Sparse complex-symmetric LDLᵀ (no conjugation) for Z = Σ cₖ Aₖ with real
//! symmetric Aₖ and complex coefficients cₖ (response-v1, ADR 0023).
//!
//! The union pattern of the terms is ordered once by reverse Cuthill–McKee;
//! the elimination tree and column counts are computed once (up-looking LDL,
//! after Davis); each `factor` call is one numeric factorisation. No pivoting
//! is performed: a complex-symmetric matrix whose imaginary part is positive
//! definite has nonsingular leading principal submatrices (xᴴZx has a
//! positive imaginary part), so the factorisation cannot break down. A zero
//! pivot therefore means the real stiffness itself is singular.

use sprs::{CsMat, TriMat};
use workbench_model::{Result, err};

/// A complex number in Cartesian form.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct C64 {
    pub re: f64,
    pub im: f64,
}

impl C64 {
    pub const ZERO: C64 = C64 { re: 0., im: 0. };
    pub fn new(re: f64, im: f64) -> Self {
        Self { re, im }
    }
    pub fn real(re: f64) -> Self {
        Self { re, im: 0. }
    }
    pub fn abs(self) -> f64 {
        self.re.hypot(self.im)
    }
    pub fn scale(self, s: f64) -> Self {
        Self::new(self.re * s, self.im * s)
    }
    pub fn is_finite(self) -> bool {
        self.re.is_finite() && self.im.is_finite()
    }
}

impl std::ops::Add for C64 {
    type Output = C64;
    fn add(self, o: C64) -> C64 {
        C64::new(self.re + o.re, self.im + o.im)
    }
}
impl std::ops::Sub for C64 {
    type Output = C64;
    fn sub(self, o: C64) -> C64 {
        C64::new(self.re - o.re, self.im - o.im)
    }
}
impl std::ops::Mul for C64 {
    type Output = C64;
    fn mul(self, o: C64) -> C64 {
        C64::new(
            self.re * o.re - self.im * o.im,
            self.re * o.im + self.im * o.re,
        )
    }
}
impl std::ops::Div for C64 {
    type Output = C64;
    fn div(self, o: C64) -> C64 {
        // Smith's algorithm: no overflow for large components.
        if o.re.abs() >= o.im.abs() {
            let r = o.im / o.re;
            let d = o.re + o.im * r;
            C64::new((self.re + self.im * r) / d, (self.im - self.re * r) / d)
        } else {
            let r = o.re / o.im;
            let d = o.re * r + o.im;
            C64::new((self.re * r + self.im) / d, (self.im * r - self.re) / d)
        }
    }
}
impl std::ops::Neg for C64 {
    type Output = C64;
    fn neg(self) -> C64 {
        C64::new(-self.re, -self.im)
    }
}
impl std::ops::AddAssign for C64 {
    fn add_assign(&mut self, o: C64) {
        self.re += o.re;
        self.im += o.im;
    }
}
impl std::ops::SubAssign for C64 {
    fn sub_assign(&mut self, o: C64) {
        self.re -= o.re;
        self.im -= o.im;
    }
}

/// The symbolic analysis of Σ cₖ Aₖ: ordering, permuted upper pattern with
/// every term's values on it, elimination tree and column pointers of L.
pub struct ComplexPencil {
    n: usize,
    /// perm[new] = old.
    perm: Vec<usize>,
    /// Permuted upper triangle (row ≤ column), column-compressed.
    up: Vec<usize>,
    ui: Vec<usize>,
    /// Per term, the value at each upper entry.
    terms: Vec<Vec<f64>>,
    /// Full (unpermuted) terms for residuals.
    full: Vec<CsMat<f64>>,
    parent: Vec<Option<usize>>,
    lp: Vec<usize>,
}

/// One numeric factorisation Z = P Dₛ⁻¹ L D Lᵀ Dₛ⁻¹ Pᵀ (Dₛ a real diagonal
/// scaling).
pub struct ComplexFactor<'a> {
    pencil: &'a ComplexPencil,
    coefficients: Vec<C64>,
    scale: Vec<f64>,
    li: Vec<usize>,
    lx: Vec<C64>,
    d: Vec<C64>,
    /// Smallest |pivot| of the scaled matrix.
    pub min_pivot: f64,
}

impl ComplexPencil {
    /// Symbolic analysis of the union pattern of `terms` (square, symmetric,
    /// same order). `budget` bounds the factor's memory in bytes.
    pub fn new(terms: &[&CsMat<f64>], budget: usize) -> Result<Self> {
        let n = terms.first().map_or(0, |a| a.rows());
        if terms.iter().any(|a| a.rows() != n || a.cols() != n) {
            return Err(err("INTERNAL", "Pencil terms differ in order"));
        }
        // Union pattern (structure only) for the ordering.
        let mut t = TriMat::new((n, n));
        for a in terms {
            for (col, v) in a.outer_iterator().enumerate() {
                for (row, _) in v.iter() {
                    t.add_triplet(row, col, 1.);
                }
            }
        }
        for i in 0..n {
            t.add_triplet(i, i, 1.);
        }
        let pattern: CsMat<f64> = t.to_csc();
        let (perm, inv) = if n > 1 {
            let o = sprs::linalg::reverse_cuthill_mckee(pattern.view());
            (o.perm.vec(), o.perm.inv_vec())
        } else {
            ((0..n).collect(), (0..n).collect())
        };
        // Permuted upper pattern: new column j holds rows inv[old row] ≤ j.
        let mut cols: Vec<Vec<usize>> = vec![vec![]; n];
        for (old_col, v) in pattern.outer_iterator().enumerate() {
            let j = inv[old_col];
            for (old_row, _) in v.iter() {
                let i = inv[old_row];
                if i <= j {
                    cols[j].push(i);
                }
            }
        }
        let mut up = vec![0];
        let mut ui = vec![];
        for c in &mut cols {
            c.sort_unstable();
            ui.extend_from_slice(c);
            up.push(ui.len());
        }
        let position = |i: usize, j: usize| -> usize {
            up[j] + ui[up[j]..up[j + 1]].binary_search(&i).unwrap()
        };
        let values: Vec<Vec<f64>> = terms
            .iter()
            .map(|a| {
                let mut v = vec![0.; ui.len()];
                for (old_col, col) in a.outer_iterator().enumerate() {
                    let j = inv[old_col];
                    for (old_row, x) in col.iter() {
                        let i = inv[old_row];
                        if i <= j {
                            v[position(i, j)] += *x;
                        }
                    }
                }
                v
            })
            .collect();
        // Elimination tree and column counts (Davis, ldl_symbolic).
        let mut parent = vec![None; n];
        let mut flag = vec![usize::MAX; n];
        let mut lnz = vec![0usize; n];
        for k in 0..n {
            flag[k] = k;
            for &row in &ui[up[k]..up[k + 1]] {
                let mut i = row;
                if i >= k {
                    continue;
                }
                while flag[i] != k {
                    if parent[i].is_none() {
                        parent[i] = Some(k);
                    }
                    lnz[i] += 1;
                    flag[i] = k;
                    i = parent[i].unwrap();
                }
            }
        }
        let mut lp = vec![0; n + 1];
        for k in 0..n {
            lp[k + 1] = lp[k] + lnz[k];
        }
        let bytes = lp[n]
            .saturating_mul(std::mem::size_of::<usize>() + std::mem::size_of::<C64>())
            .saturating_add(n.saturating_mul(64));
        if bytes > budget {
            return Err(err(
                "MEMORY_LIMIT",
                format!(
                    "The complex factor needs {} MiB, over the memory budget",
                    bytes >> 20
                ),
            ));
        }
        Ok(Self {
            n,
            perm,
            up,
            ui,
            terms: values,
            full: terms.iter().map(|a| (*a).clone()).collect(),
            parent,
            lp,
        })
    }

    pub fn order(&self) -> usize {
        self.n
    }

    /// Entries of L below the diagonal.
    pub fn factor_nnz(&self) -> usize {
        self.lp[self.n]
    }

    /// Numeric factorisation of Σ cₖ Aₖ (Davis, ldl_numeric).
    pub fn factor(&self, coefficients: &[C64]) -> Result<ComplexFactor<'_>> {
        if coefficients.len() != self.terms.len() {
            return Err(err("INTERNAL", "One coefficient per pencil term"));
        }
        let n = self.n;
        let value = |p: usize| -> C64 {
            let mut z = C64::ZERO;
            for (c, v) in coefficients.iter().zip(&self.terms) {
                if v[p] != 0. {
                    z += c.scale(v[p]);
                }
            }
            z
        };
        // Real diagonal scaling by |Z_jj|^{-1/2}.
        let mut scale = vec![1.; n];
        for j in 0..n {
            let diag = self.up[j + 1] - 1;
            let z = if self.ui[diag] == j {
                value(diag).abs()
            } else {
                0.
            };
            if !(z > 0. && z.is_finite()) {
                return Err(err(
                    "UNSTABLE_MODEL",
                    format!("Zero or nonfinite diagonal at active DOF {}", self.perm[j]),
                ));
            }
            scale[j] = 1. / z.sqrt();
        }
        let mut li = vec![0usize; self.lp[n]];
        let mut lx = vec![C64::ZERO; self.lp[n]];
        let mut d = vec![C64::ZERO; n];
        let mut y = vec![C64::ZERO; n];
        let mut pattern = vec![0usize; n];
        let mut flag = vec![usize::MAX; n];
        let mut lnz = vec![0usize; n];
        let mut min_pivot = f64::INFINITY;
        for k in 0..n {
            let mut top = n;
            flag[k] = k;
            for p in self.up[k]..self.up[k + 1] {
                let mut i = self.ui[p];
                y[i] += value(p).scale(scale[i] * scale[k]);
                let mut len = 0;
                while flag[i] != k {
                    pattern[len] = i;
                    len += 1;
                    flag[i] = k;
                    match self.parent[i] {
                        Some(next) => i = next,
                        None => break,
                    }
                }
                while len > 0 {
                    top -= 1;
                    len -= 1;
                    pattern[top] = pattern[len];
                }
            }
            d[k] = y[k];
            y[k] = C64::ZERO;
            while top < n {
                let i = pattern[top];
                top += 1;
                let yi = y[i];
                y[i] = C64::ZERO;
                let end = self.lp[i] + lnz[i];
                for p in self.lp[i]..end {
                    let r = li[p];
                    y[r] -= lx[p] * yi;
                }
                let l_ki = yi / d[i];
                d[k] -= l_ki * yi;
                li[end] = k;
                lx[end] = l_ki;
                lnz[i] += 1;
            }
            let pivot = d[k].abs();
            if !(pivot > 0. && d[k].is_finite()) {
                return Err(err(
                    "UNSTABLE_MODEL",
                    format!(
                        "Zero pivot at active DOF {}: the stiffness is singular",
                        self.perm[k]
                    ),
                ));
            }
            min_pivot = min_pivot.min(pivot);
        }
        Ok(ComplexFactor {
            pencil: self,
            coefficients: coefficients.to_vec(),
            scale,
            li,
            lx,
            d,
            min_pivot,
        })
    }
}

impl ComplexFactor<'_> {
    /// Z x.
    pub fn apply(&self, x: &[C64]) -> Vec<C64> {
        let mut out = vec![C64::ZERO; x.len()];
        for (c, a) in self.coefficients.iter().zip(&self.pencil.full) {
            for (col, v) in a.outer_iterator().enumerate() {
                let xc = x[col];
                if xc == C64::ZERO {
                    continue;
                }
                let cx = *c * xc;
                for (row, value) in v.iter() {
                    out[row] += cx.scale(*value);
                }
            }
        }
        out
    }

    /// Solve Z x = b; returns x and the scaled residual ‖Zx − b‖∞ / ‖b‖∞.
    pub fn solve(&self, b: &[C64]) -> (Vec<C64>, f64) {
        let p = self.pencil;
        let n = p.n;
        let mut x: Vec<C64> = (0..n).map(|j| b[p.perm[j]].scale(self.scale[j])).collect();
        for j in 0..n {
            let xj = x[j];
            for q in p.lp[j]..p.lp[j + 1] {
                x[self.li[q]] -= self.lx[q] * xj;
            }
        }
        for j in 0..n {
            x[j] = x[j] / self.d[j];
        }
        for j in (0..n).rev() {
            let mut s = x[j];
            for q in p.lp[j]..p.lp[j + 1] {
                s -= self.lx[q] * x[self.li[q]];
            }
            x[j] = s;
        }
        let mut out = vec![C64::ZERO; n];
        for j in 0..n {
            out[p.perm[j]] = x[j].scale(self.scale[j]);
        }
        let r = self.apply(&out);
        let norm = b.iter().map(|v| v.abs()).fold(0., f64::max);
        let res = r
            .iter()
            .zip(b)
            .map(|(a, c)| (*a - *c).abs())
            .fold(0., f64::max);
        (out, if norm > 0. { res / norm } else { res })
    }
}
