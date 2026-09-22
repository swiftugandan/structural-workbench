//! Per-scalar envelopes over multiple solved cases/combinations.
use serde_json::json;
use std::collections::BTreeMap;
use workbench_model::{Project, Result, digest, err};
use workbench_results::{
    Analysis, ComponentEnvelope, Envelope, MemberEnvelope, NodeEnvelope, ProvenanceExtreme,
    SupportEnvelope,
};

use crate::analyse;

const ACTION: [&str; 6] = ["N", "Vy", "Vz", "T", "My", "Mz"];
const DISP: [&str; 6] = ["ux", "uy", "uz", "rx", "ry", "rz"];
const REACT: [&str; 6] = ["fx", "fy", "fz", "mx", "my", "mz"];
const MEMBER_DISP: [&str; 3] = ["ux", "uy", "uz"];

#[derive(Clone)]
struct Running {
    max: ProvenanceExtreme,
    min: ProvenanceExtreme,
}

impl Running {
    fn seed(extreme: ProvenanceExtreme) -> Self {
        Self {
            max: extreme.clone(),
            min: extreme,
        }
    }
    fn consider(&mut self, extreme: ProvenanceExtreme) {
        if extreme.value > self.max.value {
            self.max = extreme.clone();
        }
        if extreme.value < self.min.value {
            self.min = extreme;
        }
    }
    fn finish(self, component: &str) -> ComponentEnvelope {
        ComponentEnvelope {
            component: component.into(),
            max: self.max,
            min: self.min,
        }
    }
}

fn extreme(
    value: f64,
    case: &str,
    member_id: Option<&str>,
    station: Option<f64>,
    side: Option<&str>,
    node_id: Option<&str>,
    support_id: Option<&str>,
) -> ProvenanceExtreme {
    ProvenanceExtreme {
        value,
        case_or_combination_id: case.into(),
        member_id: member_id.map(str::to_string),
        station,
        side: side.map(str::to_string),
        node_id: node_id.map(str::to_string),
        support_id: support_id.map(str::to_string),
    }
}

fn push(
    slot: &mut Option<Running>,
    value: f64,
    case: &str,
    member_id: Option<&str>,
    station: Option<f64>,
    side: Option<&str>,
    node_id: Option<&str>,
    support_id: Option<&str>,
) {
    let e = extreme(value, case, member_id, station, side, node_id, support_id);
    match slot {
        Some(run) => run.consider(e),
        None => *slot = Some(Running::seed(e)),
    }
}

fn absorb_analysis(
    analysis: &Analysis,
    member_action: &mut BTreeMap<String, [Option<Running>; 6]>,
    member_disp: &mut BTreeMap<String, [Option<Running>; 3]>,
    node_slots: &mut BTreeMap<String, [Option<Running>; 6]>,
    support_slots: &mut BTreeMap<String, [Option<Running>; 6]>,
) {
    let case = analysis.case_or_combination_id.as_str();
    for m in &analysis.members {
        let actions = member_action
            .entry(m.id.clone())
            .or_insert([None, None, None, None, None, None]);
        for ks in &m.key_stations {
            for i in 0..6 {
                push(
                    &mut actions[i],
                    ks.actions[i],
                    case,
                    Some(&m.id),
                    Some(ks.station),
                    ks.side.as_deref(),
                    None,
                    None,
                );
            }
        }
        let disps = member_disp
            .entry(m.id.clone())
            .or_insert([None, None, None]);
        for s in &m.samples {
            for i in 0..3 {
                push(
                    &mut disps[i],
                    s.displacement[i],
                    case,
                    Some(&m.id),
                    Some(s.station),
                    None,
                    None,
                    None,
                );
            }
        }
    }
    for (i, id) in analysis.node_ids.iter().enumerate() {
        let slot = node_slots
            .entry(id.clone())
            .or_insert([None, None, None, None, None, None]);
        for d in 0..6 {
            push(
                &mut slot[d],
                analysis.node_displacements[i * 6 + d],
                case,
                None,
                None,
                None,
                Some(id),
                None,
            );
        }
    }
    for (i, id) in analysis.reaction_support_ids.iter().enumerate() {
        let slot = support_slots
            .entry(id.clone())
            .or_insert([None, None, None, None, None, None]);
        for d in 0..6 {
            push(
                &mut slot[d],
                analysis.reactions[i * 6 + d],
                case,
                None,
                None,
                None,
                None,
                Some(id),
            );
        }
    }
}

/// Build an envelope over two or more cases/combinations.
/// Each scalar stores independent max/min with governing provenance.
pub fn envelope(project: &Project, ids: &[String]) -> Result<Envelope> {
    if ids.len() < 2 {
        return Err(err(
            "INVALID_LOAD",
            "Envelope requires at least two cases or combinations",
        ));
    }
    let mut seen = std::collections::BTreeSet::new();
    for id in ids {
        if !seen.insert(id.as_str()) {
            return Err(err(
                "INVALID_LOAD",
                "Duplicate envelope case or combination",
            ));
        }
        let known = project.load_cases.iter().any(|c| c.id == *id)
            || project.combinations.iter().any(|c| c.id == *id);
        if !known {
            return Err(err(
                "INVALID_LOAD",
                format!("Unknown case or combination {id}"),
            ));
        }
    }
    let mut member_action: BTreeMap<String, [Option<Running>; 6]> = BTreeMap::new();
    let mut member_disp: BTreeMap<String, [Option<Running>; 3]> = BTreeMap::new();
    let mut node_slots: BTreeMap<String, [Option<Running>; 6]> = BTreeMap::new();
    let mut support_slots: BTreeMap<String, [Option<Running>; 6]> = BTreeMap::new();
    let mut model_hash = String::new();
    let mut settings_hash = String::new();
    let mut solver_build_hash = String::new();
    let mut source_revision = 0u64;
    for id in ids {
        let analysis = analyse(project, id)?;
        if model_hash.is_empty() {
            model_hash = analysis.model_hash.clone();
            settings_hash = analysis.settings_hash.clone();
            solver_build_hash = analysis.solver_build_hash.clone();
            source_revision = analysis.source_revision;
        } else if analysis.model_hash != model_hash {
            return Err(err(
                "STALE_RESULT",
                "Envelope aborted: model hash changed between cases",
            ));
        }
        absorb_analysis(
            &analysis,
            &mut member_action,
            &mut member_disp,
            &mut node_slots,
            &mut support_slots,
        );
    }
    let members = member_action
        .into_iter()
        .map(|(id, slots)| {
            let disps = member_disp.remove(&id).unwrap_or([None, None, None]);
            MemberEnvelope {
                id,
                actions: slots
                    .into_iter()
                    .enumerate()
                    .map(|(i, run)| run.expect("member action observed").finish(ACTION[i]))
                    .collect(),
                displacements: disps
                    .into_iter()
                    .enumerate()
                    .map(|(i, run)| {
                        run.expect("member displacement observed")
                            .finish(MEMBER_DISP[i])
                    })
                    .collect(),
            }
        })
        .collect();
    let nodes = node_slots
        .into_iter()
        .map(|(id, slots)| NodeEnvelope {
            id,
            displacements: slots
                .into_iter()
                .enumerate()
                .map(|(i, run)| run.expect("node displacement observed").finish(DISP[i]))
                .collect(),
        })
        .collect();
    let supports = support_slots
        .into_iter()
        .map(|(id, slots)| SupportEnvelope {
            id,
            reactions: slots
                .into_iter()
                .enumerate()
                .map(|(i, run)| run.expect("support reaction observed").finish(REACT[i]))
                .collect(),
        })
        .collect();
    let joined = ids.join("+");
    let digest12 = digest(joined.as_bytes());
    let result_id = format!("{}-envelope-{}", &model_hash[..16], &digest12[..12]);
    Ok(Envelope {
        result_id,
        schema_version: "1.0.0".into(),
        analysis_type: "envelope".into(),
        model_hash,
        settings_hash,
        solver_build_hash,
        source_revision,
        case_or_combination_ids: ids.to_vec(),
        members,
        nodes,
        supports,
        diagnostics: vec![json!({
            "code": "ENVELOPE_NOT_SIMULTANEOUS",
            "message": "Envelope extrema are independent scalars with governing provenance; do not treat max/min components as a simultaneous action set for design."
        })],
    })
}
