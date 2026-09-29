//! Modal (free vibration) analysis of the assembled model (dynamics-v1,
//! `docs/formulations/modal.md`, ADR 0018).
//!
//! Declared mass sources become element line masses and nodal point masses on
//! the stability-v1 mesh (point-load expansion, then `subdivisions` equal
//! elements per member). K φ = ω² M φ is solved on the free DOFs by the
//! stability-v1 subspace iteration with a Sturm check, and each mode's
//! participation in the global translations is reported with a full mass
//! account.

use std::collections::BTreeMap;

use serde_json::json;
use sprs::{CsMat, TriMat};
use workbench_frame::{consistent_mass, lumped_mass, stiffness};
use workbench_geometry::{axes, global};
use workbench_model::{Load, MassSource, Member, Project, Release, Result, digest, err};
use workbench_results::{
    DirectionParticipation, ModalAnalysis, ModalMass, SourceMass, VibrationMode,
};
use workbench_solver::eigen::vibration;
use workbench_solver::matvec;

use crate::expand::expand_point_loads;
use crate::stability::{assemble, dofs, mode_members, subdivide};

pub const DEFAULT_MODAL_MODES: usize = 12;
pub const DEFAULT_MODAL_SUBDIVISIONS: usize = 8;
pub const DEFAULT_PARTICIPATION_TARGET: f64 = 0.9;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MassMatrix {
    Consistent,
    Lumped,
}

impl MassMatrix {
    pub fn name(self) -> &'static str {
        match self {
            Self::Consistent => "consistent",
            Self::Lumped => "lumped",
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct ModalSettings {
    /// Modes requested, 1–50.
    pub modes: usize,
    pub mass_matrix: MassMatrix,
    /// Equal elements per analytical member, 1–32.
    pub subdivisions: usize,
    /// Cumulative effective-mass ratio sought per direction, (0, 1].
    pub participation_target: f64,
}

impl Default for ModalSettings {
    fn default() -> Self {
        Self {
            modes: DEFAULT_MODAL_MODES,
            mass_matrix: MassMatrix::Consistent,
            subdivisions: DEFAULT_MODAL_SUBDIVISIONS,
            participation_target: DEFAULT_PARTICIPATION_TARGET,
        }
    }
}

const DIRECTIONS: [&str; 3] = ["X", "Y", "Z"];

/// Mass of the meshed model from the declared sources, before assembly.
struct Masses {
    /// Per analysis element: multiplier on its own ρA and ρ(Iy + Iz).
    self_factor: BTreeMap<String, f64>,
    /// Per analysis element: added translational line mass (kg/m).
    line: BTreeMap<String, f64>,
    /// Per analysis node: translational point mass (kg).
    point: BTreeMap<String, f64>,
    /// Mass contributed by each declared source (kg), in source order.
    by_source: Vec<SourceMass>,
    diagnostics: Vec<serde_json::Value>,
}

fn reject_releases(p: &Project) -> Result<()> {
    let released = |r: &Release| r.my || r.mz;
    if let Some(m) = p
        .members
        .iter()
        .find(|m| released(&m.release_start) || released(&m.release_end))
    {
        return Err(err(
            "MODAL_RELEASES_UNSUPPORTED",
            format!(
                "Member {} has an end moment release; modal analysis rejects releases until hinge DOFs exist",
                m.id
            ),
        ));
    }
    Ok(())
}

fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/// Converts declared sources on the mesh. `original` supplies the load ids
/// named in diagnostics; `mesh` carries the same loads split onto elements.
fn masses(original: &Project, mesh: &Project) -> Result<Masses> {
    let length: BTreeMap<&str, f64> = {
        let position: BTreeMap<&str, [f64; 3]> = mesh
            .nodes
            .iter()
            .map(|n| (n.id.as_str(), n.position))
            .collect();
        mesh.members
            .iter()
            .map(|m| {
                let (a, b) = (position[m.start.as_str()], position[m.end.as_str()]);
                let d: [f64; 3] = std::array::from_fn(|i| b[i] - a[i]);
                (m.id.as_str(), dot(d, d).sqrt())
            })
            .collect()
    };
    let rho_a = |m: &Member| {
        let material = mesh.materials.iter().find(|x| x.id == m.material).unwrap();
        let section = mesh.sections.iter().find(|x| x.id == m.section).unwrap();
        material.density * section.a
    };
    let g = dot(mesh.gravity, mesh.gravity).sqrt();
    let down: [f64; 3] = std::array::from_fn(|i| if g > 0. { mesh.gravity[i] / g } else { 0. });
    let has_self_mass = original
        .mass_sources
        .iter()
        .any(|s| matches!(s, MassSource::SelfMass { .. }));
    let mut out = Masses {
        self_factor: BTreeMap::new(),
        line: BTreeMap::new(),
        point: BTreeMap::new(),
        by_source: vec![],
        diagnostics: vec![],
    };
    let mut ignored: Vec<String> = vec![];
    let mut deduplicated: Vec<String> = vec![];
    for source in &original.mass_sources {
        let mut total = 0.;
        match source {
            MassSource::SelfMass { factor, .. } => {
                for m in &mesh.members {
                    *out.self_factor.entry(m.id.clone()).or_default() += factor;
                    total += factor * rho_a(m) * length[m.id.as_str()];
                }
            }
            MassSource::NodalMass { node, mass, .. } => {
                *out.point.entry(node.clone()).or_default() += mass;
                total += mass;
            }
            MassSource::LoadCase { case, factor, .. } => {
                if g == 0. {
                    return Err(err(
                        "INVALID_MASS_SOURCE",
                        "Load-case mass needs a nonzero gravity vector",
                    ));
                }
                // Gravity component of a global force, refusing negative mass.
                let along = |force: [f64; 3], id: &str| -> Result<f64> {
                    let c = dot(force, down);
                    let size = dot(force, force).sqrt();
                    if c < -1e-12 * size {
                        return Err(err(
                            "NEGATIVE_MASS",
                            format!("Load {id} acts against gravity and cannot become mass"),
                        ));
                    }
                    Ok(c.max(0.))
                };
                for load in original.loads.iter().filter(|l| l.case() == case) {
                    let lateral = |force: [f64; 3]| {
                        let c = dot(force, down);
                        let rest: [f64; 3] = std::array::from_fn(|i| force[i] - c * down[i]);
                        dot(rest, rest).sqrt() > 1e-12 * dot(force, force).sqrt()
                    };
                    match load {
                        Load::SelfWeight { id, .. } if has_self_mass => {
                            deduplicated.push(id.clone())
                        }
                        Load::Nodal { id, values, .. } | Load::Point { id, values, .. }
                            if lateral([values[0], values[1], values[2]])
                                || values[3..].iter().any(|v| *v != 0.) =>
                        {
                            ignored.push(id.clone())
                        }
                        Load::Uniform {
                            id,
                            member,
                            axes: load_axes,
                            force_per_length,
                            ..
                        } => {
                            let m = original.members.iter().find(|m| &m.id == member).unwrap();
                            let q = if load_axes == "local" {
                                let position = |id: &str| {
                                    original.nodes.iter().find(|n| n.id == id).unwrap().position
                                };
                                let (_, r) = axes(position(&m.start), position(&m.end), m.local_y);
                                global(r, *force_per_length)
                            } else {
                                *force_per_length
                            };
                            if lateral(q) {
                                ignored.push(id.clone());
                            }
                        }
                        _ => {}
                    }
                }
                for load in mesh.loads.iter().filter(|l| l.case() == case) {
                    match load {
                        Load::Nodal {
                            id, node, values, ..
                        } => {
                            let m = factor * along([values[0], values[1], values[2]], id)? / g;
                            *out.point.entry(node.clone()).or_default() += m;
                            total += m;
                        }
                        Load::Uniform {
                            id,
                            member,
                            axes: load_axes,
                            force_per_length,
                            ..
                        } => {
                            let m = mesh.members.iter().find(|m| &m.id == member).unwrap();
                            let q = if load_axes == "local" {
                                let position = |id: &str| {
                                    mesh.nodes.iter().find(|n| n.id == id).unwrap().position
                                };
                                let (_, r) = axes(position(&m.start), position(&m.end), m.local_y);
                                global(r, *force_per_length)
                            } else {
                                *force_per_length
                            };
                            let mu = factor * along(q, id)? / g;
                            *out.line.entry(member.clone()).or_default() += mu;
                            total += mu * length[member.as_str()];
                        }
                        Load::SelfWeight {
                            members,
                            factor: weight,
                            ..
                        } if !has_self_mass => {
                            if dot(mesh.gravity, mesh.gravity) == 0. {
                                continue;
                            }
                            for id in members {
                                let m = mesh.members.iter().find(|m| &m.id == id).unwrap();
                                *out.self_factor.entry(id.clone()).or_default() += factor * weight;
                                total += factor * weight * rho_a(m) * length[id.as_str()];
                            }
                        }
                        Load::SelfWeight { .. } => {}
                        Load::Point { .. } => {
                            return Err(err("INTERNAL", "Point loads must be expanded"));
                        }
                    }
                }
            }
        }
        out.by_source.push(SourceMass {
            id: source.id().to_string(),
            kind: match source {
                MassSource::SelfMass { .. } => "selfMass",
                MassSource::LoadCase { .. } => "loadCase",
                MassSource::NodalMass { .. } => "nodalMass",
            }
            .into(),
            mass: total,
        });
    }
    if !deduplicated.is_empty() {
        out.diagnostics.push(json!({
            "code": "SELF_MASS_DEDUPLICATED",
            "severity": "info",
            "message": "Self-weight loads inside load-case mass sources were skipped because self mass is declared",
            "loadIds": deduplicated,
        }));
    }
    if !ignored.is_empty() {
        ignored.sort();
        ignored.dedup();
        out.diagnostics.push(json!({
            "code": "NON_GRAVITY_COMPONENTS_IGNORED",
            "severity": "info",
            "message": "Force components perpendicular to gravity and applied moments carry no mass",
            "loadIds": ignored,
        }));
    }
    Ok(out)
}

pub fn modal(project: &Project, settings: &ModalSettings) -> Result<ModalAnalysis> {
    if !(1..=32).contains(&settings.subdivisions)
        || !(1..=50).contains(&settings.modes)
        || !(settings.participation_target > 0. && settings.participation_target <= 1.)
    {
        return Err(err(
            "INVALID_SETTINGS",
            "Modal subdivisions must be 1–32, requested modes 1–50 and the participation target in (0, 1]",
        ));
    }
    project.validate()?;
    let mut original = project.clone();
    original.canonicalise();
    reject_releases(&original)?;
    if original.mass_sources.is_empty() {
        return Err(err(
            "NO_MASS",
            "Declare mass sources (self mass, load cases or nodal masses) before a modal analysis",
        ));
    }
    let model_hash = original.hash();
    let settings_hash = digest(
        &serde_json::to_vec(&json!({
            "analysisSettings": original.analysis_settings,
            "modal": {
                "analysisType": "modal",
                "formulation": "dynamics-v1",
                "modes": settings.modes,
                "massMatrix": settings.mass_matrix.name(),
                "subdivisions": settings.subdivisions,
                "participationTarget": settings.participation_target,
            }
        }))
        .unwrap(),
    );
    let (expanded, splits) = expand_point_loads(&original)?;
    let mesh = subdivide(&expanded, settings.subdivisions)?;
    let p = &mesh.project;
    let mass = masses(&original, p)?;
    let total_mass: f64 = mass.by_source.iter().map(|s| s.mass).sum();
    if !(total_mass > 0.) {
        return Err(err(
            "NO_MASS",
            "The declared mass sources contribute no mass",
        ));
    }

    let d = dofs(p);
    let material = |m: &Member| p.materials.iter().find(|x| x.id == m.material).unwrap();
    let section = |m: &Member| p.sections.iter().find(|x| x.id == m.section).unwrap();
    let k = assemble(p, &d, |m, l| stiffness(l, material(m), section(m)));
    let element_mass = assemble(p, &d, |m, l| {
        let own = mass.self_factor.get(&m.id).copied().unwrap_or(0.);
        let mu =
            own * material(m).density * section(m).a + mass.line.get(&m.id).copied().unwrap_or(0.);
        match settings.mass_matrix {
            MassMatrix::Consistent => consistent_mass(
                l,
                mu,
                own * material(m).density * (section(m).iy + section(m).iz),
            ),
            MassMatrix::Lumped => lumped_mass(l, mu),
        }
    });
    let mut nodal = TriMat::new((d.count, d.count));
    for (node, m) in &mass.point {
        for a in 0..3 {
            if let Some(f) = d.free[d.node[node] * 6 + a] {
                nodal.add_triplet(f, f, *m);
            }
        }
    }
    let nodal: CsMat<f64> = nodal.to_csc();
    let m = &element_mass + &nodal;

    // Participating mass: a rigid unit translation of the free DOFs.
    let influence: Vec<Vec<f64>> = (0..3)
        .map(|dir| {
            let mut r = vec![0.; d.count];
            for i in 0..p.nodes.len() {
                if let Some(f) = d.free[i * 6 + dir] {
                    r[f] = 1.;
                }
            }
            r
        })
        .collect();
    let participating: Vec<f64> = influence
        .iter()
        .map(|r| r.iter().zip(matvec(&m, r)).map(|(a, b)| a * b).sum())
        .collect();
    if participating.iter().all(|v| *v <= 0.) {
        return Err(err(
            "NO_MASS",
            "All declared mass sits on restrained degrees of freedom",
        ));
    }

    let budget = p.analysis_settings.memory_limit_mi_b as usize * 1024 * 1024 / 2;
    let solved = vibration(&k, &m, settings.modes, budget)?;

    let mut modes = vec![];
    let mut cumulative = [0.; 3];
    for (n, ((omega2, shape), residual)) in solved
        .omega_squared
        .iter()
        .zip(&solved.shapes)
        .zip(&solved.residuals)
        .enumerate()
    {
        let mut u = vec![0.; p.nodes.len() * 6];
        for (g, f) in d.free.iter().enumerate() {
            if let Some(f) = f {
                u[g] = shape[*f];
            }
        }
        // Display scale: the largest translation over the mesh is +1 (the
        // largest rotation for a pure torsion mode, which has none). The
        // M-normalised vector takes the same sign, so Γ is deterministic.
        let largest = |components: &[usize]| {
            let (mut at, mut big) = (0, 0.);
            for i in 0..p.nodes.len() {
                for &a in components {
                    if u[i * 6 + a].abs() > big {
                        (at, big) = (i * 6 + a, u[i * 6 + a].abs());
                    }
                }
            }
            (at, big)
        };
        let peak = u.iter().map(|x| x.abs()).fold(0., f64::max);
        let (at, big) = largest(&[0, 1, 2]);
        let at = if big > 1e-9 * peak {
            at
        } else {
            largest(&[3, 4, 5]).0
        };
        let sign = u[at].signum();
        let mphi = matvec(&m, shape);
        let gamma: [f64; 3] = std::array::from_fn(|dir| {
            sign * influence[dir]
                .iter()
                .zip(&mphi)
                .map(|(a, b)| a * b)
                .sum::<f64>()
        });
        let scale = 1. / u[at];
        u.iter_mut().for_each(|x| *x *= scale);
        let effective: [f64; 3] = std::array::from_fn(|dir| gamma[dir] * gamma[dir]);
        let ratio: [Option<f64>; 3] = std::array::from_fn(|dir| {
            (participating[dir] > 0.).then(|| effective[dir] / participating[dir])
        });
        for dir in 0..3 {
            cumulative[dir] += ratio[dir].unwrap_or(0.);
        }
        let omega = omega2.sqrt();
        modes.push(VibrationMode {
            mode: n + 1,
            omega,
            frequency: omega / (2. * std::f64::consts::PI),
            period: 2. * std::f64::consts::PI / omega,
            residual: *residual,
            participation_factor: gamma,
            effective_mass: effective,
            effective_mass_ratio: ratio,
            cumulative_ratio: std::array::from_fn(|dir| {
                (participating[dir] > 0.).then_some(cumulative[dir])
            }),
            node_ids: original.nodes.iter().map(|x| x.id.clone()).collect(),
            node_displacements: original
                .nodes
                .iter()
                .flat_map(|x| (0..6).map(|a| u[d.node[&x.id] * 6 + a]).collect::<Vec<_>>())
                .collect(),
            members: mode_members(&original, &mesh, &splits, &d, &u),
        });
    }

    // Orthogonality of the reported M-normalised shapes.
    let (mut m_orth, mut k_orth) = (0f64, 0f64);
    let top = solved.omega_squared.last().copied().unwrap_or(1.);
    for (i, a) in solved.shapes.iter().enumerate() {
        let (ma, ka) = (matvec(&m, a), matvec(&k, a));
        for (j, b) in solved.shapes.iter().enumerate() {
            let mij: f64 = b.iter().zip(&ma).map(|(x, y)| x * y).sum();
            let kij: f64 = b.iter().zip(&ka).map(|(x, y)| x * y).sum();
            let (em, ek) = if i == j {
                (1., solved.omega_squared[i])
            } else {
                (0., 0.)
            };
            m_orth = m_orth.max((mij - em).abs());
            k_orth = k_orth.max((kij - ek).abs() / top);
        }
    }

    let mut diagnostics = mass.diagnostics;
    if modes.len() < settings.modes {
        diagnostics.push(json!({
            "code": "FEWER_MODES_THAN_REQUESTED",
            "severity": "info",
            "message": format!(
                "The model has {} vibration mode(s) with mass; {} were requested",
                modes.len(),
                settings.modes
            ),
        }));
    }
    let participation: Vec<DirectionParticipation> = (0..3)
        .map(|dir| {
            let applicable = participating[dir] > 0.;
            let achieved = applicable.then(|| cumulative[dir] >= settings.participation_target);
            if achieved == Some(false) {
                diagnostics.push(json!({
                    "code": "PARTICIPATION_TARGET_NOT_MET",
                    "severity": "warning",
                    "direction": DIRECTIONS[dir],
                    "message": format!(
                        "{} modes engage {:.1} % of the {} mass; the target is {:.1} %. {:.1} % is in omitted modes.",
                        modes.len(),
                        100. * cumulative[dir],
                        DIRECTIONS[dir],
                        100. * settings.participation_target,
                        100. * (1. - cumulative[dir]).max(0.),
                    ),
                }));
            }
            DirectionParticipation {
                direction: DIRECTIONS[dir].into(),
                participating_mass: participating[dir],
                non_participating_mass: (total_mass - participating[dir]).max(0.),
                cumulative_ratio: applicable.then_some(cumulative[dir]),
                omitted_ratio: applicable.then_some((1. - cumulative[dir]).max(0.)),
                target: settings.participation_target,
                achieved,
            }
        })
        .collect();

    let hash = &model_hash[..16];
    Ok(ModalAnalysis {
        result_id: format!("{hash}-modal-{}", &settings_hash[..8]),
        schema_version: "1.0.0".into(),
        analysis_type: "modal".into(),
        converged: true,
        model_hash,
        settings_hash,
        solver_build_hash: option_env!("WORKBENCH_SOURCE_HASH")
            .unwrap_or("development")
            .into(),
        source_revision: original.revision,
        subdivisions: settings.subdivisions,
        mass_matrix: settings.mass_matrix.name().into(),
        requested_modes: settings.modes,
        modes,
        mass: ModalMass {
            sources: mass.by_source,
            total: total_mass,
        },
        participation,
        numerical_checks: json!({
            "freeDofs": d.count,
            "iterations": solved.iterations,
            "blockSize": solved.block_size,
            "residuals": solved.residuals,
            "sturm": solved.sturm.as_ref().map(|s| json!({"sigma": s.sigma, "negativePivots": s.negative_pivots})),
            "massOrthogonality": m_orth,
            "stiffnessOrthogonality": k_orth,
        }),
        disclosures: vec![
            "UNDAMPED_FREE_VIBRATION".into(),
            "EULER_BERNOULLI_NO_ROTARY_INERTIA".into(),
            "TRANSLATIONAL_PARTICIPATION_ONLY".into(),
            "NOT_A_VIBRATION_SERVICEABILITY_CHECK".into(),
        ],
        diagnostics,
    })
}
