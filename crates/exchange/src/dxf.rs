//! DXF (ASCII) wireframe exchange (exchange-v1, ADR 0025). A DXF file holds
//! geometry only: lines and polylines become members; every analysis
//! property comes from explicit per-layer decisions.
use crate::review::*;
use crate::units::{Quantity, base_choices};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write;
use workbench_model::{Project, Result, err};

type V3 = [f64; 3];

struct Pair<'a> {
    code: i32,
    value: &'a str,
}

fn pairs(text: &str) -> Result<Vec<Pair<'_>>> {
    if text.starts_with("AutoCAD Binary DXF") {
        return Err(err(
            "UNSUPPORTED_FEATURE",
            "Binary DXF is not supported; save as ASCII DXF",
        ));
    }
    let lines: Vec<&str> = text.lines().collect();
    if lines.len() % 2 != 0 && lines.last().is_some_and(|l| !l.trim().is_empty()) {
        return Err(err(
            "INVALID_EXCHANGE_FILE",
            "DXF group codes and values do not pair up",
        ));
    }
    let mut out = Vec::with_capacity(lines.len() / 2);
    for (k, c) in lines.chunks(2).enumerate() {
        if c.len() < 2 {
            break;
        }
        let code = c[0].trim().parse::<i32>().map_err(|_| {
            err(
                "INVALID_EXCHANGE_FILE",
                format!("Invalid DXF group code at line {}", 2 * k + 1),
            )
        })?;
        out.push(Pair {
            code,
            value: c[1].trim_end_matches('\r'),
        });
    }
    Ok(out)
}

#[derive(Clone, Debug)]
struct Entity {
    kind: String,
    codes: Vec<(i32, String)>,
}

impl Entity {
    fn get(&self, code: i32) -> Option<&str> {
        self.codes
            .iter()
            .find(|c| c.0 == code)
            .map(|c| c.1.as_str())
    }
    fn num(&self, code: i32) -> Result<Option<f64>> {
        match self.get(code) {
            None => Ok(None),
            Some(v) => v
                .trim()
                .parse::<f64>()
                .ok()
                .filter(|x| x.is_finite())
                .map(Some)
                .ok_or_else(|| {
                    err(
                        "INVALID_EXCHANGE_FILE",
                        format!("{}: group {code} is not a number", self.kind),
                    )
                }),
        }
    }
    fn layer(&self) -> String {
        self.get(8).unwrap_or("0").trim().to_string()
    }
    fn extrusion(&self) -> Result<V3> {
        Ok([
            self.num(210)?.unwrap_or(0.),
            self.num(220)?.unwrap_or(0.),
            self.num(230)?.unwrap_or(1.),
        ])
    }
}

/// The DXF arbitrary axis algorithm: OCS axes for an extrusion direction.
pub fn ocs_axes(n: V3) -> Option<[V3; 3]> {
    let len = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt();
    if !(len > 1e-12) {
        return None;
    }
    let n = n.map(|x| x / len);
    let cross = |a: V3, b: V3| {
        [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0],
        ]
    };
    let norm = |a: V3| {
        let l = (a[0] * a[0] + a[1] * a[1] + a[2] * a[2]).sqrt();
        a.map(|x| x / l)
    };
    let ax = if n[0].abs() < 1. / 64. && n[1].abs() < 1. / 64. {
        norm(cross([0., 1., 0.], n))
    } else {
        norm(cross([0., 0., 1.], n))
    };
    let ay = norm(cross(n, ax));
    Some([ax, ay, n])
}

fn ocs_to_wcs(axes: &[V3; 3], p: V3) -> V3 {
    std::array::from_fn(|i| axes[0][i] * p[0] + axes[1][i] * p[1] + axes[2][i] * p[2])
}

/// $INSUNITS codes the exchange accepts, with SI factors.
fn insunits(code: i64) -> Option<(&'static str, f64)> {
    Some(match code {
        1 => ("inch", 0.0254),
        2 => ("foot", 0.3048),
        4 => ("millimetre", 1e-3),
        5 => ("centimetre", 1e-2),
        6 => ("metre", 1.),
        10 => ("yard", 0.9144),
        14 => ("decimetre", 0.1),
        _ => return None,
    })
}

pub struct Plan {
    pub report: ReadReport,
    /// (layer, start, end) in file units, WCS.
    segments: Vec<(String, V3, V3, String)>,
    unit: Option<f64>,
}

pub fn plan(text: &str, mut source: Source) -> Result<Plan> {
    let p = pairs(text)?;
    let mut ledger = Ledger::default();
    let mut header: BTreeMap<String, String> = BTreeMap::new();
    let mut entities: Vec<Entity> = vec![];
    let mut section = String::new();
    let mut i = 0;
    let mut seen_eof = false;
    while i < p.len() {
        let Pair { code, value } = &p[i];
        match (*code, value.trim()) {
            (0, "SECTION") => {
                section = p
                    .get(i + 1)
                    .filter(|x| x.code == 2)
                    .map(|x| x.value.trim().to_string())
                    .unwrap_or_default();
                i += 2;
                continue;
            }
            (0, "ENDSEC") => section.clear(),
            (0, "EOF") => {
                seen_eof = true;
                break;
            }
            (9, name) if section == "HEADER" => {
                if let Some(v) = p.get(i + 1) {
                    header.insert(name.to_string(), v.value.trim().to_string());
                }
            }
            (0, kind) if section == "ENTITIES" => {
                let mut e = Entity {
                    kind: kind.to_string(),
                    codes: vec![],
                };
                let mut j = i + 1;
                while j < p.len() && p[j].code != 0 {
                    e.codes.push((p[j].code, p[j].value.to_string()));
                    j += 1;
                }
                entities.push(e);
                i = j;
                continue;
            }
            _ => {}
        }
        i += 1;
    }
    if !seen_eof {
        return Err(err(
            "INVALID_EXCHANGE_FILE",
            "The DXF file has no EOF marker",
        ));
    }
    let version = header
        .get("$ACADVER")
        .cloned()
        .unwrap_or_else(|| "unknown".into());
    source.schema = format!("DXF {version}");

    let mut segments = vec![];
    let mut k = 0;
    let mut add = |layer: String, a: V3, b: V3, origin: String, ledger: &mut Ledger| {
        if a == b {
            ledger.add(
                "skipped",
                "zero-length segment",
                "a segment with coincident ends is not a member",
                origin,
            );
        } else {
            segments.push((layer, a, b, origin));
        }
    };
    while k < entities.len() {
        let e = &entities[k];
        let paper = e.get(67).is_some_and(|v| v.trim() == "1");
        let handle = e.get(5).map_or_else(
            || format!("{} #{}", e.kind, k + 1),
            |h| format!("{} {}", e.kind, h.trim()),
        );
        if paper {
            ledger.add(
                "notImported",
                "paper-space entity",
                "only model space is read",
                handle,
            );
            k += 1;
            continue;
        }
        match e.kind.as_str() {
            "LINE" => {
                let a = [
                    e.num(10)?.unwrap_or(0.),
                    e.num(20)?.unwrap_or(0.),
                    e.num(30)?.unwrap_or(0.),
                ];
                let b = [
                    e.num(11)?.unwrap_or(0.),
                    e.num(21)?.unwrap_or(0.),
                    e.num(31)?.unwrap_or(0.),
                ];
                add(e.layer(), a, b, handle, &mut ledger);
            }
            "LWPOLYLINE" => {
                let axes = ocs_axes(e.extrusion()?).ok_or_else(|| {
                    err("INVALID_EXCHANGE_FILE", format!("{handle}: zero extrusion"))
                })?;
                let z = e.num(38)?.unwrap_or(0.);
                let (mut xs, mut ys) = (vec![], vec![]);
                let mut bulge = false;
                for (c, v) in &e.codes {
                    let x = || {
                        v.trim().parse::<f64>().map_err(|_| {
                            err("INVALID_EXCHANGE_FILE", format!("{handle}: invalid vertex"))
                        })
                    };
                    match c {
                        10 => xs.push(x()?),
                        20 => ys.push(x()?),
                        42 if x()? != 0. => bulge = true,
                        _ => {}
                    }
                }
                if xs.len() != ys.len() {
                    return Err(err(
                        "INVALID_EXCHANGE_FILE",
                        format!("{handle}: vertex coordinates do not pair up"),
                    ));
                }
                if bulge {
                    ledger.add(
                        "notImported",
                        "polyline with arc segments",
                        "curved segments are not members",
                        handle,
                    );
                    k += 1;
                    continue;
                }
                let pts: Vec<V3> = xs
                    .iter()
                    .zip(&ys)
                    .map(|(x, y)| ocs_to_wcs(&axes, [*x, *y, z]))
                    .collect();
                let closed = e.num(70)?.unwrap_or(0.) as i64 & 1 == 1;
                for w in pts.windows(2) {
                    add(e.layer(), w[0], w[1], handle.clone(), &mut ledger);
                }
                if closed && pts.len() > 2 {
                    add(
                        e.layer(),
                        *pts.last().unwrap(),
                        pts[0],
                        handle.clone(),
                        &mut ledger,
                    );
                }
            }
            "POLYLINE" => {
                let flags = e.num(70)?.unwrap_or(0.) as i64;
                let mut verts = vec![];
                let mut j = k + 1;
                let mut bulge = false;
                while j < entities.len() && entities[j].kind == "VERTEX" {
                    let v = &entities[j];
                    verts.push([
                        v.num(10)?.unwrap_or(0.),
                        v.num(20)?.unwrap_or(0.),
                        v.num(30)?.unwrap_or(0.),
                    ]);
                    bulge |= v.num(42)?.is_some_and(|b| b != 0.);
                    j += 1;
                }
                if entities.get(j).is_some_and(|x| x.kind == "SEQEND") {
                    j += 1;
                }
                if flags & (16 | 64) != 0 {
                    ledger.add(
                        "notImported",
                        "polygon or polyface mesh",
                        "meshes are not members",
                        handle,
                    );
                } else if bulge {
                    ledger.add(
                        "notImported",
                        "polyline with arc segments",
                        "curved segments are not members",
                        handle,
                    );
                } else {
                    let pts: Vec<V3> = if flags & 8 != 0 {
                        verts
                    } else {
                        let axes = ocs_axes(e.extrusion()?).ok_or_else(|| {
                            err("INVALID_EXCHANGE_FILE", format!("{handle}: zero extrusion"))
                        })?;
                        let z = e.num(30)?.unwrap_or(0.);
                        verts
                            .iter()
                            .map(|v| ocs_to_wcs(&axes, [v[0], v[1], z]))
                            .collect()
                    };
                    for w in pts.windows(2) {
                        add(e.layer(), w[0], w[1], handle.clone(), &mut ledger);
                    }
                    if flags & 1 == 1 && pts.len() > 2 {
                        add(
                            e.layer(),
                            *pts.last().unwrap(),
                            pts[0],
                            handle.clone(),
                            &mut ledger,
                        );
                    }
                }
                k = j;
                continue;
            }
            "VERTEX" | "SEQEND" => {}
            "INSERT" => ledger.add(
                "notImported",
                "block reference (INSERT)",
                "block contents are not exploded; explode blocks before export",
                handle,
            ),
            other => ledger.add(
                "notImported",
                &format!("{other} entity"),
                "only LINE, LWPOLYLINE and POLYLINE are members",
                handle,
            ),
        }
        k += 1;
    }
    if segments.is_empty() {
        return Err(err(
            "NOTHING_TO_IMPORT",
            "The DXF file has no lines or polylines in model space",
        ));
    }

    let mut decisions = vec![];
    let code = header
        .get("$INSUNITS")
        .and_then(|v| v.trim().parse::<i64>().ok())
        .unwrap_or(0);
    let unit = insunits(code);
    let unit_record = match unit {
        Some((label, f)) => UnitRecord {
            quantity: Quantity::Length,
            factor: Some(f),
            source: "header".into(),
            label: format!("{label} ($INSUNITS = {code})"),
        },
        None => {
            decisions.push(Decision {
                id: "units:length".into(),
                kind: "units".into(),
                question: if code == 0 {
                    "The drawing has no unit ($INSUNITS is unset or 0). Its coordinates are in:"
                        .into()
                } else {
                    format!("$INSUNITS = {code} is not a supported unit. The coordinates are in:")
                },
                choices: base_choices(Quantity::Length)
                    .iter()
                    .map(|(v, l, _)| Choice {
                        value: (*v).into(),
                        label: (*l).into(),
                    })
                    .collect(),
                fields: vec![],
                entities: vec!["$INSUNITS".into()],
            });
            UnitRecord {
                quantity: Quantity::Length,
                factor: None,
                source: "undefined".into(),
                label: "not stated by the drawing".into(),
            }
        }
    };
    let layers: BTreeSet<String> = segments.iter().map(|s| s.0.clone()).collect();
    for layer in &layers {
        let n = segments.iter().filter(|s| &s.0 == layer).count();
        let mut fields = material_fields(None, None, None);
        fields.extend(section_fields([None; 6]));
        decisions.push(Decision {
            id: format!("layer:{layer}"),
            kind: "layer".into(),
            question: format!("Layer '{layer}' has {n} segment(s). Import them as members with:"),
            choices: vec![
                Choice {
                    value: "values".into(),
                    label: "These material and section properties".into(),
                },
                Choice {
                    value: "skip".into(),
                    label: "Do not import this layer".into(),
                },
            ],
            fields,
            entities: vec![layer.clone()],
        });
    }
    decisions.push(Decision {
        id: "nodes:tolerance".into(),
        kind: "tolerance".into(),
        question: "Segment ends closer than this distance become one node:".into(),
        choices: vec![Choice {
            value: "values".into(),
            label: "Merge tolerance".into(),
        }],
        fields: vec![Field {
            name: "tolerance".into(),
            label: "Merge tolerance".into(),
            unit: "m".into(),
            found: None,
            rule: FieldRule::Positive,
        }],
        entities: vec![],
    });
    decisions.push(Decision::choose(
        "supports",
        "supports",
        "A drawing has no supports. Place supports at:",
        &[
            ("none", "No supports (add them after import)"),
            ("pinnedLowest", "Pinned at the lowest nodes (minimum Z)"),
            ("fixedLowest", "Fixed at the lowest nodes (minimum Z)"),
        ],
        vec![],
    ));
    let report = ReadReport {
        source,
        units: vec![unit_record],
        counts: BTreeMap::from([
            ("segments".into(), segments.len()),
            ("layers".into(), layers.len()),
        ]),
        decisions,
        ledger: ledger.entries(),
        blocking: vec![],
    };
    Ok(Plan {
        report,
        segments,
        unit: unit.map(|u| u.1),
    })
}

pub fn build(plan: &Plan, answers: &Answers) -> Result<(Project, Vec<LossEntry>)> {
    use workbench_model::*;
    let mut ledger = Ledger::default();
    for e in &plan.report.ledger {
        ledger.extend(e);
    }
    let factor = match plan.unit {
        Some(f) => f,
        None => {
            let k = answers
                .choice("units:length")
                .ok_or_else(|| err("DECISION_REQUIRED", "units:length"))?;
            base_choices(Quantity::Length)
                .iter()
                .find(|c| c.0 == k)
                .map(|c| c.2)
                .ok_or_else(|| err("INVALID_MAPPING", "unknown length unit"))?
        }
    };
    let tol = answers
        .get("nodes:tolerance")
        .and_then(|a| a.values.get("tolerance").copied())
        .ok_or_else(|| err("DECISION_REQUIRED", "nodes:tolerance"))?;
    if tol > 0.1 {
        return Err(err(
            "INVALID_MAPPING",
            "A merge tolerance above 0.1 m would join distinct points",
        ));
    }
    let mut nodes: Vec<Node> = vec![];
    let node_at = |p: V3, nodes: &mut Vec<Node>| -> String {
        let q = p.map(|x| x * factor);
        if let Some(n) = nodes.iter().find(|n| {
            (0..3)
                .map(|i| (n.position[i] - q[i]).powi(2))
                .sum::<f64>()
                .sqrt()
                <= tol
        }) {
            return n.id.clone();
        }
        let id = format!("n{}", nodes.len() + 1);
        nodes.push(Node {
            id: id.clone(),
            position: q,
        });
        id
    };
    let mut materials = vec![];
    let mut sections = vec![];
    let mut members: Vec<Member> = vec![];
    let mut layer_props: BTreeMap<&str, (String, String)> = BTreeMap::new();
    let layers: BTreeSet<&str> = plan.segments.iter().map(|s| s.0.as_str()).collect();
    for (k, layer) in layers.iter().enumerate() {
        let a = answers
            .get(&format!("layer:{layer}"))
            .ok_or_else(|| err("DECISION_REQUIRED", format!("layer:{layer}")))?;
        if a.choice == "skip" {
            let n = plan.segments.iter().filter(|s| s.0 == *layer).count();
            for _ in 0..n {
                ledger.add(
                    "skipped",
                    "layer",
                    "the layer was not imported by choice",
                    layer.to_string(),
                );
            }
            continue;
        }
        let v = &a.values;
        let (mid, sid) = (format!("mat{}", k + 1), format!("sec{}", k + 1));
        materials.push(Material {
            id: mid.clone(),
            name: layer.to_string(),
            e: v["E"],
            nu: v["nu"],
            density: v["density"],
        });
        sections.push(Section {
            id: sid.clone(),
            name: layer.to_string(),
            a: v["A"],
            iy: v["Iy"],
            iz: v["Iz"],
            j: v["J"],
            cy: v["cy"],
            cz: v["cz"],
            provenance: format!("DXF layer '{layer}', entered at import"),
        });
        layer_props.insert(layer, (mid, sid));
    }
    let mut seen: BTreeSet<(String, String)> = BTreeSet::new();
    for (layer, a, b, origin) in &plan.segments {
        let Some((mid, sid)) = layer_props.get(layer.as_str()) else {
            continue;
        };
        let (s, e) = (node_at(*a, &mut nodes), node_at(*b, &mut nodes));
        if s == e {
            ledger.add(
                "skipped",
                "segment shorter than the merge tolerance",
                "both ends merged into one node",
                origin.clone(),
            );
            continue;
        }
        let key = if s < e {
            (s.clone(), e.clone())
        } else {
            (e.clone(), s.clone())
        };
        if !seen.insert(key) {
            ledger.add(
                "skipped",
                "duplicate segment",
                "a member already joins these nodes",
                origin.clone(),
            );
            continue;
        }
        let pa = nodes.iter().find(|n| n.id == s).unwrap().position;
        let pb = nodes.iter().find(|n| n.id == e).unwrap().position;
        let d: V3 = std::array::from_fn(|i| pb[i] - pa[i]);
        let l = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt();
        members.push(Member {
            id: format!("m{}", members.len() + 1),
            start: s,
            end: e,
            material: mid.clone(),
            section: sid.clone(),
            local_y: crate::default_local_y(d.map(|x| x / l)),
            release_start: Release {
                my: false,
                mz: false,
            },
            release_end: Release {
                my: false,
                mz: false,
            },
            parent_member_id: None,
            station_range: None,
            steel_design: None,
        });
    }
    if members.is_empty() {
        return Err(err("NOTHING_TO_IMPORT", "Every layer was skipped"));
    }
    ledger.add(
        "converted",
        "member orientation",
        "local y taken as global Y (global −X for members along Y), the workbench default",
        String::new(),
    );
    ledger.add("converted", "member ends", "segments meeting at a node are rigidly connected; crossings without a shared end are not connected", String::new());
    // Nodes only used by skipped layers are dropped.
    let used: BTreeSet<&String> = members.iter().flat_map(|m| [&m.start, &m.end]).collect();
    nodes.retain(|n| used.contains(&n.id));
    let mut supports = vec![];
    match answers.choice("supports") {
        Some(kind @ ("pinnedLowest" | "fixedLowest")) => {
            let zmin = nodes
                .iter()
                .map(|n| n.position[2])
                .fold(f64::INFINITY, f64::min);
            let fixed = if kind == "fixedLowest" {
                [true; 6]
            } else {
                [true, true, true, false, false, false]
            };
            for n in nodes.iter().filter(|n| n.position[2] <= zmin + tol) {
                supports.push(Support {
                    id: format!("s{}", supports.len() + 1),
                    node: n.id.clone(),
                    fixed,
                    prescribed: [0.; 6],
                });
            }
        }
        _ => ledger.add(
            "converted",
            "supports",
            "no supports placed; add them before analysis",
            String::new(),
        ),
    }
    let stem = plan
        .report
        .source
        .file_name
        .rsplit_once('.')
        .map_or(plan.report.source.file_name.as_str(), |x| x.0);
    let mut p = Project {
        schema_version: CURRENT_SCHEMA.into(),
        id: format!("dxf-{}", &plan.report.source.sha256[..12]),
        name: if stem.is_empty() {
            "DXF import".into()
        } else {
            stem.to_string()
        },
        revision: 0,
        display_units: "SI".into(),
        analysis_mode: "spatial".into(),
        gravity: [0., 0., -9.80665],
        materials,
        sections,
        nodes,
        members,
        supports,
        load_cases: vec![LoadCase {
            id: "lc1".into(),
            name: "Imported (drawings carry no loads)".into(),
            category: "other".into(),
        }],
        loads: vec![],
        combinations: vec![],
        analysis_settings: Settings {
            kind: "linearStatic".into(),
            formulation: "eulerBernoulli3D".into(),
            merge_tolerance: 1e-6,
            timeout_ms: 30000,
            memory_limit_mi_b: 512,
        },
        metadata: Metadata {
            description: format!(
                "Imported from {} ({}, SHA-256 {})",
                plan.report.source.file_name,
                plan.report.source.schema,
                &plan.report.source.sha256[..16]
            ),
            created_by: "exchange-v1 DXF import".into(),
            entity_labels: Default::default(),
        },
        structure: Structure::default(),
        design_previews: vec![],
        mass_sources: vec![],
        response_spectra: vec![],
    };
    ledger.add(
        "converted",
        "load cases",
        "a drawing has no loads; one empty case was created because a project needs one",
        String::new(),
    );
    p.structure = Structure::initialise(&p);
    p.canonicalise();
    p.validate()?;
    Ok((p, ledger.entries()))
}

/// R12 ASCII DXF: one LINE per member on a layer named after its section,
/// in metres ($INSUNITS = 6).
pub fn write(p: &Project) -> (String, Ledger) {
    let mut ledger = Ledger::default();
    let pos: BTreeMap<&str, V3> = p
        .nodes
        .iter()
        .map(|n| (n.id.as_str(), n.position))
        .collect();
    let layer = |id: &str| {
        let name = p
            .sections
            .iter()
            .find(|s| s.id == id)
            .map_or(id, |s| s.name.as_str());
        let clean: String = name
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || "-_$".contains(c) {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        if clean.is_empty() {
            "0".to_string()
        } else {
            clean.chars().take(31).collect()
        }
    };
    let mut t = String::new();
    let mut g = |code: i32, v: &str| {
        let _ = writeln!(t, "{code:>3}\n{v}");
    };
    g(0, "SECTION");
    g(2, "HEADER");
    g(9, "$ACADVER");
    g(1, "AC1009");
    g(9, "$INSUNITS");
    g(70, "6");
    g(0, "ENDSEC");
    g(0, "SECTION");
    g(2, "TABLES");
    g(0, "TABLE");
    g(2, "LAYER");
    let names: BTreeSet<String> = p.members.iter().map(|m| layer(&m.section)).collect();
    g(70, &names.len().to_string());
    for n in &names {
        g(0, "LAYER");
        g(2, n);
        g(70, "0");
        g(62, "7");
        g(6, "CONTINUOUS");
    }
    g(0, "ENDTAB");
    g(0, "ENDSEC");
    g(0, "SECTION");
    g(2, "ENTITIES");
    for m in &p.members {
        let (a, b) = (pos[m.start.as_str()], pos[m.end.as_str()]);
        g(0, "LINE");
        g(8, &layer(&m.section));
        for (k, v) in [
            (10, a[0]),
            (20, a[1]),
            (30, a[2]),
            (11, b[0]),
            (21, b[1]),
            (31, b[2]),
        ] {
            g(k, &format!("{v:?}"));
        }
    }
    g(0, "ENDSEC");
    g(0, "EOF");
    for (subject, n) in [
        ("support", p.supports.len()),
        ("load", p.loads.len()),
        ("load case", p.load_cases.len()),
        ("combination", p.combinations.len()),
        ("material property set", p.materials.len()),
    ] {
        for _ in 0..n {
            ledger.add(
                "notExported",
                subject,
                "a DXF drawing holds geometry only",
                String::new(),
            );
        }
    }
    ledger.add(
        "converted",
        "section",
        "sections are carried only as layer names",
        String::new(),
    );
    let releases = p
        .members
        .iter()
        .filter(|m| {
            m.release_start.my || m.release_start.mz || m.release_end.my || m.release_end.mz
        })
        .count();
    for _ in 0..releases {
        ledger.add(
            "notExported",
            "member end release",
            "a DXF drawing holds geometry only",
            String::new(),
        );
    }
    ledger.add(
        "notExported",
        "member orientation (local axes)",
        "a DXF line has no orientation",
        String::new(),
    );
    (t, ledger)
}
