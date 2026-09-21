use workbench_frame::{mul, stiffness, transform};
use workbench_model::{Material, Section};
fn data() -> (Material, Section) {
    (
        Material {
            id: "m".into(),
            name: "test".into(),
            e: 200e9,
            nu: 0.25,
            density: 0.,
        },
        Section {
            id: "s".into(),
            name: "test".into(),
            a: 0.01,
            iy: 1e-5,
            iz: 2e-5,
            j: 2e-5,
            cy: 0.1,
            cz: 0.2,
            provenance: "analytical".into(),
        },
    )
}
#[test]
fn six_rigid_body_modes_and_symmetry() {
    let (m, s) = data();
    let l = 3.;
    let k = stiffness(l, &m, &s);
    for i in 0..12 {
        for j in 0..12 {
            assert_eq!(k[i][j], k[j][i])
        }
    }
    for axis in 0..6 {
        let mut d = [0.; 12];
        d[axis] = 1.;
        d[axis + 6] = 1.;
        if axis == 4 {
            d[8] = -l
        }
        if axis == 5 {
            d[7] = l
        }
        let f = mul(&k, &d);
        assert!(f.iter().all(|x| x.abs() < 1e-7), "rigid mode {axis}: {f:?}");
    }
}
#[test]
fn axial_strain_energy_and_rotated_symmetry() {
    let (m, s) = data();
    let k = stiffness(3., &m, &s);
    let mut d = [0.; 12];
    d[6] = 0.001;
    let f = mul(&k, &d);
    let energy = d.iter().zip(f).map(|(x, y)| x * y / 2.).sum::<f64>();
    assert!((energy - m.e * s.a / 6. * 0.001_f64.powi(2)).abs() < 1e-10);
    let (_, r) = workbench_geometry::axes([0., 0., 0.], [2., 3., 4.], [0., 1., 0.]);
    let kg = transform(&k, r);
    for i in 0..12 {
        for j in 0..12 {
            assert_eq!(kg[i][j], kg[j][i])
        }
    }
}
