//! Deterministic analytical splitting of physical members that carry interior point loads.
use std::collections::{BTreeMap, BTreeSet};
use workbench_geometry::{axes, global};
use workbench_model::{Load, Member, Node, Project, Release, Result, err};
use workbench_results::{Analysis, KeyStation, MemberResult, Sample};

#[derive(Clone, Debug)]
pub struct ChildSpan {
    pub id: String,
    pub t0: f64,
    pub t1: f64,
}

#[derive(Clone, Debug)]
pub struct PhysicalSplit {
    pub children: Vec<ChildSpan>,
    /// Normalised stations on the physical member where concentrated actions act.
    pub jump_stations: Vec<f64>,
}

pub type SplitMap = BTreeMap<String, PhysicalSplit>;

fn station_key(station: f64) -> String {
    format!("{}", (station * 1_000_000.0).round() as i64)
}

fn analytical_node_id(member_id: &str, station: f64) -> String {
    format!("an_{member_id}_{}", station_key(station))
}

fn analytical_member_id(member_id: &str, index: usize) -> String {
    format!("ae_{member_id}_{index}")
}

/// Expand interior point loads into analytical nodes/members. Unsplit members are unchanged.
/// Result `model_hash` must still come from the caller’s original project.
pub fn expand_point_loads(project: &Project) -> Result<(Project, SplitMap)> {
    let mut p = project.clone();
    let mut splits = SplitMap::new();
    let mut point_by_member: BTreeMap<String, Vec<&Load>> = BTreeMap::new();
    for load in &project.loads {
        if let Load::Point { member, station, .. } = load {
            if *station <= 0.0 || *station >= 1.0 {
                return Err(err(
                    "INVALID_LOAD",
                    "Interior point station must be strictly between 0 and 1; use a nodal load at an end",
                ));
            }
            point_by_member
                .entry(member.clone())
                .or_default()
                .push(load);
        }
    }
    if point_by_member.is_empty() {
        return Ok((p, splits));
    }

    let mut new_nodes = p.nodes.clone();
    let mut new_members = Vec::new();

    for m in &p.members {
        let Some(points) = point_by_member.get(&m.id) else {
            new_members.push(m.clone());
            continue;
        };
        let start = p
            .nodes
            .iter()
            .find(|n| n.id == m.start)
            .ok_or_else(|| err("DANGLING_REFERENCE", &m.start))?;
        let end = p
            .nodes
            .iter()
            .find(|n| n.id == m.end)
            .ok_or_else(|| err("DANGLING_REFERENCE", &m.end))?;
        let mut stations: BTreeSet<i64> = BTreeSet::new();
        for load in points {
            if let Load::Point { station, .. } = load {
                stations.insert((station * 1_000_000.0).round() as i64);
            }
        }
        let mut ts: Vec<f64> = stations
            .into_iter()
            .map(|k| k as f64 / 1_000_000.0)
            .collect();
        ts.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let mut breaks = vec![0.0];
        breaks.extend(ts.iter().copied());
        breaks.push(1.0);

        for &t in &ts {
            let id = analytical_node_id(&m.id, t);
            if project.nodes.iter().any(|n| n.id == id) {
                return Err(err(
                    "DUPLICATE_ID",
                    format!("Analytical node id {id} collides with a project node"),
                ));
            }
            if !new_nodes.iter().any(|n| n.id == id) {
                let pos = [
                    start.position[0] + t * (end.position[0] - start.position[0]),
                    start.position[1] + t * (end.position[1] - start.position[1]),
                    start.position[2] + t * (end.position[2] - start.position[2]),
                ];
                new_nodes.push(Node {
                    id,
                    position: pos,
                });
            }
        }

        let mut children = Vec::new();
        let last = breaks.len() - 1;
        for (i, window) in breaks.windows(2).enumerate() {
            let t0 = window[0];
            let t1 = window[1];
            if (t1 - t0) < 1e-12 {
                return Err(err("INVALID_LOAD", "Degenerate analytical segment"));
            }
            let child_id = analytical_member_id(&m.id, i);
            if project.members.iter().any(|x| x.id == child_id) {
                return Err(err(
                    "DUPLICATE_ID",
                    format!("Analytical member id {child_id} collides with a project member"),
                ));
            }
            let start_id = if (t0 - 0.0).abs() < 1e-15 {
                m.start.clone()
            } else {
                analytical_node_id(&m.id, t0)
            };
            let end_id = if (t1 - 1.0).abs() < 1e-15 {
                m.end.clone()
            } else {
                analytical_node_id(&m.id, t1)
            };
            let release_start = if i == 0 {
                m.release_start.clone()
            } else {
                Release {
                    my: false,
                    mz: false,
                }
            };
            let release_end = if i + 1 == last {
                m.release_end.clone()
            } else {
                Release {
                    my: false,
                    mz: false,
                }
            };
            new_members.push(Member {
                id: child_id.clone(),
                start: start_id,
                end: end_id,
                material: m.material.clone(),
                section: m.section.clone(),
                local_y: m.local_y,
                release_start,
                release_end,
                parent_member_id: Some(m.id.clone()),
                station_range: Some([t0, t1]),
            });
            children.push(ChildSpan {
                id: child_id,
                t0,
                t1,
            });
        }
        splits.insert(
            m.id.clone(),
            PhysicalSplit {
                children,
                jump_stations: ts,
            },
        );
    }

    let mut new_loads = Vec::new();
    for load in &p.loads {
        match load {
            Load::Point {
                id,
                case,
                member,
                axes: load_axes,
                station,
                values,
            } => {
                let parent = p
                    .members
                    .iter()
                    .find(|m| m.id == *member)
                    .ok_or_else(|| err("DANGLING_REFERENCE", member))?;
                let start = p.nodes.iter().find(|n| n.id == parent.start).unwrap();
                let end = p.nodes.iter().find(|n| n.id == parent.end).unwrap();
                let (_, r) = axes(start.position, end.position, parent.local_y);
                let values = if load_axes == "local" {
                    let f = global(r, [values[0], values[1], values[2]]);
                    let m = global(r, [values[3], values[4], values[5]]);
                    [f[0], f[1], f[2], m[0], m[1], m[2]]
                } else {
                    *values
                };
                new_loads.push(Load::Nodal {
                    id: id.clone(),
                    case: case.clone(),
                    node: analytical_node_id(member, *station),
                    values,
                });
            }
            Load::Uniform {
                id,
                case,
                member,
                axes,
                force_per_length,
            } => {
                if let Some(split) = splits.get(member) {
                    for (i, child) in split.children.iter().enumerate() {
                        new_loads.push(Load::Uniform {
                            id: format!("{id}__{i}"),
                            case: case.clone(),
                            member: child.id.clone(),
                            axes: axes.clone(),
                            force_per_length: *force_per_length,
                        });
                    }
                } else {
                    new_loads.push(load.clone());
                }
            }
            Load::SelfWeight {
                id,
                case,
                members,
                factor,
            } => {
                let mut expanded = Vec::new();
                for mid in members {
                    if let Some(split) = splits.get(mid) {
                        expanded.extend(split.children.iter().map(|c| c.id.clone()));
                    } else {
                        expanded.push(mid.clone());
                    }
                }
                new_loads.push(Load::SelfWeight {
                    id: id.clone(),
                    case: case.clone(),
                    members: expanded,
                    factor: *factor,
                });
            }
            Load::Nodal { .. } => new_loads.push(load.clone()),
        }
    }

    p.nodes = new_nodes;
    p.members = new_members;
    p.loads = new_loads;
    Ok((p, splits))
}

fn force_jump_components(left: &[f64; 6], right: &[f64; 6]) -> Vec<String> {
    const NAMES: [&str; 6] = ["N", "Vy", "Vz", "T", "My", "Mz"];
    let mut out = Vec::new();
    for i in 0..6 {
        if (left[i] - right[i]).abs() > 1e-9 * (1. + left[i].abs().max(right[i].abs())) {
            out.push(NAMES[i].into());
        }
    }
    out
}

fn stitch_member(
    physical_id: &str,
    split: &PhysicalSplit,
    by_id: &BTreeMap<String, MemberResult>,
) -> Result<MemberResult> {
    let mut children = Vec::with_capacity(split.children.len());
    for c in &split.children {
        children.push(
            by_id
                .get(&c.id)
                .ok_or_else(|| err("INTERNAL", format!("missing child result {}", c.id)))?,
        );
    }
    let length: f64 = children.iter().map(|c| c.length).sum();
    let mut end_actions = children[0].end_actions[..6].to_vec();
    end_actions.extend_from_slice(&children.last().unwrap().end_actions[6..]);

    let mut samples = Vec::new();
    for (ci, child) in children.iter().enumerate() {
        let span = &split.children[ci];
        for s in &child.samples {
            let t = span.t0 + s.station * (span.t1 - span.t0);
            samples.push(Sample {
                station: t,
                position: s.position,
                displacement: s.displacement,
                actions: s.actions,
            });
        }
    }

    let mut key_stations = Vec::new();
    if let Some(start) = children[0]
        .key_stations
        .iter()
        .find(|k| k.kind == "end" && k.station == 0.)
    {
        key_stations.push(KeyStation {
            station: 0.,
            kind: "end".into(),
            components: start.components.clone(),
            actions: start.actions,
            side: None,
        });
    }
    if let Some(end) = children
        .last()
        .unwrap()
        .key_stations
        .iter()
        .find(|k| k.kind == "end" && k.station == 1.)
    {
        key_stations.push(KeyStation {
            station: 1.,
            kind: "end".into(),
            components: end.components.clone(),
            actions: end.actions,
            side: None,
        });
    }
    for (ci, child) in children.iter().enumerate() {
        let span = &split.children[ci];
        for k in &child.key_stations {
            if k.kind != "extremum" {
                continue;
            }
            key_stations.push(KeyStation {
                station: span.t0 + k.station * (span.t1 - span.t0),
                kind: "extremum".into(),
                components: k.components.clone(),
                actions: k.actions,
                side: None,
            });
        }
    }
    for (ji, &t) in split.jump_stations.iter().enumerate() {
        let left = children[ji]
            .key_stations
            .iter()
            .find(|k| k.kind == "end" && k.station == 1.)
            .map(|k| k.actions)
            .or_else(|| children[ji].samples.last().map(|s| s.actions))
            .ok_or_else(|| err("INTERNAL", "left discontinuity actions"))?;
        let right = children[ji + 1]
            .key_stations
            .iter()
            .find(|k| k.kind == "end" && k.station == 0.)
            .map(|k| k.actions)
            .or_else(|| children[ji + 1].samples.first().map(|s| s.actions))
            .ok_or_else(|| err("INTERNAL", "right discontinuity actions"))?;
        let comps = force_jump_components(&left, &right);
        if comps.is_empty() {
            continue;
        }
        key_stations.push(KeyStation {
            station: t,
            kind: "discontinuity".into(),
            components: comps.clone(),
            actions: left,
            side: Some("left".into()),
        });
        key_stations.push(KeyStation {
            station: t,
            kind: "discontinuity".into(),
            components: comps,
            actions: right,
            side: Some("right".into()),
        });
    }
    key_stations.sort_by(|a, b| {
        a.station
            .partial_cmp(&b.station)
            .unwrap()
            .then_with(|| match (a.side.as_deref(), b.side.as_deref()) {
                (Some("left"), Some("right")) => std::cmp::Ordering::Less,
                (Some("right"), Some("left")) => std::cmp::Ordering::Greater,
                _ => std::cmp::Ordering::Equal,
            })
    });

    Ok(MemberResult {
        id: physical_id.into(),
        length,
        end_actions,
        samples,
        key_stations,
    })
}

/// Collapse analytical child results onto the physical member inventory.
pub fn remap_to_physical(
    original: &Project,
    splits: &SplitMap,
    mut analysis: Analysis,
) -> Result<Analysis> {
    let by_id: BTreeMap<String, MemberResult> = analysis
        .members
        .drain(..)
        .map(|m| (m.id.clone(), m))
        .collect();
    let exp_ni: BTreeMap<&str, usize> = analysis
        .node_ids
        .iter()
        .enumerate()
        .map(|(i, id)| (id.as_str(), i))
        .collect();
    let mut node_ids = Vec::with_capacity(original.nodes.len());
    let mut node_displacements = Vec::with_capacity(original.nodes.len() * 6);
    for n in &original.nodes {
        let i = *exp_ni
            .get(n.id.as_str())
            .ok_or_else(|| err("INTERNAL", format!("missing expanded node {}", n.id)))?;
        node_ids.push(n.id.clone());
        node_displacements.extend_from_slice(&analysis.node_displacements[i * 6..i * 6 + 6]);
    }
    let mut members = Vec::with_capacity(original.members.len());
    for m in &original.members {
        if let Some(split) = splits.get(&m.id) {
            members.push(stitch_member(&m.id, split, &by_id)?);
        } else {
            members.push(
                by_id
                    .get(&m.id)
                    .cloned()
                    .ok_or_else(|| err("INTERNAL", format!("missing unsplit member {}", m.id)))?,
            );
        }
    }
    analysis.node_ids = node_ids;
    analysis.node_displacements = node_displacements;
    analysis.members = members;
    analysis.generated_constraint_reactions.retain(|g| {
        g.get("nodeId")
            .and_then(|v| v.as_str())
            .is_some_and(|id| original.nodes.iter().any(|n| n.id == id))
    });
    analysis.buffer_descriptors = vec![
        serde_json::json!({"name":"nodeDisplacements","scalarType":"f64","length":original.nodes.len()*6,"stride":6,"components":["ux","uy","uz","rx","ry","rz"]}),
        serde_json::json!({"name":"reactions","scalarType":"f64","length":original.supports.len()*6,"stride":6,"components":["fx","fy","fz","mx","my","mz"]}),
        serde_json::json!({"name":"memberEndActions","scalarType":"f64","length":original.members.len()*12,"stride":12}),
    ];
    Ok(analysis)
}
