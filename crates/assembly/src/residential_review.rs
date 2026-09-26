//! Demand review only. Deliberately no concrete/geotechnical resistance claim.
use crate::analyse;
use serde_json::{Value, json};
use workbench_model::{Project, Result};
pub fn residential_review(p: &Project) -> Result<Value> {
    let mut cases = vec![];
    for case in p
        .load_cases
        .iter()
        .map(|c| c.id.as_str())
        .chain(p.combinations.iter().map(|c| c.id.as_str()))
    {
        let a = analyse(p, case)?;
        let physical:Vec<_>=p.structure.physical_members.iter().map(|pm|{
   let demands:Vec<_>=(0..6).map(|component|{
    let mut best=None;let mut magnitude=-1.;
    for member in a.members.iter().filter(|m|pm.analytical_member_ids.contains(&m.id)) {for station in &member.key_stations {
     if station.actions[component].abs()>magnitude {magnitude=station.actions[component].abs();best=Some(json!({"component":(["N","Vy","Vz","T","My","Mz"][component]),"value":station.actions[component],"memberId":member.id,"station":station.station,"side":station.side,"simultaneousActions":station.actions}));}
    }}best.unwrap_or(Value::Null)
   }).collect();
   json!({"physicalMemberId":pm.id,"name":pm.name,"role":pm.role,"demands":demands,"resistanceStatus":"UNSUPPORTED","utilisation":null})
  }).collect();
        let foundations:Vec<_>=a.reaction_support_ids.iter().enumerate().map(|(i,id)|json!({"supportId":id,"supportReaction":&a.reactions[i*6..i*6+6],"foundationActions":a.reactions[i*6..i*6+6].iter().map(|x|-x).collect::<Vec<_>>(),"contactStatus":"INDETERMINATE","bearingStatus":"UNSUPPORTED","settlementStatus":"UNSUPPORTED","reinforcementStatus":"UNSUPPORTED"})).collect();
        let maximum_translation = (0..a.node_ids.len())
            .map(|i| {
                let u = &a.node_displacements[i * 6..i * 6 + 3];
                (i, u.iter().map(|x| x * x).sum::<f64>().sqrt())
            })
            .max_by(|a, b| a.1.total_cmp(&b.1))
            .unwrap();
        cases.push(json!({"caseId":case,"resultId":a.result_id,"modelHash":a.model_hash,"sourceRevision":a.source_revision,"solverBuildHash":a.solver_build_hash,"settingsHash":a.settings_hash,"converged":a.converged,"numericalChecks":a.numerical_checks,"maximumNodalTranslation":{"nodeId":a.node_ids[maximum_translation.0],"magnitude":maximum_translation.1,"vector":&a.node_displacements[maximum_translation.0*6..maximum_translation.0*6+3]},"physicalMembers":physical,"foundations":foundations}));
    }
    Ok(
        json!({"schemaVersion":"reference-review-v1","projectName":p.name,"modelHash":p.hash(),"structureHash":p.structure.hash(),"sourceRevision":p.revision,"units":"SI: N, m, N m","overall":"UNSUPPORTED","codeProfile":null,"basis":"British / UK Eurocodes intended; no validated concrete profile","inputProvenance":"syntheticFixture","assumptions":p.metadata.description,"demandNote":"Scalar governing demands are separate observations. Each retains its own actual simultaneous action vector; do not combine maxima into a fictitious vector. Slab results are one-way strip forces, never plate actions.","requiredDesignWork":["Confirm site, intended code editions and UK National Annexes, imposed categories, partitions, cladding, snow and wind","Pattern loading, complete ULS/SLS combinations, global stability and imperfections, second order response","RC beam flexure, shear, torsion, crack width, long term deflection and detailing","Column biaxial resistance, slenderness, robustness and fire","Slab distribution, punching, deflection and reinforcement; stair detailing and headroom","Ground investigation, bearing, eccentric contact, sliding, settlement, footing shear/punching/flexure"],"cases":cases}),
    )
}
