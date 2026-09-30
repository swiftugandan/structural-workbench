//! exchange-v1 semantic round trips: project → IFC4 → project, and
//! project → DXF → project with explicit layer decisions.
use serde_json::{Value, json};
use std::path::PathBuf;
use workbench_exchange::{commit, export_as, read, review::MAPPING_FORMAT};
use workbench_model::Project;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn fixture_projects() -> Vec<(String, Project)> {
    let mut out = vec![];
    let mut paths: Vec<_> = std::fs::read_dir(root().join("fixtures/models"))
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| {
            p.extension().is_some_and(|e| e == "json")
                && !p
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with("LEGACY")
        })
        .collect();
    paths.push(root().join("fixtures/exchange/X-FRAME.json"));
    paths.sort();
    for p in paths {
        let text = std::fs::read_to_string(&p).unwrap();
        out.push((
            p.file_stem().unwrap().to_string_lossy().to_string(),
            Project::parse(&text).unwrap(),
        ));
    }
    out.push((
        "UKR01".into(),
        workbench_model::residential_reference().unwrap(),
    ));
    out
}

fn mapping(sha: &str, answers: Value) -> Value {
    json!({"format": MAPPING_FORMAT, "sourceSha256": sha, "answers": answers})
}

/// The analysis model IFC carries: design data, mass sources, spectra and
/// the physical hierarchy are outside it (and in the export ledger).
fn analysis_view(p: &Project) -> Value {
    let mut q = p.clone();
    q.design_previews.clear();
    q.mass_sources.clear();
    q.response_spectra.clear();
    for m in &mut q.members {
        m.steel_design = None;
    }
    q.canonicalise();
    // Self-weight member lists are sets.
    for l in &mut q.loads {
        if let workbench_model::Load::SelfWeight { members, .. } = l {
            members.sort();
        }
    }
    let mut v = serde_json::to_value(&q).unwrap();
    let o = v.as_object_mut().unwrap();
    for k in ["structure", "revision", "schemaVersion"] {
        o.remove(k);
    }
    let meta = o["metadata"]["entityLabels"].clone();
    o.insert("metadata".into(), json!({"entityLabels": meta}));
    // Local y is compared as the unit vector it defines.
    let nodes: std::collections::BTreeMap<String, [f64; 3]> =
        q.nodes.iter().map(|n| (n.id.clone(), n.position)).collect();
    for (k, m) in q.members.iter().enumerate() {
        let (a, b) = (nodes[&m.start], nodes[&m.end]);
        let d: Vec<f64> = (0..3).map(|i| b[i] - a[i]).collect();
        let l = d.iter().map(|x| x * x).sum::<f64>().sqrt();
        let x: Vec<f64> = d.iter().map(|v| v / l).collect();
        let proj: f64 = (0..3).map(|i| m.local_y[i] * x[i]).sum();
        let y: Vec<f64> = (0..3).map(|i| m.local_y[i] - proj * x[i]).collect();
        let n = y.iter().map(|v| v * v).sum::<f64>().sqrt();
        v["members"][k]["localY"] = json!(y.iter().map(|v| v / n).collect::<Vec<_>>());
    }
    v
}

fn same(a: &Value, b: &Value, path: &str) {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => {
            let (x, y) = (x.as_f64().unwrap(), y.as_f64().unwrap());
            assert!(
                (x - y).abs() <= 1e-12 * x.abs().max(y.abs()).max(1e-300) || (x - y).abs() < 1e-15,
                "{path}: {x} vs {y}"
            );
        }
        (Value::Object(x), Value::Object(y)) => {
            let kx: Vec<_> = x.keys().collect();
            let ky: Vec<_> = y.keys().collect();
            assert_eq!(kx, ky, "{path}: keys");
            for k in x.keys() {
                same(&x[k], &y[k], &format!("{path}.{k}"));
            }
        }
        (Value::Array(x), Value::Array(y)) => {
            assert_eq!(x.len(), y.len(), "{path}: length");
            for (k, (p, q)) in x.iter().zip(y).enumerate() {
                same(p, q, &format!("{path}[{k}]"));
            }
        }
        _ => assert_eq!(a, b, "{path}"),
    }
}

#[test]
fn ifc_round_trip_preserves_the_analysis_model() {
    for (name, p) in fixture_projects() {
        let e = export_as(&p, "ifc", "2026-01-01T00:00:00").unwrap();
        let report = read("ifc", &e.file_name, &e.text).unwrap();
        assert!(report.blocking.is_empty(), "{name}: {:?}", report.blocking);
        assert!(
            report.decisions.is_empty(),
            "{name}: own exports need no decisions: {:?}",
            report.decisions.iter().map(|d| &d.id).collect::<Vec<_>>()
        );
        let (q, record) = commit(
            "ifc",
            &e.file_name,
            &e.text,
            &mapping(&report.source.sha256, json!({})),
        )
        .unwrap();
        // Settlements apply in every case unfactored; IFC displacements are
        // factored load-case actions. The export declares the loss.
        let mut expected = p.clone();
        for s in &mut expected.supports {
            if s.prescribed.iter().any(|x| *x != 0.) {
                assert!(
                    e.ledger
                        .iter()
                        .any(|l| l.subject == "prescribed support displacement"
                            && l.examples.contains(&s.id)),
                    "{name}: settlement at {} must be in the ledger",
                    s.id
                );
                s.prescribed = [0.; 6];
            }
        }
        same(&analysis_view(&expected), &analysis_view(&q), &name);
        // Deterministic: the re-import exports byte-identical IFC.
        let again = export_as(&q, "ifc", "2026-01-01T00:00:00").unwrap();
        if again.sha256 != e.sha256 {
            if let Ok(dir) = std::env::var("EXCHANGE_DUMP") {
                std::fs::write(format!("{dir}/{name}-1.ifc"), &e.text).unwrap();
                std::fs::write(format!("{dir}/{name}-2.ifc"), &again.text).unwrap();
            }
        }
        assert_eq!(again.sha256, e.sha256, "{name}: re-export differs");
        assert_eq!(record.project_hash, q.hash());
    }
}

#[test]
fn export_ledger_names_what_ifc_cannot_carry() {
    let p = workbench_model::residential_reference().unwrap();
    let e = export_as(&p, "ifc", "2026-01-01T00:00:00").unwrap();
    let subjects: Vec<&str> = e.ledger.iter().map(|l| l.subject.as_str()).collect();
    assert!(subjects.contains(&"analysis results"));
    if !p.design_previews.is_empty() {
        assert!(subjects.contains(&"design preview"), "{subjects:?}");
    }
    // A self weight on some members only cannot be written.
    let mut x = Project::parse(
        &std::fs::read_to_string(root().join("fixtures/exchange/X-FRAME.json")).unwrap(),
    )
    .unwrap();
    if let workbench_model::Load::SelfWeight { members, .. } =
        &mut x.loads.iter_mut().find(|l| l.id() == "g-sw").unwrap()
    {
        members.truncate(3);
    }
    let e = export_as(&x, "ifc", "t").unwrap();
    assert!(
        e.ledger
            .iter()
            .any(|l| l.subject == "self weight on some members"
                && l.examples == vec!["g-sw".to_string()])
    );
}

#[test]
fn imported_guids_survive_a_round_trip() {
    let (_, p) = fixture_projects()
        .into_iter()
        .find(|x| x.0 == "X-FRAME")
        .unwrap();
    let e = export_as(&p, "ifc", "t").unwrap();
    // Strip the workbench identity so ids come from GUIDs, as for a file
    // written by another program.
    let foreign = e
        .text
        .replace("'Workbench_Identity'", "'Other_Pset'")
        .replace("'Workbench_Project'", "'Other_Project'")
        .replace("'Workbench_Section'", "'Other_Section'");
    let report = read("ifc", "foreign.ifc", &foreign).unwrap();
    let (q, _) = commit(
        "ifc",
        "foreign.ifc",
        &foreign,
        &mapping(&report.source.sha256, json!({})),
    )
    .unwrap();
    assert!(
        q.members.iter().all(|m| m.id.starts_with('g')),
        "ids from GUIDs"
    );
    let guids = |t: &str| -> std::collections::BTreeSet<String> {
        t.lines()
            .filter(|l| {
                l.contains("IFCSTRUCTURALCURVEMEMBER(")
                    || l.contains("IFCSTRUCTURALPOINTCONNECTION(")
            })
            .map(|l| l.split('\'').nth(1).unwrap().to_string())
            .collect()
    };
    let e2 = export_as(&q, "ifc", "t").unwrap();
    assert_eq!(
        guids(&foreign),
        guids(&e2.text),
        "GUIDs are preserved on re-export"
    );
    // Without the section set, extreme fibres come from the section moduli.
    for s in &q.sections {
        let o = p.sections.iter().find(|x| x.name == s.name).unwrap();
        assert!((s.cy / o.cy - 1.).abs() < 1e-12 && (s.cz / o.cz - 1.).abs() < 1e-12);
    }
}

#[test]
fn dxf_round_trip_with_explicit_layer_decisions() {
    let (_, p) = fixture_projects()
        .into_iter()
        .find(|x| x.0 == "X-FRAME")
        .unwrap();
    let e = export_as(&p, "dxf", "t").unwrap();
    let report = read("dxf", &e.file_name, &e.text).unwrap();
    let ids: Vec<&str> = report.decisions.iter().map(|d| d.id.as_str()).collect();
    assert!(ids.contains(&"nodes:tolerance") && ids.contains(&"supports"));
    assert!(!ids.contains(&"units:length"), "$INSUNITS = 6 is read");
    // Without answers the import is refused and lists what is missing.
    let refused = commit(
        "dxf",
        &e.file_name,
        &e.text,
        &mapping(&report.source.sha256, json!({})),
    )
    .unwrap_err();
    assert_eq!(refused.code, "DECISION_REQUIRED");
    let mut answers = serde_json::Map::new();
    for s in &p.sections {
        let layer: String = s
            .name
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || "-_$".contains(c) {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        let m = p
            .materials
            .iter()
            .find(|m| {
                p.members
                    .iter()
                    .any(|x| x.section == s.id && x.material == m.id)
            })
            .unwrap();
        answers.insert(
            format!("layer:{layer}"),
            json!({"choice":"values","values":{"E":m.e,"nu":m.nu,"density":m.density,"A":s.a,"Iy":s.iy,"Iz":s.iz,"J":s.j,"cy":s.cy,"cz":s.cz}}),
        );
    }
    answers.insert(
        "nodes:tolerance".into(),
        json!({"choice":"values","values":{"tolerance":1e-4}}),
    );
    answers.insert("supports".into(), json!({"choice":"fixedLowest"}));
    let (q, record) = commit(
        "dxf",
        &e.file_name,
        &e.text,
        &mapping(&report.source.sha256, Value::Object(answers)),
    )
    .unwrap();
    assert_eq!(q.members.len(), p.members.len());
    assert_eq!(q.nodes.len(), p.nodes.len());
    assert_eq!(q.supports.len(), 4);
    let mut a: Vec<_> = p
        .nodes
        .iter()
        .map(|n| n.position.map(|x| (x * 1e9).round() as i64))
        .collect();
    let mut b: Vec<_> = q
        .nodes
        .iter()
        .map(|n| n.position.map(|x| (x * 1e9).round() as i64))
        .collect();
    a.sort();
    b.sort();
    assert_eq!(a, b);
    assert!(
        record
            .ledger
            .iter()
            .any(|l| l.subject == "member orientation")
    );
    // A mapping for another file is refused.
    let wrong = commit(
        "dxf",
        &e.file_name,
        &e.text,
        &mapping(&"0".repeat(64), json!({})),
    )
    .unwrap_err();
    assert_eq!(wrong.code, "MAPPING_MISMATCH");
}

#[test]
fn refusals_name_the_reason() {
    assert_eq!(
        read("ifc", "x.ifc", "not step").unwrap_err().code,
        "INVALID_EXCHANGE_FILE"
    );
    let v2x3 = "ISO-10303-21;HEADER;FILE_SCHEMA(('IFC2X3'));ENDSEC;DATA;ENDSEC;END-ISO-10303-21;";
    let e = read("ifc", "x.ifc", v2x3).unwrap_err();
    assert_eq!(e.code, "UNSUPPORTED_FEATURE");
    assert!(e.message.contains("IFC2X3"));
    let empty = "ISO-10303-21;HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;DATA;#1=IFCPROJECT('3t3TDZl_D9NOIWB0BSjzJI',$,'p',$,$,$,$,$,$);ENDSEC;END-ISO-10303-21;";
    assert_eq!(
        read("ifc", "x.ifc", empty).unwrap_err().code,
        "NOTHING_TO_IMPORT"
    );
    assert_eq!(
        read("step", "x.stp", empty).unwrap_err().code,
        "UNSUPPORTED_FEATURE"
    );
    assert_eq!(
        read("dxf", "x.dxf", "AutoCAD Binary DXF\r\n")
            .unwrap_err()
            .code,
        "UNSUPPORTED_FEATURE"
    );
    assert_eq!(
        read(
            "dxf",
            "x.dxf",
            "  0\nSECTION\n  2\nENTITIES\n  0\nENDSEC\n  0\nEOF\n"
        )
        .unwrap_err()
        .code,
        "NOTHING_TO_IMPORT"
    );
}
