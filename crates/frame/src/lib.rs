use workbench_model::{Diagnostic, Material, Release, Section, err};
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

/// Local DOF indices for My/Mz end releases (ry/rz at each end).
pub fn released_dofs(start: &Release, end: &Release) -> Vec<usize> {
    let mut out = Vec::new();
    if start.my {
        out.push(4);
    }
    if start.mz {
        out.push(5);
    }
    if end.my {
        out.push(10);
    }
    if end.mz {
        out.push(11);
    }
    out
}

fn solve_dense(a: &[Vec<f64>], b: &[f64]) -> Option<Vec<f64>> {
    let n = b.len();
    if n == 0 {
        return Some(vec![]);
    }
    let mut m: Vec<Vec<f64>> = a
        .iter()
        .enumerate()
        .map(|(i, row)| {
            let mut r = row.clone();
            r.push(b[i]);
            r
        })
        .collect();
    for col in 0..n {
        let mut pivot = col;
        for r in col + 1..n {
            if m[r][col].abs() > m[pivot][col].abs() {
                pivot = r;
            }
        }
        if m[pivot][col].abs() < 1e-14 {
            return None;
        }
        m.swap(col, pivot);
        let div = m[col][col];
        for c in col..=n {
            m[col][c] /= div;
        }
        for r in 0..n {
            if r == col {
                continue;
            }
            let f = m[r][col];
            for c in col..=n {
                m[r][c] -= f * m[col][c];
            }
        }
    }
    Some(m.into_iter().map(|row| row[n]).collect())
}

/// Static condensation of released rotational DOFs: Kc = Kaa − Kab Kbb⁻¹ Kba,
/// fc = fa − Kab Kbb⁻¹ fb. Expanded back to 12×12 with released rows/cols zero.
pub fn condense(
    k: &Matrix,
    f: &[f64; 12],
    released: &[usize],
) -> Result<(Matrix, [f64; 12]), Diagnostic> {
    if released.is_empty() {
        return Ok((*k, *f));
    }
    let retained: Vec<usize> = (0..12).filter(|i| !released.contains(i)).collect();
    let na = retained.len();
    let nb = released.len();
    let kaa: Vec<Vec<f64>> = (0..na)
        .map(|i| (0..na).map(|j| k[retained[i]][retained[j]]).collect())
        .collect();
    let kab: Vec<Vec<f64>> = (0..na)
        .map(|i| (0..nb).map(|j| k[retained[i]][released[j]]).collect())
        .collect();
    let kba: Vec<Vec<f64>> = (0..nb)
        .map(|i| (0..na).map(|j| k[released[i]][retained[j]]).collect())
        .collect();
    let kbb: Vec<Vec<f64>> = (0..nb)
        .map(|i| (0..nb).map(|j| k[released[i]][released[j]]).collect())
        .collect();
    let fa: Vec<f64> = retained.iter().map(|&i| f[i]).collect();
    let fb: Vec<f64> = released.iter().map(|&i| f[i]).collect();
    // X = Kbb^{-1} Kba  (nb × na)
    let mut x = vec![vec![0.; na]; nb];
    for j in 0..na {
        let col: Vec<f64> = (0..nb).map(|i| kba[i][j]).collect();
        let sol = solve_dense(&kbb, &col).ok_or_else(|| {
            err(
                "SINGULAR_RELEASE",
                "Released end rotational block is singular",
            )
        })?;
        for i in 0..nb {
            x[i][j] = sol[i];
        }
    }
    let y = solve_dense(&kbb, &fb).ok_or_else(|| {
        err(
            "SINGULAR_RELEASE",
            "Released end rotational block is singular",
        )
    })?;
    let mut kc = [[0.; 12]; 12];
    let mut fc = [0.; 12];
    for i in 0..na {
        for j in 0..na {
            let mut v = kaa[i][j];
            for p in 0..nb {
                v -= kab[i][p] * x[p][j];
            }
            kc[retained[i]][retained[j]] = v;
        }
        let mut v = fa[i];
        for p in 0..nb {
            v -= kab[i][p] * y[p];
        }
        fc[retained[i]] = v;
    }
    Ok((kc, fc))
}

/// Recover released local DOFs: ub = Kbb⁻¹ (fb − Kba ua).
pub fn recover_released(
    k: &Matrix,
    f: &[f64; 12],
    released: &[usize],
    d: &mut [f64; 12],
) -> Result<(), Diagnostic> {
    if released.is_empty() {
        return Ok(());
    }
    let retained: Vec<usize> = (0..12).filter(|i| !released.contains(i)).collect();
    let na = retained.len();
    let nb = released.len();
    let kba: Vec<Vec<f64>> = (0..nb)
        .map(|i| (0..na).map(|j| k[released[i]][retained[j]]).collect())
        .collect();
    let kbb: Vec<Vec<f64>> = (0..nb)
        .map(|i| (0..nb).map(|j| k[released[i]][released[j]]).collect())
        .collect();
    let fb: Vec<f64> = released.iter().map(|&i| f[i]).collect();
    let mut rhs = fb;
    for i in 0..nb {
        for j in 0..na {
            rhs[i] -= kba[i][j] * d[retained[j]];
        }
    }
    let ub = solve_dense(&kbb, &rhs).ok_or_else(|| {
        err(
            "SINGULAR_RELEASE",
            "Released end rotational block is singular",
        )
    })?;
    for (i, &dof) in released.iter().enumerate() {
        d[dof] = ub[i];
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use workbench_model::{Material, Section};

    fn mat_sec() -> (Material, Section) {
        (
            Material {
                id: "m".into(),
                name: "m".into(),
                e: 2e11,
                nu: 0.25,
                density: 7850.,
            },
            Section {
                id: "s".into(),
                name: "s".into(),
                a: 0.01,
                iy: 8e-5,
                iz: 8e-5,
                j: 2e-5,
                cy: 0.1,
                cz: 0.2,
                provenance: "test".into(),
            },
        )
    }

    #[test]
    fn condense_udl_both_my_releases_zeros_end_moments_in_fe() {
        let (mat, sec) = mat_sec();
        let l = 6.;
        let k = stiffness(l, &mat, &sec);
        let q = [0., 0., -10000.];
        let fe = uniform(l, q);
        let released = vec![4usize, 10]; // My at both ends
        let (_kc, fc) = condense(&k, &fe, &released).unwrap();
        // Condensed load vector has no My residual on released DOFs (zeroed).
        assert_eq!(fc[4], 0.);
        assert_eq!(fc[10], 0.);
        // Retained transverse loads still present.
        assert!(fc[2].abs() > 1.);
        assert!(fc[8].abs() > 1.);
    }

    #[test]
    fn condense_udl_both_mz_releases_zeros_end_moments_in_fe() {
        let (mat, sec) = mat_sec();
        let l = 6.;
        let k = stiffness(l, &mat, &sec);
        let q = [0., -10000., 0.];
        let fe = uniform(l, q);
        let released = vec![5usize, 11]; // Mz at both ends
        let (_kc, fc) = condense(&k, &fe, &released).unwrap();
        assert_eq!(fc[5], 0.);
        assert_eq!(fc[11], 0.);
        assert!(fc[1].abs() > 1.);
        assert!(fc[7].abs() > 1.);
    }
}
