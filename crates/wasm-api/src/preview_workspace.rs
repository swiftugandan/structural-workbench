//! Workflow previews. Missing numerical/code resources never produce a PASS.
use serde_json::{Value, json};
use workbench_design::rc_column;
use workbench_design::rc_section::{
    self, BarLayer, BarRow, ConcreteLaw, ElasticInputs, RcRectangle, SteelLaw,
};
use workbench_design::{
    CodeProfile, ColumnActions, FootingActions, PadFootingContext, PadFootingDetailing, footing_design, DesignDemand, DesignRun, Ec2UkNaProfile, MemberContext, ProfileApplicability,
    RcBarRow, RcBeamContext, RcColumnContext, RcColumnDetailing, RcFace, RcLinks,
};
use workbench_model::{
    DesignPreview, Project, Result, SectionMechanicsInputs, SlabColumn, SlabPlateInputs, digest,
    err,
};
use workbench_results::KeyStation;

fn fields(kind: &str) -> Vec<(&'static str, &'static str, f64, &'static str, f64)> {
    let mut f = match kind {
        "rcBeam" => vec![
            ("width", "Width", 0.3, "mm", 1000.),
            ("depth", "Depth", 0.6, "mm", 1000.),
            ("cover", "Cover", 0.035, "mm", 1000.),
            ("topBarDiameter", "Top bar diameter", 0.02, "mm", 1000.),
            ("topBarCount", "Top bars", 4., "", 1.),
            (
                "bottomBarDiameter",
                "Bottom bar diameter",
                0.02,
                "mm",
                1000.,
            ),
            ("bottomBarCount", "Bottom bars", 4., "", 1.),
            ("linkDiameter", "Link diameter", 0.01, "mm", 1000.),
            ("linkSpacing", "Link spacing", 0.2, "mm", 1000.),
            ("linkLegs", "Link legs", 2., "", 1.),
        ],
        // Width along the member's local y, depth along local z (ADR 0022).
        "rcColumn" => vec![
            ("width", "Width (local y)", 0.4, "mm", 1000.),
            ("depth", "Depth (local z)", 0.4, "mm", 1000.),
            ("cover", "Cover", 0.035, "mm", 1000.),
            ("barDiameter", "Bar diameter", 0.025, "mm", 1000.),
            ("barsAlongWidth", "Bars along width (per face)", 3., "", 1.),
            ("barsAlongDepth", "Bars along depth (per face)", 3., "", 1.),
            ("linkDiameter", "Link diameter", 0.01, "mm", 1000.),
            ("linkSpacing", "Link spacing", 0.2, "mm", 1000.),
        ],
        "slab" => vec![
            ("length", "Length X", 6., "m", 1.),
            ("width", "Length Y", 5., "m", 1.),
            ("thickness", "Thickness", 0.225, "mm", 1000.),
            ("cover", "Nominal cover", 0.03, "mm", 1000.),
            ("meshSize", "Target mesh size", 0.4, "mm", 1000.),
            ("openingWidth", "Opening Y", 1., "m", 1.),
            ("openingLength", "Opening X", 1., "m", 1.),
        ],
        "padFooting" => vec![
            ("length", "Length X", 2.4, "m", 1.),
            ("width", "Length Y", 2.1, "m", 1.),
            ("thickness", "Thickness", 0.55, "mm", 1000.),
            ("cover", "Cover", 0.05, "mm", 1000.),
            ("columnWidth", "Column X", 0.4, "mm", 1000.),
            ("columnDepth", "Column Y", 0.4, "mm", 1000.),
            (
                "bearingPressure",
                "Allowable bearing input",
                200000.,
                "kPa",
                0.001,
            ),
            ("embedment", "Foundation depth", 1.2, "m", 1.),
            ("soilUnitWeight", "Soil unit weight", 18000., "N/m³", 1.),
        ],
        _ => vec![],
    };
    f.extend([
        (
            "concreteStrength",
            "Concrete strength input",
            30e6,
            "MPa",
            1e-6,
        ),
        (
            "rebarStrength",
            "Reinforcement strength input",
            500e6,
            "MPa",
            1e-6,
        ),
    ]);
    f
}
/// (key, label, synthetic default, unit, display scale, law or "all"). Defaults are the
/// RC-SR-BLOCK oracle fixture values, never code coefficients (ADR 0012).
type MechanicsField = (
    &'static str,
    &'static str,
    f64,
    &'static str,
    f64,
    &'static str,
);
const MECHANICS_FIELDS: &[MechanicsField] = &[
    (
        "blockIntensity",
        "Stress-block intensity",
        20e6,
        "MPa",
        1e-6,
        "rectangularBlock",
    ),
    (
        "blockDepthRatio",
        "Stress-block depth ratio λ",
        0.75,
        "",
        1.,
        "rectangularBlock",
    ),
    (
        "parabolaPeak",
        "Peak concrete stress",
        20e6,
        "MPa",
        1e-6,
        "parabolaRectangle",
    ),
    (
        "strainAtPeak",
        "Strain at peak stress",
        0.002,
        "",
        1.,
        "parabolaRectangle",
    ),
    (
        "parabolaExponent",
        "Parabola exponent n",
        2.,
        "",
        1.,
        "parabolaRectangle",
    ),
    (
        "ultimateStrain",
        "Ultimate concrete strain",
        0.003,
        "",
        1.,
        "all",
    ),
    (
        "steelYieldStrength",
        "Steel yield strength (mechanics)",
        460e6,
        "MPa",
        1e-6,
        "all",
    ),
    ("steelModulus", "Steel modulus", 200e9, "GPa", 1e-9, "all"),
    (
        "concreteModulus",
        "Concrete modulus",
        30e9,
        "GPa",
        1e-9,
        "all",
    ),
    (
        "concreteTensileStrength",
        "Concrete tensile strength",
        2.8e6,
        "MPa",
        1e-6,
        "all",
    ),
    (
        "minimumClearSpacing",
        "Minimum clear bar spacing",
        0.025,
        "mm",
        1000.,
        "all",
    ),
    // Column drafts only (pivot C of the strain domain, ADR 0022).
    (
        "fullCompressionStrain",
        "Full-compression strain (pivot C)",
        0.002,
        "",
        1.,
        "rcColumn",
    ),
];
const MECHANICS_LAWS: &[(&str, &str)] = &[
    ("rectangularBlock", "Rectangular stress block"),
    ("parabolaRectangle", "Parabola-rectangle"),
];
fn mechanics_default(kind: &str, law: &str, key: &str) -> Option<f64> {
    MECHANICS_FIELDS
        .iter()
        .find(|f| f.0 == key && (f.5 == "all" || f.5 == law || f.5 == kind))
        .map(|f| f.2)
}
fn mechanics_keys(kind: &str, law: &str) -> Result<Vec<&'static str>> {
    SectionMechanicsInputs::keys(kind, law)
        .ok_or_else(|| err("INVALID_SCHEMA", "Unknown section-mechanics law"))
}
fn default_mechanics(kind: &str) -> SectionMechanicsInputs {
    let law = "rectangularBlock";
    let keys = mechanics_keys(kind, law).unwrap();
    SectionMechanicsInputs {
        law: law.into(),
        inputs: keys
            .iter()
            .map(|k| (k.to_string(), mechanics_default(kind, law, k).unwrap()))
            .collect(),
        input_sources: keys
            .iter()
            .map(|k| (k.to_string(), "syntheticFixture".to_string()))
            .collect(),
    }
}
/// Parse edited mechanics inputs; provenance is `user` only where the value
/// differs from the previously stored value (or the synthetic default for a
/// newly introduced key).
fn edit_mechanics(
    kind: &str,
    old: Option<&SectionMechanicsInputs>,
    args: &Value,
) -> Result<SectionMechanicsInputs> {
    let law = args["law"]
        .as_str()
        .ok_or_else(|| err("INVALID_SCHEMA", "Section-mechanics law is required"))?;
    let keys = mechanics_keys(kind, law)?;
    let mut inputs = std::collections::BTreeMap::new();
    let mut sources = std::collections::BTreeMap::new();
    for key in keys {
        let unit = MECHANICS_FIELDS.iter().find(|f| f.0 == key).unwrap().3;
        let mut v = args["inputs"][key].clone();
        super::quantity(
            &mut v,
            match unit {
                "MPa" | "GPa" => "stress",
                "" => "dimensionless",
                _ => "length",
            },
        )?;
        let value = v.as_f64().ok_or_else(|| {
            err(
                "INVALID_SCHEMA",
                format!("Section-mechanics input {key} must be numeric"),
            )
        })?;
        let previous = old.and_then(|m| {
            m.inputs
                .get(key)
                .map(|v| (*v, m.input_sources[key].clone()))
        });
        let source = match previous {
            Some((p, s)) if p == value => s,
            Some(_) => "user".into(),
            None if mechanics_default(kind, law, key) == Some(value) => "syntheticFixture".into(),
            None => "user".into(),
        };
        inputs.insert(key.to_string(), value);
        sources.insert(key.to_string(), source);
    }
    let m = SectionMechanicsInputs {
        law: law.into(),
        inputs,
        input_sources: sources,
    };
    m.validate(kind)?;
    Ok(m)
}
/// (key, label, synthetic default, unit, display scale). The defaults are
/// the P-OPEN-OS oracle panel's load and material, never code values.
type PlateField = (&'static str, &'static str, f64, &'static str, f64);
const PLATE_FIELDS: &[PlateField] = &[
    ("pressure", "Uniform pressure (down)", 10e3, "kPa", 1e-3),
    ("elasticModulus", "Elastic modulus", 30e9, "GPa", 1e-9),
    ("poissonRatio", "Poisson's ratio ν", 0.2, "", 1.),
    ("openingX", "Opening corner X", 2.5, "m", 1.),
    ("openingY", "Opening corner Y", 2., "m", 1.),
];
const PLATE_EDGE_LABELS: [&str; 4] = ["Edge x = 0", "Edge x = Lx", "Edge y = 0", "Edge y = Ly"];
fn default_plate() -> SlabPlateInputs {
    let mut input_sources: std::collections::BTreeMap<String, String> = PLATE_FIELDS
        .iter()
        .map(|f| (f.0.to_string(), "syntheticFixture".to_string()))
        .collect();
    for k in ["edges", "includeOpening"] {
        input_sources.insert(k.into(), "syntheticFixture".into());
    }
    SlabPlateInputs {
        edges: std::array::from_fn(|_| "simple".to_string()),
        include_opening: true,
        inputs: PLATE_FIELDS
            .iter()
            .map(|f| (f.0.to_string(), f.2))
            .collect(),
        input_sources,
        placement: None,
        columns: vec![],
    }
}
/// Parse edited plate inputs; provenance becomes `user` only where a value
/// differs from the stored one (or, when none is stored, from the default).
fn edit_plate(old: Option<&SlabPlateInputs>, args: &Value) -> Result<SlabPlateInputs> {
    let base = old.cloned().unwrap_or_else(default_plate);
    let mut next = base.clone();
    for &(key, _, _, unit, _) in PLATE_FIELDS {
        let mut v = args["inputs"][key].clone();
        super::quantity(
            &mut v,
            match unit {
                "kPa" | "GPa" => "stress",
                "" => "dimensionless",
                _ => "length",
            },
        )?;
        let value = v.as_f64().ok_or_else(|| {
            err(
                "INVALID_SCHEMA",
                format!("Plate input {key} must be numeric"),
            )
        })?;
        if value != base.inputs[key] {
            next.inputs.insert(key.into(), value);
            next.input_sources.insert(key.into(), "user".into());
        }
    }
    let edges: [String; 4] = serde_json::from_value(args["edges"].clone()).map_err(|_| {
        err(
            "INVALID_SCHEMA",
            "Plate edges must list four edge conditions",
        )
    })?;
    if edges != base.edges {
        next.edges = edges;
        next.input_sources.insert("edges".into(), "user".into());
    }
    let include = args["includeOpening"]
        .as_bool()
        .ok_or_else(|| err("INVALID_SCHEMA", "includeOpening must be true or false"))?;
    if include != base.include_opening {
        next.include_opening = include;
        next.input_sources
            .insert("includeOpening".into(), "user".into());
    }
    // Columns: a column identical to a stored one keeps its source (a model
    // column stays tied to its node and members); anything else is the
    // user's own point support.
    if let Some(list) = args.get("columns").filter(|v| !v.is_null()) {
        let list = list
            .as_array()
            .ok_or_else(|| err("INVALID_SCHEMA", "plate.columns must be an array"))?;
        next.columns = list
            .iter()
            .map(|c| {
                let mut column: SlabColumn = serde_json::from_value(json!({
                    "x": c["x"], "y": c["y"], "kind": c["kind"],
                    "kz": c.get("kz").cloned().unwrap_or(json!(0.)),
                    "krx": c.get("krx").cloned().unwrap_or(json!(0.)),
                    "kry": c.get("kry").cloned().unwrap_or(json!(0.)),
                    "source": "user",
                }))
                .map_err(|e| err("INVALID_SCHEMA", format!("Invalid column: {e}")))?;
                if let Some(stored) = base.columns.iter().find(|s| {
                    (s.x, s.y, &s.kind, s.kz, s.krx, s.kry)
                        == (column.x, column.y, &column.kind, column.kz, column.krx, column.kry)
                }) {
                    column = stored.clone();
                }
                Ok(column)
            })
            .collect::<Result<Vec<_>>>()?;
    }
    if let Some(p) = args.get("placement") {
        next.placement = if p.is_null() {
            None
        } else {
            Some(
                serde_json::from_value(p.clone())
                    .map_err(|_| err("INVALID_SCHEMA", "plate.placement must be [x, y, z]"))?,
            )
        };
    }
    next.validate()?;
    Ok(next)
}

/// The plate-v1 panel of a slab draft, its material and its pressure.
fn slab_model(
    d: &DesignPreview,
) -> Result<(workbench_plate::Panel, workbench_plate::PlateMaterial, f64)> {
    use workbench_plate::{Edge, Panel, PlateMaterial, PointKind, PointSupport};
    let plate = d.plate.as_ref().ok_or_else(|| {
        err(
            "DESIGN_INPUT_INCOMPLETE",
            "Record plate analysis inputs (pressure, material, edges) for this slab first",
        )
    })?;
    let v = &d.inputs;
    let opening = plate.include_opening.then(|| {
        let (x0, y0) = (plate.inputs["openingX"], plate.inputs["openingY"]);
        [x0, x0 + v["openingLength"], y0, y0 + v["openingWidth"]]
    });
    let edges = plate.edges.each_ref().map(|e| match e.as_str() {
        "free" => Edge::Free,
        "simple" => Edge::Simple,
        _ => Edge::Clamped,
    });
    let points = plate
        .columns
        .iter()
        .map(|c| PointSupport {
            x: c.x,
            y: c.y,
            kind: match c.kind.as_str() {
                "pinned" => PointKind::Pinned,
                "fixed" => PointKind::Fixed,
                _ => PointKind::Spring {
                    kz: c.kz,
                    krx: c.krx,
                    kry: c.kry,
                },
            },
        })
        .collect();
    let panel = Panel {
        lx: v["length"],
        ly: v["width"],
        opening,
        edges,
        target: v["meshSize"],
        points,
    };
    let material = PlateMaterial {
        e: plate.inputs["elasticModulus"],
        nu: plate.inputs["poissonRatio"],
        t: v["thickness"],
    };
    Ok((panel, material, plate.inputs["pressure"]))
}

fn slab_index(v: &Value, id: &str) -> Result<usize> {
    let index = v["designPreviews"]
        .as_array()
        .and_then(|ds| ds.iter().position(|d| d["id"] == id))
        .ok_or_else(|| err("DANGLING_REFERENCE", "Unknown design preview"))?;
    if v["designPreviews"][index]["kind"] != "slab" {
        return Err(err("INVALID_SCHEMA", "Only slab drafts have columns"));
    }
    if v["designPreviews"][index].get("plate").is_none() {
        return Err(err(
            "DESIGN_INPUT_INCOMPLETE",
            "Record plate analysis inputs for this slab first",
        ));
    }
    Ok(index)
}

/// `DeriveSlabColumns {id, origin: [x, y, z]}`: the vertical members meeting
/// the slab level inside the placed panel become spring supports with
/// kz = ΣEA/L and, about global X and Y, Σ4EI/L (3EI/L when the far end
/// is free to rotate about that axis; 0 when the slab end is released).
/// User columns are kept; model columns are replaced.
fn derive_slab_columns(v: &mut Value, a: &Value) -> Result<()> {
    let id = a["id"].as_str().unwrap_or("");
    let index = slab_index(v, id)?;
    let origin: [f64; 3] = serde_json::from_value(a["origin"].clone())
        .ok()
        .filter(|o: &[f64; 3]| o.iter().all(|x| x.is_finite()))
        .ok_or_else(|| err("INVALID_SCHEMA", "origin must be [x, y, z] in metres"))?;
    let draft: DesignPreview = serde_json::from_value(v["designPreviews"][index].clone())
        .map_err(|e| err("INVALID_SCHEMA", e.to_string()))?;
    let (lx, ly) = (draft.inputs["length"], draft.inputs["width"]);
    let project: Project = serde_json::from_value(v.clone())
        .map_err(|e| err("INVALID_SCHEMA", e.to_string()))?;
    let position = |id: &str| project.nodes.iter().find(|n| n.id == id).map(|n| n.position);
    let extent = project
        .nodes
        .iter()
        .flat_map(|n| n.position)
        .fold(1f64, |m, x| m.max(x.abs()));
    let tol = 1e-6 * extent.max(lx).max(ly);
    let mut columns = vec![];
    let mut skewed = vec![];
    for node in &project.nodes {
        let [x, y, z] = node.position;
        let (px, py) = (x - origin[0], y - origin[1]);
        if (z - origin[2]).abs() > tol
            || !(-tol..=lx + tol).contains(&px)
            || !(-tol..=ly + tol).contains(&py)
        {
            continue;
        }
        let (mut kz, mut krx, mut kry) = (0., 0., 0.);
        let mut members = vec![];
        for m in &project.members {
            let near_start = m.start == node.id;
            if !near_start && m.end != node.id {
                continue;
            }
            let far = if near_start { &m.end } else { &m.start };
            let (Some(a), Some(b)) = (position(&m.start), position(&m.end)) else {
                continue;
            };
            let (length, axes) = workbench_geometry::axes(a, b, m.local_y);
            if axes[0][2].abs() < 1. - 1e-9 {
                // Beams in the slab plane carry nothing to this support; an
                // inclined member is not a column.
                if axes[0][2].abs() > 1e-9 {
                    skewed.push(m.id.clone());
                }
                continue;
            }
            let material = project.materials.iter().find(|x| x.id == m.material).unwrap();
            let section = project.sections.iter().find(|x| x.id == m.section).unwrap();
            let far_support = project.supports.iter().find(|s| &s.node == far);
            let far_connected = project
                .members
                .iter()
                .any(|o| o.id != m.id && (&o.start == far || &o.end == far));
            if far_support.is_none_or(|s| !s.fixed[2]) && !far_connected {
                continue;
            }
            kz += material.e * section.a / length;
            let (near_release, far_release) = if near_start {
                (&m.release_start, &m.release_end)
            } else {
                (&m.release_end, &m.release_start)
            };
            // Local y and z of a vertical member lie along global X or Y.
            for (local, inertia, near_free, far_free) in [
                (axes[1], section.iy, near_release.my, far_release.my),
                (axes[2], section.iz, near_release.mz, far_release.mz),
            ] {
                let along_x = local[0].abs() > 1. - 1e-9;
                let along_y = local[1].abs() > 1. - 1e-9;
                if !(along_x || along_y) {
                    skewed.push(m.id.clone());
                    continue;
                }
                if near_free {
                    continue;
                }
                let global_axis = if along_x { 0 } else { 1 };
                let far_rotates = far_free
                    || (!far_connected
                        && far_support.is_none_or(|s| !s.fixed[3 + global_axis]));
                let k = if far_rotates { 3. } else { 4. } * material.e * inertia / length;
                if along_x {
                    krx += k;
                } else {
                    kry += k;
                }
            }
            members.push(m.id.clone());
        }
        if kz > 0. {
            members.sort();
            columns.push(SlabColumn {
                x: px.clamp(0., lx),
                y: py.clamp(0., ly),
                kind: "spring".into(),
                kz,
                krx,
                kry,
                source: "model".into(),
                node_id: Some(node.id.clone()),
                member_ids: members,
            });
        }
    }
    if !skewed.is_empty() {
        skewed.sort();
        skewed.dedup();
        return Err(err(
            "UNSUPPORTED_FEATURE",
            format!(
                "Members {} meet the slab but are not vertical columns with axes along X and Y",
                skewed.join(", ")
            ),
        ));
    }
    if columns.is_empty() {
        return Err(err(
            "DESIGN_INPUT_INCOMPLETE",
            "No column meets the slab level inside the placed panel",
        ));
    }
    let mut plate = draft.plate.clone().unwrap();
    plate.columns.retain(|c| c.source == "user");
    plate.columns.extend(columns);
    plate.placement = Some(origin);
    plate.validate()?;
    v["designPreviews"][index]["plate"] = serde_json::to_value(plate).unwrap();
    Ok(())
}

/// `ApplySlabColumnLoads {id, caseId}`: solves the slab and writes, at each
/// model column's node, the slab's action on the column (the negated support
/// reaction [0, 0, −Fz, −Mx, −My, 0]) as a nodal load in the load case.
/// Loads from this slab carry an id prefix derived from the draft and are
/// replaced on every apply.
fn apply_slab_column_loads(v: &mut Value, a: &Value) -> Result<()> {
    let id = a["id"].as_str().unwrap_or("");
    let index = slab_index(v, id)?;
    let case = a["caseId"].as_str().unwrap_or("");
    if !v["loadCases"]
        .as_array()
        .is_some_and(|cs| cs.iter().any(|c| c["id"] == case))
    {
        return Err(err("INVALID_LOAD", "Choose an existing load case"));
    }
    let draft: DesignPreview = serde_json::from_value(v["designPreviews"][index].clone())
        .map_err(|e| err("INVALID_SCHEMA", e.to_string()))?;
    let plate = draft.plate.as_ref().unwrap();
    if !plate.columns.iter().any(|c| c.source == "model") {
        return Err(err(
            "DESIGN_INPUT_INCOMPLETE",
            "Take the slab's columns from the model first",
        ));
    }
    let (panel, material, q) = slab_model(&draft)?;
    let memory = v["analysisSettings"]["memoryLimitMiB"].as_u64().unwrap_or(512) as usize;
    let s = workbench_plate::solve(&panel, &material, q, memory * 1024 * 1024 / 2)?;
    let prefix = format!("sl{}x", &digest(id.as_bytes())[..8]);
    let loads = v["loads"]
        .as_array_mut()
        .ok_or_else(|| err("INVALID_SCHEMA", "Missing loads"))?;
    loads.retain(|l| !l["id"].as_str().is_some_and(|x| x.starts_with(&prefix)));
    for (c, r) in plate.columns.iter().zip(&s.point_reactions) {
        let Some(node) = &c.node_id else { continue };
        loads.push(json!({
            "id": format!("{prefix}{}", &digest(node.as_bytes())[..12]),
            "case": case,
            "type": "nodal",
            "node": node,
            "values": [0., 0., -r[0], -r[1], -r[2], 0.],
        }));
    }
    Ok(())
}
pub fn templates() -> Value {
    json!([("rcBeam","RC beam"),("rcColumn","RC column"),("slab","Slab"),("padFooting","Pad footing")].iter().map(|(kind,name)|{
        let mut t = json!({"kind":kind,"name":name,"mock":true,"fields":fields(kind).into_iter().map(|(key,label,value,unit,scale)|json!({"key":key,"label":label,"defaultValue":value,"unit":unit,"displayScale":scale})).collect::<Vec<_>>()});
        if *kind == "slab" {
            t["plate"] = json!({
                "fields": PLATE_FIELDS.iter().map(|(key,label,value,unit,scale)|json!({"key":key,"label":label,"defaultValue":value,"unit":unit,"displayScale":scale})).collect::<Vec<_>>(),
                "edgeLabels": PLATE_EDGE_LABELS,
                "edgeConditions": workbench_model::SLAB_EDGE_CONDITIONS,
                "defaultEdges": ["simple", "simple", "simple", "simple"],
                "defaultIncludeOpening": true,
            });
        }
        if ["rcBeam", "rcColumn"].contains(kind) {
            // Kind-only fields are listed for every law of that kind.
            t["mechanics"] = json!({
                "laws": MECHANICS_LAWS.iter().map(|(id,label)|json!({"id":id,"label":label})).collect::<Vec<_>>(),
                "defaultLaw": "rectangularBlock",
                "fields": MECHANICS_FIELDS.iter().filter(|f| !["rcBeam","rcColumn"].contains(&f.5) || f.5 == *kind)
                    .map(|(key,label,value,unit,scale,law)|json!({"key":key,"label":label,"defaultValue":value,"unit":unit,"displayScale":scale,"law":if law == kind {"all"} else {law}})).collect::<Vec<_>>(),
            });
        }
        t
    }).collect::<Vec<_>>())
}
pub fn apply(v: &mut Value, c: &Value) -> Result<()> {
    if v.get("designPreviews").is_none() {
        v["designPreviews"] = json!([]);
    }
    let a = &c["args"];
    if c["type"] == "DeriveSlabColumns" {
        return derive_slab_columns(v, a);
    }
    if c["type"] == "ApplySlabColumnLoads" {
        return apply_slab_column_loads(v, a);
    }
    if c["type"] == "CreateDesignPreview" {
        let kind = a["kind"].as_str().unwrap_or("");
        if !["rcBeam", "rcColumn", "slab", "padFooting"].contains(&kind) {
            return Err(err("INVALID_SCHEMA", "Unknown preview kind"));
        }
        let id = format!(
            "dp{}",
            &digest(format!("{}:{}", c["id"], v["revision"]).as_bytes())[..16]
        );
        let draft = DesignPreview {
            id,
            kind: kind.into(),
            target_id: a["targetId"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(String::from),
            input_source: "syntheticFixture".into(),
            input_sources: fields(kind)
                .iter()
                .map(|(k, _, _, _, _)| (k.to_string(), "syntheticFixture".to_string()))
                .collect(),
            inputs: fields(kind)
                .iter()
                .map(|(k, _, v, _, _)| (k.to_string(), *v))
                .collect(),
            soil_reference:
                "Synthetic starter input; replace with a referenced geotechnical report".into(),
            mechanics: ["rcBeam", "rcColumn"]
                .contains(&kind)
                .then(|| default_mechanics(kind)),
            // Never defaulted: only the user can confirm anchorage (ADR 0016).
            tension_anchorage_confirmed: None,
            plate: (kind == "slab").then(default_plate),
            // Never defaulted: the engineer enters them (ADR 0026).
            code_inputs: None,
        };
        v["designPreviews"]
            .as_array_mut()
            .unwrap()
            .push(serde_json::to_value(draft).unwrap());
    } else {
        let id = a["id"].as_str().unwrap_or("");
        let index = v["designPreviews"]
            .as_array()
            .unwrap()
            .iter()
            .position(|d| d["id"] == id)
            .ok_or_else(|| err("DANGLING_REFERENCE", "Unknown design preview"))?;
        if c["type"] == "DeleteDesignPreview" {
            v["designPreviews"].as_array_mut().unwrap().remove(index);
            return Ok(());
        }
        let kind = v["designPreviews"][index]["kind"]
            .as_str()
            .unwrap()
            .to_string();
        let mut inputs = a["inputs"].clone();
        for (key, _, _, unit, _) in fields(&kind) {
            if key == "soilUnitWeight" {
                let n = inputs[key]
                    .as_f64()
                    .or_else(|| inputs[key].as_str().and_then(|s| s.parse().ok()))
                    .ok_or_else(|| {
                        err("INVALID_SCHEMA", "Soil unit weight must be numeric in N/m³")
                    })?;
                inputs[key] = json!(n);
            } else {
                super::quantity(
                    &mut inputs[key],
                    match unit {
                        "MPa" | "kPa" => "stress",
                        "" => "dimensionless",
                        _ => "length",
                    },
                )?;
            }
        }
        let old = &v["designPreviews"][index];
        let sources: serde_json::Map<String, Value> = fields(&kind)
            .iter()
            .map(|(key, _, _, _, _)| {
                // Numeric comparison: an untouched `3` equals a stored `3.0`.
                let source = if inputs[*key].as_f64() != old["inputs"][*key].as_f64() {
                    "user"
                } else {
                    old["inputSources"][*key]
                        .as_str()
                        .unwrap_or(old["inputSource"].as_str().unwrap_or("syntheticFixture"))
                };
                (key.to_string(), json!(source))
            })
            .collect();
        let all_user = sources.values().all(|s| s == "user");
        let all_mock = sources.values().all(|s| s == "syntheticFixture");
        v["designPreviews"][index]["inputSources"] = json!(sources);
        v["designPreviews"][index]["inputs"] = inputs;
        v["designPreviews"][index]["inputSource"] = json!(if all_user {
            "user"
        } else if all_mock {
            "syntheticFixture"
        } else {
            "mixed"
        });
        let sectional = ["rcBeam", "rcColumn"].contains(&kind.as_str());
        if sectional && !a["mechanics"].is_null() {
            let old: Option<SectionMechanicsInputs> =
                serde_json::from_value(v["designPreviews"][index]["mechanics"].clone()).ok();
            v["designPreviews"][index]["mechanics"] =
                serde_json::to_value(edit_mechanics(&kind, old.as_ref(), &a["mechanics"])?)
                    .unwrap();
        } else if !sectional && !a["mechanics"].is_null() {
            return Err(err(
                "INVALID_SCHEMA",
                "Section mechanics apply only to RC beam and column drafts",
            ));
        }
        if kind == "slab" && !a["plate"].is_null() {
            let old: Option<SlabPlateInputs> =
                serde_json::from_value(v["designPreviews"][index]["plate"].clone()).ok();
            v["designPreviews"][index]["plate"] =
                serde_json::to_value(edit_plate(old.as_ref(), &a["plate"])?).unwrap();
        } else if kind != "slab" && !a["plate"].is_null() {
            return Err(err(
                "INVALID_SCHEMA",
                "Plate analysis inputs apply only to slab drafts",
            ));
        }
        // Only an explicit `true` records the user's anchorage confirmation;
        // anything else leaves it unconfirmed (ADR 0016).
        match (kind.as_str(), a["tensionAnchorageConfirmed"].as_bool()) {
            ("rcBeam", Some(true)) => {
                v["designPreviews"][index]["tensionAnchorageConfirmed"] = json!(true);
            }
            (_, Some(true)) => {
                return Err(err(
                    "INVALID_SCHEMA",
                    "Tension anchorage confirmation applies only to RC beam drafts",
                ));
            }
            _ => {
                v["designPreviews"][index]
                    .as_object_mut()
                    .unwrap()
                    .remove("tensionAnchorageConfirmed");
            }
        }
        // Code inputs (schema 1.7.0/1.8.0, ADR 0026/0027): replaced when sent,
        // cleared by an explicit null, kept when omitted. Lengths accept units;
        // fields not applicable to the kind are refused.
        if let Some(ci) = a.get("codeInputs") {
            if ci.is_null() {
                v["designPreviews"][index].as_object_mut().unwrap().remove("codeInputs");
            } else {
                let mut out = serde_json::Map::new();
                for key in ["minimumCoverDurability", "aggregateSize"] {
                    let mut x = ci[key].clone();
                    if x.is_null() || x == json!("") {
                        continue;
                    }
                    super::quantity(&mut x, "length")?;
                    out.insert(key.into(), x);
                }
                for key in ["exposureClass", "structuralSystem", "quasiPermanentCombinationId", "bearingCombinationId"] {
                    if let Some(t) = ci[key].as_str().filter(|t| !t.is_empty()) {
                        out.insert(key.into(), json!(t));
                    }
                }
                for key in ["partitionsSensitive", "braced", "castOnBlinding"] {
                    if let Some(b) = ci[key].as_bool() {
                        out.insert(key.into(), json!(b));
                    }
                }
                for key in ["restraintY", "restraintZ"] {
                    if !ci[key].is_null() {
                        out.insert(key.into(), ci[key].clone());
                    }
                }
                if !ci["effectiveCreepRatio"].is_null() && ci["effectiveCreepRatio"] != json!("") {
                    let mut x = ci["effectiveCreepRatio"].clone();
                    if let Some(t) = x.as_str() {
                        x = json!(t.trim().parse::<f64>().map_err(|_| err("INVALID_SCHEMA", "Effective creep ratio must be a number"))?);
                    }
                    out.insert("effectiveCreepRatio".into(), x);
                }
                let parsed: workbench_model::CodeInputs = serde_json::from_value(Value::Object(out))
                    .map_err(|e| err("INVALID_SCHEMA", format!("Code inputs: {e}")))?;
                parsed.validate(&kind)?;
                v["designPreviews"][index]["codeInputs"] = serde_json::to_value(parsed).unwrap();
            }
        }
        v["designPreviews"][index]["soilReference"] =
            json!(a["soilReference"].as_str().unwrap_or(""));
        if let Some(id) = a["targetId"].as_str().filter(|s| !s.is_empty()) {
            v["designPreviews"][index]["targetId"] = json!(id);
        } else {
            v["designPreviews"][index]
                .as_object_mut()
                .unwrap()
                .remove("targetId");
        }
    }
    Ok(())
}
/// The explicit concrete and steel laws recorded on a draft (ADR 0012).
fn mechanics_laws(m: &SectionMechanicsInputs) -> (ConcreteLaw, SteelLaw) {
    let mi = &m.inputs;
    let steel = SteelLaw {
        yield_strength: mi["steelYieldStrength"],
        modulus: mi["steelModulus"],
    };
    let law = if m.law == "rectangularBlock" {
        ConcreteLaw::RectangularBlock {
            intensity: mi["blockIntensity"],
            depth_ratio: mi["blockDepthRatio"],
            ultimate_strain: mi["ultimateStrain"],
        }
    } else {
        ConcreteLaw::ParabolaRectangle {
            peak: mi["parabolaPeak"],
            strain_at_peak: mi["strainAtPeak"],
            ultimate_strain: mi["ultimateStrain"],
            exponent: mi["parabolaExponent"],
        }
    };
    (law, steel)
}

/// Perimeter bars of an rcColumn draft: `barsAlongWidth` on each ±z face,
/// `barsAlongDepth` on each ±y face (corners shared), centres inset by
/// cover + link + half a bar. Origin at the section centre.
fn column_bars(v: &std::collections::BTreeMap<String, f64>) -> Vec<rc_column::ColumnBar> {
    let dia = v["barDiameter"];
    let inset = v["cover"] + v["linkDiameter"] + dia / 2.;
    let (a, c) = (v["width"] / 2. - inset, v["depth"] / 2. - inset);
    let (nw, nd) = (v["barsAlongWidth"] as usize, v["barsAlongDepth"] as usize);
    let area = std::f64::consts::PI * dia * dia / 4.;
    let at = |k: usize, n: usize, half: f64| -half + 2. * half * k as f64 / (n - 1) as f64;
    let mut bars = vec![];
    for z in [-c, c] {
        for k in 0..nw {
            bars.push(rc_column::ColumnBar {
                y: at(k, nw, a),
                z,
                area,
            });
        }
    }
    for y in [-a, a] {
        for k in 1..nd - 1 {
            bars.push(rc_column::ColumnBar {
                y,
                z: at(k, nd, c),
                area,
            });
        }
    }
    bars
}

/// Biaxial section mechanics of an rcColumn draft (ADR 0022): the axial
/// range, M_Rd(N_Ed, θ_Ed) and a mechanics utilisation at every key station
/// of the bound member (model mode), and the resistance contour at the
/// governing axial force. Never a code resistance or a check status.
fn column_mechanics(d: &DesignPreview, stations: Option<&[KeyStation]>) -> Value {
    let Some(m) = &d.mechanics else {
        return json!({"status":"notConfigured","reason":"No explicit section-mechanics material law is recorded for this draft"});
    };
    let (concrete, steel) = mechanics_laws(m);
    let section = rc_column::ColumnSection {
        width: d.inputs["width"],
        depth: d.inputs["depth"],
        bars: column_bars(&d.inputs),
    };
    let column = match rc_column::Column::new(rc_column::ColumnInputs {
        section: section.clone(),
        concrete,
        steel,
        limits: rc_column::StrainLimits {
            full_compression_strain: m.inputs["fullCompressionStrain"],
            steel_strain_limit: None,
        },
    }) {
        Ok(c) => c,
        Err(e) => return json!({"status":"unsupported","code":e.code,"reason":e.message}),
    };
    let range = column.axial_range();
    let mut rows = vec![];
    let mut governing: Option<(usize, f64)> = None;
    let mut beyond = false;
    for (i, st) in stations.unwrap_or(&[]).iter().enumerate() {
        // Frame N is tension positive; the section works compression positive.
        let (n_ed, my_ed, mz_ed) = (-st.actions[0], st.actions[4], st.actions[5]);
        let base = json!({"station":st.station,"kind":st.kind,"side":st.side,"actions":st.actions,"nEd":n_ed,"myEd":my_ed,"mzEd":mz_ed,"mEd":my_ed.hypot(mz_ed)});
        let row = match column.check(n_ed, my_ed, mz_ed) {
            Ok(c) => match c.utilisation.filter(|u| u.is_finite()) {
                Some(u) => {
                    if governing.is_none_or(|(_, g)| u > g) {
                        governing = Some((i, u));
                    }
                    merge(
                        base,
                        json!({"status":"evaluated","utilisation":u,"axialRatio":c.axial_ratio,"capacity":c.capacity}),
                    )
                }
                None => {
                    beyond = true;
                    merge(
                        base,
                        json!({"status":"beyondAxialRange","utilisation":null,"axialRatio":c.axial_ratio}),
                    )
                }
            },
            Err(e) => merge(
                base,
                json!({"status":"refused","utilisation":null,"code":e.code,"reason":e.message}),
            ),
        };
        rows.push(row);
    }
    // The contour is drawn at the governing station's N_Ed, or at N = 0
    // without model actions.
    let n_contour = governing.map_or(0., |(i, _)| rows[i]["nEd"].as_f64().unwrap());
    let contour = column.interaction_contour(n_contour, 72).map_or_else(
        |e| json!({"status":"unavailable","code":e.code,"reason":e.message}),
        |pts| json!({"status":"evaluated","nEd":n_contour,"points":pts.iter().map(|r| [r.my, r.mz]).collect::<Vec<_>>()}),
    );
    json!({
        "status": "evaluated",
        "basis": "mechanics",
        "codeProfile": null,
        "kernel": "workbench-design::rc_column",
        "formulation": "docs/formulations/rc-column.md",
        "section": {"width":section.width,"depth":section.depth,"bars":section.bars,"barCount":section.bars.len(),
            "steelArea":section.bars.iter().map(|b| b.area).sum::<f64>()},
        "law": m.law,
        "materialInputs": m.inputs,
        "materialSources": m.input_sources,
        "axialRange": range,
        "convention": "N compression positive (N = −N_frame); frame My and Mz unchanged: My < 0 compresses the +z face, Mz > 0 the +y face; θ = atan2(Mz, My)",
        "demand": if stations.is_some() {json!({"status":"evaluated","basis":"modelKeyStations"})} else {json!({"status":"unavailable","reason":"Station actions need a bound member and the current model case/combination"})},
        "stations": rows,
        "governing": governing.map(|(i, u)| json!({"index":i,"station":rows[i]["station"],"utilisation":u,"nEd":rows[i]["nEd"],"mEd":rows[i]["mEd"],"mRd":rows[i]["capacity"]["mRd"]})),
        "beyondAxialRange": beyond,
        "contour": contour,
        "limitations": ["Checked at the member's key stations (ends, component extrema, discontinuities) only","No slenderness, second-order moments, minimum eccentricity, partial factors or detailing"],
    })
}
/// Code-agnostic section mechanics for an rcBeam draft (ADR 0012). Each face
/// has one row of its own bars; `cover` is taken to the link. Sagging puts
/// the top face in compression, hogging the bottom. When `demand` is an
/// evaluated model demand (ADR 0014), each state's governing moment is its
/// cracked-section service moment. Results are mechanics only and never feed
/// a check status.
fn section_mechanics(d: &DesignPreview, demand: &Value) -> Value {
    let Some(m) = &d.mechanics else {
        return json!({"status":"notConfigured","reason":"No explicit section-mechanics material law is recorded for this draft"});
    };
    let v = &d.inputs;
    let mi = &m.inputs;
    let row = |face: &str| BarRow {
        width: v["width"],
        side_cover: v["cover"],
        link_diameter: v["linkDiameter"],
        bar_diameter: v[&format!("{face}BarDiameter")],
        count: v[&format!("{face}BarCount")] as u32,
        minimum_clear_spacing: mi["minimumClearSpacing"],
    };
    let base = json!({"basis":"mechanics","codeProfile":null,"law":m.law,"inputs":mi,"inputSources":m.input_sources,
        "arrangement":"One row per face (top and bottom bar inputs); cover measured to the link; layer depths from the compression face",
        "limitations":["Mechanics only — not a code resistance; no partial factors or code limits applied","Pure flexure (N = 0) about the width axis; concrete tension ignored at ultimate and in the cracked state","Material-law parameters are explicit inputs with recorded provenance","Service stresses use the cracked transformed section under the governing model moment of the one bound case/combination, which is not classified as a serviceability combination; no stress limits applied"]});
    let (top, bottom) = match (
        rc_section::row_fit(&row("top")),
        rc_section::row_fit(&row("bottom")),
    ) {
        (Ok(t), Ok(b)) => (t, b),
        (Err(e), _) | (_, Err(e)) => {
            return merge(base, json!({"status":"unsupported","reason":e.message}));
        }
    };
    let fits = json!({"top":top,"bottom":bottom});
    if !(top.fits && bottom.fits) {
        let faces: Vec<&str> = [("top", top.fits), ("bottom", bottom.fits)]
            .iter()
            .filter(|(_, ok)| !ok)
            .map(|(f, _)| *f)
            .collect();
        return merge(
            base,
            json!({"status":"rowDoesNotFit","rowFits":fits,"reason":format!("The {} bar row does not fit the width with the stated clear spacing; ultimate state not evaluated", faces.join(" and "))}),
        );
    }
    let section = RcRectangle {
        width: v["width"],
        depth: v["depth"],
    };
    let (law, steel) = mechanics_laws(m);
    // Layers are ordered [compression-face row, opposite row] with depths from
    // the compression face.
    let state = |name: &str,
                 compression: &str,
                 near: &rc_section::RowFit,
                 far: &rc_section::RowFit|
     -> Value {
        let governing = &demand[name];
        let elastic_inputs = ElasticInputs {
            concrete_modulus: mi["concreteModulus"],
            tensile_strength: Some(mi["concreteTensileStrength"]),
            service_moment: governing["moment"].as_f64(),
        };
        let layers = [
            BarLayer {
                depth: near.depth_from_face,
                area: near.area,
            },
            BarLayer {
                depth: v["depth"] - far.depth_from_face,
                area: far.area,
            },
        ];
        match (
            rc_section::ultimate(&section, &layers, &steel, &law),
            rc_section::elastic(&section, &layers, &steel, &elastic_inputs),
        ) {
            (Ok(u), Ok(e)) => {
                let service = governing["moment"].as_f64().map_or(Value::Null, |m| {
                    json!({"moment":m,"combinationId":demand["combinationId"],"station":governing["station"],"side":governing["side"],
                        "stressBasis":"crackedSection","belowCrackingMoment":e.cracking_moment.map(|mcr| m < mcr)})
                });
                json!({"status":"evaluated","compressionFace":compression,"layers":layers,"ultimate":u,"elastic":e,"serviceMoment":service})
            }
            (Err(e), _) | (_, Err(e)) => {
                json!({"status":"unsupported","compressionFace":compression,"reason":e.message})
            }
        }
    };
    let sagging = state("sagging", "top", &top, &bottom);
    let hogging = state("hogging", "bottom", &bottom, &top);
    let status = if sagging["status"] == "evaluated" && hogging["status"] == "evaluated" {
        "evaluated"
    } else {
        "unsupported"
    };
    merge(
        base,
        json!({"status":status,"rowFits":fits,"sagging":sagging,"hogging":hogging}),
    )
}
/// Governing flexural demand about the draft width axis (ADR 0014). The draft
/// width runs along member local y and its depth along local z; the top face is
/// local +z. With σ = N/A + My z/Iy, My < 0 compresses the top face (sagging)
/// and My > 0 the bottom face (hogging). One bound combination only; no ratio.
fn flexural_demand(
    p: &Project,
    member_id: &str,
    stations: &[KeyStation],
    combination: &str,
) -> Result<Value> {
    let m = p
        .members
        .iter()
        .find(|m| m.id == member_id)
        .ok_or_else(|| err("DANGLING_REFERENCE", "Bound member is not in the model"))?;
    let position = |id: &str| {
        p.nodes
            .iter()
            .find(|n| n.id == id)
            .map(|n| n.position)
            .ok_or_else(|| {
                err(
                    "DANGLING_REFERENCE",
                    "Bound member node is not in the model",
                )
            })
    };
    let (_, axes) = workbench_geometry::axes(position(&m.start)?, position(&m.end)?, m.local_y);
    let top = axes[2];
    // `sign` is the My sign that compresses the face; ties keep the first station.
    let governing = |sign: f64| {
        stations
            .iter()
            .filter(|s| sign * s.actions[4] > 0.)
            .fold(None, |best: Option<&KeyStation>, s| match best {
                Some(b) if sign * b.actions[4] >= sign * s.actions[4] => Some(b),
                _ => Some(s),
            })
            .map_or(Value::Null, |s| {
                json!({"moment":sign * s.actions[4],"station":s.station,"kind":s.kind,"side":s.side,"actions":s.actions})
            })
    };
    Ok(
        json!({"status":"evaluated","basis":"modelKeyStations","combinationId":combination,"memberId":member_id,
        "component":"My","actionOrder":["N","Vy","Vz","T","My","Mz"],
        "convention":"Draft width along local y, depth along local z; top face = local +z. My < 0 compresses the top face (sagging), My > 0 the bottom face (hogging)",
        "topFaceDirection":top,
        "topFaceOrientation":if top[2] > 0. {"up"} else if top[2] < 0. {"down"} else {"horizontal"},
        "sagging":governing(-1.),"hogging":governing(1.),"utilisation":null,
        "limitations":["Governing key stations of the one bound case/combination; no envelope across combinations","Axial force, shear, torsion and Mz at these stations are not considered by the pure-flexure mechanics","No utilisation ratio or status: the capacity is mechanics, not a code resistance"]}),
    )
}
/// The metadata every EC2 run and proposal carries.
fn code_base(d: &DesignPreview) -> Value {
    let profile = Ec2UkNaProfile::default();
    let meta = profile.metadata();
    json!({"profileId":meta.id,"profileEnabled":meta.enabled,
        "basis":if meta.enabled {"codeProfile"} else {"disabledProfilePreview"},
        "standard":meta.standard,"edition":meta.edition,"certification":meta.certification,
        "unreconciledAmendments":meta.unreconciled_amendments,
        "resourceGate":meta.resource_gate,"ndp":profile.ndp.label,
        "interpretation":{"concreteStrength":"fck (characteristic cylinder strength)","rebarStrength":"fyk for longitudinal bars and links"},
        "tensionAnchorageConfirmed":d.tension_anchorage_confirmed == Some(true),
        "codeInputs":d.code_inputs,
        "limitations":meta.limitations})
}

/// A key station the EC2 checks run at: the roles it governs, its recorded
/// station, and the quasi-permanent My on the same side. Independent of the
/// bars, so a proposal search prepares these once.
struct CodeStation {
    roles: Vec<&'static str>,
    at: Value,
    quasi_permanent_my: Option<f64>,
}

fn member_length(p: &Project, target: Option<&String>) -> Option<f64> {
    let m = p.members.iter().find(|m| Some(&m.id) == target)?;
    let pos = |id: &str| p.nodes.iter().find(|n| n.id == id).map(|n| n.position);
    let (a, b) = (pos(&m.start)?, pos(&m.end)?);
    Some(((0..3).map(|i| (b[i] - a[i]).powi(2)).sum::<f64>()).sqrt())
}

fn code_stations(p: &Project, d: &DesignPreview, demand: &Value, stations: &[KeyStation]) -> Result<Vec<CodeStation>> {
    // Governing shear: the key station with the largest |Vz|; ties keep the first.
    let shear = stations
        .iter()
        .filter(|s| s.actions[2] != 0.)
        .fold(None, |best: Option<&KeyStation>, s| match best {
            Some(b) if b.actions[2].abs() >= s.actions[2].abs() => Some(b),
            _ => Some(s),
        })
        .map_or(
            Value::Null,
            |s| json!({"station":s.station,"kind":s.kind,"side":s.side,"actions":s.actions}),
        );
    // One entry per distinct key station: a station that governs several roles
    // (e.g. hogging and shear at a fixed end) is checked once, listing its roles.
    let mut stations_by_role: Vec<(Vec<&str>, &Value)> = Vec::new();
    for (role, g) in [
        ("sagging", &demand["sagging"]),
        ("hogging", &demand["hogging"]),
        ("shear", &shear),
    ] {
        if g.is_null() {
            continue;
        }
        match stations_by_role
            .iter_mut()
            .find(|(_, h)| h["station"] == g["station"] && h["side"] == g["side"])
        {
            Some((roles, _)) => roles.push(role),
            None => stations_by_role.push((vec![role], g)),
        }
    }
    // The quasi-permanent My at each governing station, on the same side.
    let target = d.target_id.clone().unwrap_or_default();
    let qp_moments: Vec<Option<f64>> = match d.code_inputs.as_ref().and_then(|c| c.quasi_permanent_combination_id.as_ref()) {
        Some(qp) => {
            let at: Vec<f64> = stations_by_role.iter().map(|(_, g)| g["station"].as_f64().unwrap()).collect();
            let actions = workbench_assembly::member_actions_at(p, qp, &target, &at)?;
            stations_by_role
                .iter()
                .zip(actions)
                .map(|((_, g), sides)| {
                    let pick = if g["side"] == "right" { sides.last() } else { sides.first() };
                    pick.map(|a| a[4])
                })
                .collect()
        }
        None => vec![None; stations_by_role.len()],
    };
    Ok(stations_by_role
        .into_iter()
        .zip(qp_moments)
        .map(|((roles, g), qp)| CodeStation { roles, at: g.clone(), quasi_permanent_my: qp })
        .collect())
}

/// EC2 UK NA beam checks for an rcBeam draft at the governing sagging,
/// hogging and shear key stations of the one bound combination (ADR 0016,
/// ADR 0026). The profile is enabled as a labelled demonstration of the held
/// edition: every run states the edition, the unreconciled amendments and
/// that it is not a certified design. Detailing and serviceability inputs
/// come from the draft's `codeInputs`; checks lacking one are indeterminate.
fn code_evaluate(p: &Project, d: &DesignPreview, demand: &Value, governing: &[CodeStation], combination: &str) -> Value {
    let profile = Ec2UkNaProfile::default();
    let v = &d.inputs;
    let base = code_base(d);
    let Some(m) = &d.mechanics else {
        return merge(
            base,
            json!({"status":"unavailable","reason":"The draft has no section-mechanics inputs (minimum clear spacing)"}),
        );
    };
    let fit = |face: &str| {
        rc_section::row_fit(&BarRow {
            width: v["width"],
            side_cover: v["cover"],
            link_diameter: v["linkDiameter"],
            bar_diameter: v[&format!("{face}BarDiameter")],
            count: v[&format!("{face}BarCount")] as u32,
            minimum_clear_spacing: m.inputs["minimumClearSpacing"],
        })
    };
    let (top, bottom) = match (fit("top"), fit("bottom")) {
        (Ok(t), Ok(b)) if t.fits && b.fits => (t, b),
        (Ok(_), Ok(_)) => {
            return merge(
                base,
                json!({"status":"unavailable","reason":"A bar row does not fit the width; code checks not evaluated"}),
            );
        }
        (Err(e), _) | (_, Err(e)) => {
            return merge(base, json!({"status":"unavailable","reason":e.message}));
        }
    };
    let span = member_length(p, d.target_id.as_ref());
    let ci = d.code_inputs.clone().unwrap_or_default();
    let bars = |face: &str| {
        Some(workbench_design::RcBars { diameter: v[&format!("{face}BarDiameter")], count: v[&format!("{face}BarCount")] as u32 })
    };
    let detailing = workbench_design::RcBeamDetailing {
        exposure_class: ci.exposure_class.clone(),
        cover_durability: ci.minimum_cover_durability,
        aggregate_size: ci.aggregate_size,
        structural_system: ci.structural_system.clone(),
        partitions_sensitive: ci.partitions_sensitive,
        span,
        quasi_permanent_moment: None,
        quasi_permanent_combination: ci.quasi_permanent_combination_id.clone(),
    };
    let ctx = MemberContext {
        member_id: demand["memberId"].as_str().unwrap_or("").into(),
        section_family: "RC rectangle".into(),
        rc_beam: Some(RcBeamContext {
            width: v["width"],
            depth: v["depth"],
            cover_to_link: v["cover"],
            fck: v["concreteStrength"],
            fyk: v["rebarStrength"],
            rows: vec![
                RcBarRow {
                    face: RcFace::Top,
                    area: top.area,
                    centroid_from_face: top.depth_from_face,
                    bars: bars("top"),
                },
                RcBarRow {
                    face: RcFace::Bottom,
                    area: bottom.area,
                    centroid_from_face: bottom.depth_from_face,
                    bars: bars("bottom"),
                },
            ],
            links: Some(RcLinks {
                legs: v["linkLegs"] as u32,
                diameter: v["linkDiameter"],
                spacing: v["linkSpacing"],
                fyk: v["rebarStrength"],
            }),
            tension_steel_anchored: d.tension_anchorage_confirmed,
            detailing,
        }),
        ..Default::default()
    };
    if let ProfileApplicability::Unsupported(reason) = profile.applicability(&ctx) {
        return merge(base, json!({"status":"unsupported","reason":reason}));
    }
    let governing: Vec<Value> = governing
        .iter()
        .map(|CodeStation { roles, at: g, quasi_permanent_my: qp }| {
            let qp = *qp;
            let a: Vec<f64> = g["actions"].as_array().unwrap().iter().map(|x| x.as_f64().unwrap()).collect();
            let station = DesignDemand {
                n: a[0],
                vy: a[1],
                vz: a[2],
                t: a[3],
                my: a[4],
                mz: a[5],
                combination_id: combination.into(),
                station: g["station"].as_f64().unwrap(),
            };
            let mut local = ctx.clone();
            local.rc_beam.as_mut().unwrap().detailing.quasi_permanent_moment = qp;
            let checks = profile.run_checks(&station, &local);
            json!({"roles":roles,"station":g["station"],"kind":g["kind"],"side":g["side"],"actions":a,
                "quasiPermanentMy":qp,
                "overall":DesignRun::overall_from_checks(&checks).as_str(),
                "checks":checks.iter().map(|c| c.to_json()).collect::<Vec<_>>()})
        })
        .collect();
    merge(
        base,
        json!({"status":"evaluated","combinationId":combination,"span":span,"governing":governing}),
    )
}

/// Discrete bar sizes the proposal enumerates (BS 8666 preferred sizes).
const PROPOSAL_BARS: [f64; 6] = [0.010, 0.012, 0.016, 0.020, 0.025, 0.032];
const PROPOSAL_LINKS: [f64; 3] = [0.008, 0.010, 0.012];
const PROPOSAL_MAX_BARS: u32 = 8;
const STEEL_DENSITY: f64 = 7850.;

/// Closed-link cut length 2(A + B) + two 135° hook extensions of
/// max(5φ, 50 mm) (EN 1992-1-1 Figure 8.5), A and B its outer dimensions.
fn link_cut_length(v: &std::collections::BTreeMap<String, f64>, link: f64) -> f64 {
    2. * (v["width"] - 2. * v["cover"] + v["depth"] - 2. * v["cover"]) + 2. * (5. * link).max(0.050)
}

/// Steel mass per metre of beam: both bar rows plus the links, each closed
/// link giving two legs and an odd leg an open link with two hooks.
fn steel_mass_per_metre(v: &std::collections::BTreeMap<String, f64>) -> f64 {
    let area = |phi: f64| std::f64::consts::PI * phi * phi / 4.;
    let bars = area(v["topBarDiameter"]) * v["topBarCount"] + area(v["bottomBarDiameter"]) * v["bottomBarCount"];
    let link = v["linkDiameter"];
    let legs = v["linkLegs"];
    let closed = (legs / 2.).floor() * link_cut_length(v, link);
    let open = if legs % 2. == 1. { v["depth"] - 2. * v["cover"] + 2. * (5. * link).max(0.050) } else { 0. };
    (bars + area(link) * (closed + open) / v["linkSpacing"]) * STEEL_DENSITY
}

/// Discrete reinforcement enumeration (M08, ADR 0026). The least steel mass
/// per metre, among arrangements from PROPOSAL_BARS (2 to 8 bars a face) and
/// PROPOSAL_LINKS at 75-300 mm in 25 mm steps with the draft's legs, cover and
/// materials, for which no EC2 check fails at the prepared key stations.
/// Links carry shear with V_Rd = V_Rd,s (6.2.3), independent of the
/// longitudinal bars, so for each link size the lightest longitudinal pair is
/// found at the densest spacing and the spacing then opened to the widest that
/// still passes. Indeterminate checks (missing inputs, unconfirmed anchorage)
/// do not block a proposal and are reported with it.
fn propose_reinforcement(p: &Project, d: &DesignPreview, demand: &Value, governing: &[CodeStation], combination: &str) -> Value {
    let with = |top: (f64, u32), bottom: (f64, u32), link: f64, spacing: f64| {
        let mut c = d.clone();
        for (k, x) in [
            ("topBarDiameter", top.0),
            ("topBarCount", top.1 as f64),
            ("bottomBarDiameter", bottom.0),
            ("bottomBarCount", bottom.1 as f64),
            ("linkDiameter", link),
            ("linkSpacing", spacing),
        ] {
            c.inputs.insert(k.into(), x);
        }
        c
    };
    let mut evaluated = 0usize;
    let mut passes = |c: &DesignPreview| -> Option<Value> {
        evaluated += 1;
        let code = code_evaluate(p, c, demand, governing, combination);
        let fails = code["status"] != "evaluated"
            || code["governing"].as_array().is_none_or(|g| {
                g.iter().any(|s| s["checks"].as_array().is_some_and(|cs| cs.iter().any(|c| c["status"] == "fail")))
            });
        (!fails).then_some(code)
    };
    let area = |(phi, n): (f64, u32)| std::f64::consts::PI * phi * phi / 4. * n as f64;
    let faces: Vec<(f64, u32)> =
        PROPOSAL_BARS.iter().flat_map(|&phi| (2..=PROPOSAL_MAX_BARS).map(move |n| (phi, n))).collect();
    let mut pairs: Vec<((f64, u32), (f64, u32))> =
        faces.iter().flat_map(|&t| faces.iter().map(move |&b| (t, b))).collect();
    // Least area first; ties to fewer bars, then the larger diameters.
    pairs.sort_by(|a, b| {
        (area(a.0) + area(a.1))
            .total_cmp(&(area(b.0) + area(b.1)))
            .then((a.0.1 + a.1.1).cmp(&(b.0.1 + b.1.1)))
            .then(b.0.0.total_cmp(&a.0.0))
            .then(b.1.0.total_cmp(&a.1.0))
    });
    let spacings: Vec<f64> = (3..=12).map(|k| k as f64 * 0.025).collect();
    let mut best: Option<(f64, DesignPreview, Value)> = None;
    for link in PROPOSAL_LINKS {
        let Some(&(top, bottom)) = pairs.iter().find(|(t, b)| passes(&with(*t, *b, link, spacings[0])).is_some()) else {
            continue;
        };
        let chosen = spacings.iter().rev().find_map(|&s| {
            let c = with(top, bottom, link, s);
            passes(&c).map(|code| (c, code))
        });
        if let Some((c, code)) = chosen {
            let mass = steel_mass_per_metre(&c.inputs);
            if best.as_ref().is_none_or(|(m, _, _)| mass < *m) {
                best = Some((mass, c, code));
            }
        }
    }
    let basis = json!({"objective":"Least steel mass per metre (both bar rows and links)",
        "barDiameters":PROPOSAL_BARS,"barsPerFace":[2, PROPOSAL_MAX_BARS],"linkDiameters":PROPOSAL_LINKS,
        "linkSpacings":spacings,"fixed":["width","depth","cover","linkLegs","concreteStrength","rebarStrength","codeInputs","tensionAnchorageConfirmed"],
        "acceptance":"No EC2 check fails at any governing key station; indeterminate checks are reported, not assumed"});
    match best {
        Some((mass, c, code)) => {
            let (rows, overall) = code_rows(&code).unwrap_or((vec![], "unsupported"));
            let keys = ["topBarCount", "topBarDiameter", "bottomBarCount", "bottomBarDiameter", "linkDiameter", "linkSpacing"];
            json!({"status":"proposed","inputs":keys.iter().map(|k| (k.to_string(), json!(c.inputs[*k]))).collect::<serde_json::Map<_, _>>(),
                "massPerMetre":mass,"overall":overall,"checks":rows,"candidatesEvaluated":evaluated,"basis":basis})
        }
        None => json!({"status":"none","candidatesEvaluated":evaluated,"basis":basis,
            "reason":"No enumerated arrangement passes every EC2 check at this section size; change the section, materials or inputs"}),
    }
}

/// An indicative bar schedule for an rcBeam draft bound to a member (M08,
/// ADR 0026): straight top and bottom bars over the member length less the
/// nominal end cover (cover + link) at each end; closed links from 50 mm off
/// each end at the draft spacing, cut length 2(A + B) + two 135° hook
/// extensions of max(5φ, 50 mm) (EN 1992-1-1 Figure 8.5), A and B the link's
/// outer dimensions. Mass at 7850 kg/m³. BS 8666 shape codes are not held;
/// curtailment and laps are the engineer's. Unbound drafts give quantities only.
fn beam_schedule(p: &Project, d: &DesignPreview) -> Value {
    let v = &d.inputs;
    let length = member_length(p, d.target_id.as_ref());
    let mass = |phi: f64, len: f64, n: f64| std::f64::consts::PI * phi * phi / 4. * len * n * STEEL_DENSITY;
    let (cover, link) = (v["cover"], v["linkDiameter"]);
    let mut rows = vec![];
    for (mark, region, face) in [("T1", "Top", "top"), ("B1", "Bottom", "bottom")] {
        let (phi, n) = (v[&format!("{face}BarDiameter")], v[&format!("{face}BarCount")]);
        let cut = length.map(|l| l - 2. * (cover + link)).filter(|c| *c > 0.);
        rows.push(json!({"mark":mark,"region":region,"shape":"straight","diameter":phi,"quantity":n,
            "cutLength":cut,"massKg":cut.map(|c| mass(phi, c, n)),
            "source":if cut.is_some() {"indicative"} else {"quantitiesOnly"},"status":"indicative",
            "basis":"Straight bar over the member length less cover + link at each end"}));
    }
    let positions = length.map(|l| ((l - 0.100) / v["linkSpacing"]).floor() + 1.).filter(|n| *n >= 1.);
    let hook = (5. * link).max(0.050);
    let legs = v["linkLegs"];
    let closed = (legs / 2.).floor();
    let link_cut = link_cut_length(v, link);
    let quantity = positions.map(|n| n * closed);
    rows.push(json!({"mark":"L1","region":"Links","shape":"closed link, 135° hooks","diameter":link,"quantity":quantity,
        "legs":2,"cutLength":link_cut,"massKg":quantity.map(|n| mass(link, link_cut, n)),
        "source":if quantity.is_some() {"indicative"} else {"quantitiesOnly"},"status":"indicative",
        "basis":"First link 50 mm from each end at the draft spacing; cut length 2(A + B) + 2 max(5φ, 50 mm), EN 1992-1-1 Fig. 8.5"}));
    if legs % 2. == 1. {
        let cut = v["depth"] - 2. * cover + 2. * hook;
        rows.push(json!({"mark":"L2","region":"Links","shape":"single leg, 135° hooks","diameter":link,"quantity":positions,
            "legs":1,"cutLength":cut,"massKg":positions.map(|n| mass(link, cut, n)),
            "source":if positions.is_some() {"indicative"} else {"quantitiesOnly"},"status":"indicative",
            "basis":"Odd leg count: one open link per position, B + 2 max(5φ, 50 mm)"}));
    }
    json!(rows)
}

/// The preview's named rows from the profile's checks, worst first: fail,
/// unsupported, indeterminate, pass (PROTOCOL §5).
fn code_rows(code: &Value) -> Option<(Vec<Value>, &'static str)> {
    if code["status"] != "evaluated" || code["profileEnabled"] != true {
        return None;
    }
    // Beams carry checks per governing station; columns one set per member.
    let checks: Vec<&Value> = match code["governing"].as_array() {
        Some(g) => g.iter().flat_map(|g| g["checks"].as_array().unwrap().iter()).collect(),
        None => code["checks"].as_array()?.iter().collect(),
    };
    let beam: [(&str, &[&str]); 6] = [
        ("Flexure", &["ec2.flexure", "ec2.actions"]),
        ("Shear", &["ec2.shear", "ec2.links-min", "ec2.links-spacing"]),
        ("Minimum/maximum reinforcement", &["ec2.as-min", "ec2.as-max.top", "ec2.as-max.bottom", "ec2.crack-min"]),
        ("Cover and spacing", &["ec2.cover", "ec2.bar-spacing"]),
        ("Anchorage", &["ec2.anchorage"]),
        ("Serviceability", &["ec2.crack-control", "ec2.deflection"]),
    ];
    let column: [(&str, &[&str]); 5] = [
        ("Axial and biaxial bending", &["ec2.column.biaxial.y", "ec2.column.biaxial.z"]),
        ("Shear", &["ec2.column.shear.y", "ec2.column.shear.z"]),
        ("Longitudinal reinforcement", &["ec2.column.bar-diameter", "ec2.column.as-min", "ec2.column.as-max"]),
        ("Links and bar restraint", &["ec2.column.links", "ec2.column.restraint"]),
        ("Cover and spacing", &["ec2.cover", "ec2.bar-spacing"]),
    ];
    let footing: [(&str, &[&str]); 5] = [
        ("Contact and bearing", &["ec2.footing.contact", "ec2.footing.bearing"]),
        ("Bending and tie force", &["ec2.footing.flexure.x", "ec2.footing.flexure.y"]),
        ("Anchorage", &["ec2.footing.anchorage.x", "ec2.footing.anchorage.y"]),
        ("Shear and punching", &["ec2.footing.shear.x", "ec2.footing.shear.y", "ec2.footing.punching", "ec2.footing.punching-face"]),
        ("Cover and bar size", &["ec2.cover", "ec2.footing.cast-cover", "ec2.footing.bar-diameter"]),
    ];
    let rows: &[(&str, &[&str])] = if code["governing"].is_array() {
        &beam
    } else if code["family"] == "padFooting" {
        &footing
    } else {
        &column
    };
    Some(rows_from(&checks, rows))
}

/// Named rows, each the worst status and largest utilisation of its checks;
/// overall is the worst row (fail > unsupported > indeterminate > pass).
fn rows_from(checks: &[&Value], rows: &[(&str, &[&str])]) -> (Vec<Value>, &'static str) {
    let rank = |s: &str| match s {
        "fail" => 3,
        "unsupported" => 2,
        "indeterminate" => 1,
        _ => 0,
    };
    let mut worst_all = "pass";
    let out = rows
        .iter()
        .map(|(name, ids)| {
            let mine: Vec<&&Value> = checks.iter().filter(|c| ids.contains(&c["checkId"].as_str().unwrap_or(""))).collect();
            let worst = mine
                .iter()
                .map(|c| c["status"].as_str().unwrap_or("unsupported"))
                .max_by_key(|s| rank(s))
                .unwrap_or("pass");
            let status = if mine.is_empty() { "notApplicable" } else { worst };
            if rank(status) > rank(worst_all) {
                worst_all = match status {
                    "fail" => "fail",
                    "unsupported" => "unsupported",
                    "indeterminate" => "indeterminate",
                    _ => worst_all,
                };
            }
            let utilisation = mine.iter().filter_map(|c| c["utilisation"].as_f64()).fold(None, |m: Option<f64>, u| Some(m.map_or(u, |m| m.max(u))));
            let reason = mine
                .iter()
                .find(|c| c["status"] == worst && worst != "pass")
                .map_or_else(|| mine.iter().map(|c| c["clause"].as_str().unwrap_or("")).collect::<Vec<_>>().join("; "), |c| c["message"].as_str().unwrap_or("").to_string());
            json!({"name":name,"status":status,"utilisation":utilisation,"reason":reason,"checkIds":ids})
        })
        .collect();
    (out, worst_all)
}

/// EC2 UK NA column checks (M12, ADR 0027) for an rcColumn draft bound to a
/// member: first-order actions of the one bound combination from the key
/// stations (N compression positive, end moments, largest moments and
/// shears), the draft's bars and the engineer's code inputs.
fn column_code(p: &Project, d: &DesignPreview, stations: &[KeyStation], combination: &str) -> Value {
    let mut base = code_base(d);
    base.as_object_mut().unwrap().remove("tensionAnchorageConfirmed");
    let profile = Ec2UkNaProfile::default();
    let v = &d.inputs;
    let Some(length) = member_length(p, d.target_id.as_ref()) else {
        return merge(base, json!({"status":"unavailable","reason":"The column must be bound to a model member"}));
    };
    if stations.is_empty() {
        return merge(base, json!({"status":"unavailable","reason":"No key stations for the bound member"}));
    }
    let target = d.target_id.clone().unwrap_or_default();
    let transverse_load = p.loads.iter().any(|l| match l {
        workbench_model::Load::Uniform { member, .. } | workbench_model::Load::Point { member, .. } => member == &target,
        _ => false,
    });
    let ci = d.code_inputs.clone().unwrap_or_default();
    let ctx = RcColumnContext {
        width: v["width"],
        depth: v["depth"],
        cover_to_link: v["cover"],
        fck: v["concreteStrength"],
        fyk: v["rebarStrength"],
        bar_diameter: v["barDiameter"],
        bars_along_width: v["barsAlongWidth"] as u32,
        bars_along_depth: v["barsAlongDepth"] as u32,
        link_diameter: v["linkDiameter"],
        link_spacing: v["linkSpacing"],
        bars: column_bars(v),
        length,
        transverse_load,
        detailing: RcColumnDetailing {
            exposure_class: ci.exposure_class.clone(),
            cover_durability: ci.minimum_cover_durability,
            aggregate_size: ci.aggregate_size,
            braced: ci.braced,
            restraint_y: ci.restraint_y,
            restraint_z: ci.restraint_z,
            creep_ratio: ci.effective_creep_ratio,
        },
    };
    let first = stations.iter().min_by(|a, b| a.station.total_cmp(&b.station)).unwrap();
    let last = stations.iter().max_by(|a, b| a.station.total_cmp(&b.station)).unwrap();
    let peak = |k: usize| stations.iter().map(|s| s.actions[k].abs()).fold(0., f64::max);
    // Frame N is tension positive; the column works compression positive.
    let actions = ColumnActions {
        n_ed: stations.iter().map(|s| -s.actions[0]).fold(f64::NEG_INFINITY, f64::max),
        my_ends: [first.actions[4], last.actions[4]],
        mz_ends: [first.actions[5], last.actions[5]],
        my_max: peak(4),
        mz_max: peak(5),
        vy_max: peak(1),
        vz_max: peak(2),
        combination_id: combination.into(),
    };
    let checks = workbench_design::column_checks(&profile.ndp, &ctx, &actions);
    merge(
        base,
        json!({"status":"evaluated","combinationId":combination,"span":length,"transverseLoad":transverse_load,
            "actions":{"nEd":actions.n_ed,"myEnds":actions.my_ends,"mzEnds":actions.mz_ends,"myMax":actions.my_max,
                "mzMax":actions.mz_max,"vyMax":actions.vy_max,"vzMax":actions.vz_max,
                "convention":"N compression positive; end moments are the frame's internal My, Mz at stations 0 and 1"},
            "checks":checks.iter().map(|c| c.to_json()).collect::<Vec<_>>()}),
    )
}

/// EC2 UK NA pad footing design (M11, ADR 0028) for a draft bound to a
/// support: the column actions are the support reaction reversed (global
/// axes), the base rigid on tensionless ground; the bearing check re-solves
/// the engineer's bearing case or combination at the same support.
fn footing_code(p: &Project, d: &DesignPreview, foundation: &[f64], combination: &str) -> Value {
    let mut base = code_base(d);
    base.as_object_mut().unwrap().remove("tensionAnchorageConfirmed");
    base["family"] = json!("padFooting");
    let profile = Ec2UkNaProfile::default();
    let v = &d.inputs;
    let ci = d.code_inputs.clone().unwrap_or_default();
    let ctx = PadFootingContext {
        length: v["length"],
        width: v["width"],
        thickness: v["thickness"],
        cover: v["cover"],
        column_x: v["columnWidth"],
        column_y: v["columnDepth"],
        fck: v["concreteStrength"],
        fyk: v["rebarStrength"],
        bearing_pressure: v["bearingPressure"],
        embedment: v["embedment"],
        soil_unit_weight: v["soilUnitWeight"],
        detailing: PadFootingDetailing {
            exposure_class: ci.exposure_class.clone(),
            cover_durability: ci.minimum_cover_durability,
            aggregate_size: ci.aggregate_size,
            cast_on_blinding: ci.cast_on_blinding,
        },
    };
    // Foundation actions [Fx, Fy, Fz, Mx, My, Mz] act on the base; N is downward.
    let actions = |f: &[f64], id: &str| FootingActions { n: -f[2], mx: f[3], my: f[4], hx: f[0], hy: f[1], combination_id: id.into() };
    let uls = actions(foundation, combination);
    let target = d.target_id.clone().unwrap_or_default();
    let bearing = match &ci.bearing_combination_id {
        None => None,
        Some(id) => match workbench_assembly::analyse(p, id) {
            Ok(a) => match a.reaction_support_ids.iter().position(|s| s == &target) {
                Some(i) => Some(actions(&a.reactions[i * 6..i * 6 + 6].iter().map(|x| -x).collect::<Vec<_>>(), id)),
                None => None,
            },
            Err(e) => return merge(base, json!({"status":"unavailable","reason":format!("Bearing combination {id}: {}", e.message)})),
        },
    };
    let out = footing_design(&profile.ndp, &ctx, &uls, bearing.as_ref());
    merge(
        base,
        json!({"status":"evaluated","combinationId":combination,"bearingCombinationId":ci.bearing_combination_id,
            "actions":{"n":uls.n,"mx":uls.mx,"my":uls.my,"hx":uls.hx,"hy":uls.hy,
                "convention":"Global axes; N downward on the base; moments and horizontal forces at the top of the base"},
            "barsX":out.bars_x,"barsY":out.bars_y,"design":out.detail,
            "checks":out.checks.iter().map(|c| c.to_json()).collect::<Vec<_>>()}),
    )
}

/// The footing's bottom bars: straight, the base length less cover at each end.
fn footing_schedule(d: &DesignPreview, code: &Value) -> Value {
    let v = &d.inputs;
    let mass = |phi: f64, len: f64, n: f64| std::f64::consts::PI * phi * phi / 4. * len * n * STEEL_DENSITY;
    let rows: Vec<Value> = [("X1", "Bottom X", "barsX", "length"), ("Y1", "Bottom Y", "barsY", "width")]
        .iter()
        .filter_map(|(mark, region, key, along)| {
            let b = &code[*key];
            let (phi, n) = (b["diameter"].as_f64()?, b["count"].as_f64()?);
            let cut = v[*along] - 2. * v["cover"];
            Some(json!({"mark":mark,"region":region,"shape":"straight","diameter":phi,"quantity":n,"cutLength":cut,
                "massKg":mass(phi, cut, n),"spacing":b["spacing"],"source":"designed","status":"indicative",
                "basis":"Straight bars over the base less the nominal cover at each end; spacing as designed"}))
        })
        .collect();
    json!(rows)
}

/// Column bar sizes the proposal enumerates (BS 8666 preferred, ≥ 12 mm UK NA 9.5.2(1)).
const COLUMN_BARS: [f64; 6] = [0.012, 0.016, 0.020, 0.025, 0.032, 0.040];

/// Discrete column reinforcement (ADR 0027): the least longitudinal steel
/// over COLUMN_BARS with 2 to 6 bars along each face, each with the smallest
/// link of 8, 10 or 12 mm meeting 9.5.3(1) at the largest 25 mm multiple
/// within s_cl,tmax, such that no check fails. Needs the bending checks
/// evaluated (braced, restraint and, when slender, creep entered).
fn propose_column(p: &Project, d: &DesignPreview, stations: &[KeyStation], combination: &str) -> Value {
    let mut candidates = vec![];
    for phi in COLUMN_BARS {
        for nw in 2..=6u32 {
            for nd in 2..=6u32 {
                let n = 2 * nw + 2 * (nd - 2);
                candidates.push((n as f64 * std::f64::consts::PI * phi * phi / 4., n, phi, nw, nd));
            }
        }
    }
    candidates.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)).then(b.2.total_cmp(&a.2)));
    let mut evaluated = 0usize;
    for (area, _, phi, nw, nd) in candidates {
        let Some(link) = [0.008, 0.010, 0.012].into_iter().find(|t| *t >= (0.006f64).max(phi / 4.) - 1e-12) else {
            continue;
        };
        let s_max = (20. * phi).min(d.inputs["width"].min(d.inputs["depth"])).min(0.4);
        let spacing = (s_max / 0.025 + 1e-9).floor() * 0.025;
        let mut c = d.clone();
        for (k, x) in [("barDiameter", phi), ("barsAlongWidth", nw as f64), ("barsAlongDepth", nd as f64), ("linkDiameter", link), ("linkSpacing", spacing)] {
            c.inputs.insert(k.into(), x);
        }
        // Bars that consume the section are not candidates.
        if c.validate().is_err() {
            continue;
        }
        evaluated += 1;
        let code = column_code(p, &c, stations, combination);
        let Some(checks) = code["checks"].as_array() else { continue };
        if evaluated == 1 && checks.iter().any(|x| x["checkId"].as_str().is_some_and(|i| i.starts_with("ec2.column.biaxial")) && x["status"] == "indeterminate") {
            return json!({"status":"none","candidatesEvaluated":evaluated,
                "reason":"Enter whether the column is braced, the end restraints and (for a slender column) φ_ef before proposing reinforcement"});
        }
        if checks.iter().any(|x| x["status"] == "fail") {
            continue;
        }
        let (rows, overall) = code_rows(&code).unwrap_or_else(|| (vec![], "unsupported"));
        return json!({"status":"proposed","inputs":{"barDiameter":phi,"barsAlongWidth":nw,"barsAlongDepth":nd,"linkDiameter":link,"linkSpacing":spacing},
            "steelArea":area,"overall":overall,"checks":rows,"candidatesEvaluated":evaluated,
            "basis":{"objective":"Least longitudinal steel area","barDiameters":COLUMN_BARS,"barsPerFace":[2, 6],
                "links":"Smallest of 8, 10, 12 mm with φ_t ≥ max(6 mm, φ/4) at the largest 25 mm multiple within s_cl,tmax",
                "fixed":["width","depth","cover","concreteStrength","rebarStrength","codeInputs"],
                "acceptance":"No EC2 check fails; indeterminate checks are reported, not assumed"}});
    }
    json!({"status":"none","candidatesEvaluated":evaluated,
        "reason":"No enumerated arrangement passes every EC2 check at this section size; enlarge the section or change the materials"})
}

/// plate-v1 analysis of a slab draft's panel (ADR 0021): mechanics only, never
/// a check status. Element-centre (unsmoothed) actions are the design values;
/// Wood–Armer moments are moments to resist, not reinforcement.
fn plate_analysis(p: &Project, d: &DesignPreview) -> Result<Value> {
    use workbench_plate::wood_armer;
    let (panel, material, q) = slab_model(d)?;
    let plate = d.plate.as_ref().unwrap();
    let opening = panel.opening;
    let budget = p.analysis_settings.memory_limit_mi_b as usize * 1024 * 1024 / 2;
    let s = workbench_plate::solve(&panel, &material, q, budget)?;
    let c = workbench_plate::convergence(&panel, &material, q, &s, budget)?;
    let (count, aspect, smallest) = s.mesh.quality();
    let mut warnings = vec![];
    if aspect > workbench_plate::ASPECT_WARNING {
        warnings.push(json!({"code":"MESH_ASPECT","message":format!("Largest cell aspect ratio {aspect:.2} exceeds {}", workbench_plate::ASPECT_WARNING)}));
    }
    let design: Vec<[f64; 4]> = s
        .element_actions
        .iter()
        .map(|a| wood_armer(a.mx, a.my, a.mxy))
        .collect();
    let centre = |e: usize| {
        let (i, j) = s.mesh.element_grid[e];
        [
            (s.mesh.xs[i] + s.mesh.xs[i + 1]) / 2.,
            (s.mesh.ys[j] + s.mesh.ys[j + 1]) / 2.,
        ]
    };
    let governing = |value: &dyn Fn(usize) -> f64| {
        let e = (0..count)
            .max_by(|&a, &b| value(a).total_cmp(&value(b)))
            .unwrap();
        json!({"value":value(e),"element":e,"cell":s.mesh.element_grid[e],"at":centre(e)})
    };
    let column = |f: &dyn Fn(usize) -> f64| (0..count).map(f).collect::<Vec<_>>();
    let a = &s.element_actions;
    let extremes = s.extremes();
    let limit = 0.05;
    Ok(json!({
        "status": "evaluated",
        "basis": "mechanics",
        "codeProfile": null,
        "family": "plate-v1",
        "formulation": "docs/formulations/plate.md",
        "panel": {"lengthX":panel.lx,"lengthY":panel.ly,"thickness":material.t,"opening":opening,"edges":plate.edges,"targetMeshSize":panel.target,"placement":plate.placement},
        "columns": plate.columns.iter().zip(&s.point_reactions).map(|(c, r)| json!({"x":c.x,"y":c.y,"kind":c.kind,"kz":c.kz,"krx":c.krx,"kry":c.kry,"source":c.source,"nodeId":c.node_id,"memberIds":c.member_ids,"reaction":r})).collect::<Vec<_>>(),
        "load": {"pressure":q,"direction":"down","source":plate.input_sources["pressure"]},
        "material": {"elasticModulus":material.e,"poissonRatio":material.nu,"shearCorrection":5.0/6.0,"sources":{"elasticModulus":plate.input_sources["elasticModulus"],"poissonRatio":plate.input_sources["poissonRatio"]}},
        "mesh": {"elements":count,"nodes":s.mesh.nodes.len(),"freeDofs":s.free_dofs,"maxAspect":aspect,"smallestCell":smallest,"xs":s.mesh.xs,"ys":s.mesh.ys,"warnings":warnings},
        "equilibrium": {"applied":s.applied,"reactions":s.reaction_z,"relativeImbalance":s.balance,"solverResidual":s.residual},
        "extremes": {"maxDeflection":extremes.max_deflection,"maxMx":extremes.max_mx,"maxMy":extremes.max_my,"minMx":extremes.min_mx,"minMy":extremes.min_my},
        "convergence": {"coarseMeshSize":2.0*panel.target,"coarseElements":c.coarse_elements,"change":c.change,"indicatorLimit":limit,"withinLimit":c.change <= limit,
            "note":"Indicator only: the panel re-solved at twice the mesh size. Peak moments at re-entrant opening corners are singular and mesh-dependent."},
        "designMoments": {
            "method": "woodArmer",
            "bottomX": governing(&|e| design[e][0]),
            "bottomY": governing(&|e| design[e][1]),
            "topX": governing(&|e| design[e][2]),
            "topY": governing(&|e| design[e][3]),
        },
        "edgeMoments": s.edge_moments.iter().map(|m| json!({"edge":m.edge,"position":m.position,"moment":m.moment})).collect::<Vec<_>>(),
        "fields": {
            "recovery": "elementCentre",
            "cells": s.mesh.element_grid,
            "mx": column(&|e| a[e].mx),
            "my": column(&|e| a[e].my),
            "mxy": column(&|e| a[e].mxy),
            "qx": column(&|e| a[e].qx),
            "qy": column(&|e| a[e].qy),
            "bottomX": column(&|e| design[e][0]),
            "bottomY": column(&|e| design[e][1]),
            "topX": column(&|e| design[e][2]),
            "topY": column(&|e| design[e][3]),
            "nodes": s.mesh.node_grid,
            "w": s.displacements.iter().map(|u| u[2]).collect::<Vec<_>>(),
        },
        "units": {"moment":"N m/m","shear":"N/m","deflection":"m","length":"m","pressure":"Pa"},
        "signs": "Moments sagging positive (bottom face in tension); w positive up; Wood–Armer values are magnitudes to resist on each face",
    }))
}
fn merge(mut a: Value, b: Value) -> Value {
    for (k, v) in b.as_object().unwrap() {
        a[k] = v.clone();
    }
    a
}
pub fn evaluate(p: &Project, input: &Value) -> Result<Value> {
    if input["modelHash"] != p.hash() {
        return Err(err(
            "STALE_RESULT",
            "Preview request belongs to another model",
        ));
    }
    let id = input["draftId"].as_str().unwrap_or("");
    let draft = p
        .design_previews
        .iter()
        .find(|d| d.id == id)
        .ok_or_else(|| err("DANGLING_REFERENCE", "Unknown preview"))?;
    let mut source = json!({"kind":"syntheticFixture","mock":true,"fixtureId":format!("{}-workflow-illustration-v1",draft.kind),"units":"SI","actions":[0,40000,0,0,0,120000],"note":"Illustrative upstream actions, not a solver result"});
    if draft.kind == "padFooting" {
        source = json!({"kind":"syntheticFixture","mock":true,"fixtureId":"pad-footing-reaction-v1","foundationActions":[0,0,-800000,40000,60000,0],"axes":"Global [Fx,Fy,Fz,Mx,My,Mz], N and N m","note":"Synthetic downward load and biaxial moments; no contact solution"});
    }
    if draft.kind == "slab" {
        source = json!({"kind":"syntheticFixture","mock":true,"fixtureId":"slab-plate-actions-v1","units":"N m/m","rawPlateActions":{"mx":-62000,"my":-31000,"mxy":8500},"designTransform":"unavailable","meshConvergence":"notChecked","note":"No validated plate/shell analysis; never use a frame-member result as a slab action"});
    }
    let mut plate = Value::Null;
    let mut stations: Option<Vec<KeyStation>> = None;
    if draft.kind == "slab" {
        plate = json!({"status":"notRun","reason":"Choose the plate analysis source to solve this panel"});
    }
    let mut demand = json!({"status":"unavailable","reason":"Model flexural demand needs a bound member and the current model case/combination; synthetic actions are illustrative"});
    let mut code = json!({"status":"unavailable","basis":"codeProfile","reason":"EC2 checks need actual model actions from a bound member and the current case/combination"});
    let mut proposal = Value::Null;
    if input["sourceMode"] == "plate" {
        if draft.kind != "slab" {
            return Err(err(
                "INVALID_SCHEMA",
                "The plate analysis source applies only to slab drafts",
            ));
        }
        plate = plate_analysis(p, draft)?;
        source = json!({"kind":"plateAnalysis","mock":false,"family":"plate-v1","units":"N m/m","pressureSource":plate["load"]["source"],
            "note":"Plate analysis of the draft panel under its entered pressure; not connected to the frame model"});
    } else if input["sourceMode"] == "model" {
        if draft.kind == "slab" {
            return Err(err(
                "UNSUPPORTED_FEATURE",
                "Validated plate actions are unavailable; only synthetic slab preview is supported",
            ));
        }
        let target = draft
            .target_id
            .as_ref()
            .ok_or_else(|| err("DESIGN_INPUT_INCOMPLETE", "Choose a model member/support"))?;
        let case = input["caseId"].as_str().unwrap_or("");
        let a = workbench_assembly::analyse(p, case)?;
        if input["resultId"] != a.result_id || !a.converged {
            return Err(err(
                "STALE_RESULT",
                "Current converged case/combination is required",
            ));
        }
        source = json!({"kind":"modelAnalysis","mock":false,"resultId":a.result_id,"modelHash":a.model_hash,"sourceRevision":a.source_revision,"solverBuildHash":a.solver_build_hash,"settingsHash":a.settings_hash,"combinationId":case,"targetId":target});
        if draft.kind == "rcColumn" {
            let m = a
                .members
                .iter()
                .find(|m| &m.id == target)
                .ok_or_else(|| err("DANGLING_REFERENCE", "Member result unavailable"))?;
            source["stations"] = serde_json::to_value(&m.key_stations).unwrap();
            stations = Some(m.key_stations.clone());
            code = column_code(p, draft, &m.key_stations, case);
            if input["propose"] == true && code["status"] == "evaluated" && code["profileEnabled"] == true {
                proposal = propose_column(p, draft, &m.key_stations, case);
            }
            source["note"] = json!(
                "Actual model actions at the member's key stations; the draft section is not applied to frame stiffness"
            );
        } else if draft.kind == "rcBeam" {
            let m = a
                .members
                .iter()
                .find(|m| &m.id == target)
                .ok_or_else(|| err("DANGLING_REFERENCE", "Member result unavailable"))?;
            source["stations"] = serde_json::to_value(&m.key_stations).unwrap();
            demand = flexural_demand(p, target, &m.key_stations, case)?;
            let governing = code_stations(p, draft, &demand, &m.key_stations)?;
            code = code_evaluate(p, draft, &demand, &governing, case);
            if input["propose"] == true && code["status"] == "evaluated" && code["profileEnabled"] == true {
                proposal = propose_reinforcement(p, draft, &demand, &governing, case);
            }
            source["note"] = json!(
                "Actual model actions; preview section is not applied to frame stiffness, and no concrete resistance is calculated"
            );
        } else {
            let i = a
                .reaction_support_ids
                .iter()
                .position(|id| id == target)
                .ok_or_else(|| err("DANGLING_REFERENCE", "Support reaction unavailable"))?;
            let reaction = &a.reactions[i * 6..i * 6 + 6];
            source["supportReaction"] = json!(reaction);
            source["foundationActions"] = json!(reaction.iter().map(|v| -v).collect::<Vec<_>>());
            source["axes"] = json!(
                "Global [Fx,Fy,Fz,Mx,My,Mz], SI; foundation actions oppose support-on-structure reactions"
            );
            source["note"] = json!(
                "Exact simultaneous support reaction; the base is rigid on tensionless ground (no frame-foundation coupling)"
            );
            let foundation: Vec<f64> = reaction.iter().map(|v| -v).collect();
            code = footing_code(p, draft, &foundation, case);
        }
    } else if input["sourceMode"] != "synthetic" {
        return Err(err(
            "INVALID_SCHEMA",
            "Choose model or synthetic upstream source",
        ));
    }
    let checks: Vec<&str> = match draft.kind.as_str() {
        // Biaxial section mechanics are reported under `columnMechanics`.
        "rcColumn" => vec![
            "Axial and biaxial bending",
            "Slenderness and second-order effects",
            "Minimum eccentricity",
            "Shear",
            "Detailing",
        ],
        "rcBeam" => vec![
            "Flexure",
            "Shear",
            "Minimum/maximum reinforcement",
            "Cover and spacing",
            "Anchorage",
            "Serviceability",
        ],
        // Plate solution, convergence and design-moment transformation are
        // reported under `plateAnalysis`; these are the code checks.
        "slab" => vec![
            "Top X/Y reinforcement",
            "Bottom X/Y reinforcement",
            "Minimum/maximum reinforcement",
            "Punching",
            "Deflection",
        ],
        _ => vec![
            "Compression-only contact",
            "Bearing",
            "Sliding/overturning",
            "Flexure",
            "One-way shear",
            "Punching",
            "Detailing",
        ],
    };
    let schedule = if draft.kind == "rcBeam" {
        beam_schedule(p, draft)
    } else if draft.kind == "padFooting" && code["status"] == "evaluated" {
        footing_schedule(draft, &code)
    } else {
        json!([])
    };
    // ADR 0026: an evaluated, enabled code profile replaces the unsupported
    // rows with its checks, labelled as a demonstration of the held edition.
    let coded = if ["rcBeam", "rcColumn", "padFooting"].contains(&draft.kind.as_str()) { code_rows(&code) } else { None };
    let mut run = json!({"contractVersion":1,"draftId":id,"kind":draft.kind,"overall":"unsupported","mock":true,"codeProfile":null,"modelHash":p.hash(),"sourceRevision":p.revision,
        "inputHash":digest(&serde_json::to_vec(draft).unwrap()),"inputs":draft,"sourceProvenance":source,"schedule":schedule,
        "checks":checks.iter().map(|name|json!({"name":name,"status":"unsupported","utilisation":null,"reason":if *name=="Flexure"&&draft.kind=="rcBeam"{"Code profile unavailable. Section mechanics are reported separately and are not a code resistance"}else{"Required numerical family or locked code/example resources are unavailable"}})).collect::<Vec<_>>(),
        "contactState":if draft.kind=="padFooting"{"indeterminate"}else{"notApplicable"},
        "reinforcementFields":["Top X","Top Y","Bottom X","Bottom Y"],
        "soilProvenance":if draft.kind=="padFooting"{json!({"source":draft.input_sources.get("bearingPressure").unwrap_or(&draft.input_source),"reference":draft.soil_reference,"bearingPressure":draft.inputs["bearingPressure"],"computedByWorkbench":false})}else{Value::Null},
        "sectionMechanics":if draft.kind=="rcBeam"{section_mechanics(draft,&demand)}else{Value::Null},
        "flexuralDemand":if draft.kind=="rcBeam"{demand}else{Value::Null},
        "codeProfilePreview":if ["rcBeam","rcColumn","padFooting"].contains(&draft.kind.as_str()){code.clone()}else{Value::Null},
        "plateAnalysis":plate,
        "columnMechanics":if draft.kind=="rcColumn"{column_mechanics(draft,stations.as_deref())}else{Value::Null},
        "limitations":["MOCK WORKFLOW — no code-compliance claim","Dimensions are draft inputs; frame geometry/stiffness is unchanged","Illustrations are not construction details; quantities/fit/anchorage and cut lengths are unverified"]});
    if let Some((rows, overall)) = coded {
        run["reinforcementProposal"] = proposal;
        run["checks"] = json!(rows);
        run["overall"] = json!(overall);
        if draft.kind == "padFooting" {
            // The ULS contact state from the rigid-base solution.
            run["contactState"] = json!(code["design"]["uls"]["contact"]["state"].as_str().unwrap_or("noEquilibrium"));
        }
        run["mock"] = json!(draft.input_source != "user");
        run["codeProfile"] = json!({"id":code["profileId"],"standard":code["standard"],"edition":code["edition"],
            "certification":code["certification"],"unreconciledAmendments":code["unreconciledAmendments"]});
        run["limitations"] = json!([
            format!("DEMONSTRATION — {}; {} not reconciled; {}", code["edition"].as_str().unwrap_or(""),
                code["unreconciledAmendments"].as_array().map(|a| a.iter().filter_map(|x| x.as_str()).collect::<Vec<_>>().join(", ")).unwrap_or_default(),
                code["certification"].as_str().unwrap_or("")),
            "Dimensions are draft inputs; frame geometry/stiffness is unchanged",
            "Schedule and illustrations are indicative; curtailment and laps are the engineer's detailing"]);
    }
    run["previewRunId"] = json!(digest(&serde_json::to_vec(&run).unwrap()));
    Ok(run)
}
