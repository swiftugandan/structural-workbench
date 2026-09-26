use workbench_assembly::analyse;
use workbench_model::residential_reference;
#[test]
fn residential_load_path_balances_independent_quantity_takeoff() {
    let p = residential_reference().unwrap();
    // Independent dimensional take-off, not a sum of the generated load records.
    let q =
        (144. + 3. * 132.) * 2000. + 132. * 750. + 8. * 1.2 * 2.4 * 3000. + 4. * 1.2 * 1.2 * 3000.;
    let volume = 12. * 13. * 0.4 * 0.4
        + 5. * (3. * 12. + 4. * 12.) * 0.3 * 0.6
        + 4. * 16. * 0.3 * 0.6
        + 112. * 6. * 0.2
        + 8. * 2.4_f64.hypot(1.5) * 1.2 * 0.2
        + 4. * 1.2 * 1.2 * 0.2
        + 8. * 1.2 * 2.4 * (1.5 / 9.) / 2.;
    let g =
        volume * 2500. * 9.80665 + 672. * 2000. + 8. * 1.2 * 2.4 * 1000. + 4. * 1.2 * 1.2 * 1000.;
    for (case, expected, axis) in [
        ("G", g, 2),
        ("Q", q, 2),
        ("SLS", g + q, 2),
        ("ULS", 1.35 * g + 1.5 * q, 2),
        ("WX", -72000., 0),
        ("WY", -72000., 1),
    ] {
        let r = analyse(&p, case).unwrap();
        assert!(r.converged);
        let sum: f64 = r.reactions.chunks(6).map(|v| v[axis]).sum();
        assert!(
            (sum - expected).abs() < expected.abs() * 1e-8,
            "{case}: {sum} versus {expected}"
        );
        assert_eq!(r.numerical_checks["forcePass"], true);
        assert_eq!(r.numerical_checks["momentPass"], true);
    }
    let mut changed = p.clone();
    changed.materials[0].e *= 0.5;
    let a = analyse(&p, "Q").unwrap();
    let b = analyse(&changed, "Q").unwrap();
    assert_ne!(a.model_hash, b.model_hash);
    for (a, b) in a.node_displacements.iter().zip(b.node_displacements.iter()) {
        assert!((b - 2. * a).abs() < 1e-10);
    }
}
