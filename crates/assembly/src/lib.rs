use serde_json::json;
use sprs::TriMat;
use std::collections::BTreeMap;
use workbench_frame::{mul, stiffness, transform, uniform};
use workbench_geometry::{axes, cross, global, local};
use workbench_model::{Load, Project, Result, digest, err};
use workbench_results::{Analysis, MemberResult, Sample};
use workbench_solver::{LinearSolver, SparseLdl};
pub fn analyse(project: &Project, case: &str) -> Result<Analysis> {
    project.validate()?;
    let mut p = project.clone();
    p.canonicalise();
    let factors: BTreeMap<String, f64> =
        if let Some(c) = p.combinations.iter().find(|c| c.id == case) {
            c.terms.iter().map(|t| (t.case.clone(), t.factor)).collect()
        } else if p.load_cases.iter().any(|c| c.id == case) {
            [(case.into(), 1.)].into()
        } else {
            return Err(err("INVALID_LOAD", "Unknown case or combination"));
        };
    let ni: BTreeMap<_, _> = p
        .nodes
        .iter()
        .enumerate()
        .map(|(i, n)| (n.id.as_str(), i))
        .collect();
    let nd = p.nodes.len() * 6;
    let mut entries = BTreeMap::<(usize, usize), f64>::new();
    let mut f = vec![0.; nd];
    let mut fixed = vec![false; nd];
    let mut u = vec![0.; nd];
    for s in &p.supports {
        let i = ni[s.node.as_str()] * 6;
        for a in 0..6 {
            fixed[i + a] = s.fixed[a];
            u[i + a] = s.prescribed[a];
        }
    }
    if p.analysis_mode == "planarXZ" {
        for i in 0..p.nodes.len() {
            for a in [1, 3, 5] {
                fixed[i * 6 + a] = true;
            }
        }
    }
    for load in &p.loads {
        if let Load::Nodal {
            case, node, values, ..
        } = load
        {
            let factor = *factors.get(case).unwrap_or(&0.);
            for a in 0..6 {
                f[ni[node.as_str()] * 6 + a] += values[a] * factor;
            }
        }
    }
    let mut elements = vec![];
    for m in &p.members {
        let i = ni[m.start.as_str()];
        let j = ni[m.end.as_str()];
        let a = p.nodes[i].position;
        let b = p.nodes[j].position;
        let (l, r) = axes(a, b, m.local_y);
        let mat = p.materials.iter().find(|v| v.id == m.material).unwrap();
        let sec = p.sections.iter().find(|v| v.id == m.section).unwrap();
        let k = stiffness(l, mat, sec);
        let kg = transform(&k, r);
        let ids: [usize; 12] =
            std::array::from_fn(|d| if d < 6 { i * 6 + d } else { j * 6 + d - 6 });
        let mut q = [0.; 3];
        for load in &p.loads {
            let factor = *factors.get(load.case()).unwrap_or(&0.);
            let add = match load {
                Load::Uniform {
                    member,
                    axes,
                    force_per_length,
                    ..
                } if *member == m.id => {
                    if axes == "local" {
                        *force_per_length
                    } else {
                        local(r, *force_per_length)
                    }
                }
                Load::SelfWeight {
                    members,
                    factor: sw,
                    ..
                } if members.contains(&m.id) => {
                    local(r, p.gravity.map(|g| g * mat.density * sec.a * sw))
                }
                _ => [0.; 3],
            };
            for d in 0..3 {
                q[d] += add[d] * factor;
            }
        }
        let fe = uniform(l, q);
        for block in 0..4 {
            let v = global(r, [fe[block * 3], fe[block * 3 + 1], fe[block * 3 + 2]]);
            for d in 0..3 {
                f[ids[block * 3 + d]] += v[d];
            }
        }
        for x in 0..12 {
            for y in 0..12 {
                if kg[x][y] != 0. {
                    *entries.entry((ids[x], ids[y])).or_default() += kg[x][y];
                }
            }
        }
        elements.push((m, l, r, k, ids, fe, q, mat, sec));
    }
    let free: Vec<_> = (0..nd).filter(|&i| !fixed[i]).collect();
    let mut mapping = vec![usize::MAX; nd];
    for (k, &i) in free.iter().enumerate() {
        mapping[i] = k;
    }
    let mut rhs = free.iter().map(|&i| f[i]).collect::<Vec<_>>();
    let mut tri = TriMat::new((free.len(), free.len()));
    for (&(i, j), &v) in &entries {
        if !fixed[i] {
            if fixed[j] {
                rhs[mapping[i]] -= v * u[j];
            } else {
                tri.add_triplet(mapping[i], mapping[j], v);
            }
        }
    }
    let solved = SparseLdl.solve(
        &tri.to_csc(),
        &rhs,
        p.analysis_settings.memory_limit_mi_b as usize * 1024 * 1024 / 2,
    )?;
    for (k, &i) in free.iter().enumerate() {
        u[i] = solved.values[k];
    }
    let mut reactions = f.iter().map(|v| -v).collect::<Vec<_>>();
    for (&(i, j), v) in &entries {
        reactions[i] += v * u[j];
    }
    let mut balances = [0.; 6];
    let mut scale = [0.; 2];
    for (i, node) in p.nodes.iter().enumerate() {
        let actions: [f64; 6] = std::array::from_fn(|a| {
            f[i * 6 + a]
                + if fixed[i * 6 + a] {
                    reactions[i * 6 + a]
                } else {
                    0.
                }
        });
        let moment = cross(node.position, [actions[0], actions[1], actions[2]]);
        for a in 0..3 {
            balances[a] += actions[a];
            balances[a + 3] += actions[a + 3] + moment[a];
            scale[0] += f[i * 6 + a].abs();
            scale[1] += f[i * 6 + a + 3].abs();
        }
        let external = cross(node.position, [f[i * 6], f[i * 6 + 1], f[i * 6 + 2]]);
        scale[1] += external.iter().map(|x| x.abs()).sum::<f64>();
    }
    if balances[..3]
        .iter()
        .any(|x| x.abs() > 1e-3 + 1e-8 * scale[0])
        || balances[3..]
            .iter()
            .any(|x| x.abs() > 1e-3 + 1e-8 * scale[1])
    {
        return Err(err(
            "EQUILIBRIUM_FAILURE",
            format!("Global balance {balances:?}"),
        ));
    }
    let mut member_results = vec![];
    for (m, l, r, k, ids, fe, q, mat, sec) in elements {
        let mut dl = [0.; 12];
        for block in 0..4 {
            let v = local(
                r,
                [
                    u[ids[block * 3]],
                    u[ids[block * 3 + 1]],
                    u[ids[block * 3 + 2]],
                ],
            );
            dl[block * 3..block * 3 + 3].copy_from_slice(&v);
        }
        let kd = mul(&k, &dl);
        let end: Vec<_> = (0..12).map(|a| kd[a] - fe[a]).collect();
        let mut samples = vec![];
        for station in 0..=40 {
            let t = station as f64 / 40.;
            let x = t * l;
            let h1 = 1. - 3. * t * t + 2. * t * t * t;
            let h2 = l * (t - 2. * t * t + t * t * t);
            let h3 = 3. * t * t - 2. * t * t * t;
            let h4 = l * (-t * t + t * t * t);
            let particular = x * x * (l - x).powi(2) / 24.;
            let disp = [
                dl[0] * (1. - t) + dl[6] * t + q[0] * x * (l - x) / (2. * mat.e * sec.a),
                h1 * dl[1]
                    + h2 * dl[5]
                    + h3 * dl[7]
                    + h4 * dl[11]
                    + q[1] * particular / (mat.e * sec.iz),
                h1 * dl[2] - h2 * dl[4] + h3 * dl[8] - h4 * dl[10]
                    + q[2] * particular / (mat.e * sec.iy),
            ];
            let displacement = global(r, disp);
            let start = p.nodes[ids[0] / 6].position;
            let position = std::array::from_fn(|a| start[a] + r[0][a] * x);
            let actions = [
                -end[0] - q[0] * x,
                -end[1] - q[1] * x,
                -end[2] - q[2] * x,
                -end[3],
                -end[4] - end[2] * x - q[2] * x * x / 2.,
                -end[5] + end[1] * x + q[1] * x * x / 2.,
            ];
            samples.push(Sample {
                station: t,
                position,
                displacement,
                actions,
            });
        }
        member_results.push(MemberResult {
            id: m.id.clone(),
            length: l,
            end_actions: end,
            samples,
        });
    }
    workbench_model::finite(&u)?;
    workbench_model::finite(&reactions)?;
    workbench_model::finite(&balances)?;
    for m in &member_results {
        workbench_model::finite(&m.end_actions)?;
        for s in &m.samples {
            workbench_model::finite(&s.displacement)?;
            workbench_model::finite(&s.actions)?;
        }
    }
    let mut support_values = vec![];
    for s in &p.supports {
        for a in 0..6 {
            support_values.push(if s.fixed[a] {
                reactions[ni[s.node.as_str()] * 6 + a]
            } else {
                0.
            });
        }
    }
    let mut generated = vec![];
    if p.analysis_mode == "planarXZ" {
        for n in &p.nodes {
            for a in [1, 3, 5] {
                if !p.supports.iter().any(|s| s.node == n.id && s.fixed[a]) {
                    generated.push(
                        json!({"nodeId":n.id,"dof":a,"reaction":reactions[ni[n.id.as_str()]*6+a]}),
                    );
                }
            }
        }
    }
    let hash = p.hash();
    let mut diagnostics = vec![];
    if solved.min_pivot < 1e-9 {
        diagnostics.push(json!({"code":"ILL_CONDITIONED","message":"Small scaled factor pivot; interpret results cautiously"}));
    }
    Ok(Analysis {
        schema_version: "1.0.0".into(),
        analysis_type: "linearStatic".into(),
        converged: true,
        case_or_combination_id: case.into(),
        buffer_descriptors: vec![
            json!({"name":"nodeDisplacements","scalarType":"f64","length":p.nodes.len()*6,"stride":6,"components":["ux","uy","uz","rx","ry","rz"]}),
            json!({"name":"reactions","scalarType":"f64","length":p.supports.len()*6,"stride":6,"components":["fx","fy","fz","mx","my","mz"]}),
            json!({"name":"memberEndActions","scalarType":"f64","length":p.members.len()*12,"stride":12}),
        ],
        result_id: format!("{}-{case}", &hash[..16]),
        model_hash: hash,
        settings_hash: digest(&serde_json::to_vec(&p.analysis_settings).unwrap()),
        solver_build_hash: option_env!("WORKBENCH_SOURCE_HASH")
            .unwrap_or("development")
            .into(),
        source_revision: p.revision,
        case_id: case.into(),
        node_ids: p.nodes.iter().map(|n| n.id.clone()).collect(),
        node_displacements: u,
        reaction_support_ids: p.supports.iter().map(|s| s.id.clone()).collect(),
        reactions: support_values,
        generated_constraint_reactions: generated,
        members: member_results,
        numerical_checks: json!({"scaledResidual":solved.residual,"minScaledPivot":solved.min_pivot,"matrixNnz":solved.nnz,"globalBalance":balances,"origin":[0,0,0],"forcePass":true,"momentPass":true}),
        diagnostics,
    })
}
