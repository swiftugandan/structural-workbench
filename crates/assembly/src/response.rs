//! Harmonic (steady-state) and response-spectrum analysis (response-v1,
//! `docs/formulations/response.md`, ADR 0023), on the dynamics-v1 model.

use std::collections::BTreeMap;

use serde_json::json;
use workbench_frame::{Matrix, uniform};
use workbench_geometry::{global, local};
use workbench_model::{Load, Project, Result, digest, err};
use workbench_results::{
    DirectionParticipation, HarmonicFrequency, HarmonicResponse, RayleighDamping, SpectrumMember,
    SpectrumMode, SpectrumResponse, SpectrumStation,
};
use workbench_solver::complex::{C64, ComplexPencil};
use workbench_solver::eigen::vibration;
use workbench_solver::matvec;

use crate::dynamic::{DynamicElement, DynamicModel};
use crate::modal::MassMatrix;
use crate::stability::pieces;
use crate::{case_factors, member_load_density};

pub const MAX_FREQUENCIES: usize = 200;
pub const MAX_NODE_FREQUENCIES: usize = 200_000;
const DIRECTIONS: [&str; 3] = ["X", "Y", "Z"];

/// Rayleigh damping as entered (ADR 0023): a₁ > 0 always.
#[derive(Clone, Copy, Debug)]
pub enum Damping {
    /// ζ at two frequencies f₁ < f₂ (Hz).
    Ratio { ratio: f64, frequencies: [f64; 2] },
    /// C = a₀M + a₁K directly.
    Coefficients { a0: f64, a1: f64 },
}

#[derive(Clone, Debug)]
pub struct HarmonicSettings {
    /// Forcing frequencies (Hz).
    pub frequencies: Vec<f64>,
    pub damping: Damping,
    pub mass_matrix: MassMatrix,
    pub subdivisions: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Combination {
    Srss,
    Cqc,
}

impl Combination {
    pub fn name(self) -> &'static str {
        match self {
            Self::Srss => "srss",
            Self::Cqc => "cqc",
        }
    }
}

#[derive(Clone, Debug)]
pub struct SpectrumSettings {
    pub spectrum: String,
    /// 0, 1, 2 for X, Y, Z.
    pub direction: usize,
    pub scale: f64,
    pub combination: Combination,
    pub modes: usize,
    pub mass_matrix: MassMatrix,
    pub subdivisions: usize,
    pub participation_target: f64,
}

fn solver_build_hash() -> String {
    option_env!("WORKBENCH_SOURCE_HASH")
        .unwrap_or("development")
        .into()
}

/// Local end actions of an element for a displacement field, given the
/// element's local operator (stiffness, or a complex combination).
fn local_ends<T: Copy + Default + std::ops::Add<Output = T>>(
    e: &DynamicElement,
    x: &[T],
    scale: impl Fn(T, f64) -> T + Copy,
    split: impl Fn(T) -> Vec<f64>,
    join: impl Fn(&[f64]) -> T,
    operator: impl Fn(&[T; 12]) -> [T; 12],
) -> [T; 12] {
    let g = e.global(x, scale);
    // Rotate each 3-block to local axes, component by component.
    let parts: Vec<Vec<f64>> = g.iter().map(|v| split(*v)).collect();
    let width = parts[0].len();
    let mut dl = [T::default(); 12];
    for block in 0..4 {
        for c in 0..width {
            let v = local(e.rotation, std::array::from_fn(|a| parts[block * 3 + a][c]));
            for a in 0..3 {
                let mut comps: Vec<f64> = split(dl[block * 3 + a]);
                comps[c] = v[a];
                dl[block * 3 + a] = join(&comps);
            }
        }
    }
    operator(&dl)
}

fn matrix_apply(k: &Matrix, x: &[f64; 12]) -> [f64; 12] {
    std::array::from_fn(|a| (0..12).map(|b| k[a][b] * x[b]).sum())
}

/// Rotates local 12-vectors of end actions to global 3-blocks.
fn to_global(r: [[f64; 3]; 3], f: &[f64; 12]) -> [f64; 12] {
    let mut out = [0.; 12];
    for block in 0..4 {
        let v = global(r, [f[block * 3], f[block * 3 + 1], f[block * 3 + 2]]);
        out[block * 3..block * 3 + 3].copy_from_slice(&v);
    }
    out
}

pub fn harmonic(
    project: &Project,
    case: &str,
    settings: &HarmonicSettings,
) -> Result<HarmonicResponse> {
    let freqs = &settings.frequencies;
    if freqs.is_empty()
        || freqs.len() > MAX_FREQUENCIES
        || freqs.iter().any(|f| !(f.is_finite() && *f > 0.))
        || !(1..=32).contains(&settings.subdivisions)
    {
        return Err(err(
            "INVALID_SETTINGS",
            format!(
                "Harmonic analysis takes 1–{MAX_FREQUENCIES} positive finite frequencies and 1–32 subdivisions"
            ),
        ));
    }
    let (a0, a1, ratio, pair) = match settings.damping {
        Damping::Ratio {
            ratio,
            frequencies: [f1, f2],
        } => {
            if !(ratio > 0. && ratio < 1. && f1 > 0. && f2 > f1 && f2.is_finite()) {
                return Err(err(
                    "INVALID_SETTINGS",
                    "Rayleigh damping needs a ratio in (0, 1) at two frequencies 0 < f₁ < f₂",
                ));
            }
            let (w1, w2) = (
                2. * std::f64::consts::PI * f1,
                2. * std::f64::consts::PI * f2,
            );
            (
                2. * ratio * w1 * w2 / (w1 + w2),
                2. * ratio / (w1 + w2),
                Some(ratio),
                Some([f1, f2]),
            )
        }
        Damping::Coefficients { a0, a1 } => {
            if !(a0 >= 0. && a0.is_finite() && a1 > 0. && a1.is_finite()) {
                return Err(err(
                    "INVALID_SETTINGS",
                    "Rayleigh damping needs a₀ ≥ 0 and a₁ > 0 (stiffness-proportional damping keeps every frequency solvable)",
                ));
            }
            (a0, a1, None, None)
        }
    };
    let model = DynamicModel::build(project, settings.mass_matrix, settings.subdivisions)?;
    let original = &model.original;
    let p = &model.mesh.project;
    let d = &model.d;
    let nodes = original.nodes.len();
    if nodes * freqs.len() > MAX_NODE_FREQUENCIES {
        return Err(err(
            "INVALID_SETTINGS",
            format!(
                "{nodes} nodes × {} frequencies exceed the {MAX_NODE_FREQUENCIES} node-frequency result limit",
                freqs.len()
            ),
        ));
    }
    let factors = case_factors(p, case)?;
    let elements = model.elements();

    // Load amplitude on the full node DOFs (for reactions) and the free DOFs.
    let nd = p.nodes.len() * 6;
    let mut f_full = vec![0.; nd];
    let mut f_free = vec![0.; d.count];
    for load in &p.loads {
        if let Load::Nodal {
            case, node, values, ..
        } = load
        {
            let factor = *factors.get(case).unwrap_or(&0.);
            for a in 0..6 {
                let g = d.node[node] * 6 + a;
                f_full[g] += values[a] * factor;
                if let Some(f) = d.free[g] {
                    f_free[f] += values[a] * factor;
                }
            }
        }
    }
    for (e, m) in elements.iter().zip(&p.members) {
        let q = member_load_density(p, m, e.rotation, &factors);
        if q == [0.; 3] {
            continue;
        }
        let g = to_global(e.rotation, &uniform(e.length, q));
        for x in 0..12 {
            let node = if x < 6 { e.start } else { e.end };
            f_full[node * 6 + x % 6] += g[x];
            for &(f, c) in &e.map[x] {
                f_free[f] += c * g[x];
            }
        }
    }
    if f_free.iter().all(|v| *v == 0.) {
        return Err(err(
            "INVALID_LOAD",
            "The case or combination applies no load to a free degree of freedom",
        ));
    }
    let settings_hash = digest(
        &serde_json::to_vec(&json!({
            "analysisSettings": original.analysis_settings,
            "harmonic": {
                "analysisType": "harmonic",
                "formulation": "response-v1",
                "case": case,
                "frequencies": freqs,
                "a0": a0, "a1": a1,
                "massMatrix": settings.mass_matrix.name(),
                "subdivisions": settings.subdivisions,
            }
        }))
        .unwrap(),
    );

    let pencil = ComplexPencil::new(&[&model.k, &model.m], model.budget())?;
    let rhs: Vec<C64> = f_free.iter().map(|v| C64::real(*v)).collect();
    let node_ids: Vec<String> = original.nodes.iter().map(|x| x.id.clone()).collect();
    let supports: Vec<(String, usize, [bool; 6])> = original
        .supports
        .iter()
        .map(|s| (s.id.clone(), d.node[&s.node], s.fixed))
        .collect();
    let scale = |v: C64, c: f64| v.scale(c);
    let split = |v: C64| vec![v.re, v.im];
    let join = |c: &[f64]| C64::new(c[0], c[1]);
    let mut results = vec![];
    let (mut worst, mut smallest) = (0f64, f64::INFINITY);
    for &f in freqs {
        let w = 2. * std::f64::consts::PI * f;
        let ck = C64::new(1., w * a1);
        let cm = C64::new(-w * w, w * a0);
        let factor = pencil.factor(&[ck, cm])?;
        let (u, residual) = factor.solve(&rhs);
        if !(residual <= 1e-8) {
            return Err(err(
                "RESIDUAL_FAILURE",
                format!("Harmonic residual {residual:e} at {f} Hz"),
            ));
        }
        worst = worst.max(residual);
        smallest = smallest.min(factor.min_pivot);
        let at = |g: usize| d.free[g].map_or(C64::ZERO, |a| u[a]);
        let mut displacement_re = Vec::with_capacity(nodes * 6);
        let mut displacement_im = Vec::with_capacity(nodes * 6);
        for id in &node_ids {
            for a in 0..6 {
                let v = at(d.node[id] * 6 + a);
                displacement_re.push(v.re);
                displacement_im.push(v.im);
            }
        }
        // Reactions: element end forces (Z_e u_e) at restrained DOFs minus
        // the applied amplitude there.
        let mut reaction = vec![C64::ZERO; nd];
        for e in &elements {
            let ends = local_ends(e, &u, scale, split, join, |dl| {
                let re: [f64; 12] = std::array::from_fn(|a| dl[a].re);
                let im: [f64; 12] = std::array::from_fn(|a| dl[a].im);
                let (kre, kim) = (
                    matrix_apply(&e.stiffness, &re),
                    matrix_apply(&e.stiffness, &im),
                );
                let (mre, mim) = (matrix_apply(&e.mass, &re), matrix_apply(&e.mass, &im));
                std::array::from_fn(|a| {
                    ck * C64::new(kre[a], kim[a]) + cm * C64::new(mre[a], mim[a])
                })
            });
            let re = to_global(e.rotation, &std::array::from_fn(|a| ends[a].re));
            let im = to_global(e.rotation, &std::array::from_fn(|a| ends[a].im));
            for x in 0..12 {
                let node = if x < 6 { e.start } else { e.end };
                reaction[node * 6 + x % 6] += C64::new(re[x], im[x]);
            }
        }
        let mut reaction_re = vec![];
        let mut reaction_im = vec![];
        for (_, node, fixed) in &supports {
            for a in 0..6 {
                let v = if fixed[a] {
                    reaction[node * 6 + a] - C64::real(f_full[node * 6 + a])
                } else {
                    C64::ZERO
                };
                reaction_re.push(v.re);
                reaction_im.push(v.im);
            }
        }
        results.push(HarmonicFrequency {
            frequency: f,
            omega: w,
            damping_ratio: a0 / (2. * w) + a1 * w / 2.,
            residual,
            displacement_re,
            displacement_im,
            reaction_re,
            reaction_im,
        });
    }
    let hash = &model.model_hash[..16];
    Ok(HarmonicResponse {
        result_id: format!("{hash}-harmonic-{}", &settings_hash[..8]),
        schema_version: "1.0.0".into(),
        analysis_type: "harmonic".into(),
        converged: true,
        model_hash: model.model_hash.clone(),
        settings_hash,
        solver_build_hash: solver_build_hash(),
        source_revision: original.revision,
        case_id: case.into(),
        subdivisions: settings.subdivisions,
        mass_matrix: settings.mass_matrix.name().into(),
        damping: RayleighDamping {
            a0,
            a1,
            ratio,
            frequencies: pair,
        },
        node_ids,
        support_ids: supports.into_iter().map(|s| s.0).collect(),
        frequencies: results,
        numerical_checks: json!({
            "freeDofs": d.count,
            "factorNonzeros": pencil.factor_nnz(),
            "maxResidual": worst,
            "minScaledPivot": smallest,
        }),
        disclosures: vec![
            "STEADY_STATE_ONLY".into(),
            "RAYLEIGH_DAMPING".into(),
            "PRESCRIBED_DISPLACEMENTS_STATIC_ONLY".into(),
            "NO_MEMBER_ACTIONS".into(),
        ],
        diagnostics: model.mass.diagnostics.clone(),
    })
}

/// Der Kiureghian (1981) CQC correlation for equal damping ζ.
fn cqc_rho(wi: f64, wj: f64, zeta: f64) -> f64 {
    let b = wj / wi;
    8. * zeta * zeta * (1. + b) * b.powf(1.5)
        / ((1. - b * b).powi(2) + 4. * zeta * zeta * b * (1. + b).powi(2))
}

pub fn response_spectrum(
    project: &Project,
    settings: &SpectrumSettings,
) -> Result<SpectrumResponse> {
    if !(1..=50).contains(&settings.modes)
        || !(1..=32).contains(&settings.subdivisions)
        || settings.direction > 2
        || !(settings.scale.is_finite() && settings.scale > 0.)
        || !(settings.participation_target > 0. && settings.participation_target <= 1.)
    {
        return Err(err(
            "INVALID_SETTINGS",
            "Spectrum analysis takes 1–50 modes, 1–32 subdivisions, a direction X/Y/Z, a scale > 0 and a participation target in (0, 1]",
        ));
    }
    let spectrum = project
        .response_spectra
        .iter()
        .find(|s| s.id == settings.spectrum)
        .ok_or_else(|| err("DANGLING_REFERENCE", "Unknown response spectrum"))?
        .clone();
    let model = DynamicModel::build(project, settings.mass_matrix, settings.subdivisions)?;
    let dir = settings.direction;
    if model.participating[dir] <= 0. {
        return Err(err(
            "NO_MASS",
            format!("No mass participates in {}", DIRECTIONS[dir]),
        ));
    }
    let original = &model.original;
    let p = &model.mesh.project;
    let d = &model.d;
    let settings_hash = digest(
        &serde_json::to_vec(&json!({
            "analysisSettings": original.analysis_settings,
            "responseSpectrum": {
                "analysisType": "responseSpectrum",
                "formulation": "response-v1",
                "spectrum": settings.spectrum,
                "direction": DIRECTIONS[dir],
                "scale": settings.scale,
                "combination": settings.combination.name(),
                "modes": settings.modes,
                "massMatrix": settings.mass_matrix.name(),
                "subdivisions": settings.subdivisions,
                "participationTarget": settings.participation_target,
            }
        }))
        .unwrap(),
    );
    let solved = vibration(&model.k, &model.m, settings.modes, model.budget())?;
    let r = &model.influence[dir];
    let mr = matvec(&model.m, r);

    // Per mode: modal peak coordinate vector x = φ Γ s Sa / ω².
    let mut modes = vec![];
    let mut xs: Vec<Vec<f64>> = vec![];
    let mut omegas = vec![];
    let mut beyond = vec![];
    for (n, (omega2, shape)) in solved.omega_squared.iter().zip(&solved.shapes).enumerate() {
        let omega = omega2.sqrt();
        let period = 2. * std::f64::consts::PI / omega;
        let Some(sa) = spectrum.sa(period) else {
            beyond.push(period);
            continue;
        };
        let sa = sa * settings.scale;
        let gamma: f64 = shape.iter().zip(&mr).map(|(a, b)| a * b).sum();
        let q = gamma * sa / omega2;
        xs.push(shape.iter().map(|v| v * q).collect());
        omegas.push(omega);
        modes.push(SpectrumMode {
            mode: n + 1,
            omega,
            frequency: omega / (2. * std::f64::consts::PI),
            period,
            sa,
            participation_factor: gamma,
            effective_mass: gamma * gamma,
            effective_mass_ratio: Some(gamma * gamma / model.participating[dir]),
            base_shear: gamma * gamma * sa,
        });
    }
    if !beyond.is_empty() {
        let last = spectrum.points.last().unwrap()[0];
        return Err(err(
            "SPECTRUM_RANGE",
            format!(
                "Mode period(s) {} s exceed the spectrum's last period {last} s; extend the spectrum",
                beyond
                    .iter()
                    .map(|t| format!("{t:.4}"))
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
        ));
    }
    let count = xs.len();
    let zeta = spectrum.damping_ratio;
    let rho: Vec<Vec<f64>> = (0..count)
        .map(|i| {
            (0..count)
                .map(|j| match settings.combination {
                    Combination::Srss => f64::from(u8::from(i == j)),
                    Combination::Cqc => cqc_rho(omegas[i], omegas[j], zeta),
                })
                .collect()
        })
        .collect();
    let combine = |values: &[f64]| -> f64 {
        let mut s = 0.;
        for i in 0..count {
            if values[i] == 0. {
                continue;
            }
            for j in 0..count {
                s += rho[i][j] * values[i] * values[j];
            }
        }
        s.max(0.).sqrt()
    };

    // Modal responses: node displacements, element ends, reactions.
    let elements = model.elements();
    let nd = p.nodes.len() * 6;
    let scale = |v: f64, c: f64| v * c;
    let split = |v: f64| vec![v];
    let join = |c: &[f64]| c[0];
    let modal_ends: Vec<Vec<[f64; 12]>> = xs
        .iter()
        .map(|x| {
            elements
                .iter()
                .map(|e| {
                    local_ends(e, x, scale, split, join, |dl| {
                        matrix_apply(&e.stiffness, dl)
                    })
                })
                .collect()
        })
        .collect();
    let modal_reactions: Vec<Vec<f64>> = modal_ends
        .iter()
        .map(|ends| {
            let mut reaction = vec![0.; nd];
            for (e, end) in elements.iter().zip(ends) {
                let g = to_global(e.rotation, end);
                for x in 0..12 {
                    let node = if x < 6 { e.start } else { e.end };
                    reaction[node * 6 + x % 6] += g[x];
                }
            }
            reaction
        })
        .collect();
    let node_ids: Vec<String> = original.nodes.iter().map(|x| x.id.clone()).collect();
    let mut node_displacements = vec![];
    for id in &node_ids {
        for a in 0..6 {
            let g = d.node[id] * 6 + a;
            let values: Vec<f64> = xs.iter().map(|x| d.free[g].map_or(0., |f| x[f])).collect();
            node_displacements.push(combine(&values));
        }
    }
    let supports: Vec<(String, usize, [bool; 6])> = original
        .supports
        .iter()
        .map(|s| (s.id.clone(), d.node[&s.node], s.fixed))
        .collect();
    let mut reactions = vec![];
    for (_, node, fixed) in &supports {
        for a in 0..6 {
            let values: Vec<f64> = modal_reactions
                .iter()
                .map(|r| if fixed[a] { r[node * 6 + a] } else { 0. })
                .collect();
            reactions.push(combine(&values));
        }
    }
    let base_reaction: [f64; 3] = std::array::from_fn(|a| {
        let values: Vec<f64> = modal_reactions
            .iter()
            .map(|r| {
                supports
                    .iter()
                    .filter(|s| s.2[a])
                    .map(|(_, node, _)| r[node * 6 + a])
                    .sum()
            })
            .collect();
        combine(&values)
    });

    // Members: combined section actions at every mesh node, both sides.
    let index: BTreeMap<&str, usize> = elements
        .iter()
        .enumerate()
        .map(|(k, e)| (e.id.as_str(), k))
        .collect();
    let action = |k: usize, end: usize| -> [f64; 6] {
        std::array::from_fn(|c| {
            let values: Vec<f64> = modal_ends.iter().map(|ends| ends[k][end * 6 + c]).collect();
            combine(&values)
        })
    };
    let mut members = vec![];
    for m in &original.members {
        let mut chain: Vec<(usize, f64, f64)> = vec![];
        for (child, t0, t1) in pieces(&model.splits, &m.id) {
            let list = &model.mesh.elements[&child];
            let n = list.len() as f64;
            for (k, e) in list.iter().enumerate() {
                chain.push((
                    index[e.as_str()],
                    t0 + (t1 - t0) * k as f64 / n,
                    t0 + (t1 - t0) * (k + 1) as f64 / n,
                ));
            }
        }
        let last = chain.len() - 1;
        let mut stations = vec![];
        for (at, &(k, t0, t1)) in chain.iter().enumerate() {
            stations.push(SpectrumStation {
                station: t0,
                side: (at > 0).then(|| "right".into()),
                actions: action(k, 0),
            });
            stations.push(SpectrumStation {
                station: t1,
                side: (at < last).then(|| "left".into()),
                actions: action(k, 1),
            });
        }
        // Order each interior node as left then right.
        stations.sort_by(|a, b| {
            a.station.total_cmp(&b.station).then_with(|| {
                let rank = |s: &SpectrumStation| match s.side.as_deref() {
                    Some("left") => 0,
                    _ => 1,
                };
                rank(a).cmp(&rank(b))
            })
        });
        members.push(SpectrumMember {
            id: m.id.clone(),
            stations,
        });
    }

    let cumulative: f64 = modes.iter().filter_map(|m| m.effective_mass_ratio).sum();
    let achieved = cumulative >= settings.participation_target;
    let mut diagnostics = model.mass.diagnostics.clone();
    if modes.len() < settings.modes {
        diagnostics.push(json!({
            "code": "FEWER_MODES_THAN_REQUESTED",
            "severity": "info",
            "message": format!("The model has {} vibration mode(s) with mass; {} were requested", modes.len(), settings.modes),
        }));
    }
    if !achieved {
        diagnostics.push(json!({
            "code": "PARTICIPATION_TARGET_NOT_MET",
            "severity": "warning",
            "direction": DIRECTIONS[dir],
            "message": format!(
                "{} modes engage {:.1} % of the {} mass; the target is {:.1} %. {:.1} % is in omitted modes and no missing-mass correction is applied.",
                modes.len(), 100. * cumulative, DIRECTIONS[dir],
                100. * settings.participation_target, 100. * (1. - cumulative).max(0.)
            ),
        }));
    }
    let hash = &model.model_hash[..16];
    Ok(SpectrumResponse {
        result_id: format!("{hash}-spectrum-{}", &settings_hash[..8]),
        schema_version: "1.0.0".into(),
        analysis_type: "responseSpectrum".into(),
        converged: true,
        model_hash: model.model_hash.clone(),
        settings_hash,
        solver_build_hash: solver_build_hash(),
        source_revision: original.revision,
        spectrum_id: spectrum.id.clone(),
        direction: DIRECTIONS[dir].into(),
        scale: settings.scale,
        combination: settings.combination.name().into(),
        damping_ratio: zeta,
        subdivisions: settings.subdivisions,
        mass_matrix: settings.mass_matrix.name().into(),
        requested_modes: settings.modes,
        modes,
        participation: DirectionParticipation {
            direction: DIRECTIONS[dir].into(),
            participating_mass: model.participating[dir],
            non_participating_mass: (model.total_mass - model.participating[dir]).max(0.),
            cumulative_ratio: Some(cumulative),
            omitted_ratio: Some((1. - cumulative).max(0.)),
            target: settings.participation_target,
            achieved: Some(achieved),
        },
        node_ids,
        node_displacements,
        support_ids: supports.into_iter().map(|s| s.0).collect(),
        reactions,
        base_reaction,
        members,
        numerical_checks: json!({
            "freeDofs": d.count,
            "iterations": solved.iterations,
            "residuals": solved.residuals,
            "sturm": solved.sturm.as_ref().map(|s| json!({"sigma": s.sigma, "negativePivots": s.negative_pivots})),
        }),
        disclosures: vec![
            "USER_SPECTRUM_NOT_A_CODE_SPECTRUM".into(),
            "PEAK_MAGNITUDES_SIGNS_LOST".into(),
            "ONE_DIRECTION".into(),
            "NO_MISSING_MASS_CORRECTION".into(),
        ],
        diagnostics,
    })
}
