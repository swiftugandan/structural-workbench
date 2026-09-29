//! Element mass matrices (dynamics-v1, `docs/formulations/modal.md`): the
//! kinetic-energy quadratic forms of rigid motions are exact integrals.
use workbench_frame::{Matrix, consistent_mass, lumped_mass};

const L: f64 = 3.7;
const MU: f64 = 42.24;
const MU_POLAR: f64 = 0.703;

fn form(m: &Matrix, d: &[f64; 12]) -> f64 {
    (0..12)
        .map(|i| (0..12).map(|j| d[i] * m[i][j] * d[j]).sum::<f64>())
        .sum()
}

fn close(a: f64, b: f64) {
    assert!((a - b).abs() <= 1e-12 * b.abs().max(1.), "{a} vs {b}");
}

#[test]
fn both_matrices_are_symmetric() {
    for m in [consistent_mass(L, MU, MU_POLAR), lumped_mass(L, MU)] {
        for i in 0..12 {
            for j in 0..12 {
                assert_eq!(m[i][j], m[j][i], "{i} {j}");
            }
        }
    }
}

#[test]
fn a_rigid_translation_carries_the_whole_member_mass_in_every_direction() {
    for m in [consistent_mass(L, MU, MU_POLAR), lumped_mass(L, MU)] {
        for a in 0..3 {
            let mut d = [0.; 12];
            d[a] = 1.;
            d[a + 6] = 1.;
            close(form(&m, &d), MU * L);
        }
    }
}

#[test]
fn a_rigid_twist_carries_the_polar_mass_only_in_the_consistent_matrix() {
    let mut d = [0.; 12];
    d[3] = 1.;
    d[9] = 1.;
    close(form(&consistent_mass(L, MU, MU_POLAR), &d), MU_POLAR * L);
    assert_eq!(form(&lumped_mass(L, MU), &d), 0.);
}

#[test]
fn a_rigid_rotation_about_the_midpoint_is_exact_in_both_bending_planes() {
    // v = θ(x − L/2), rz = θ; w = −θ(x − L/2), ry = θ (w′ = −ry).
    // ∫ μ v² dx = μ θ² L³ / 12 exactly: the cubic interpolation holds it.
    let theta = 0.013;
    let exact = MU * theta * theta * L.powi(3) / 12.;
    let mut v = [0.; 12];
    v[1] = -theta * L / 2.;
    v[5] = theta;
    v[7] = theta * L / 2.;
    v[11] = theta;
    close(form(&consistent_mass(L, MU, 0.), &v), exact);
    let mut w = [0.; 12];
    w[2] = theta * L / 2.;
    w[4] = theta;
    w[8] = -theta * L / 2.;
    w[10] = theta;
    close(form(&consistent_mass(L, MU, 0.), &w), exact);
    // Lumped mass sees only the end translations: μL/2 · 2 · (θL/2)².
    close(
        form(&lumped_mass(L, MU), &v),
        MU * L * theta * theta * L * L / 4.,
    );
}
