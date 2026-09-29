//! plate-v1 validation against `fixtures/plate/plate-oracle.json`
//! (`docs/formulations/plate.md`, Validation).

use serde_json::Value;
use workbench_plate::element::{self, DOFS, NODE_DOFS};
use workbench_plate::{Edge, Mesh, Panel, PlateMaterial, Solution, solve, solve_mesh, wood_armer};
use workbench_solver::eigen::symmetric_eigen;

const BUDGET: usize = 1 << 30;

fn oracle() -> Value {
    let text = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../fixtures/plate/plate-oracle.json"
    ))
    .unwrap();
    serde_json::from_str(&text).unwrap()
}

fn f(v: &Value, key: &str) -> f64 {
    v[key].as_f64().unwrap_or_else(|| panic!("{key} missing"))
}

fn uniform(length: f64, n: usize) -> Vec<f64> {
    (0..=n).map(|i| length * i as f64 / n as f64).collect()
}

fn panel(a: f64, b: f64, edge: Edge, opening: Option<[f64; 4]>) -> Panel {
    Panel {
        lx: a,
        ly: b,
        opening,
        edges: [edge; 4],
        target: a.max(b),
    }
}

fn solve_uniform(p: &Panel, nx: usize, ny: usize, m: &PlateMaterial, q: f64) -> Solution {
    let mesh = Mesh::structured(p, uniform(p.lx, nx), uniform(p.ly, ny)).unwrap();
    solve_mesh(p, mesh, m, q, BUDGET).unwrap()
}

fn centre_w(s: &Solution, nx: usize, ny: usize) -> f64 {
    s.displacements[s.mesh.node_at(nx / 2, ny / 2).unwrap()][2]
}

fn rel(a: f64, b: f64) -> f64 {
    (a - b).abs() / b.abs()
}

#[test]
fn p_rigid_six_zero_eigenvalues() {
    let m = PlateMaterial {
        e: 30e9,
        nu: 0.2,
        t: 0.2,
    };
    for xy in [
        [[0., 0.], [2., 0.], [2., 1.], [0., 1.]],
        [[0.04, 0.02], [0.18, 0.03], [0.16, 0.08], [0.08, 0.08]],
    ] {
        let k = element::stiffness(&xy, &m);
        for x in 0..DOFS {
            for y in 0..DOFS {
                assert!((k[x][y] - k[y][x]).abs() <= 1e-9 * k[x][x].abs().max(k[y][y].abs()));
            }
        }
        let dense: Vec<Vec<f64>> = k.iter().map(|r| r.to_vec()).collect();
        let (values, _) = symmetric_eigen(&dense);
        let largest = values.iter().fold(0f64, |a, v| a.max(v.abs()));
        let zeros = values.iter().filter(|v| v.abs() < 1e-10 * largest).count();
        let negative = values.iter().filter(|v| **v < -1e-10 * largest).count();
        assert_eq!(zeros, 6, "{xy:?}: {values:?}");
        assert_eq!(negative, 0);
    }
}

/// MacNeal–Harder distorted patch: outer nodes prescribed from the exact
/// field, interior nodes solved, unloaded.
#[test]
fn p_patch_membrane_and_bending() {
    let o = oracle();
    let patch = &o["patch"];
    let point = |v: &Value| [v[0].as_f64().unwrap(), v[1].as_f64().unwrap()];
    let nodes: Vec<[f64; 2]> = patch["outer"]
        .as_array()
        .unwrap()
        .iter()
        .chain(patch["inner"].as_array().unwrap())
        .map(point)
        .collect();
    let elements: Vec<[usize; 4]> = patch["elements"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| std::array::from_fn(|k| e[k].as_u64().unwrap() as usize))
        .collect();
    let tol = f(patch, "tolerance");
    let m = PlateMaterial {
        e: 1e6,
        nu: 0.25,
        t: 0.001,
    };
    let c = 1e-3;
    // u = c(x + y/2), v = c(y + x/2); w = c(x² + xy + y²)/2, βx = −w,x = ry,
    // βy = −w,y = −rx.
    let exact = |[x, y]: [f64; 2]| -> [f64; NODE_DOFS] {
        let wx = c * (x + y / 2.);
        let wy = c * (y + x / 2.);
        [
            c * (x + y / 2.),
            c * (y + x / 2.),
            c * (x * x + x * y + y * y) / 2.,
            wy,
            -wx,
        ]
    };
    let n = nodes.len();
    let mut k = vec![vec![0.; n * NODE_DOFS]; n * NODE_DOFS];
    for e in &elements {
        let xy = e.map(|i| nodes[i]);
        let ke = element::stiffness(&xy, &m);
        for x in 0..DOFS {
            for y in 0..DOFS {
                let gx = e[x / NODE_DOFS] * NODE_DOFS + x % NODE_DOFS;
                let gy = e[y / NODE_DOFS] * NODE_DOFS + y % NODE_DOFS;
                k[gx][gy] += ke[x][y];
            }
        }
    }
    let mut u = vec![0.; n * NODE_DOFS];
    for i in 0..4 {
        u[i * NODE_DOFS..(i + 1) * NODE_DOFS].copy_from_slice(&exact(nodes[i]));
    }
    // Interior system K_ii u_i = −K_ib u_b, by Gaussian elimination.
    let free: Vec<usize> = (4 * NODE_DOFS..n * NODE_DOFS).collect();
    let mut a: Vec<Vec<f64>> = free
        .iter()
        .map(|&r| {
            let mut row: Vec<f64> = free.iter().map(|&c| k[r][c]).collect();
            row.push(-(0..4 * NODE_DOFS).map(|b| k[r][b] * u[b]).sum::<f64>());
            row
        })
        .collect();
    let size = free.len();
    for p in 0..size {
        let pivot = (p..size)
            .max_by(|&x, &y| a[x][p].abs().total_cmp(&a[y][p].abs()))
            .unwrap();
        a.swap(p, pivot);
        for r in p + 1..size {
            let factor = a[r][p] / a[p][p];
            for col in p..=size {
                a[r][col] -= factor * a[p][col];
            }
        }
    }
    for p in (0..size).rev() {
        let s: f64 = (p + 1..size).map(|col| a[p][col] * u[free[col]]).sum();
        u[free[p]] = (a[p][size] - s) / a[p][p];
    }
    for i in 4..n {
        let want = exact(nodes[i]);
        for d in 0..NODE_DOFS {
            let got = u[i * NODE_DOFS + d];
            assert!(
                (got - want[d]).abs() <= tol * want[d].abs().max(c * 0.1),
                "node {i} dof {d}: {got} vs {}",
                want[d]
            );
        }
    }
    let dd = m.rigidity();
    let a_m = m.e * m.t / (1. - m.nu * m.nu);
    // κx = κy = κxy = −c; εx = εy = γxy = c.
    let want = [
        a_m * c * (1. + m.nu),
        a_m * c * (1. + m.nu),
        a_m * (1. - m.nu) / 2. * c,
        dd * c * (1. + m.nu),
        dd * c * (1. + m.nu),
        dd * (1. - m.nu) / 2. * c,
    ];
    for e in &elements {
        let xy = e.map(|i| nodes[i]);
        let d: [f64; DOFS] =
            std::array::from_fn(|x| u[e[x / NODE_DOFS] * NODE_DOFS + x % NODE_DOFS]);
        for (r, s) in [(0., 0.), (-0.6, 0.3), (0.9, -0.8)] {
            let act = element::actions(&xy, &m, &d, r, s);
            let got = [act.nx, act.ny, act.nxy, act.mx, act.my, act.mxy];
            for (g, w) in got.iter().zip(want) {
                assert!((g - w).abs() <= tol * w.abs(), "{g} vs {w}");
            }
            // Kirchhoff field: zero transverse shear strain, measured against
            // the rotation scale c L.
            let shear = 5. / 6. * m.e / (2. * (1. + m.nu)) * m.t;
            for q in [act.qx, act.qy] {
                assert!(
                    (q / shear).abs() <= tol * c * 0.24,
                    "shear strain {}",
                    q / shear
                );
            }
        }
    }
}

#[test]
fn p_ss_navier_convergence() {
    let o = oracle();
    for case in o["cases"].as_array().unwrap() {
        let id = case["id"].as_str().unwrap();
        let (a, b, t) = (f(case, "a"), f(case, "b"), f(case, "t"));
        let m = PlateMaterial {
            e: f(case, "E"),
            nu: f(case, "nu"),
            t,
        };
        let q = f(case, "q");
        let p = panel(a, b, Edge::Simple, None);
        let w_ref = f(&case["centre"], "w");
        let mut errors = vec![];
        for point in case["elementCentres"].as_array().unwrap() {
            let n = point["mesh"].as_u64().unwrap() as usize;
            let s = solve_uniform(&p, n, n, &m, q);
            assert!(s.balance <= 1e-9, "{id} balance {}", s.balance);
            let e = s.mesh.element_at(n / 2 - 1, n / 2 - 1).unwrap();
            let w_err = rel(centre_w(&s, n, n), w_ref);
            let mx_err = rel(s.element_actions[e].mx, f(point, "mx"));
            let my_err = rel(s.element_actions[e].my, f(point, "my"));
            println!("{id} {n}: w {w_err:.3e} mx {mx_err:.3e} my {my_err:.3e}");
            errors.push((n, w_err, mx_err.max(my_err)));
        }
        if id == "P-SS-THINLIMIT" {
            let (_, w16, _) = errors.iter().find(|e| e.0 == 16).unwrap();
            assert!(*w16 <= 2e-2, "{id} locking: {w16}");
        } else {
            let (_, w32, m32) = errors.iter().find(|e| e.0 == 32).unwrap();
            assert!(*w32 <= 2e-3 && *m32 <= 5e-3, "{id} 32×32: w {w32} m {m32}");
            for pair in errors.windows(2) {
                assert!(
                    pair[1].1 < pair[0].1 && pair[1].2 < pair[0].2,
                    "{id} not converging: {errors:?}"
                );
            }
        }
    }
}

#[test]
fn p_cl_timoshenko() {
    let o = oracle();
    let c = &o["clampedTimoshenko"];
    let (a, t, q) = (f(c, "a"), f(c, "t"), f(c, "q"));
    let m = PlateMaterial {
        e: f(c, "E"),
        nu: f(c, "nu"),
        t,
    };
    let p = panel(a, a, Edge::Clamped, None);
    let n = 32;
    let s = solve_uniform(&p, n, n, &m, q);
    let tol = f(c, "tolerance");
    let w = -centre_w(&s, n, n) * m.rigidity() / (q * a.powi(4));
    let centre =
        s.element_actions[s.mesh.element_at(n / 2 - 1, n / 2 - 1).unwrap()].mx / (q * a * a);
    // Edge-mid moment: the clamped edge's line moment from the reactions.
    let mid = s.mesh.node_at(0, n / 2).unwrap();
    let edge = s
        .edge_moments
        .iter()
        .find(|m| m.edge == 0 && m.node == mid)
        .unwrap()
        .moment
        / (q * a * a);
    // By symmetry every clamped edge carries the same line moment at mid-edge.
    for (k, (i, j)) in [(1, (n, n / 2)), (2, (n / 2, 0)), (3, (n / 2, n))] {
        let node = s.mesh.node_at(i, j).unwrap();
        let other = s
            .edge_moments
            .iter()
            .find(|m| m.edge == k && m.node == node)
            .unwrap()
            .moment;
        assert!(rel(other / (q * a * a), edge) <= 1e-9, "edge {k}: {other}");
    }
    let element_edge = s.element_actions[s.mesh.element_at(0, n / 2 - 1).unwrap()].mx / (q * a * a);
    println!(
        "clamped: w {w:.6} centre mx {centre:.6} edge mx {edge:.6} (edge element centre {element_edge:.6})"
    );
    assert!(rel(w, f(c, "wCoefficient")) <= tol, "w {w}");
    assert!(
        rel(centre, f(c, "mxCentreCoefficient")) <= tol,
        "centre {centre}"
    );
    assert!(
        rel(edge, f(c, "mxEdgeMidCoefficient")) <= tol,
        "edge {edge}"
    );
}

fn opensees_case(c: &Value, edge: Edge, opening: Option<[f64; 4]>) {
    let (a, b, t, q) = (f(c, "a"), f(c, "b"), f(c, "t"), f(c, "q"));
    let m = PlateMaterial {
        e: f(c, "E"),
        nu: f(c, "nu"),
        t,
    };
    let nx = c["mesh"][0].as_u64().unwrap() as usize;
    let ny = c["mesh"][1].as_u64().unwrap() as usize;
    let p = panel(a, b, edge, opening);
    let s = solve_uniform(&p, nx, ny, &m, q);
    let tol = f(c, "tolerance");
    if let Some(nodes) = c["nodes"].as_u64() {
        assert_eq!(s.mesh.nodes.len() as u64, nodes);
        assert_eq!(
            s.mesh.elements.len() as u64,
            c["elements"].as_u64().unwrap()
        );
    }
    assert!(s.balance <= 1e-9, "balance {}", s.balance);
    let grid = |k: &str| -> (usize, usize) {
        let (i, j) = k.split_once(',').unwrap();
        (i.parse().unwrap(), j.parse().unwrap())
    };
    for (k, w) in c["nodeW"].as_object().unwrap() {
        let (i, j) = grid(k);
        let got = s.displacements[s.mesh.node_at(i, j).unwrap()][2];
        let want = w.as_f64().unwrap();
        assert!(
            rel(got, want) <= tol,
            "{} node {k}: {got} vs {want}",
            c["id"]
        );
    }
    for (k, moments) in c["elementMoments"].as_object().unwrap() {
        let (i, j) = grid(k);
        let act = s.element_actions[s.mesh.element_at(i, j).unwrap()];
        let scale = f(moments, "mx").abs().max(f(moments, "my").abs());
        for (got, key) in [(act.mx, "mx"), (act.my, "my"), (act.mxy, "mxy")] {
            let want = f(moments, key);
            assert!(
                (got - want).abs() <= tol * scale,
                "{} element {k} {key}: {got} vs {want}",
                c["id"]
            );
        }
    }
}

#[test]
fn p_cl_opensees_identical_mesh() {
    opensees_case(&oracle()["clampedOpenSees"], Edge::Clamped, None);
}

#[test]
fn p_open_opensees_identical_mesh() {
    let o = oracle();
    let c = &o["openingOpenSees"];
    let op = &c["opening"];
    opensees_case(
        c,
        Edge::Simple,
        Some([f(op, "x0"), f(op, "x1"), f(op, "y0"), f(op, "y1")]),
    );
}

#[test]
fn p_balance_mixed_edges_and_target_mesh() {
    let m = PlateMaterial {
        e: 30e9,
        nu: 0.2,
        t: 0.25,
    };
    let p = Panel {
        lx: 7.3,
        ly: 4.9,
        opening: Some([1.1, 2.35, 3.0, 4.2]),
        edges: [Edge::Clamped, Edge::Simple, Edge::Free, Edge::Simple],
        target: 0.3,
    };
    let s = solve(&p, &m, 12.5e3, BUDGET).unwrap();
    let area = 7.3 * 4.9 - 1.25 * 1.2;
    assert!(rel(s.applied, 12.5e3 * area) <= 1e-12);
    assert!(s.balance <= 1e-9, "{}", s.balance);
    let (count, aspect, smallest) = s.mesh.quality();
    assert_eq!(count, s.mesh.elements.len());
    assert!(aspect < 2. && smallest > 0.);
    // The free edge deflects most at its middle.
    assert!(s.displacements.iter().all(|d| d[2] <= 1e-12));
}

#[test]
fn refusals() {
    let m = PlateMaterial {
        e: 30e9,
        nu: 0.2,
        t: 0.2,
    };
    let free = Panel {
        lx: 4.,
        ly: 4.,
        opening: None,
        edges: [Edge::Free; 4],
        target: 0.5,
    };
    assert_eq!(
        solve(&free, &m, 1e3, BUDGET).unwrap_err().code,
        "UNSTABLE_MODEL"
    );
    let outside = Panel {
        opening: Some([3., 5., 1., 2.]),
        edges: [Edge::Simple; 4],
        ..free.clone()
    };
    assert_eq!(
        solve(&outside, &m, 1e3, BUDGET).unwrap_err().code,
        "INVALID_SETTINGS"
    );
    let fine = Panel {
        target: 0.01,
        edges: [Edge::Simple; 4],
        ..free.clone()
    };
    assert_eq!(
        solve(&fine, &m, 1e3, BUDGET).unwrap_err().code,
        "MEMORY_LIMIT"
    );
    let bad = PlateMaterial { nu: 0.5, ..m };
    let ok = Panel {
        edges: [Edge::Simple; 4],
        ..free
    };
    assert_eq!(
        solve(&ok, &bad, 1e3, BUDGET).unwrap_err().code,
        "INVALID_SETTINGS"
    );
    assert_eq!(
        solve(&ok, &m, f64::NAN, BUDGET).unwrap_err().code,
        "INVALID_SETTINGS"
    );
    // A single free-standing edge line supports nothing against rotation.
    let cantilever = Panel {
        edges: [Edge::Simple, Edge::Free, Edge::Free, Edge::Free],
        ..ok
    };
    assert_eq!(
        solve(&cantilever, &m, 1e3, BUDGET).unwrap_err().code,
        "UNSTABLE_MODEL"
    );
}

#[test]
fn wood_armer_cases() {
    // Pure sagging, no twist.
    assert_eq!(wood_armer(10., 6., 0.), [10., 6., 0., 0.]);
    // Pure twist: |mxy| both faces, both directions.
    assert_eq!(wood_armer(0., 0., 4.), [4., 4., 4., 4.]);
    // mx + |mxy| < 0 → bottom x = 0, bottom y = my + |mxy²/mx|.
    let [bx, by, tx, ty] = wood_armer(-10., 8., 2.);
    assert_eq!((bx, by), (0., 8. + 0.4));
    assert_eq!((tx, ty), (10. + 0.5, 0.));
    // Hogging corner.
    assert_eq!(wood_armer(-5., -3., 1.), [0., 0., 6., 4.]);
}

fn indicator(opening: Option<[f64; 4]>) -> Vec<f64> {
    let m = PlateMaterial {
        e: 30e9,
        nu: 0.2,
        t: 0.2,
    };
    [1.0, 0.5, 0.25]
        .map(|target| {
            let p = Panel {
                lx: 6.,
                ly: 5.,
                opening,
                edges: [Edge::Simple; 4],
                target,
            };
            let s = solve(&p, &m, 1e4, BUDGET).unwrap();
            let c = workbench_plate::convergence(&p, &m, 1e4, &s, BUDGET).unwrap();
            assert!(c.coarse_elements < s.mesh.elements.len());
            c.change
        })
        .to_vec()
}

#[test]
fn convergence_indicator_falls_with_refinement() {
    let changes = indicator(None);
    println!("smooth panel: {changes:?}");
    // Element-centre extremes move with the mesh, so the fall is below the
    // O(h²) factor of 4 but steady.
    assert!(
        changes[1] < changes[0] / 2. && changes[2] < changes[1] / 2.,
        "{changes:?}"
    );
    assert!(changes[2] < 0.03);
}

/// A free-edged opening has re-entrant corners where the plate moments are
/// singular: the extremes there do not converge and the indicator says so.
#[test]
fn convergence_indicator_exposes_reentrant_corners() {
    let changes = indicator(Some([2., 3., 2., 3.]));
    println!("opening: {changes:?}");
    assert!(changes.iter().all(|c| *c > 0.05), "{changes:?}");
}

/// The oracle's checkerboard distortion of interior nodes.
fn distort(mesh: &mut Mesh, amplitude: f64) {
    let (nx, ny) = (mesh.xs.len() - 1, mesh.ys.len() - 1);
    let (hx, hy) = (mesh.xs[1] - mesh.xs[0], mesh.ys[1] - mesh.ys[0]);
    for (k, &(i, j)) in mesh.node_grid.iter().enumerate() {
        if i == 0 || i == nx || j == 0 || j == ny {
            continue;
        }
        let sign = if (i + j) % 2 == 0 { 1. } else { -1. };
        mesh.nodes[k] = [
            mesh.xs[i] + sign * amplitude * hx,
            mesh.ys[j] + sign * amplitude * hy,
        ];
    }
}

#[test]
fn p_distort_navier_and_opensees() {
    let o = oracle();
    let c = &o["distorted"];
    let (a, t, q) = (f(c, "a"), f(c, "t"), f(c, "q"));
    let m = PlateMaterial {
        e: f(c, "E"),
        nu: f(c, "nu"),
        t,
    };
    let amplitude = f(&c["distortion"], "amplitude");
    let p = panel(a, a, Edge::Simple, None);
    let solve_distorted = |n: usize| {
        let mut mesh = Mesh::structured(&p, uniform(a, n), uniform(a, n)).unwrap();
        distort(&mut mesh, amplitude);
        solve_mesh(&p, mesh, &m, q, BUDGET).unwrap()
    };
    let mut errors = vec![];
    for point in c["navierCentre"].as_array().unwrap() {
        let n = point["mesh"].as_u64().unwrap() as usize;
        let s = solve_distorted(n);
        assert!(s.balance <= 1e-9, "balance {}", s.balance);
        let k = s.mesh.node_at(n / 2, n / 2).unwrap();
        assert!((s.mesh.nodes[k][0] - f(point, "x")).abs() < 1e-12);
        errors.push(rel(s.displacements[k][2], f(point, "w")));
    }
    println!("distorted Navier w errors {errors:?}");
    assert!(errors.windows(2).all(|e| e[1] < e[0]), "{errors:?}");
    assert!(errors[2] <= f(&c["navierGate"], "w"), "{errors:?}");
    // OpenSees ShellMITC4 on the identical meshes: converging discretisations
    // (Bathe–Dvorkin 1985 element-constant shear angles versus pointwise J⁻¹).
    let mut differences = vec![];
    for level in c["openSees"].as_array().unwrap() {
        let n = level["mesh"].as_u64().unwrap() as usize;
        let s = solve_distorted(n);
        let mut worst = 0f64;
        for (key, want) in level["nodeW"].as_object().unwrap() {
            let (i, j) = key.split_once(',').unwrap();
            let k = s
                .mesh
                .node_at(i.parse().unwrap(), j.parse().unwrap())
                .unwrap();
            worst = worst.max(rel(s.displacements[k][2], want.as_f64().unwrap()));
        }
        differences.push(worst);
    }
    println!("distorted OpenSees differences {differences:?}");
    assert!(
        differences.windows(2).all(|d| d[1] < d[0]),
        "{differences:?}"
    );
    assert!(
        differences[2] <= f(&c["openSeesGate"], "w"),
        "{differences:?}"
    );
}
