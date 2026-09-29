//! dynamics-v1 modal analysis against the independent oracle
//! (`fixtures/dynamics/modal-oracle.json`, `docs/formulations/modal.md`).
use serde_json::{Value, json};
use workbench_assembly::{MassMatrix, ModalSettings, modal};
use workbench_model::Project;
use workbench_results::{ModalAnalysis, VibrationMode};

fn oracle() -> Value {
    serde_json::from_str(
        &std::fs::read_to_string("../../fixtures/dynamics/modal-oracle.json").unwrap(),
    )
    .unwrap()
}
fn f(v: &Value) -> f64 {
    v.as_f64().unwrap()
}

fn settings(modes: usize, mass_matrix: MassMatrix, subdivisions: usize) -> ModalSettings {
    ModalSettings {
        modes,
        mass_matrix,
        subdivisions,
        participation_target: 0.9,
    }
}

struct Model {
    mode: &'static str,
    density: f64,
    nu: f64,
    sections: Value,
    nodes: Value,
    members: Value,
    supports: Value,
    loads: Value,
    mass: Value,
}

impl Model {
    fn build(&self) -> Project {
        let p = json!({
            "schemaVersion": "1.0.0", "id": "modal", "name": "modal", "revision": 0,
            "displayUnits": "SI", "analysisMode": self.mode, "gravity": [0, 0, -9.80665],
            "materials": [{"id": "mat1", "name": "steel", "E": 210e9, "nu": self.nu, "density": self.density}],
            "sections": self.sections,
            "nodes": self.nodes, "members": self.members, "supports": self.supports,
            "loadCases": [{"id": "LC1", "name": "Mass case", "category": "dead"},
                          {"id": "LC2", "name": "Other", "category": "other"}],
            "loads": self.loads, "combinations": [],
            "analysisSettings": {"type": "linearStatic", "formulation": "eulerBernoulli3D",
                "mergeTolerance": 1e-6, "timeoutMs": 30000, "memoryLimitMiB": 512},
            "metadata": {"description": "dynamics-v1 oracle case", "createdBy": "tests"},
        });
        // Migrated through the real chain, then given its declared mass.
        let mut p = Project::parse(&p.to_string()).unwrap();
        p.mass_sources = serde_json::from_value(self.mass.clone()).unwrap();
        p
    }
}

fn node(id: &str, p: [f64; 3]) -> Value {
    json!({"id": id, "position": p})
}
fn member(id: &str, a: &str, b: &str, sec: &str, local_y: [f64; 3]) -> Value {
    json!({"id": id, "start": a, "end": b, "material": "mat1", "section": sec, "localY": local_y,
           "releaseStart": {"my": false, "mz": false}, "releaseEnd": {"my": false, "mz": false}})
}
fn support(id: &str, n: &str, fixed: [bool; 6]) -> Value {
    json!({"id": id, "node": n, "fixed": fixed, "prescribed": [0, 0, 0, 0, 0, 0]})
}
fn section(id: &str, s: &Value) -> Value {
    json!({"id": id, "name": id, "A": s["A"], "Iy": s["Iy"], "Iz": s["Iz"], "J": s["J"],
           "cy": 0.1, "cz": 0.1, "provenance": "dynamics-v1 oracle"})
}

/// A member along X from the origin, local y = global Y (Iz bends in Y, Iy in Z).
fn bar(l: f64, sec: Value, density: f64, end: [bool; 6], mass: Value) -> Project {
    Model {
        mode: "spatial",
        density,
        nu: 0.3,
        sections: json!([section("sec1", &sec)]),
        nodes: json!([node("n1", [0., 0., 0.]), node("n2", [l, 0., 0.])]),
        members: json!([member("m1", "n1", "n2", "sec1", [0., 1., 0.])]),
        supports: json!(
            [support("s1", "n1", [true; 6])]
                .into_iter()
                .chain(end.iter().any(|x| *x).then(|| support("s2", "n2", end)))
                .collect::<Vec<_>>()
        ),
        loads: json!([]),
        mass,
    }
    .build()
}

/// Dominant component family of a shape over every analysis station:
/// 0–2 translation X/Y/Z, 3 torsion. A torsion mode is normalised on its
/// largest rotation and its translations are round-off only.
fn family(m: &VibrationMode) -> usize {
    let mut sums = [0.; 3];
    let mut largest = 0f64;
    for s in m.members.iter().flat_map(|x| &x.stations) {
        for a in 0..3 {
            sums[a] += s.displacement[a] * s.displacement[a];
            largest = largest.max(s.displacement[a].abs());
        }
    }
    if largest < 1e-6 {
        return 3;
    }
    (0..3).max_by(|&a, &b| sums[a].total_cmp(&sums[b])).unwrap()
}

fn omegas(r: &ModalAnalysis, fam: usize) -> Vec<f64> {
    r.modes
        .iter()
        .filter(|m| family(m) == fam)
        .map(|m| m.omega)
        .collect()
}

fn rel(a: f64, b: f64) -> f64 {
    (a / b - 1.).abs()
}

#[test]
fn a_tip_mass_on_a_massless_cantilever_is_the_sdof_closed_form() {
    let o = oracle();
    let c = &o["sdof"];
    let p = bar(
        f(&c["L"]),
        c["section"].clone(),
        0.,
        [false; 6],
        json!([{"id": "ms1", "kind": "nodalMass", "node": "n2", "mass": c["tipMass"]}]),
    );
    for mass in [MassMatrix::Consistent, MassMatrix::Lumped] {
        let r = modal(&p, &settings(12, mass, 4)).unwrap();
        // Only the three translations of the tip carry mass.
        assert_eq!(r.modes.len(), 3, "{mass:?}");
        assert_eq!(
            r.diagnostics.last().unwrap()["code"],
            "FEWER_MODES_THAN_REQUESTED"
        );
        let tol = f(&c["tolerance"]);
        assert!(
            rel(omegas(&r, 2)[0], f(&c["omegaWeak"])) <= tol,
            "{mass:?} weak"
        );
        assert!(
            rel(omegas(&r, 1)[0], f(&c["omegaStrong"])) <= tol,
            "{mass:?} strong"
        );
        assert!(
            rel(omegas(&r, 0)[0], f(&c["omegaAxial"])) <= tol,
            "{mass:?} axial"
        );
        // Each mode engages all of the tip mass in its own direction.
        for m in &r.modes {
            let d = family(m);
            assert!(rel(m.effective_mass[d], f(&c["tipMass"])) <= 1e-9);
        }
        assert!(rel(r.mass.total, f(&c["tipMass"])) <= 1e-15);
    }
}

#[test]
fn cantilever_bending_and_torsion_converge_from_above_to_the_closed_forms() {
    let o = oracle();
    let c = &o["cantilever"];
    let t = &o["torsion"];
    let p = bar(
        f(&c["L"]),
        c["section"].clone(),
        f(&c["density"]),
        [false; 6],
        json!([{"id": "ms1", "kind": "selfMass", "factor": 1.0}]),
    );
    let mut errors: Vec<Vec<f64>> = vec![];
    for n in [2, 4, 8, 16] {
        let r = modal(&p, &settings(25, MassMatrix::Consistent, n)).unwrap();
        let (weak, strong) = (omegas(&r, 2), omegas(&r, 1));
        let mut e = vec![];
        for k in 0..3 {
            e.push(weak[k] / f(&c["omegaWeak"][k]) - 1.);
            e.push(strong[k] / f(&c["omegaStrong"][k]) - 1.);
        }
        e.push(omegas(&r, 3)[0] / f(&t["omega"][0]) - 1.);
        errors.push(e);
    }
    for k in 0..7 {
        let series: Vec<f64> = errors.iter().map(|e| e[k]).collect();
        // Consistent mass: Rayleigh–Ritz upper bounds that tighten with the mesh.
        for w in series.windows(2) {
            assert!(w[0] >= w[1] && w[1] >= -1e-12, "quantity {k}: {series:?}");
        }
    }
    let last = errors.last().unwrap();
    for (k, e) in last.iter().enumerate() {
        let tol = if k < 6 {
            f(&c["tolerance"])
        } else {
            f(&t["tolerance"])
        };
        assert!(e.abs() <= tol, "quantity {k}: {e}");
    }
}

#[test]
fn simply_supported_beam_matches_n_pi_squared() {
    let o = oracle();
    let c = &o["simplySupported"];
    let mut p = bar(
        f(&c["L"]),
        c["section"].clone(),
        f(&c["density"]),
        [false, true, true, false, false, false],
        json!([{"id": "ms1", "kind": "selfMass", "factor": 1.0}]),
    );
    p.supports[0].fixed = [true, true, true, true, false, false];
    let r = modal(&p, &settings(25, MassMatrix::Consistent, 16)).unwrap();
    let (weak, strong) = (omegas(&r, 2), omegas(&r, 1));
    for k in 0..3 {
        assert!(
            rel(weak[k], f(&c["omegaWeak"][k])) <= f(&c["tolerance"]),
            "weak {k}"
        );
        assert!(
            rel(strong[k], f(&c["omegaStrong"][k])) <= f(&c["tolerance"]),
            "strong {k}"
        );
    }
}

#[test]
fn axial_bar_converges_at_second_order_to_the_quarter_wave_closed_form() {
    let o = oracle();
    let c = &o["axial"];
    // Bending and torsion made stiff so the first axial modes are isolated.
    let sec = json!({"A": o["cantilever"]["section"]["A"], "Iy": 1.0, "Iz": 1.0, "J": 2.0});
    let p = bar(
        f(&c["L"]),
        sec,
        f(&c["density"]),
        [false; 6],
        json!([{"id": "ms1", "kind": "selfMass", "factor": 1.0}]),
    );
    let error = |n: usize| -> Vec<f64> {
        let r = modal(&p, &settings(8, MassMatrix::Consistent, n)).unwrap();
        let axial = omegas(&r, 0);
        (0..2).map(|k| axial[k] / f(&c["omega"][k]) - 1.).collect()
    };
    let (coarse, fine) = (
        error(16),
        error(c["subdivisions"].as_u64().unwrap() as usize),
    );
    for k in 0..2 {
        // Linear axial interpolation: error ≈ (kh)²/24 from above, so halving
        // h divides it by about four.
        assert!(
            coarse[k] > fine[k] && fine[k] > 0.,
            "mode {k}: {coarse:?} {fine:?}"
        );
        assert!(
            (coarse[k] / fine[k] - 4.).abs() < 0.1,
            "mode {k}: {coarse:?} {fine:?}"
        );
        assert!(fine[k] <= f(&c["tolerance"]), "mode {k}: {fine:?}");
    }
}

#[test]
fn scaling_every_mass_by_four_halves_every_frequency() {
    let o = oracle();
    let c = &o["cantilever"];
    let make = |k: f64| {
        bar(
            f(&c["L"]),
            c["section"].clone(),
            f(&c["density"]),
            [false; 6],
            json!([{"id": "ms1", "kind": "selfMass", "factor": k},
                   {"id": "ms2", "kind": "nodalMass", "node": "n2", "mass": 250.0 * k}]),
        )
    };
    let tol = f(&o["massScaling"]["tolerance"]);
    for mass in [MassMatrix::Consistent, MassMatrix::Lumped] {
        let a = modal(&make(1.), &settings(8, mass, 8)).unwrap();
        let b = modal(&make(4.), &settings(8, mass, 8)).unwrap();
        for (x, y) in a.modes.iter().zip(&b.modes) {
            assert!(rel(y.omega, 0.5 * x.omega) <= tol, "{mass:?}");
            for d in 0..3 {
                assert!(
                    (y.effective_mass_ratio[d].unwrap_or(0.)
                        - x.effective_mass_ratio[d].unwrap_or(0.))
                    .abs()
                        <= 1e-9
                );
            }
        }
    }
}

fn shear_frame(o: &Value) -> Project {
    let c = &o["shearFrame"];
    let (h, b) = (f(&c["storeyHeight"]), f(&c["bay"]));
    let ends = &c["nodalMassPerBeamEnd"];
    Model {
        mode: "planarXZ",
        density: 0.,
        nu: f(&c["nu"]),
        sections: json!([section("col", &c["column"]), section("beam", &c["beam"])]),
        nodes: json!([
            node("a0", [0., 0., 0.]),
            node("b0", [b, 0., 0.]),
            node("a1", [0., 0., h]),
            node("b1", [b, 0., h]),
            node("a2", [0., 0., 2. * h]),
            node("b2", [b, 0., 2. * h])
        ]),
        members: json!([
            member("c1", "a0", "a1", "col", [0., 1., 0.]),
            member("c2", "b0", "b1", "col", [0., 1., 0.]),
            member("c3", "a1", "a2", "col", [0., 1., 0.]),
            member("c4", "b1", "b2", "col", [0., 1., 0.]),
            member("f1", "a1", "b1", "beam", [0., 1., 0.]),
            member("f2", "a2", "b2", "beam", [0., 1., 0.])
        ]),
        supports: json!([
            support("s1", "a0", [true; 6]),
            support("s2", "b0", [true; 6])
        ]),
        loads: json!([]),
        mass: json!([
            {"id": "ms1", "kind": "nodalMass", "node": "a1", "mass": ends[0]},
            {"id": "ms2", "kind": "nodalMass", "node": "b1", "mass": ends[0]},
            {"id": "ms3", "kind": "nodalMass", "node": "a2", "mass": ends[1]},
            {"id": "ms4", "kind": "nodalMass", "node": "b2", "mass": ends[1]},
        ]),
    }
    .build()
}

#[test]
fn two_storey_shear_frame_matches_the_closed_form() {
    let o = oracle();
    let c = &o["shearFrame"];
    let r = modal(&shear_frame(&o), &settings(2, MassMatrix::Consistent, 1)).unwrap();
    for k in 0..2 {
        assert!(
            rel(r.modes[k].omega, f(&c["omega"][k])) <= f(&c["tolerance"]),
            "mode {k}"
        );
        assert_eq!(family(&r.modes[k]), 0, "mode {k} sways in X");
    }
    // Y is constrained in planar XZ mode: nothing participates.
    assert_eq!(r.participation[1].achieved, None);
    assert!(r.modes[0].effective_mass_ratio[1].is_none());
}

fn spatial_frame(o: &Value) -> Project {
    let c = &o["spatialFrame"];
    let nodes: Vec<Value> = c["nodes"]
        .as_object()
        .unwrap()
        .iter()
        .map(|(id, p)| node(id, [f(&p[0]), f(&p[1]), f(&p[2])]))
        .collect();
    let members: Vec<Value> = c["members"]
        .as_array()
        .unwrap()
        .iter()
        .map(|m| {
            let y = &m["localY"];
            member(
                m["id"].as_str().unwrap(),
                m["start"].as_str().unwrap(),
                m["end"].as_str().unwrap(),
                m["section"].as_str().unwrap(),
                [f(&y[0]), f(&y[1]), f(&y[2])],
            )
        })
        .collect();
    let supports: Vec<Value> = c["supports"]
        .as_array()
        .unwrap()
        .iter()
        .enumerate()
        .map(|(i, n)| support(&format!("s{i}"), n.as_str().unwrap(), [true; 6]))
        .collect();
    let mut mass = vec![json!({"id": "self", "kind": "selfMass", "factor": 1.0})];
    for (i, (n, m)) in c["nodalMasses"].as_object().unwrap().iter().enumerate() {
        mass.push(json!({"id": format!("nm{i}"), "kind": "nodalMass", "node": n, "mass": m}));
    }
    Model {
        mode: "spatial",
        density: f(&c["density"]),
        nu: f(&c["nu"]),
        sections: json!([
            section("col", &c["sections"]["col"]),
            section("beam", &c["sections"]["beam"])
        ]),
        nodes: json!(nodes),
        members: json!(members),
        supports: json!(supports),
        loads: json!([]),
        mass: json!(mass),
    }
    .build()
}

#[test]
fn spatial_frame_matches_opensees_with_lumped_mass() {
    let o = oracle();
    let c = &o["spatialFrame"];
    let r = modal(
        &spatial_frame(&o),
        &settings(
            6,
            MassMatrix::Lumped,
            c["subdivisions"].as_u64().unwrap() as usize,
        ),
    )
    .unwrap();
    for k in 0..6 {
        assert!(
            rel(r.modes[k].omega, f(&c["omega"][k])) <= f(&c["tolerance"]),
            "mode {k}"
        );
    }
    let checks = &r.numerical_checks;
    assert!(f(&checks["massOrthogonality"]) <= 1e-8);
    assert!(f(&checks["stiffnessOrthogonality"]) <= 1e-8);
    assert_eq!(checks["sturm"]["negativePivots"], 5);
    assert!(r.modes.iter().all(|m| m.residual <= 1e-8));
}

fn portal(o: &Value, mass: Value) -> Project {
    let c = &o["portal"];
    let (h, b) = (f(&c["height"]), f(&c["span"]));
    Model {
        mode: "planarXZ",
        density: f(&c["density"]),
        nu: f(&c["nu"]),
        sections: json!([section("col", &c["column"]), section("beam", &c["beam"])]),
        nodes: json!([node("bl", [0., 0., 0.]), node("br", [b, 0., 0.]),
                      node("tl", [0., 0., h]), node("tr", [b, 0., h])]),
        members: json!([member("cl", "bl", "tl", "col", [0., 1., 0.]),
                        member("cr", "br", "tr", "col", [0., 1., 0.]),
                        member("bm", "tl", "tr", "beam", [0., 1., 0.])]),
        supports: json!([support("s1", "bl", [true; 6]), support("s2", "br", [true; 6])]),
        loads: json!([
            {"id": "g1", "case": "LC1", "type": "uniform", "member": "bm", "axes": "global", "forcePerLength": [0, 0, -2000]},
            {"id": "w1", "case": "LC1", "type": "selfWeight", "members": ["cl", "cr", "bm"], "factor": 1.0},
            {"id": "h1", "case": "LC1", "type": "nodal", "node": "tl", "values": [500, 0, -1000, 0, 0, 0]},
            {"id": "u1", "case": "LC2", "type": "nodal", "node": "tr", "values": [0, 0, 1000, 0, 0, 0]},
        ]),
        mass,
    }
    .build()
}

fn portal_mass(o: &Value) -> Value {
    let m = &o["portal"]["nodalMass"];
    json!([{"id": "self", "kind": "selfMass", "factor": 1.0},
           {"id": "mtl", "kind": "nodalMass", "node": "tl", "mass": m},
           {"id": "mtr", "kind": "nodalMass", "node": "tr", "mass": m}])
}

#[test]
fn planar_portal_matches_opensees_with_consistent_mass() {
    let o = oracle();
    let c = &o["portal"];
    let r = modal(
        &portal(&o, portal_mass(&o)),
        &settings(
            4,
            MassMatrix::Consistent,
            c["subdivisions"].as_u64().unwrap() as usize,
        ),
    )
    .unwrap();
    for k in 0..4 {
        assert!(
            rel(r.modes[k].omega, f(&c["omega"][k])) <= f(&c["tolerance"]),
            "mode {k}"
        );
    }
}

#[test]
fn every_mode_together_accounts_for_all_participating_mass() {
    let o = oracle();
    for (mass, n) in [
        (MassMatrix::Lumped, 1),
        (MassMatrix::Consistent, 1),
        (MassMatrix::Lumped, 2),
    ] {
        let r = modal(&portal(&o, portal_mass(&o)), &settings(50, mass, n)).unwrap();
        for d in [0, 2] {
            let p = &r.participation[d];
            assert!(
                (p.cumulative_ratio.unwrap() - 1.).abs() <= 1e-10,
                "{mass:?} {n} dir {d}"
            );
            assert_eq!(p.achieved, Some(true));
            let sum: f64 = r.modes.iter().map(|m| m.effective_mass[d]).sum();
            assert!(rel(sum, p.participating_mass) <= 1e-10);
        }
        // Mass held directly by the supports never participates.
        assert!(r.participation[0].non_participating_mass >= 0.);
    }
}

#[test]
fn a_short_extraction_reports_the_omitted_mass_and_the_unmet_target() {
    let o = oracle();
    let r = modal(
        &portal(&o, portal_mass(&o)),
        &settings(1, MassMatrix::Consistent, 8),
    )
    .unwrap();
    let x = &r.participation[0];
    assert_eq!(x.achieved, Some(x.cumulative_ratio.unwrap() >= 0.9));
    assert!((x.cumulative_ratio.unwrap() + x.omitted_ratio.unwrap() - 1.).abs() <= 1e-12);
    let z = &r.participation[2];
    assert_eq!(z.achieved, Some(false));
    assert!(
        r.diagnostics
            .iter()
            .any(|d| d["code"] == "PARTICIPATION_TARGET_NOT_MET" && d["direction"] == "Z")
    );
}

#[test]
fn load_case_mass_converts_gravity_loads_and_deduplicates_self_weight() {
    let o = oracle();
    let c = &o["portal"];
    let g = 9.80665;
    let span = f(&c["span"]);
    let members_mass = f(&c["density"])
        * (2. * f(&c["column"]["A"]) * f(&c["height"]) + f(&c["beam"]["A"]) * span);
    // With self mass declared, the case's self-weight load is skipped.
    let with_self = modal(
        &portal(
            &o,
            json!([{"id": "self", "kind": "selfMass", "factor": 1.0},
                            {"id": "case", "kind": "loadCase", "case": "LC1", "factor": 0.5}]),
        ),
        &settings(2, MassMatrix::Consistent, 4),
    )
    .unwrap();
    let case_mass = 0.5 * (2000. * span + 1000.) / g;
    let by = |r: &ModalAnalysis, id: &str| r.mass.sources.iter().find(|s| s.id == id).unwrap().mass;
    assert!(rel(by(&with_self, "self"), members_mass) <= 1e-12);
    assert!(rel(by(&with_self, "case"), case_mass) <= 1e-12);
    let codes: Vec<&Value> = with_self.diagnostics.iter().map(|d| &d["code"]).collect();
    assert!(codes.contains(&&json!("SELF_MASS_DEDUPLICATED")));
    assert!(codes.contains(&&json!("NON_GRAVITY_COMPONENTS_IGNORED")));
    // Without it, the self-weight load is the self mass, scaled by the source.
    let without = modal(
        &portal(
            &o,
            json!([{"id": "case", "kind": "loadCase", "case": "LC1", "factor": 0.5}]),
        ),
        &settings(2, MassMatrix::Consistent, 4),
    )
    .unwrap();
    assert!(rel(by(&without, "case"), case_mass + 0.5 * members_mass) <= 1e-12);
    assert!(rel(without.mass.total, case_mass + 0.5 * members_mass) <= 1e-12);
}

#[test]
fn unsupported_or_meaningless_requests_are_refused() {
    let o = oracle();
    let code = |p: &Project, s: ModalSettings| modal(p, &s).unwrap_err().code;
    let ok = settings(4, MassMatrix::Consistent, 4);
    // No declared mass.
    assert_eq!(code(&portal(&o, json!([])), ok), "NO_MASS");
    // Mass against gravity.
    assert_eq!(
        code(
            &portal(
                &o,
                json!([{"id": "up", "kind": "loadCase", "case": "LC2", "factor": 1.0}])
            ),
            ok
        ),
        "NEGATIVE_MASS"
    );
    // End releases until hinge DOFs exist.
    let mut released = portal(&o, portal_mass(&o));
    released.members[2].release_end.my = true;
    assert_eq!(code(&released, ok), "MODAL_RELEASES_UNSUPPORTED");
    // A mechanism has rigid-body modes: refused, never reported as zero.
    let mut mechanism = portal(&o, portal_mass(&o));
    for s in &mut mechanism.supports {
        // Rollers in X at both bases: the portal slides freely.
        s.fixed = [false, true, true, true, false, true];
    }
    assert_eq!(code(&mechanism, ok), "UNSTABLE_MODEL");
    // Settings out of range.
    for s in [
        settings(0, MassMatrix::Consistent, 4),
        settings(51, MassMatrix::Consistent, 4),
        settings(4, MassMatrix::Consistent, 0),
        ModalSettings {
            participation_target: 0.,
            ..ok
        },
        ModalSettings {
            participation_target: 1.5,
            ..ok
        },
    ] {
        assert_eq!(code(&portal(&o, portal_mass(&o)), s), "INVALID_SETTINGS");
    }
}

#[test]
fn settings_and_mass_enter_the_result_identity() {
    let o = oracle();
    let p = portal(&o, portal_mass(&o));
    let a = modal(&p, &settings(4, MassMatrix::Consistent, 4)).unwrap();
    let b = modal(&p, &settings(4, MassMatrix::Lumped, 4)).unwrap();
    assert_ne!(a.settings_hash, b.settings_hash);
    assert_eq!(a.model_hash, b.model_hash);
    let mut heavier = p.clone();
    if let workbench_model::MassSource::NodalMass { mass, .. } = &mut heavier.mass_sources[1] {
        *mass *= 2.;
    }
    let c = modal(&heavier, &settings(4, MassMatrix::Consistent, 4)).unwrap();
    assert_ne!(a.model_hash, c.model_hash);
    // Deterministic: the same request gives bit-identical frequencies.
    let again = modal(&p, &settings(4, MassMatrix::Consistent, 4)).unwrap();
    let w = |r: &ModalAnalysis| {
        r.modes
            .iter()
            .map(|m| m.omega.to_bits())
            .collect::<Vec<_>>()
    };
    assert_eq!(w(&a), w(&again));
}
