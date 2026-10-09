//! Slab panels as the model views draw them (ADR 0035). The panel outline is
//! `DesignPreview::slab_panel`; this adds where the drawn slab bears in the
//! frame. Display only: the plate solve and the frame are unaffected.
use serde_json::{Value, json};
use workbench_model::{DesignPreview, Project, SlabPanel};

/// Length tolerance for "at the slab level, inside the panel": the one
/// `DeriveSlabColumns` uses.
pub fn level_tolerance(project: &Project, lx: f64, ly: f64) -> f64 {
    let extent = project
        .nodes
        .iter()
        .flat_map(|n| n.position)
        .fold(1f64, |m, x| m.max(x.abs()));
    1e-6 * extent.max(lx).max(ly)
}

/// Where a placed slab bears: the horizontal members lying at its support
/// level inside the panel, and the soffit on the highest top of their drawn
/// surfaces (half-height |y·Z| c_y + |z·Z| c_z, the envelope the solid view
/// draws). With none, as on columns alone, the soffit is the support level.
pub struct Bearing {
    pub soffit: f64,
    pub member_ids: Vec<String>,
}

pub fn bearing(project: &Project, panel: &SlabPanel) -> Option<Bearing> {
    let [px, py, pz] = panel.placement?;
    let tol = level_tolerance(project, panel.length, panel.width);
    let position = |id: &str| {
        project
            .nodes
            .iter()
            .find(|n| n.id == id)
            .map(|n| n.position)
    };
    let inside = |p: [f64; 3]| {
        (p[2] - pz).abs() <= tol
            && (-tol..=panel.length + tol).contains(&(p[0] - px))
            && (-tol..=panel.width + tol).contains(&(p[1] - py))
    };
    let mut soffit = pz;
    let mut member_ids = vec![];
    for m in &project.members {
        let (Some(a), Some(b)) = (position(&m.start), position(&m.end)) else {
            continue;
        };
        if !(inside(a) && inside(b)) {
            continue;
        }
        let (_, axes) = workbench_geometry::axes(a, b, m.local_y);
        if axes[0][2].abs() > 1e-9 {
            continue;
        }
        let Some(section) = project.sections.iter().find(|s| s.id == m.section) else {
            continue;
        };
        let half = axes[1][2].abs() * section.cy + axes[2][2].abs() * section.cz;
        soffit = soffit.max(pz + half);
        member_ids.push(m.id.clone());
    }
    member_ids.sort();
    Some(Bearing { soffit, member_ids })
}

/// One `slabs` entry of the axes response.
pub fn slab_json(project: &Project, d: &DesignPreview) -> Option<Value> {
    let panel = d.slab_panel()?;
    let corners = panel.world_corners();
    let bearing = bearing(project, &panel);
    let plate = d.plate.as_ref();
    let column_node_ids: Vec<&str> = plate
        .iter()
        .flat_map(|p| &p.columns)
        .filter_map(|c| c.node_id.as_deref())
        .collect();
    let mut slab = serde_json::to_value(&panel).unwrap();
    slab["id"] = json!(d.id);
    slab["corners"] = json!(corners.map(|c| c.0));
    slab["openingCorners"] = json!(corners.and_then(|c| c.1));
    slab["soffit"] = json!(bearing.as_ref().map(|b| b.soffit));
    slab["bearingMemberIds"] = json!(bearing.map(|b| b.member_ids).unwrap_or_default());
    slab["columnNodeIds"] = json!(column_node_ids);
    slab["pressure"] = json!(plate.map(|p| p.inputs["pressure"]));
    Some(slab)
}
