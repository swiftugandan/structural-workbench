use workbench_frame::{geometric, mul, stiffness, transform};
use workbench_model::{Material, Section};

fn data() -> (Material, Section) {
    (
        Material {
            id: "m".into(),
            name: "test".into(),
            e: 210e9,
            nu: 0.3,
            density: 0.,
        },
        Section {
            id: "s".into(),
            name: "test".into(),
            a: 5.381e-3,
            iy: 6.038e-6,
            iz: 8.356e-5,
            j: 2.01e-7,
            cy: 0.075,
            cz: 0.15,
            provenance: "analytical".into(),
        },
    )
}

#[test]
fn symmetric_and_zero_outside_the_bending_blocks() {
    let k = geometric(4., -1e5);
    for i in 0..12 {
        for j in 0..12 {
            assert_eq!(k[i][j], k[j][i]);
            // Axial (0, 6) and torsional (3, 9) rows carry no geometric term.
            if [0, 3, 6, 9].contains(&i) {
                assert_eq!(k[i][j], 0., "row {i} col {j}");
            }
        }
    }
}

#[test]
fn rigid_translation_is_force_free() {
    let k = geometric(3., 2.5e5);
    for axis in 0..3 {
        let mut d = [0.; 12];
        d[axis] = 1.;
        d[axis + 6] = 1.;
        assert!(mul(&k, &d).iter().all(|f| f.abs() < 1e-9), "axis {axis}");
    }
}

#[test]
fn rigid_chord_rotation_gives_the_p_delta_couple() {
    // A chord slope s gives end shears -N s at i and +N s at j and no end
    // moments: the couple N * (L s) of the axial force about the chord.
    let (l, n, theta) = (3., -4e5, 1e-3);
    let k = geometric(l, n);
    // About local z: v = theta x, rz = theta; slope of v is +theta.
    let mut d = [0.; 12];
    (d[5], d[11], d[7]) = (theta, theta, l * theta);
    let f = mul(&k, &d);
    assert!(
        (f[1] + n * theta).abs() < 1e-9 && (f[7] - n * theta).abs() < 1e-9,
        "{f:?}"
    );
    assert!(f[5].abs() < 1e-9 && f[11].abs() < 1e-9);
    // About local y: w = -theta x, ry = theta; slope of w is -theta.
    let mut d = [0.; 12];
    (d[4], d[10], d[8]) = (theta, theta, -l * theta);
    let f = mul(&k, &d);
    assert!(
        (f[2] - n * theta).abs() < 1e-9 && (f[8] + n * theta).abs() < 1e-9,
        "{f:?}"
    );
    assert!(f[4].abs() < 1e-9 && f[10].abs() < 1e-9);
}

#[test]
fn compression_softens_and_tension_stiffens() {
    let (m, s) = data();
    let l = 5.;
    let ke = stiffness(l, &m, &s);
    let mut d = [0.; 12];
    // Half-sine-like rotations of a pinned strut, both planes.
    (d[5], d[11], d[4], d[10]) = (1., -1., 1., -1.);
    let energy =
        |k: &[[f64; 12]; 12]| -> f64 { mul(k, &d).iter().zip(d).map(|(f, x)| f * x).sum() };
    let e0 = energy(&ke);
    let add = |n: f64| {
        let kg = geometric(l, n);
        std::array::from_fn::<_, 12, _>(|i| {
            std::array::from_fn::<_, 12, _>(|j| ke[i][j] + kg[i][j])
        })
    };
    assert!(energy(&add(-1e5)) < e0);
    assert!(energy(&add(1e5)) > e0);
}

#[test]
fn one_element_pinned_strut_buckles_at_12_ei_over_l_squared() {
    // Ends pinned (v fixed), rotations free, antisymmetric rotation mode:
    // (2EI/L) - P L/6 = 0, the +21.6 % one-element figure of stability-v1.
    let (m, s) = data();
    let l = 5.;
    let ke = stiffness(l, &m, &s);
    let p = 12. * m.e * s.iz / (l * l);
    let kg = geometric(l, -p);
    let (a, b) = (5, 11);
    let det = (ke[a][a] + kg[a][a]) * (ke[b][b] + kg[b][b]) - (ke[a][b] + kg[a][b]).powi(2);
    assert!(det.abs() < 1e-9 * ke[a][a] * ke[b][b], "det {det}");
    // The same holds in the weak plane with Iy.
    let p = 12. * m.e * s.iy / (l * l);
    let kg = geometric(l, -p);
    let (a, b) = (4, 10);
    let det = (ke[a][a] + kg[a][a]) * (ke[b][b] + kg[b][b]) - (ke[a][b] + kg[a][b]).powi(2);
    assert!(det.abs() < 1e-9 * ke[a][a] * ke[b][b], "det {det}");
}

#[test]
fn transformed_geometric_stiffness_stays_symmetric_and_rigid_translation_free() {
    let c = std::f64::consts::FRAC_1_SQRT_2;
    let r = [[c, c, 0.], [-c, c, 0.], [0., 0., 1.]];
    let g = transform(&geometric(3., -2e5), r);
    for i in 0..12 {
        for j in 0..12 {
            assert!((g[i][j] - g[j][i]).abs() < 1e-9);
        }
    }
    let mut d = [0.; 12];
    (d[0], d[6], d[1], d[7]) = (0.3, 0.3, -0.7, -0.7);
    assert!(mul(&g, &d).iter().all(|f| f.abs() < 1e-9));
}
