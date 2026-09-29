//! response-v1 validation against `fixtures/dynamics/response-oracle.json`
//! (`docs/formulations/response.md`, Validation).
use serde_json::{Value, json};
use workbench_assembly::{
    Combination, Damping, HarmonicSettings, MassMatrix, SpectrumSettings, analyse, harmonic,
    response_spectrum,
};
use workbench_model::{Project, ResponseSpectrum};

fn oracle() -> Value {
    serde_json::from_str(
        &std::fs::read_to_string("../../fixtures/dynamics/response-oracle.json").unwrap(),
    )
    .unwrap()
}
fn f(v: &Value) -> f64 {
    v.as_f64().unwrap_or_else(|| panic!("not a number: {v}"))
}
fn rel(a: f64, b: f64) -> f64 {
    (a - b).abs() / b.abs()
}

struct Model {
    mode: &'static str,
    density: f64,
    sections: Value,
    nodes: Value,
    members: Value,
    supports: Value,
    loads: Value,
    mass: Value,
}

impl Model {
    fn build(&self, o: &Value) -> Project {
        let p = json!({
            "schemaVersion": "1.0.0", "id": "response", "name": "response", "revision": 0,
            "displayUnits": "SI", "analysisMode": self.mode, "gravity": [0, 0, -9.80665],
            "materials": [{"id": "mat1", "name": "steel", "E": 210e9, "nu": 0.3, "density": self.density}],
            "sections": self.sections,
            "nodes": self.nodes, "members": self.members, "supports": self.supports,
            "loadCases": [{"id": "LC1", "name": "Excitation", "category": "other"}],
            "loads": self.loads, "combinations": [],
            "analysisSettings": {"type": "linearStatic", "formulation": "eulerBernoulli3D",
                "mergeTolerance": 1e-6, "timeoutMs": 30000, "memoryLimitMiB": 512},
            "metadata": {"description": "response-v1 oracle case", "createdBy": "tests"},
        });
        let mut p = Project::parse(&p.to_string()).unwrap();
        p.mass_sources = serde_json::from_value(self.mass.clone()).unwrap();
        p.response_spectra = vec![ResponseSpectrum {
            id: "sp1".into(),
            name: "Oracle spectrum".into(),
            points: serde_json::from_value(o["spectrum"]["points"].clone()).unwrap(),
            damping_ratio: f(&o["spectrum"]["dampingRatio"]),
            reference: "response-v1 oracle".into(),
        }];
        p.validate().unwrap();
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
fn support(id: &str, n: &str) -> Value {
    json!({"id": id, "node": n, "fixed": [true, true, true, true, true, true], "prescribed": [0, 0, 0, 0, 0, 0]})
}
fn section(id: &str, s: &Value) -> Value {
    json!({"id": id, "name": id, "A": s["A"], "Iy": s["Iy"], "Iz": s["Iz"], "J": s["J"],
           "cy": 0.1, "cz": 0.1, "provenance": "response-v1 oracle"})
}
fn nodal(id: &str, n: &str, v: [f64; 6]) -> Value {
    json!({"id": id, "case": "LC1", "type": "nodal", "node": n, "values": v})
}

/// Massless cantilever along X (local y = Y) with a tip mass and tip load Z.
fn cantilever(o: &Value) -> Project {
    let c = &o["sdof"];
    Model {
        mode: "spatial",
        density: 0.,
        sections: json!([section("sec1", &c["section"])]),
        nodes: json!([node("n1", [0., 0., 0.]), node("n2", [f(&c["L"]), 0., 0.])]),
        members: json!([member("m1", "n1", "n2", "sec1", [0., 1., 0.])]),
        supports: json!([support("s1", "n1")]),
        loads: json!([nodal(
            "l1",
            "n2",
            [0., 0., f(&c["harmonic"]["force"]), 0., 0., 0.]
        )]),
        mass: json!([{"id": "ms1", "kind": "nodalMass", "node": "n2", "mass": c["tipMass"]}]),
    }
    .build(o)
}

fn shear_frame(o: &Value) -> Project {
    let c = &o["shearFrame"];
    let (h, b) = (f(&c["storeyHeight"]), f(&c["bay"]));
    let ends = &c["nodalMassPerBeamEnd"];
    Model {
        mode: "planarXZ",
        density: 0.,
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
        supports: json!([support("s1", "a0"), support("s2", "b0")]),
        loads: json!([]),
        mass: json!([
            {"id": "ms1", "kind": "nodalMass", "node": "a1", "mass": ends[0]},
            {"id": "ms2", "kind": "nodalMass", "node": "b1", "mass": ends[0]},
            {"id": "ms3", "kind": "nodalMass", "node": "a2", "mass": ends[1]},
            {"id": "ms4", "kind": "nodalMass", "node": "b2", "mass": ends[1]},
        ]),
    }
    .build(o)
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
        .map(|n| support(&format!("s-{}", n.as_str().unwrap()), n.as_str().unwrap()))
        .collect();
    let mut mass = vec![json!({"id": "self", "kind": "selfMass", "factor": 1.0})];
    for (i, (n, m)) in c["nodalMasses"].as_object().unwrap().iter().enumerate() {
        mass.push(json!({"id": format!("nm{i}"), "kind": "nodalMass", "node": n, "mass": m}));
    }
    let loads: Vec<Value> = c["loads"]
        .as_object()
        .unwrap()
        .iter()
        .enumerate()
        .map(|(i, (n, v))| nodal(&format!("l{i}"), n, std::array::from_fn(|a| f(&v[a]))))
        .collect();
    Model {
        mode: "spatial",
        density: f(&c["density"]),
        sections: json!([
            section("col", &c["sections"]["col"]),
            section("beam", &c["sections"]["beam"])
        ]),
        nodes: json!(nodes),
        members: json!(members),
        supports: json!(supports),
        loads: json!(loads),
        mass: json!(mass),
    }
    .build(o)
}

fn ratio_damping(h: &Value) -> Damping {
    let d = &h["damping"];
    Damping::Ratio {
        ratio: f(&d["ratio"]),
        frequencies: [f(&d["frequencies"][0]), f(&d["frequencies"][1])],
    }
}

fn frequencies(h: &Value) -> Vec<f64> {
    h["frequencies"].as_array().unwrap().iter().map(f).collect()
}

fn spectrum(
    direction: usize,
    combination: Combination,
    modes: usize,
    mass: MassMatrix,
    n: usize,
) -> SpectrumSettings {
    SpectrumSettings {
        spectrum: "sp1".into(),
        direction,
        scale: 1.,
        combination,
        modes,
        mass_matrix: mass,
        subdivisions: n,
        participation_target: 0.9,
    }
}

#[test]
fn h_sdof_matches_the_closed_form_through_resonance() {
    let o = oracle();
    let h = &o["sdof"]["harmonic"];
    let p = cantilever(&o);
    for mass in [MassMatrix::Consistent, MassMatrix::Lumped] {
        let settings = HarmonicSettings {
            frequencies: frequencies(h),
            damping: ratio_damping(h),
            mass_matrix: mass,
            subdivisions: 4,
        };
        let r = harmonic(&p, "LC1", &settings).unwrap();
        assert!(rel(r.damping.a0, f(&h["a0"])) <= 1e-12 && rel(r.damping.a1, f(&h["a1"])) <= 1e-12);
        let tip = r.node_ids.iter().position(|n| n == "n2").unwrap() * 6 + 2;
        for (k, want) in h["tipDisplacement"].as_array().unwrap().iter().enumerate() {
            let got = [
                r.frequencies[k].displacement_re[tip],
                r.frequencies[k].displacement_im[tip],
            ];
            let want = [f(&want[0]), f(&want[1])];
            let size = want[0].hypot(want[1]);
            let err = (got[0] - want[0]).hypot(got[1] - want[1]);
            assert!(
                err <= f(&h["tolerance"]) * size,
                "{mass:?} f{k}: {got:?} vs {want:?}"
            );
        }
        // Reactions balance the inertia-free support: at resonance the base
        // force equals k·U (massless member, all mass at the tip).
        let k = f(&o["sdof"]["tipStiffness"]);
        let at = &r.frequencies[3];
        let fz = [at.reaction_re[2], at.reaction_im[2]];
        let ku = [k * at.displacement_re[tip], k * at.displacement_im[tip]];
        // The support takes −(1 + iΩa₁) k U − ... : compare magnitudes of
        // the elastic-plus-damping force through the member.
        let expected = [
            ku[0] - at.omega * r.damping.a1 * ku[1],
            ku[1] + at.omega * r.damping.a1 * ku[0],
        ];
        let size = expected[0].hypot(expected[1]);
        assert!(
            (fz[0] + expected[0]).hypot(fz[1] + expected[1]) <= 1e-9 * size,
            "{fz:?} vs {expected:?}"
        );
    }
}

#[test]
fn h_static_limit_is_the_linear_static_solution() {
    let o = oracle();
    let p = cantilever(&o);
    let settings = HarmonicSettings {
        // At 1e-6 Hz the damping phase Ω(a₁ + a₀m/k) is already 3.7e-8.
        frequencies: vec![1e-9],
        damping: Damping::Coefficients { a0: 0.1, a1: 1e-3 },
        mass_matrix: MassMatrix::Consistent,
        subdivisions: 4,
    };
    let r = harmonic(&p, "LC1", &settings).unwrap();
    let s = analyse(&p, "LC1").unwrap();
    let tip = r.node_ids.iter().position(|n| n == "n2").unwrap() * 6 + 2;
    let static_tip =
        s.node_displacements[s.node_ids.iter().position(|n| n == "n2").unwrap() * 6 + 2];
    assert!(rel(r.frequencies[0].displacement_re[tip], static_tip) <= 1e-8);
    assert!(r.frequencies[0].displacement_im[tip].abs() <= 1e-8 * static_tip.abs());
}

#[test]
fn h_frame_matches_the_opensees_matrices_direct_solve() {
    let o = oracle();
    let c = &o["spatialFrame"];
    let h = &c["harmonic"];
    let p = spatial_frame(&o);
    let responses = h["responses"].as_array().unwrap();
    let settings = HarmonicSettings {
        frequencies: responses.iter().map(|x| f(&x["frequency"])).collect(),
        damping: ratio_damping(h),
        mass_matrix: MassMatrix::Lumped,
        subdivisions: c["subdivisions"].as_u64().unwrap() as usize,
    };
    let r = harmonic(&p, "LC1", &settings).unwrap();
    // The oracle's Rayleigh coefficients come from OpenSees frequencies.
    assert!(rel(r.damping.a0, f(&h["a0"])) <= 1e-6 && rel(r.damping.a1, f(&h["a1"])) <= 1e-6);
    let tol = f(&h["tolerance"]);
    for (k, want) in responses.iter().enumerate() {
        let got = &r.frequencies[k];
        let nodes = want["nodes"].as_object().unwrap();
        let scale = nodes
            .values()
            .flat_map(|v| {
                v.as_array()
                    .unwrap()
                    .iter()
                    .map(|c| f(&c[0]).hypot(f(&c[1])))
            })
            .fold(0., f64::max);
        for (id, comps) in nodes {
            let i = r.node_ids.iter().position(|n| n == id).unwrap();
            for a in 0..6 {
                let w = &comps[a];
                let e = (got.displacement_re[i * 6 + a] - f(&w[0]))
                    .hypot(got.displacement_im[i * 6 + a] - f(&w[1]));
                assert!(e <= tol * scale, "f{k} {id}[{a}]: {e:e} of {scale:e}");
            }
        }
        assert!(got.residual <= 1e-10);
    }
}

#[test]
fn r_sdof_matches_the_closed_form() {
    let o = oracle();
    let s = &o["sdof"]["spectrum"];
    let p = cantilever(&o);
    let r = response_spectrum(
        &p,
        &spectrum(2, Combination::Srss, 3, MassMatrix::Consistent, 4),
    )
    .unwrap();
    let tol = f(&s["tolerance"]);
    // One mode participates in Z; the other two have Γ_Z = 0.
    let z = r
        .modes
        .iter()
        .find(|m| m.effective_mass_ratio.unwrap() > 0.5)
        .unwrap();
    assert!(rel(z.period, f(&s["period"])) <= tol && rel(z.sa, f(&s["sa"])) <= tol);
    let tip = r.node_ids.iter().position(|n| n == "n2").unwrap() * 6 + 2;
    assert!(rel(r.node_displacements[tip], f(&s["tipDisplacement"])) <= tol);
    assert!(rel(r.base_reaction[2], f(&s["baseShear"])) <= tol);
    // Base moment about local y at the support (My, index 4).
    assert!(
        rel(r.reactions[4], f(&s["baseMoment"])) <= tol,
        "{}",
        r.reactions[4]
    );
    // The modal base shear table agrees with the combined reaction.
    assert!(rel(z.base_shear, f(&s["baseShear"])) <= tol);
}

#[test]
fn r_shear_frame_matches_srss_and_cqc_by_hand() {
    let o = oracle();
    let c = &o["shearFrame"];
    let p = shear_frame(&o);
    for (combination, key) in [(Combination::Srss, "srss"), (Combination::Cqc, "cqc")] {
        let r =
            response_spectrum(&p, &spectrum(0, combination, 2, MassMatrix::Consistent, 1)).unwrap();
        let tol = f(&c["tolerance"]);
        for (k, m) in c["modes"].as_array().unwrap().iter().enumerate() {
            assert!(rel(r.modes[k].omega, f(&m["omega"])) <= tol);
            assert!(rel(r.modes[k].participation_factor.abs(), f(&m["gamma"]).abs()) <= tol);
        }
        let ux =
            |n: &str| r.node_displacements[r.node_ids.iter().position(|x| x == n).unwrap() * 6];
        let comb = &c["combined"];
        assert!(
            rel(ux("a1"), f(&comb["floor1"][key])) <= tol,
            "{key} floor 1"
        );
        assert!(
            rel(ux("b2"), f(&comb["floor2"][key])) <= tol,
            "{key} floor 2"
        );
        assert!(
            rel(r.base_reaction[0], f(&comb["baseShear"][key])) <= tol,
            "{key} base shear"
        );
    }
}

#[test]
fn r_frame_matches_opensees_modal_combination() {
    let o = oracle();
    let c = &o["spatialFrame"];
    let p = spatial_frame(&o);
    let tol = f(&c["spectrum"]["tolerance"]);
    let n = c["subdivisions"].as_u64().unwrap() as usize;
    let modes = c["modes"].as_u64().unwrap() as usize;
    for case in c["spectrum"]["cases"].as_array().unwrap() {
        let dir = ["X", "Y", "Z"]
            .iter()
            .position(|d| *d == case["direction"])
            .unwrap();
        for (combination, key) in [(Combination::Srss, "srss"), (Combination::Cqc, "cqc")] {
            let r = response_spectrum(
                &p,
                &spectrum(dir, combination, modes, MassMatrix::Lumped, n),
            )
            .unwrap();
            let want = &case[key];
            let check = |label: &str, got: &[f64], want: &[f64]| {
                let scale = want.iter().fold(0f64, |m, v| m.max(v.abs()));
                for (a, (g, w)) in got.iter().zip(want).enumerate() {
                    assert!(
                        (g - w).abs() <= tol * scale.max(1e-300),
                        "{} {key} {label}[{a}]: {g} vs {w}",
                        case["direction"]
                    );
                }
            };
            let values = |v: &Value| -> Vec<f64> { v.as_array().unwrap().iter().map(f).collect() };
            check("base", &r.base_reaction, &values(&want["baseReaction"]));
            for (id, v) in want["reactions"].as_object().unwrap() {
                let i = r
                    .support_ids
                    .iter()
                    .position(|s| *s == format!("s-{id}"))
                    .unwrap();
                check(
                    &format!("reaction {id}"),
                    &r.reactions[i * 6..i * 6 + 6],
                    &values(v),
                );
            }
            for (id, v) in want["nodes"].as_object().unwrap() {
                let i = r.node_ids.iter().position(|x| x == id).unwrap();
                check(
                    &format!("node {id}"),
                    &r.node_displacements[i * 6..i * 6 + 6],
                    &values(v),
                );
            }
            for (id, v) in want["memberEnds"].as_object().unwrap() {
                let m = r.members.iter().find(|m| &m.id == id).unwrap();
                let got: Vec<f64> = m.stations[0]
                    .actions
                    .iter()
                    .chain(m.stations.last().unwrap().actions.iter())
                    .copied()
                    .collect();
                check(&format!("member {id}"), &got, &values(v));
            }
        }
    }
}

#[test]
fn refusals() {
    let o = oracle();
    let p = cantilever(&o);
    let base = HarmonicSettings {
        frequencies: vec![1.],
        damping: Damping::Coefficients { a0: 0., a1: 1e-3 },
        mass_matrix: MassMatrix::Consistent,
        subdivisions: 4,
    };
    let code = |s: &HarmonicSettings| harmonic(&p, "LC1", s).unwrap_err().code;
    assert_eq!(
        code(&HarmonicSettings {
            damping: Damping::Coefficients { a0: 1., a1: 0. },
            ..base.clone()
        }),
        "INVALID_SETTINGS"
    );
    assert_eq!(
        code(&HarmonicSettings {
            frequencies: vec![0.],
            ..base.clone()
        }),
        "INVALID_SETTINGS"
    );
    assert_eq!(
        code(&HarmonicSettings {
            frequencies: vec![1.; 201],
            ..base.clone()
        }),
        "INVALID_SETTINGS"
    );
    assert_eq!(
        code(&HarmonicSettings {
            damping: Damping::Ratio {
                ratio: 0.05,
                frequencies: [2., 1.]
            },
            ..base.clone()
        }),
        "INVALID_SETTINGS"
    );
    assert_eq!(
        harmonic(&p, "nope", &base).unwrap_err().code,
        "INVALID_LOAD"
    );
    let mut unloaded = p.clone();
    unloaded.loads.clear();
    assert_eq!(
        harmonic(&unloaded, "LC1", &base).unwrap_err().code,
        "INVALID_LOAD"
    );
    let mut massless = p.clone();
    massless.mass_sources.clear();
    assert_eq!(
        harmonic(&massless, "LC1", &base).unwrap_err().code,
        "NO_MASS"
    );

    let spec = |s: SpectrumSettings, p: &Project| response_spectrum(p, &s).unwrap_err().code;
    assert_eq!(
        spec(
            SpectrumSettings {
                spectrum: "nope".into(),
                ..spectrum(2, Combination::Srss, 3, MassMatrix::Consistent, 4)
            },
            &p
        ),
        "DANGLING_REFERENCE"
    );
    assert_eq!(
        spec(
            SpectrumSettings {
                scale: 0.,
                ..spectrum(2, Combination::Srss, 3, MassMatrix::Consistent, 4)
            },
            &p
        ),
        "INVALID_SETTINGS"
    );
    // A short spectrum does not reach the cantilever's 1.4 s period.
    let mut short = p.clone();
    short.response_spectra[0].points = vec![[0., 1.], [1., 1.]];
    assert_eq!(
        spec(
            spectrum(2, Combination::Srss, 3, MassMatrix::Consistent, 4),
            &short
        ),
        "SPECTRUM_RANGE"
    );
    // Planar XZ holds Y: nothing participates.
    let frame = shear_frame(&o);
    assert_eq!(
        spec(
            spectrum(1, Combination::Srss, 2, MassMatrix::Consistent, 1),
            &frame
        ),
        "NO_MASS"
    );
}

#[test]
fn spectra_are_validated_as_project_data() {
    let o = oracle();
    let p = cantilever(&o);
    let bad = |edit: &dyn Fn(&mut ResponseSpectrum)| {
        let mut q = p.clone();
        edit(&mut q.response_spectra[0]);
        q.validate().unwrap_err().code
    };
    assert_eq!(bad(&|s| s.points[0][0] = 0.1), "INVALID_SPECTRUM");
    assert_eq!(
        bad(&|s| s.points[2][0] = s.points[1][0]),
        "INVALID_SPECTRUM"
    );
    assert_eq!(bad(&|s| s.points[1][1] = -1.), "INVALID_SPECTRUM");
    assert_eq!(bad(&|s| s.damping_ratio = 0.), "INVALID_SPECTRUM");
    assert_eq!(bad(&|s| s.points.truncate(1)), "INVALID_SPECTRUM");
    let s = &p.response_spectra[0];
    assert_eq!(s.sa(0.3), Some(5.));
    assert_eq!(s.sa(1.5), Some(1.875));
    assert_eq!(s.sa(4.5), None);
}
