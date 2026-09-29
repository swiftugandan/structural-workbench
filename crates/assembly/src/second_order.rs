//! Second-order (P-Δ-δ) elastic analysis (stability-v1,
//! `docs/formulations/stability.md`, ADR 0017).
//!
//! One real case/combination is applied proportionally to the expanded and
//! subdivided model. Element axial forces are updated by successive
//! substitution: (K + K_G(N_k)) u_{k+1} = F. A failed analysis returns an
//! error with its convergence history and never a response.

use std::collections::BTreeMap;

use serde_json::{Value, json};
use sprs::TriMat;
use workbench_frame::{Matrix, geometric, mul, stiffness, transform, uniform};
use workbench_geometry::{axes, cross, global, local};
use workbench_model::{Load, Material, Project, Result, Section, digest, err};
use workbench_results::{Analysis, KeyStation, MemberResult, Sample};
use workbench_solver::{LinearSolver, SparseLdl};

use crate::expand::expand_point_loads;
use crate::stability::{dofs, subdivide};
use crate::{case_factors, member_load_density, section_actions};

pub const MAX_ITERATIONS: usize = 100;
const TOLERANCE: f64 = 1e-10;
const DIVERGING_STREAK: usize = 5;

/// Initial imperfection, always stated explicitly.
#[derive(Clone, Copy, Debug)]
pub enum Imperfection {
    None,
    /// Equivalent horizontal nodal forces H = ratio · V along the stated
    /// global horizontal direction, V being each node's downward applied load.
    Sway {
        ratio: f64,
        direction: [f64; 2],
    },
}

#[derive(Clone, Copy, Debug)]
pub struct SecondOrderSettings {
    pub subdivisions: usize,
    pub imperfection: Imperfection,
}

struct Element<'a> {
    id: String,
    i: usize,
    j: usize,
    l: f64,
    r: [[f64; 3]; 3],
    k: Matrix,
    fe: [f64; 12],
    q: [f64; 3],
    material: &'a Material,
    section: &'a Section,
    /// Hinge DOFs at the start (0) and end (1): (index in the extended
    /// displacement vector, free DOF, released axis in global coordinates).
    hinges: [Vec<(usize, usize, [f64; 3])>; 2],
}

impl Element<'_> {
    fn ids(&self) -> [usize; 12] {
        std::array::from_fn(|x| {
            if x < 6 {
                self.i * 6 + x
            } else {
                self.j * 6 + x - 6
            }
        })
    }
    /// Element DOFs in global axes: the node DOFs, with each released end
    /// rotation carrying its hinge DOF along the released axis.
    fn global_displacements(&self, u: &[f64]) -> [f64; 12] {
        let ids = self.ids();
        let mut dg: [f64; 12] = std::array::from_fn(|x| u[ids[x]]);
        for (end, list) in self.hinges.iter().enumerate() {
            for &(ext, _, axis) in list {
                for c in 0..3 {
                    dg[end * 6 + 3 + c] += axis[c] * u[ext];
                }
            }
        }
        dg
    }
    fn local_displacements(&self, u: &[f64]) -> [f64; 12] {
        let dg = self.global_displacements(u);
        let mut dl = [0.; 12];
        for block in 0..4 {
            let v = local(self.r, [dg[block * 3], dg[block * 3 + 1], dg[block * 3 + 2]]);
            dl[block * 3..block * 3 + 3].copy_from_slice(&v);
        }
        dl
    }
    /// Axial force (tension positive) from the elastic part alone: K_G has no
    /// axial terms.
    fn axial(&self, u: &[f64]) -> f64 {
        let kd = mul(&self.k, &self.local_displacements(u));
        ((kd[6] - self.fe[6]) - (kd[0] - self.fe[0])) / 2.
    }
    /// End actions applied by the nodes to the element, including second-order terms.
    fn end_actions(&self, u: &[f64], n: f64) -> [f64; 12] {
        let dl = self.local_displacements(u);
        let kg = geometric(self.l, n);
        let kt: Matrix = std::array::from_fn(|a| std::array::from_fn(|b| self.k[a][b] + kg[a][b]));
        let kd = mul(&kt, &dl);
        std::array::from_fn(|a| kd[a] - self.fe[a])
    }
}

fn inf(v: impl Iterator<Item = f64>) -> f64 {
    v.map(f64::abs).fold(0., f64::max)
}

fn failure(
    reason: &str,
    message: String,
    iteration: usize,
    history: &[Value],
) -> workbench_model::Diagnostic {
    let mut e = err("NONCONVERGED", message);
    e.details = json!({"reason": reason, "iteration": iteration, "history": history});
    e
}

pub fn second_order(
    project: &Project,
    case: &str,
    settings: &SecondOrderSettings,
) -> Result<Analysis> {
    if !(1..=32).contains(&settings.subdivisions) {
        return Err(err(
            "INVALID_SETTINGS",
            "Stability subdivisions must be 1–32",
        ));
    }
    let imperfection = match settings.imperfection {
        Imperfection::None => None,
        Imperfection::Sway { ratio, direction } => {
            let norm = direction[0].hypot(direction[1]);
            if !(ratio.is_finite() && ratio > 0. && ratio <= 0.1)
                || !(norm.is_finite() && norm > 0.)
            {
                return Err(err(
                    "INVALID_SETTINGS",
                    "A sway imperfection needs a ratio in (0, 0.1] and a nonzero horizontal direction",
                ));
            }
            Some((ratio, [direction[0] / norm, direction[1] / norm]))
        }
    };
    project.validate()?;
    let mut original = project.clone();
    original.canonicalise();
    let model_hash = original.hash();
    let imperfection_json = match imperfection {
        None => json!({"kind": "none"}),
        Some((ratio, d)) => json!({"kind": "sway", "ratio": ratio, "direction": d}),
    };
    let settings_hash = digest(
        &serde_json::to_vec(&json!({
            "analysisSettings": original.analysis_settings,
            "stability": {
                "analysisType": "secondOrder",
                "formulation": "stability-v1",
                "subdivisions": settings.subdivisions,
                "imperfection": imperfection_json,
            }
        }))
        .unwrap(),
    );
    let (expanded, splits) = expand_point_loads(&original)?;
    let mesh = subdivide(&expanded, settings.subdivisions)?;
    let p = &mesh.project;
    let factors = case_factors(p, case)?;
    let d = dofs(p);
    let nd = p.nodes.len() * 6;
    // Hinge DOFs follow the node DOFs in the extended displacement vector.
    let hinge_ext: BTreeMap<usize, usize> = d
        .hinges
        .values()
        .flatten()
        .enumerate()
        .map(|(k, h)| (h.dof, nd + k))
        .collect();
    let nu = nd + hinge_ext.len();
    let position: BTreeMap<&str, [f64; 3]> = p
        .nodes
        .iter()
        .map(|x| (x.id.as_str(), x.position))
        .collect();

    // Elements and the factored load vector (nodal loads + equivalent member loads).
    let mut f = vec![0.; nd];
    for load in &p.loads {
        if let Load::Nodal {
            case, node, values, ..
        } = load
        {
            let factor = *factors.get(case).unwrap_or(&0.);
            for a in 0..6 {
                f[d.node[node] * 6 + a] += values[a] * factor;
            }
        }
    }
    let mut elements = vec![];
    for m in &p.members {
        let (l, r) = axes(
            position[m.start.as_str()],
            position[m.end.as_str()],
            m.local_y,
        );
        let material = p.materials.iter().find(|x| x.id == m.material).unwrap();
        let section = p.sections.iter().find(|x| x.id == m.section).unwrap();
        let q = member_load_density(p, m, r, &factors);
        let e = Element {
            id: m.id.clone(),
            i: d.node[&m.start],
            j: d.node[&m.end],
            l,
            r,
            k: stiffness(l, material, section),
            fe: uniform(l, q),
            q,
            material,
            section,
            hinges: std::array::from_fn(|end| {
                d.hinges
                    .get(&(m.id.clone(), end))
                    .map(|list| list.iter().map(|h| (hinge_ext[&h.dof], h.dof, h.axis)).collect())
                    .unwrap_or_default()
            }),
        };
        let ids = e.ids();
        for block in 0..4 {
            let v = global(
                r,
                [e.fe[block * 3], e.fe[block * 3 + 1], e.fe[block * 3 + 2]],
            );
            for a in 0..3 {
                f[ids[block * 3 + a]] += v[a];
            }
        }
        elements.push(e);
    }
    // Equivalent sway forces from each node's downward applied load.
    let mut sway_forces = vec![];
    if let Some((ratio, dir)) = imperfection {
        for (i, node) in p.nodes.iter().enumerate() {
            let v = -f[i * 6 + 2];
            if v != 0. {
                let h = ratio * v;
                f[i * 6] += h * dir[0];
                f[i * 6 + 1] += h * dir[1];
                sway_forces.push(json!({"nodeId": node.id, "force": [h * dir[0], h * dir[1], 0.]}));
            }
        }
    }

    let budget = p.analysis_settings.memory_limit_mi_b as usize * 1024 * 1024 / 2;
    // Solve (K + K_G(N)) u = F with prescribed displacements partitioned out.
    let solve = |axial: &[f64]| -> Result<(Vec<f64>, f64)> {
        let mut t = TriMat::new((d.count, d.count));
        let mut rhs: Vec<f64> = vec![0.; d.count];
        for (g, free) in d.free.iter().enumerate() {
            if let Some(a) = free {
                rhs[*a] = f[g];
            }
        }
        for (e, &n) in elements.iter().zip(axial) {
            let kg = geometric(e.l, n);
            let kt: Matrix = std::array::from_fn(|a| std::array::from_fn(|b| e.k[a][b] + kg[a][b]));
            let g = transform(&kt, e.r);
            let ids = e.ids();
            // Each element DOF as free DOFs with coefficients, or a prescribed value.
            let mut free: [Vec<(usize, f64)>; 12] = std::array::from_fn(|x| {
                d.free[ids[x]].map(|a| vec![(a, 1.)]).unwrap_or_default()
            });
            for (end, list) in e.hinges.iter().enumerate() {
                for &(_, dof, axis) in list {
                    for c in 0..3 {
                        if axis[c] != 0. {
                            free[end * 6 + 3 + c].push((dof, axis[c]));
                        }
                    }
                }
            }
            let fixed: [f64; 12] = std::array::from_fn(|x| {
                if d.free[ids[x]].is_none() { d.prescribed[ids[x]] } else { 0. }
            });
            for x in 0..12 {
                for y in 0..12 {
                    if g[x][y] == 0. {
                        continue;
                    }
                    for &(a, ca) in &free[x] {
                        for &(b, cb) in &free[y] {
                            t.add_triplet(a, b, g[x][y] * ca * cb);
                        }
                        rhs[a] -= ca * g[x][y] * fixed[y];
                    }
                }
            }
        }
        let solved = SparseLdl.solve(&t.to_csc(), &rhs, budget)?;
        let mut u = d.prescribed.clone();
        u.resize(nu, 0.);
        for (g, free) in d.free.iter().enumerate() {
            if let Some(a) = free {
                u[g] = solved.values[*a];
            }
        }
        for (&dof, &ext) in &hinge_ext {
            u[ext] = solved.values[dof];
        }
        Ok((u, solved.residual))
    };

    let mut axial = vec![0.; elements.len()];
    let mut previous: Option<Vec<f64>> = None;
    // Iteration 0 solves K u = F with the same loads (imperfection included)
    // on the same mesh: the first-order response the second-order one amplifies.
    let mut first_order: Option<Vec<f64>> = None;
    let mut history: Vec<Value> = vec![];
    let mut growing = 0;
    let mut last_increment = f64::INFINITY;
    let (u, residual, iterations) = 'iterate: {
        for iteration in 0..=MAX_ITERATIONS {
            let (u, residual) = match solve(&axial) {
                Ok(x) => x,
                // The first solve is linear: a failure there is the model's own.
                Err(e) if iteration == 0 => return Err(e),
                Err(e) if e.code == "UNSTABLE_MODEL" => {
                    return Err(failure(
                        "TANGENT_NOT_POSITIVE_DEFINITE",
                        format!(
                            "K + K_G is not positive definite at iteration {iteration}: the load is at or beyond the elastic critical state ({})",
                            e.message
                        ),
                        iteration,
                        &history,
                    ));
                }
                Err(e) => return Err(e),
            };
            workbench_model::finite(&u)?;
            if iteration == 0 {
                first_order = Some(u.clone());
            }
            let next: Vec<f64> = elements.iter().map(|e| e.axial(&u)).collect();
            let (dt, dr) = match &previous {
                Some(prev) => (
                    inf((0..nd).filter(|g| g % 6 < 3).map(|g| u[g] - prev[g])),
                    inf((0..nd).filter(|g| g % 6 >= 3).map(|g| u[g] - prev[g])),
                ),
                None => (f64::INFINITY, f64::INFINITY),
            };
            let dn = inf(next.iter().zip(&axial).map(|(a, b)| a - b));
            let (ut, ur) = (
                inf((0..nd).filter(|g| g % 6 < 3).map(|g| u[g])),
                inf((0..nd).filter(|g| g % 6 >= 3).map(|g| u[g])),
            );
            let nmax = inf(next.iter().copied());
            history.push(json!({
                "iteration": iteration,
                "maxTranslationIncrement": if dt.is_finite() { json!(dt) } else { Value::Null },
                "maxRotationIncrement": if dr.is_finite() { json!(dr) } else { Value::Null },
                "maxAxialChange": dn,
                "scaledResidual": residual,
            }));
            let converged = previous.is_some()
                && dt <= TOLERANCE * ut.max(1e-12)
                && dr <= TOLERANCE * ur.max(1e-12)
                && dn <= TOLERANCE * nmax + 1e-6;
            if converged {
                break 'iterate (u, residual, iteration);
            }
            if dt.is_finite() {
                growing = if dt > last_increment { growing + 1 } else { 0 };
                last_increment = dt;
                if growing >= DIVERGING_STREAK {
                    return Err(failure(
                        "DIVERGING",
                        format!(
                            "Displacement increments grew for {DIVERGING_STREAK} consecutive iterations"
                        ),
                        iteration,
                        &history,
                    ));
                }
            }
            axial = next;
            previous = Some(u);
        }
        return Err(failure(
            "ITERATION_LIMIT",
            format!("No convergence in {MAX_ITERATIONS} iterations"),
            MAX_ITERATIONS,
            &history,
        ));
    };

    // Support reactions of a displacement field with the given axial forces:
    // element end actions assembled globally, minus the applied loads.
    let reactions_of = |u: &[f64], axial: &[f64]| -> (Vec<[f64; 12]>, Vec<f64>) {
        let ends: Vec<[f64; 12]> = elements
            .iter()
            .zip(axial)
            .map(|(e, &n)| e.end_actions(u, n))
            .collect();
        let mut reactions = f.iter().map(|v| -v).collect::<Vec<_>>();
        for (e, end) in elements.iter().zip(&ends) {
            let ids = e.ids();
            for block in 0..4 {
                let v = global(
                    e.r,
                    [end[block * 3], end[block * 3 + 1], end[block * 3 + 2]],
                );
                for a in 0..3 {
                    reactions[ids[block * 3 + a]] += v[a];
                }
            }
        }
        (ends, reactions)
    };
    // Recovery with the axial forces of the converged tangent.
    let (ends, reactions) = reactions_of(&u, &axial);
    // Global balance of applied loads and support reactions, forces and
    // moments, with moments taken about the origin in the deformed geometry.
    let mut balance = [0.; 6];
    let mut scale = [0.; 2];
    for (i, node) in p.nodes.iter().enumerate() {
        let at = |a: usize| {
            f[i * 6 + a]
                + if d.free[i * 6 + a].is_none() {
                    reactions[i * 6 + a]
                } else {
                    0.
                }
        };
        let deformed: [f64; 3] = std::array::from_fn(|a| node.position[a] + u[i * 6 + a]);
        let force = [at(0), at(1), at(2)];
        let moment = cross(deformed, force);
        for a in 0..3 {
            balance[a] += force[a];
            balance[a + 3] += at(a + 3) + moment[a];
            scale[0] += f[i * 6 + a].abs();
            scale[1] += f[i * 6 + a + 3].abs();
        }
        scale[1] += cross(deformed, [f[i * 6], f[i * 6 + 1], f[i * 6 + 2]])
            .iter()
            .map(|x| x.abs())
            .sum::<f64>();
    }
    if balance[..3]
        .iter()
        .any(|x| x.abs() > 1e-3 + 1e-8 * scale[0])
    {
        return Err(err(
            "EQUILIBRIUM_FAILURE",
            format!("Global force balance {balance:?}"),
        ));
    }

    // Physical members: samples at mesh nodes and element midpoints, key
    // stations at the ends and every mesh node (one-sided at point loads).
    let element_index: BTreeMap<&str, usize> = elements
        .iter()
        .enumerate()
        .map(|(k, e)| (e.id.as_str(), k))
        .collect();
    let pieces = |id: &str| -> Vec<(String, f64, f64)> {
        match splits.get(id) {
            Some(s) => s
                .children
                .iter()
                .map(|c| (c.id.clone(), c.t0, c.t1))
                .collect(),
            None => vec![(id.to_string(), 0., 1.)],
        }
    };
    let mut members = vec![];
    for m in &original.members {
        let length = {
            let (a, b) = (
                original
                    .nodes
                    .iter()
                    .find(|n| n.id == m.start)
                    .unwrap()
                    .position,
                original
                    .nodes
                    .iter()
                    .find(|n| n.id == m.end)
                    .unwrap()
                    .position,
            );
            ((b[0] - a[0]).powi(2) + (b[1] - a[1]).powi(2) + (b[2] - a[2]).powi(2)).sqrt()
        };
        let mut chain: Vec<(usize, f64, f64)> = vec![];
        for (child, t0, t1) in pieces(&m.id) {
            let n = mesh.elements[&child].len() as f64;
            for (k, e) in mesh.elements[&child].iter().enumerate() {
                chain.push((
                    element_index[e.as_str()],
                    t0 + (t1 - t0) * k as f64 / n,
                    t0 + (t1 - t0) * (k + 1) as f64 / n,
                ));
            }
        }
        let jumps = splits
            .get(&m.id)
            .map(|s| s.jump_stations.clone())
            .unwrap_or_default();
        let mut samples = vec![];
        let mut key_stations = vec![];
        let components = || {
            ["N", "Vy", "Vz", "T", "My", "Mz"]
                .map(String::from)
                .to_vec()
        };
        for (index, &(k, t0, t1)) in chain.iter().enumerate() {
            let e = &elements[k];
            let dl = e.local_displacements(&u);
            let end = ends[k];
            let n = axial[k];
            let at = |s: f64| -> ([f64; 3], [f64; 3], [f64; 6]) {
                let x = s * e.l;
                let h1 = 1. - 3. * s * s + 2. * s * s * s;
                let h2 = e.l * (s - 2. * s * s + s * s * s);
                let h3 = 3. * s * s - 2. * s * s * s;
                let h4 = e.l * (-s * s + s * s * s);
                let particular = x * x * (e.l - x).powi(2) / 24.;
                let disp = [
                    dl[0] * (1. - s)
                        + dl[6] * s
                        + e.q[0] * x * (e.l - x) / (2. * e.material.e * e.section.a),
                    h1 * dl[1]
                        + h2 * dl[5]
                        + h3 * dl[7]
                        + h4 * dl[11]
                        + e.q[1] * particular / (e.material.e * e.section.iz),
                    h1 * dl[2] - h2 * dl[4] + h3 * dl[8] - h4 * dl[10]
                        + e.q[2] * particular / (e.material.e * e.section.iy),
                ];
                // Equilibrium of the deformed left segment adds N (v - v_i)
                // to Mz and -N (w - w_i) to My.
                let mut actions = section_actions(&end, e.q, x);
                actions[5] += n * (disp[1] - dl[1]);
                actions[4] -= n * (disp[2] - dl[2]);
                let start = p.nodes[e.i].position;
                (
                    std::array::from_fn(|a| start[a] + e.r[0][a] * x),
                    global(e.r, disp),
                    actions,
                )
            };
            let first = index == 0;
            for (s, station) in [(0., t0), (0.5, 0.5 * (t0 + t1))] {
                if s == 0. && !first {
                    continue;
                }
                let (position, displacement, actions) = at(s);
                samples.push(Sample {
                    station,
                    position,
                    displacement,
                    actions,
                });
            }
            let (position, displacement, actions) = at(1.);
            samples.push(Sample {
                station: t1,
                position,
                displacement,
                actions,
            });
            if first {
                key_stations.push(KeyStation {
                    station: 0.,
                    kind: "end".into(),
                    components: components(),
                    actions: at(0.).2,
                    side: None,
                });
            }
            let last = index + 1 == chain.len();
            let jump = jumps.iter().any(|j| (j - t1).abs() < 1e-9);
            key_stations.push(KeyStation {
                station: if last { 1. } else { t1 },
                kind: if last {
                    "end"
                } else if jump {
                    "discontinuity"
                } else {
                    "meshNode"
                }
                .into(),
                components: components(),
                actions: at(1.).2,
                side: jump.then(|| "left".into()),
            });
            if jump && !last {
                let (next, _, _) = chain[index + 1];
                key_stations.push(KeyStation {
                    station: t1,
                    kind: "discontinuity".into(),
                    components: components(),
                    actions: section_actions(&ends[next], elements[next].q, 0.),
                    side: Some("right".into()),
                });
            }
        }
        let first_end = ends[chain[0].0].to_vec();
        let last_end = ends[chain.last().unwrap().0];
        let mut end_actions = first_end[..6].to_vec();
        end_actions.extend_from_slice(&last_end[6..]);
        members.push(MemberResult {
            id: m.id.clone(),
            length,
            end_actions,
            samples,
            key_stations,
            stress_screen: None,
        });
    }
    for m in &members {
        workbench_model::finite(&m.end_actions)?;
        for s in &m.samples {
            workbench_model::finite(&s.displacement)?;
            workbench_model::finite(&s.actions)?;
        }
    }
    let physical_displacements = |u: &[f64]| -> Vec<f64> {
        original
            .nodes
            .iter()
            .flat_map(|n| (0..6).map(|a| u[d.node[&n.id] * 6 + a]).collect::<Vec<_>>())
            .collect()
    };
    let support_reactions = |reactions: &[f64]| -> Vec<f64> {
        original
            .supports
            .iter()
            .flat_map(|s| {
                (0..6)
                    .map(|a| {
                        if s.fixed[a] {
                            reactions[d.node[&s.node] * 6 + a]
                        } else {
                            0.
                        }
                    })
                    .collect::<Vec<_>>()
            })
            .collect()
    };
    let first_u = first_order.expect("iteration 0 always runs");
    let (_, first_reactions) = reactions_of(&first_u, &vec![0.; elements.len()]);
    let first_order_json = json!({
        "nodeDisplacements": physical_displacements(&first_u),
        "reactions": support_reactions(&first_reactions),
    });
    let node_displacements = physical_displacements(&u);
    let support_values = support_reactions(&reactions);
    let mut generated = vec![];
    if original.analysis_mode == "planarXZ" {
        for n in &original.nodes {
            for a in [1, 3, 5] {
                if !original
                    .supports
                    .iter()
                    .any(|s| s.node == n.id && s.fixed[a])
                {
                    generated.push(json!({"nodeId": n.id, "dof": a, "reaction": reactions[d.node[&n.id] * 6 + a]}));
                }
            }
        }
    }
    let axial_forces: Vec<Value> = original
        .members
        .iter()
        .map(|m| {
            let segments: Vec<Value> = pieces(&m.id)
                .into_iter()
                .flat_map(|(child, t0, t1)| {
                    let n = mesh.elements[&child].len() as f64;
                    mesh.elements[&child]
                        .iter()
                        .enumerate()
                        .map(|(k, e)| {
                            json!({"t0": t0 + (t1 - t0) * k as f64 / n, "t1": t0 + (t1 - t0) * (k + 1) as f64 / n,
                                   "n": axial[element_index[e.as_str()]]})
                        })
                        .collect::<Vec<_>>()
                })
                .collect();
            json!({"id": m.id, "segments": segments})
        })
        .collect();
    let hash = &model_hash[..16];
    Ok(Analysis {
        result_id: format!("{hash}-{case}-so-{}", &settings_hash[..8]),
        schema_version: "1.0.0".into(),
        analysis_type: "secondOrder".into(),
        converged: true,
        case_or_combination_id: case.into(),
        buffer_descriptors: vec![
            json!({"name":"nodeDisplacements","scalarType":"f64","length":original.nodes.len()*6,"stride":6,"components":["ux","uy","uz","rx","ry","rz"]}),
            json!({"name":"reactions","scalarType":"f64","length":original.supports.len()*6,"stride":6,"components":["fx","fy","fz","mx","my","mz"]}),
            json!({"name":"memberEndActions","scalarType":"f64","length":original.members.len()*12,"stride":12}),
        ],
        model_hash,
        settings_hash,
        solver_build_hash: option_env!("WORKBENCH_SOURCE_HASH")
            .unwrap_or("development")
            .into(),
        source_revision: original.revision,
        case_id: case.into(),
        node_ids: original.nodes.iter().map(|n| n.id.clone()).collect(),
        node_displacements,
        reaction_support_ids: original.supports.iter().map(|s| s.id.clone()).collect(),
        reactions: support_values,
        generated_constraint_reactions: generated,
        members,
        numerical_checks: json!({
            "iterations": iterations,
            "history": history,
            "scaledResidual": residual,
            "subdivisions": settings.subdivisions,
            "globalBalanceDeformed": balance,
            "balanceScale": scale,
            "axialForces": axial_forces,
            "imperfection": {"settings": imperfection_json, "equivalentNodalForces": sway_forces},
            "firstOrder": first_order_json,
        }),
        diagnostics: vec![
            json!({"code": "FLEXURAL_ONLY", "severity": "info", "message": "Flexural second-order effects only; torsional and lateral-torsional effects are excluded"}),
            json!({"code": "PROPORTIONAL_LOADING", "severity": "info", "message": "All loads of the combination are applied together; no construction staging"}),
            json!({"code": "SMALL_ROTATIONS", "severity": "info", "message": "Linearised second-order theory about the undeformed geometry"}),
        ],
    })
}
