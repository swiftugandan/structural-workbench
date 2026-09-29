//! Biaxial RC column section against `fixtures/column/column-oracle.json`
//! (docs/formulations/rc-column.md, Validation).

use serde_json::Value;
use std::f64::consts::{FRAC_PI_2, PI};
use workbench_design::rc_column::{
    Column, ColumnBar, ColumnInputs, ColumnSection, Pivot, Resultants, StrainLimits, StrainPlane,
};
use workbench_design::rc_section::{self, BarLayer, ConcreteLaw, RcRectangle, SteelLaw};

fn oracle() -> Value {
    let text = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../fixtures/column/column-oracle.json"
    ))
    .unwrap();
    serde_json::from_str(&text).unwrap()
}

fn f(v: &Value, key: &str) -> f64 {
    v[key]
        .as_f64()
        .unwrap_or_else(|| panic!("{key} missing in {v}"))
}

fn column(cfg: &Value) -> Column {
    let inputs: ColumnInputs = serde_json::from_value(serde_json::json!({
        "section": cfg["section"],
        "concrete": cfg["concrete"],
        "steel": cfg["steel"],
        "limits": cfg["limits"],
    }))
    .unwrap();
    Column::new(inputs).unwrap()
}

/// (axial scale N, moment scale N m) of a configuration.
fn scales(c: &Column) -> (f64, f64) {
    let r = c.axial_range();
    let n = r.squash.abs().max(r.tension.abs());
    let s = &c.inputs().section;
    (n, n * s.width.max(s.depth))
}

fn plane(v: &Value) -> StrainPlane {
    serde_json::from_value(v.clone()).unwrap()
}

fn assert_resultants(id: &str, got: Resultants, want: &Value, tol_n: f64, tol_m: f64) {
    for (key, g, tol) in [
        ("n", got.n, tol_n),
        ("my", got.my, tol_m),
        ("mz", got.mz, tol_m),
    ] {
        let w = f(want, key);
        assert!(
            (g - w).abs() <= tol,
            "{id} {key}: {g:e} vs {w:e} (|Δ| {:e}, tol {tol:e})",
            (g - w).abs()
        );
    }
}

#[test]
fn oracle_self_checks_passed() {
    assert_eq!(oracle()["failures"], serde_json::json!([]));
}

/// Kernel against the oracle's exact reference (polygon + graded quadrature)
/// to 1e-9 of the section's axial and moment scales.
#[test]
fn resultants_match_reference_integration() {
    let o = oracle();
    let rel = f(&o["tolerance"], "exactRelative");
    let mut worst: f64 = 0.;
    for cfg in o["configs"].as_array().unwrap() {
        let c = column(cfg);
        let (sn, sm) = scales(&c);
        for p in cfg["planes"].as_array().unwrap() {
            let id = format!("{} α {} τ {}", cfg["id"], p["alphaDeg"], p["tau"]);
            let got = c.resultants(plane(&p["plane"])).unwrap();
            assert_resultants(&id, got, &p["reference"], rel * sn, rel * sm);
            let w = &p["reference"];
            worst = worst
                .max((got.n - f(w, "n")).abs() / sn)
                .max((got.my - f(w, "my")).abs() / sm)
                .max((got.mz - f(w, "mz")).abs() / sm);
        }
    }
    println!("largest |kernel − reference| / scale = {worst:.2e}");
}

/// Against the independent fibre model, within the error bound the oracle
/// derives for it: the two-grid difference for the continuous parabola, the
/// cut-cell bound where the block's stress jumps.
#[test]
fn resultants_within_fibre_error_bound() {
    let o = oracle();
    let mut worst: f64 = 0.;
    for cfg in o["configs"].as_array().unwrap() {
        let c = column(cfg);
        let (sn, sm) = scales(&c);
        for p in cfg["planes"].as_array().unwrap() {
            let Some(fib) = p.get("fibre") else { continue };
            let got = c.resultants(plane(&p["plane"])).unwrap();
            for (key, g, scale) in [("n", got.n, sn), ("my", got.my, sm), ("mz", got.mz, sm)] {
                let f8 = f(&fib["800"], key);
                let bound = f(&fib["bound800"], key) + 1e-12 * scale;
                assert!(
                    (g - f8).abs() <= bound,
                    "{} {key}: {g:e} vs fibre {f8:e}, bound {bound:e} ({})",
                    cfg["id"],
                    fib["boundMethod"]
                );
                worst = worst.max((g - f8).abs() / scale);
            }
        }
    }
    println!("largest |kernel − fibre800| / scale = {worst:.2e}");
}

#[test]
fn closed_form_endpoints() {
    let o = oracle();
    for cfg in o["configs"].as_array().unwrap() {
        let c = column(cfg);
        let (sn, sm) = scales(&c);
        let cf = &cfg["closedForm"];
        let r = c.axial_range();
        assert!(
            (r.squash - f(cf, "squash")).abs() <= 1e-12 * sn,
            "{} squash",
            cfg["id"]
        );
        assert!(
            (r.tension - f(cf, "tension")).abs() <= 1e-12 * sn,
            "{} tension",
            cfg["id"]
        );
        assert_eq!(r.tension_attained, cf["tensionAttained"].as_bool().unwrap());
        if let Some(b) = cf.get("balanced") {
            let got = c.resultants(plane(&b["plane"])).unwrap();
            assert_resultants(
                &format!("{} balanced", cfg["id"]),
                got,
                b,
                1e-9 * sn,
                1e-9 * sm,
            );
        }
    }
}

#[test]
fn capacities_match_oracle() {
    let o = oracle();
    let rel = f(&o["tolerance"], "capacityRelative");
    let (mut depth_its, mut angle_its) = (0, 0);
    let mut worst: f64 = 0.;
    for cfg in o["configs"].as_array().unwrap() {
        let c = column(cfg);
        let (_, sm) = scales(&c);
        for cap in cfg["capacities"].as_array().unwrap() {
            let (n_ed, theta) = (f(cap, "nEd"), f(cap, "thetaDeg").to_radians());
            let got = c.moment_capacity(n_ed, theta).unwrap();
            let id = format!("{} N {n_ed:e} θ {}", cfg["id"], cap["thetaDeg"]);
            let want = f(cap, "mRd");
            worst = worst.max((got.m_rd - want).abs() / want);
            assert!(
                (got.m_rd - want).abs() <= rel * want,
                "{id}: M_Rd {:e} vs {want:e}",
                got.m_rd
            );
            for (key, g) in [("my", got.my), ("mz", got.mz)] {
                assert!((g - f(cap, key)).abs() <= rel * sm, "{id} {key}");
            }
            assert!(
                got.axial_residual <= 1e-12,
                "{id} residual {}",
                got.axial_residual
            );
            assert!(
                got.direction_error <= 1e-12,
                "{id} direction {}",
                got.direction_error
            );
            depth_its = depth_its.max(got.depth_iterations);
            angle_its = angle_its.max(got.angle_iterations);
        }
    }
    println!(
        "bisection: at most {depth_its} depth and {angle_its} angle iterations; largest |ΔM_Rd|/M_Rd = {worst:.2e}"
    );
    assert!(depth_its <= 64 && angle_its <= 64);
}

fn square(law: ConcreteLaw, fc_strain: f64) -> Column {
    let bars = [-0.15, 0.0, 0.15]
        .iter()
        .flat_map(|&y| [-0.15, 0.0, 0.15].map(move |z| (y, z)))
        .filter(|&(y, z)| (y, z) != (0.0, 0.0))
        .map(|(y, z)| ColumnBar {
            y,
            z,
            area: PI * 0.025f64.powi(2) / 4.0,
        })
        .collect();
    Column::new(ColumnInputs {
        section: ColumnSection {
            width: 0.4,
            depth: 0.4,
            bars,
        },
        concrete: law,
        steel: SteelLaw {
            yield_strength: 435e6,
            modulus: 200e9,
        },
        limits: StrainLimits {
            full_compression_strain: fc_strain,
            steel_strain_limit: None,
        },
    })
    .unwrap()
}

fn laws() -> [(ConcreteLaw, f64); 3] {
    [
        (
            ConcreteLaw::ParabolaRectangle {
                peak: 17e6,
                strain_at_peak: 0.002,
                ultimate_strain: 0.0035,
                exponent: 2.0,
            },
            0.002,
        ),
        (
            ConcreteLaw::ParabolaRectangle {
                peak: 30e6,
                strain_at_peak: 0.0022,
                ultimate_strain: 0.0031,
                exponent: 1.75,
            },
            0.0022,
        ),
        (
            ConcreteLaw::RectangularBlock {
                intensity: 17e6,
                depth_ratio: 0.8,
                ultimate_strain: 0.0035,
            },
            0.00175,
        ),
    ]
}

/// N = 0 bending about y with compression on the +z face is the uniaxial
/// problem of `rc_section::ultimate` (pivot B, no steel strain limit).
#[test]
fn uniaxial_agrees_with_rc_section() {
    for (law, ec) in laws() {
        let c = square(law.clone(), ec);
        let layers: Vec<BarLayer> = [0.15, 0.0, -0.15]
            .iter()
            .map(|&z| BarLayer {
                depth: 0.2 - z,
                area: c
                    .inputs()
                    .section
                    .bars
                    .iter()
                    .filter(|b| b.z == z)
                    .map(|b| b.area)
                    .sum(),
            })
            .collect();
        let u = rc_section::ultimate(
            &RcRectangle {
                width: 0.4,
                depth: 0.4,
            },
            &layers,
            &c.inputs().steel,
            &law,
        )
        .unwrap();
        // Compression on +z: My < 0, Mz = 0, θ = atan2(0, −1) = π.
        let got = c.moment_capacity(0.0, PI).unwrap();
        assert_eq!(got.pivot, Pivot::UltimateCompression);
        // The problems coincide when no bar disc straddles the block edge
        // (rc_section treats bars as points there).
        if let ConcreteLaw::RectangularBlock {
            depth_ratio,
            ultimate_strain,
            ..
        } = law
        {
            let k = got.plane.ky.hypot(got.plane.kz);
            for b in &c.inputs().section.bars {
                let e = got.plane.e0 + got.plane.ky * b.y + got.plane.kz * b.z;
                let delta = ((1. - depth_ratio) * ultimate_strain - e) / k;
                assert!(
                    delta.abs() >= (b.area / PI).sqrt(),
                    "bar straddles the block edge"
                );
            }
        }
        assert!(
            (got.m_rd - u.moment).abs() <= 1e-9 * u.moment,
            "{law:?}: {} vs {}",
            got.m_rd,
            u.moment
        );
        assert!((got.my + u.moment).abs() <= 1e-9 * u.moment);
        assert!(got.mz.abs() <= 1e-9 * u.moment);
        let x = got.neutral_axis_depth.unwrap();
        assert!(
            (x - u.neutral_axis_depth).abs() <= 1e-9 * u.neutral_axis_depth,
            "x {x} vs {}",
            u.neutral_axis_depth
        );
        // Same section rotated: compression on +y, Mz > 0, θ = π/2.
        let rotated = c.moment_capacity(0.0, FRAC_PI_2).unwrap();
        assert!((rotated.mz - u.moment).abs() <= 1e-9 * u.moment);
    }
}

#[test]
fn square_symmetry() {
    for (law, ec) in laws() {
        let c = square(law, ec);
        let squash = c.axial_range().squash;
        for n in [0.0, 0.4 * squash, 0.6 * c.axial_range().tension] {
            for theta in [0.3f64, 1.1, 2.0] {
                let a = c.moment_capacity(n, theta).unwrap();
                for turn in [FRAC_PI_2, PI, 3. * FRAC_PI_2] {
                    let b = c.moment_capacity(n, theta + turn).unwrap();
                    assert!(
                        (a.m_rd - b.m_rd).abs() <= 1e-9 * a.m_rd,
                        "N {n} θ {theta}+{turn}: {} vs {}",
                        a.m_rd,
                        b.m_rd
                    );
                }
                // Reflection y ↔ z maps (My, Mz) to (−Mz, −My).
                let r = c.moment_capacity(n, (-a.my).atan2(-a.mz)).unwrap();
                assert!((r.m_rd - a.m_rd).abs() <= 1e-9 * a.m_rd);
            }
        }
    }
}

/// The resistance falls towards squash and towards tension from its peak,
/// and every contour point is a capacity in its own direction.
#[test]
fn contour_points_are_capacities() {
    let o = oracle();
    for cfg in o["configs"].as_array().unwrap() {
        let c = column(cfg);
        let r = c.axial_range();
        for n in [0.0, 0.5 * r.squash, 0.4 * r.tension] {
            for p in c.interaction_contour(n, 24).unwrap() {
                assert!((p.n - n).abs() <= 1e-12 * r.squash.abs().max(r.tension.abs()));
                let m = p.my.hypot(p.mz);
                let cap = c.moment_capacity(n, p.mz.atan2(p.my)).unwrap();
                assert!(
                    cap.m_rd <= m * (1. + 1e-9),
                    "{} N {n}: contour {m} < capacity {}",
                    cfg["id"],
                    cap.m_rd
                );
                assert!(
                    (cap.m_rd - m).abs() <= 1e-9 * m,
                    "{} N {n}: {m} vs {}",
                    cfg["id"],
                    cap.m_rd
                );
            }
        }
    }
}

#[test]
fn resistance_vanishes_at_the_axial_limits() {
    let (law, ec) = laws()[0].clone();
    let c = square(law, ec);
    let r = c.axial_range();
    let near = c.moment_capacity(r.squash * (1. - 1e-6), 0.4).unwrap();
    assert_eq!(near.pivot, Pivot::FullCompression);
    let at = c.moment_capacity(r.squash, 0.4).unwrap();
    assert_eq!(at.m_rd, 0.);
    let peak = c.moment_capacity(0.3 * r.squash, 0.4).unwrap().m_rd;
    assert!(near.m_rd < 1e-3 * peak);
    let tension = c.moment_capacity(r.tension * (1. - 1e-9), 0.4).unwrap();
    assert!(tension.m_rd < 1e-3 * peak);
    // Monotone along the axial range at a fixed direction on each side of the peak.
    let ms: Vec<f64> = (0..=20)
        .map(|k| {
            c.moment_capacity(r.squash * (0.3 + 0.7 * k as f64 / 20.) * (1. - 1e-9), 0.4)
                .unwrap()
                .m_rd
        })
        .collect();
    assert!(ms.windows(2).all(|w| w[1] < w[0]), "{ms:?}");
}

#[test]
fn check_utilisation() {
    let (law, ec) = laws()[0].clone();
    let c = square(law, ec);
    let r = c.axial_range();
    let n = 0.3 * r.squash;
    let cap = c.moment_capacity(n, 0.7).unwrap();
    let at = c.check(n, cap.my, cap.mz).unwrap();
    assert!((at.utilisation.unwrap() - 1.).abs() <= 1e-12);
    let half = c.check(n, cap.my / 2., cap.mz / 2.).unwrap();
    assert!((half.utilisation.unwrap() - 0.5).abs() <= 1e-9);
    let pure = c.check(n, 0., 0.).unwrap();
    assert_eq!(pure.utilisation, Some(0.));
    assert!(pure.capacity.is_none());
    assert!((pure.axial_ratio - 0.3).abs() <= 1e-15);
    let over = c.check(1.01 * r.squash, 1e3, 0.).unwrap();
    assert_eq!(over.utilisation, None);
    assert!(over.axial_ratio > 1.);
    let pull = c.check(1.01 * r.tension, 0., 0.).unwrap();
    assert_eq!(pull.utilisation, None);
    assert!(pull.axial_ratio > 1.);
}

#[test]
fn pivot_a_range_is_attained() {
    let o = oracle();
    let cfg = o["configs"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["id"] == "RECT-ASYM")
        .unwrap();
    let c = column(cfg);
    let r = c.axial_range();
    assert!(r.tension_attained);
    let eud = c.inputs().limits.steel_strain_limit.unwrap();
    let mut pivot_a = 0;
    for cap in cfg["capacities"].as_array().unwrap() {
        let (n_ed, theta) = (f(cap, "nEd"), f(cap, "thetaDeg").to_radians());
        let got = c.moment_capacity(n_ed, theta).unwrap();
        if got.pivot != Pivot::SteelStrainLimit {
            continue;
        }
        pivot_a += 1;
        // The extreme tension bar sits exactly at the strain limit.
        let min_strain = c
            .inputs()
            .section
            .bars
            .iter()
            .map(|b| got.plane.e0 + got.plane.ky * b.y + got.plane.kz * b.z)
            .fold(f64::INFINITY, f64::min);
        assert!((min_strain + eud).abs() <= 1e-12, "{min_strain}");
    }
    assert!(pivot_a > 0, "no oracle capacity reached pivot A");
    // Near the tension limit the steel resultant is eccentric: the contour
    // leaves the section centre and a ray utilisation is refused, even for a
    // pure axial demand.
    for code in [
        c.moment_capacity(0.9 * r.tension, 0.2).unwrap_err().code,
        c.check(0.9 * r.tension, 0., 0.).unwrap_err().code,
    ] {
        assert_eq!(code, "UNSUPPORTED_FEATURE");
    }
}

#[test]
fn refusals() {
    let (law, ec) = laws()[0].clone();
    let c = square(law.clone(), ec);
    let r = c.axial_range();
    let code = |e: workbench_model::Diagnostic| e.code;
    assert_eq!(
        code(c.moment_capacity(r.squash * 1.0001, 0.).unwrap_err()),
        "INVALID_LOAD"
    );
    // Without a steel strain limit the tension resistance is only approached.
    assert_eq!(
        code(c.moment_capacity(r.tension, 0.).unwrap_err()),
        "INVALID_LOAD"
    );
    assert_eq!(
        code(c.moment_capacity(f64::NAN, 0.).unwrap_err()),
        "NONFINITE_INPUT"
    );
    assert_eq!(
        code(c.check(0., f64::INFINITY, 0.).unwrap_err()),
        "NONFINITE_INPUT"
    );
    assert_eq!(
        code(c.interaction_contour(0., 2).unwrap_err()),
        "INVALID_SETTINGS"
    );
    assert_eq!(
        code(c.interaction_contour(r.squash, 12).unwrap_err()),
        "INVALID_LOAD"
    );
    let mut inputs = c.inputs().clone();
    let bad = |i: &ColumnInputs| code(Column::new(i.clone()).unwrap_err());
    inputs.section.bars[0].y = 0.2;
    assert_eq!(bad(&inputs), "INVALID_SCHEMA");
    inputs.section.bars.clear();
    assert_eq!(bad(&inputs), "DESIGN_INPUT_INCOMPLETE");
    let mut inputs = c.inputs().clone();
    inputs.limits.full_compression_strain = 0.004;
    assert_eq!(bad(&inputs), "INVALID_SCHEMA");
    inputs.limits.full_compression_strain = f64::NAN;
    assert_eq!(bad(&inputs), "NONFINITE_INPUT");
    let mut inputs = c.inputs().clone();
    inputs.limits.steel_strain_limit = Some(-0.01);
    assert_eq!(bad(&inputs), "INVALID_SCHEMA");
    let mut inputs = c.inputs().clone();
    inputs.section.bars[0].area = 0.;
    assert_eq!(bad(&inputs), "INVALID_SCHEMA");
    assert_eq!(
        code(
            c.resultants(StrainPlane {
                e0: f64::NAN,
                ky: 0.,
                kz: 0.
            })
            .unwrap_err()
        ),
        "NONFINITE_INPUT"
    );
    // Asymmetric bars at squash: the centre is outside the resistance contour.
    let o = oracle();
    let asym = column(
        o["configs"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["id"] == "RECT-ASYM")
            .unwrap(),
    );
    assert_eq!(
        code(
            asym.moment_capacity(asym.axial_range().squash, 0.)
                .unwrap_err()
        ),
        "UNSUPPORTED_FEATURE"
    );
}
