//! Elastic buckling of the assembled model (stability-v1,
//! `docs/formulations/stability.md`, ADR 0017).
//!
//! The physical model is expanded for interior point loads (M02-P), every
//! analytical member is split into `subdivisions` equal elements, the linear
//! reference state under one real case/combination gives each element's axial
//! force, and (K + λK_G(N₀))φ = 0 is solved on the free DOFs.

use std::collections::BTreeMap;

use serde_json::json;
use sprs::{CsMat, TriMat};
use workbench_frame::{Matrix, geometric, stiffness, transform};
use workbench_geometry::axes;
use workbench_model::{Load, Member, Node, Project, Release, Result, digest, err};
use workbench_results::{
    AxialSegment, BucklingAnalysis, BucklingMode, MemberAxialForces, MemberModeShape, ModeStation,
};
use workbench_solver::eigen::buckling;

use crate::analyse_assembled;
use crate::expand::{SplitMap, expand_point_loads};

pub const DEFAULT_SUBDIVISIONS: usize = 8;
pub const DEFAULT_MODES: usize = 5;

#[derive(Clone, Copy, Debug)]
pub struct StabilitySettings {
    /// Equal elements per analytical member, 1–32.
    pub subdivisions: usize,
    /// Positive critical factors requested, 1–20.
    pub modes: usize,
}

impl Default for StabilitySettings {
    fn default() -> Self {
        Self {
            subdivisions: DEFAULT_SUBDIVISIONS,
            modes: DEFAULT_MODES,
        }
    }
}

/// Axial forces below this fraction of the largest are rounding in the
/// reference state, not compression, and are set to zero.
const AXIAL_NOISE: f64 = 1e-9;

pub(crate) fn reject_releases(p: &Project) -> Result<()> {
    let released = |r: &Release| r.my || r.mz;
    if let Some(m) = p
        .members
        .iter()
        .find(|m| released(&m.release_start) || released(&m.release_end))
    {
        return Err(err(
            "STABILITY_RELEASES_UNSUPPORTED",
            format!(
                "Member {} has an end moment release; second-order analysis rejects releases until its end-action recovery includes hinge DOFs",
                m.id
            ),
        ));
    }
    Ok(())
}

/// Every member split into `n` equal elements; end releases stay on the
/// first and last element as hinge DOFs.
pub(crate) struct Mesh {
    pub(crate) project: Project,
    /// Per input member: (station 0..1, node id) at every mesh node, in order.
    pub(crate) stations: BTreeMap<String, Vec<(f64, String)>>,
    /// Per input member: its element ids, in order.
    pub(crate) elements: BTreeMap<String, Vec<String>>,
}

pub(crate) fn subdivide(p: &Project, n: usize) -> Result<Mesh> {
    let position: BTreeMap<&str, [f64; 3]> = p
        .nodes
        .iter()
        .map(|x| (x.id.as_str(), x.position))
        .collect();
    let taken =
        |id: &str| p.nodes.iter().any(|x| x.id == id) || p.members.iter().any(|x| x.id == id);
    let mut mesh = p.clone();
    mesh.members.clear();
    let mut stations = BTreeMap::new();
    let mut elements = BTreeMap::new();
    for m in &p.members {
        let (a, b) = (position[m.start.as_str()], position[m.end.as_str()]);
        let mut ids = vec![m.start.clone()];
        for k in 1..n {
            let id = format!("sn_{}_{k}", m.id);
            if taken(&id) {
                return Err(err(
                    "DUPLICATE_ID",
                    format!("Subdivision node id {id} collides with the model"),
                ));
            }
            let t = k as f64 / n as f64;
            mesh.nodes.push(Node {
                id: id.clone(),
                position: std::array::from_fn(|d| a[d] + t * (b[d] - a[d])),
            });
            ids.push(id);
        }
        ids.push(m.end.clone());
        let mut children = vec![];
        for k in 0..n {
            let id = format!("sd_{}_{k}", m.id);
            if taken(&id) {
                return Err(err(
                    "DUPLICATE_ID",
                    format!("Subdivision member id {id} collides with the model"),
                ));
            }
            mesh.members.push(Member {
                id: id.clone(),
                start: ids[k].clone(),
                end: ids[k + 1].clone(),
                material: m.material.clone(),
                section: m.section.clone(),
                local_y: m.local_y,
                // Member end releases stay at the member ends (hinge DOFs).
                release_start: if k == 0 {
                    m.release_start.clone()
                } else {
                    Release {
                        my: false,
                        mz: false,
                    }
                },
                release_end: if k + 1 == n {
                    m.release_end.clone()
                } else {
                    Release {
                        my: false,
                        mz: false,
                    }
                },
                parent_member_id: Some(m.parent_member_id.clone().unwrap_or_else(|| m.id.clone())),
                station_range: None,
                steel_design: None,
            });
            children.push(id);
        }
        stations.insert(
            m.id.clone(),
            ids.into_iter()
                .enumerate()
                .map(|(k, id)| (k as f64 / n as f64, id))
                .collect(),
        );
        elements.insert(m.id.clone(), children);
    }
    let mut loads = vec![];
    for load in &p.loads {
        match load {
            Load::Uniform {
                id,
                case,
                member,
                axes,
                force_per_length,
            } => {
                for (k, child) in elements[member].iter().enumerate() {
                    loads.push(Load::Uniform {
                        id: format!("{id}__s{k}"),
                        case: case.clone(),
                        member: child.clone(),
                        axes: axes.clone(),
                        force_per_length: *force_per_length,
                    });
                }
            }
            Load::SelfWeight {
                id,
                case,
                members,
                factor,
            } => loads.push(Load::SelfWeight {
                id: id.clone(),
                case: case.clone(),
                members: members
                    .iter()
                    .flat_map(|m| elements[m].iter().cloned())
                    .collect(),
                factor: *factor,
            }),
            Load::Nodal { .. } => loads.push(load.clone()),
            Load::Point { .. } => {
                return Err(err(
                    "INTERNAL",
                    "Point loads must be expanded before subdivision",
                ));
            }
        }
    }
    mesh.loads = loads;
    Ok(Mesh {
        project: mesh,
        stations,
        elements,
    })
}

/// Free-DOF numbering with the same constraints as the linear analysis:
/// fixed support components and, in planar XZ mode, uy, rx and rz everywhere.
pub(crate) struct Dofs {
    pub(crate) node: BTreeMap<String, usize>,
    pub(crate) free: Vec<Option<usize>>,
    pub(crate) count: usize,
    /// Prescribed values at constrained DOFs (zero where free).
    pub(crate) prescribed: Vec<f64>,
    /// Hinge DOFs of released member ends, keyed by (element id, end 0|1).
    pub(crate) hinges: BTreeMap<(String, usize), Vec<Hinge>>,
}

/// A released end rotation (my about local y, mz about local z) is an
/// independent free DOF `a`: the element's end rotation is the node's
/// rotation plus `axis · a`, with `axis` the released local axis in global
/// coordinates. A pure hinge carries no moment about that axis.
pub(crate) struct Hinge {
    pub(crate) dof: usize,
    pub(crate) axis: [f64; 3],
}

pub(crate) fn dofs(p: &Project) -> Dofs {
    let node: BTreeMap<String, usize> = p
        .nodes
        .iter()
        .enumerate()
        .map(|(i, n)| (n.id.clone(), i))
        .collect();
    let mut fixed = vec![false; p.nodes.len() * 6];
    let mut prescribed = vec![0.; p.nodes.len() * 6];
    for s in &p.supports {
        for a in 0..6 {
            fixed[node[&s.node] * 6 + a] |= s.fixed[a];
            if s.fixed[a] {
                prescribed[node[&s.node] * 6 + a] = s.prescribed[a];
            }
        }
    }
    if p.analysis_mode == "planarXZ" {
        for i in 0..p.nodes.len() {
            for a in [1, 3, 5] {
                fixed[i * 6 + a] = true;
            }
        }
    }
    let mut count = 0;
    let free = fixed
        .iter()
        .map(|&f| {
            (!f).then(|| {
                count += 1;
                count - 1
            })
        })
        .collect();
    let position: BTreeMap<&str, [f64; 3]> = p
        .nodes
        .iter()
        .map(|x| (x.id.as_str(), x.position))
        .collect();
    let mut hinges = BTreeMap::new();
    for m in &p.members {
        let (_, r) = axes(position[m.start.as_str()], position[m.end.as_str()], m.local_y);
        for (end, release) in [(0, &m.release_start), (1, &m.release_end)] {
            let mut list = vec![];
            for (released, axis) in [(release.my, r[1]), (release.mz, r[2])] {
                if released {
                    list.push(Hinge { dof: count, axis });
                    count += 1;
                }
            }
            if !list.is_empty() {
                hinges.insert((m.id.clone(), end), list);
            }
        }
    }
    Dofs {
        node,
        free,
        count,
        prescribed,
        hinges,
    }
}

pub(crate) fn assemble(p: &Project, d: &Dofs, local: impl Fn(&Member, f64) -> Matrix) -> CsMat<f64> {
    let position: BTreeMap<&str, [f64; 3]> = p
        .nodes
        .iter()
        .map(|x| (x.id.as_str(), x.position))
        .collect();
    let mut t = TriMat::new((d.count, d.count));
    for m in &p.members {
        let (l, r) = axes(
            position[m.start.as_str()],
            position[m.end.as_str()],
            m.local_y,
        );
        let g = transform(&local(m, l), r);
        let (i, j) = (d.node[&m.start], d.node[&m.end]);
        let ids: [usize; 12] =
            std::array::from_fn(|x| if x < 6 { i * 6 + x } else { j * 6 + x - 6 });
        // Element DOF x = Σ coefficient × free DOF: the node DOF, plus the
        // released axis times the hinge DOF on end rotations.
        let mut map: [Vec<(usize, f64)>; 12] = std::array::from_fn(|x| {
            d.free[ids[x]].map(|f| vec![(f, 1.)]).unwrap_or_default()
        });
        for end in 0..2 {
            for h in d.hinges.get(&(m.id.clone(), end)).into_iter().flatten() {
                for c in 0..3 {
                    if h.axis[c] != 0. {
                        map[end * 6 + 3 + c].push((h.dof, h.axis[c]));
                    }
                }
            }
        }
        for x in 0..12 {
            for y in 0..12 {
                if g[x][y] == 0. {
                    continue;
                }
                for &(a, ca) in &map[x] {
                    for &(b, cb) in &map[y] {
                        t.add_triplet(a, b, g[x][y] * ca * cb);
                    }
                }
            }
        }
    }
    t.to_csc()
}

/// Physical member → (analysis member, station range) pieces, in order.
pub(crate) fn pieces(splits: &SplitMap, id: &str) -> Vec<(String, f64, f64)> {
    match splits.get(id) {
        Some(s) => s
            .children
            .iter()
            .map(|c| (c.id.clone(), c.t0, c.t1))
            .collect(),
        None => vec![(id.to_string(), 0., 1.)],
    }
}

/// Translations of the mesh displacement vector `u` at every analysis node
/// along each physical member of `original`, for drawing a mode shape.
pub(crate) fn mode_members(
    original: &Project,
    mesh: &Mesh,
    splits: &SplitMap,
    d: &Dofs,
    u: &[f64],
) -> Vec<MemberModeShape> {
    let position: BTreeMap<&str, [f64; 3]> = mesh
        .project
        .nodes
        .iter()
        .map(|x| (x.id.as_str(), x.position))
        .collect();
    let translation = |id: &str| -> [f64; 3] { std::array::from_fn(|a| u[d.node[id] * 6 + a]) };
    original
        .members
        .iter()
        .map(|m| {
            let mut stations: Vec<ModeStation> = vec![];
            for (child, t0, t1) in pieces(splits, &m.id) {
                for (s, node) in &mesh.stations[&child] {
                    let station = t0 + (t1 - t0) * s;
                    if stations
                        .last()
                        .is_some_and(|x| (x.station - station).abs() < 1e-12)
                    {
                        continue;
                    }
                    stations.push(ModeStation {
                        station,
                        position: position[node.as_str()],
                        displacement: translation(node),
                    });
                }
            }
            MemberModeShape {
                id: m.id.clone(),
                stations,
            }
        })
        .collect()
}

pub fn elastic_buckling(
    project: &Project,
    case: &str,
    settings: &StabilitySettings,
) -> Result<BucklingAnalysis> {
    if !(1..=32).contains(&settings.subdivisions) || !(1..=20).contains(&settings.modes) {
        return Err(err(
            "INVALID_SETTINGS",
            "Stability subdivisions must be 1–32 and requested modes 1–20",
        ));
    }
    project.validate()?;
    let mut original = project.clone();
    original.canonicalise();
    let model_hash = original.hash();
    let settings_hash = digest(
        &serde_json::to_vec(&json!({
            "analysisSettings": original.analysis_settings,
            "stability": {
                "analysisType": "elasticBuckling",
                "formulation": "stability-v1",
                "subdivisions": settings.subdivisions,
                "modes": settings.modes,
            }
        }))
        .unwrap(),
    );
    let (expanded, splits) = expand_point_loads(&original)?;
    let mesh = subdivide(&expanded, settings.subdivisions)?;
    let p = &mesh.project;
    // Linear reference state under the one real case or combination.
    let reference = analyse_assembled(p, case)?;
    let raw: BTreeMap<&str, f64> = reference
        .members
        .iter()
        .map(|m| (m.id.as_str(), (m.end_actions[6] - m.end_actions[0]) / 2.))
        .collect();
    let largest = raw.values().map(|n| n.abs()).fold(0., f64::max);
    let axial: BTreeMap<&str, f64> = raw
        .iter()
        .map(|(&id, &n)| {
            (
                id,
                if n.abs() <= AXIAL_NOISE * largest {
                    0.
                } else {
                    n
                },
            )
        })
        .collect();
    let d = dofs(p);
    let material = |m: &Member| p.materials.iter().find(|x| x.id == m.material).unwrap();
    let section = |m: &Member| p.sections.iter().find(|x| x.id == m.section).unwrap();
    let k = assemble(p, &d, |m, l| stiffness(l, material(m), section(m)));
    let kg = assemble(p, &d, |m, l| geometric(l, axial[m.id.as_str()]));
    let compression = axial.values().any(|&n| n < 0.);
    let budget = p.analysis_settings.memory_limit_mi_b as usize * 1024 * 1024 / 2;
    let solved = buckling(&k, &kg, settings.modes, compression, budget)?;

    let mut modes = vec![];
    for ((factor, shape), residual) in solved
        .factors
        .iter()
        .zip(&solved.shapes)
        .zip(&solved.residuals)
    {
        let mut u = vec![0.; p.nodes.len() * 6];
        for (g, f) in d.free.iter().enumerate() {
            if let Some(f) = f {
                u[g] = shape[*f];
            }
        }
        // Largest absolute translation over the mesh becomes +1.
        let (mut at, mut big) = (0, 0.);
        for i in 0..p.nodes.len() {
            for a in 0..3 {
                if u[i * 6 + a].abs() > big {
                    (at, big) = (i * 6 + a, u[i * 6 + a].abs());
                }
            }
        }
        let scale = 1. / u[at];
        u.iter_mut().for_each(|x| *x *= scale);
        let members = mode_members(&original, &mesh, &splits, &d, &u);
        modes.push(BucklingMode {
            factor: *factor,
            residual: *residual,
            node_ids: original.nodes.iter().map(|n| n.id.clone()).collect(),
            node_displacements: original
                .nodes
                .iter()
                .flat_map(|n| (0..6).map(|a| u[d.node[&n.id] * 6 + a]).collect::<Vec<_>>())
                .collect(),
            members,
        });
    }
    let reference_axial_forces = original
        .members
        .iter()
        .map(|m| MemberAxialForces {
            id: m.id.clone(),
            segments: pieces(&splits, &m.id)
                .into_iter()
                .flat_map(|(child, t0, t1)| {
                    let n = mesh.elements[&child].len() as f64;
                    mesh.elements[&child]
                        .iter()
                        .enumerate()
                        .map(|(k, e)| AxialSegment {
                            t0: t0 + (t1 - t0) * k as f64 / n,
                            t1: t0 + (t1 - t0) * (k + 1) as f64 / n,
                            n: axial[e.as_str()],
                        })
                        .collect::<Vec<_>>()
                })
                .collect(),
        })
        .collect();
    let mut diagnostics = vec![];
    if modes.is_empty() {
        diagnostics.push(json!({
            "code": "NO_POSITIVE_CRITICAL_FACTOR",
            "message": if compression {
                "No positive critical factor: the reference load does not cause instability in this model"
            } else {
                "No member is in compression under the reference load; a positive critical factor does not exist"
            },
            "smallestNegativeFactor": solved.negative_factors.first(),
        }));
    }
    let hash = &model_hash[..16];
    Ok(BucklingAnalysis {
        result_id: format!("{hash}-{case}-eb-{}", &settings_hash[..8]),
        schema_version: "1.0.0".into(),
        analysis_type: "elasticBuckling".into(),
        converged: true,
        case_or_combination_id: case.into(),
        model_hash,
        settings_hash,
        solver_build_hash: option_env!("WORKBENCH_SOURCE_HASH")
            .unwrap_or("development")
            .into(),
        source_revision: original.revision,
        subdivisions: settings.subdivisions,
        requested_modes: settings.modes,
        modes,
        negative_factors: solved.negative_factors,
        reference_axial_forces,
        numerical_checks: json!({
            "freeDofs": d.count,
            "iterations": solved.iterations,
            "blockSize": solved.block_size,
            "residuals": solved.residuals,
            "sturm": solved.sturm.as_ref().map(|s| json!({"sigma": s.sigma, "negativePivots": s.negative_pivots})),
            "referenceScaledResidual": reference.numerical_checks["scaledResidual"],
            "axialNoiseFloor": AXIAL_NOISE * largest,
        }),
        disclosures: vec![
            "FLEXURAL_ONLY".into(),
            "NOT_A_RESISTANCE_CHECK".into(),
            "LINEAR_REFERENCE_STATE".into(),
        ],
        diagnostics,
    })
}
