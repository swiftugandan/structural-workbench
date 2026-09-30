//! exchange-v1 against the independent corpus in
//! fixtures/exchange/exchange-oracle.json (tools/oracles/exchange_oracle.py):
//! IfcOpenShell- and ezdxf-authored files with expected SI models, and the
//! hashes of workbench exports that IfcOpenShell validated and read back.
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::path::PathBuf;
use workbench_exchange::{commit, export_as, read, review::MAPPING_FORMAT};
use workbench_model::{Load, Project};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn oracle() -> Value {
    serde_json::from_str(
        &std::fs::read_to_string(root().join("fixtures/exchange/exchange-oracle.json")).unwrap(),
    )
    .unwrap()
}

fn near(a: f64, b: f64, tol: f64, what: &str) {
    assert!(
        (a - b).abs() <= tol * a.abs().max(b.abs()).max(1.),
        "{what}: {a} vs {b}"
    );
}

fn vec3(v: &Value) -> [f64; 3] {
    [
        v[0].as_f64().unwrap(),
        v[1].as_f64().unwrap(),
        v[2].as_f64().unwrap(),
    ]
}

fn import(
    entry: &Value,
) -> (
    String,
    Result<(Project, workbench_exchange::ConversionRecord), workbench_model::Diagnostic>,
    workbench_exchange::review::ReadReport,
) {
    let file = entry["file"].as_str().unwrap();
    let text = std::fs::read_to_string(root().join("fixtures/exchange").join(file)).unwrap();
    assert_eq!(
        workbench_model::digest(text.as_bytes()),
        entry["sha256"].as_str().unwrap(),
        "{file}: fixture changed"
    );
    let format = if file.ends_with(".ifc") { "ifc" } else { "dxf" };
    let report = read(format, file, &text).unwrap();
    let mapping = json!({"format": MAPPING_FORMAT, "sourceSha256": report.source.sha256, "answers": entry.get("mapping").cloned().unwrap_or(json!({}))});
    (
        file.to_string(),
        commit(format, file, &text, &mapping),
        report,
    )
}

#[test]
fn ifc_corpus_imports_to_the_expected_si_models() {
    let o = oracle();
    let tol = o["tolerance"].as_f64().unwrap();
    for entry in o["corpus"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|e| e["file"].as_str().unwrap().ends_with(".ifc"))
    {
        let (file, result, report) = import(entry);
        let blocking: Vec<&str> = report.blocking.iter().map(|d| d.code.as_str()).collect();
        let want_blocking: Vec<&str> = entry["blocking"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert_eq!(blocking, want_blocking, "{file}: blocking");
        if !want_blocking.is_empty() {
            let refused = result.unwrap_err();
            assert_eq!(refused.code, want_blocking[0], "{file}");
            for g in entry["blockingEntities"].as_array().unwrap() {
                assert!(
                    report
                        .blocking
                        .iter()
                        .any(|d| d.entity_ids.contains(&g.as_str().unwrap().to_string())),
                    "{file}: {g}"
                );
            }
            continue;
        }
        let mut decisions: Vec<&str> = report.decisions.iter().map(|d| d.id.as_str()).collect();
        decisions.sort();
        let want: Vec<&str> = entry["decisions"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert_eq!(decisions, want, "{file}: decisions");
        let (p, record) = result.unwrap_or_else(|d| panic!("{file}: {d:?}"));
        assert_eq!(
            p.analysis_mode,
            entry["analysisMode"].as_str().unwrap(),
            "{file}"
        );
        let subjects: Vec<&str> = record.ledger.iter().map(|l| l.subject.as_str()).collect();
        for s in entry["ledgerSubjects"].as_array().unwrap() {
            assert!(
                subjects.contains(&s.as_str().unwrap()),
                "{file}: ledger lacks {s}: {subjects:?}"
            );
        }
        let nodes: BTreeMap<&str, [f64; 3]> = p
            .nodes
            .iter()
            .map(|n| (n.id.as_str(), n.position))
            .collect();
        let want_nodes = entry["nodes"].as_object().unwrap();
        assert_eq!(nodes.len(), want_nodes.len(), "{file}: node count");
        for (id, pos) in want_nodes {
            let got = nodes
                .get(id.as_str())
                .unwrap_or_else(|| panic!("{file}: node {id}"));
            for k in 0..3 {
                near(got[k], vec3(pos)[k], tol, &format!("{file} node {id}"));
            }
        }
        let supports: BTreeMap<&str, [bool; 6]> = p
            .supports
            .iter()
            .map(|s| (s.node.as_str(), s.fixed))
            .collect();
        let want_supports: BTreeMap<&str, [bool; 6]> = entry["supports"]
            .as_object()
            .unwrap()
            .iter()
            .map(|(k, v)| (k.as_str(), serde_json::from_value(v.clone()).unwrap()))
            .collect();
        assert_eq!(supports, want_supports, "{file}: supports");
        for (id, w) in entry["members"].as_object().unwrap() {
            let m = p
                .members
                .iter()
                .find(|m| &m.id == id)
                .unwrap_or_else(|| panic!("{file}: member {id}"));
            assert_eq!(
                (m.start.as_str(), m.end.as_str()),
                (w["start"].as_str().unwrap(), w["end"].as_str().unwrap()),
                "{file} {id}"
            );
            let (a, b) = (nodes[m.start.as_str()], nodes[m.end.as_str()]);
            let d: Vec<f64> = (0..3).map(|i| b[i] - a[i]).collect();
            let l = d.iter().map(|x| x * x).sum::<f64>().sqrt();
            let x: Vec<f64> = d.iter().map(|v| v / l).collect();
            let proj: f64 = (0..3).map(|i| m.local_y[i] * x[i]).sum();
            let y: Vec<f64> = (0..3).map(|i| m.local_y[i] - proj * x[i]).collect();
            let n = y.iter().map(|v| v * v).sum::<f64>().sqrt();
            for k in 0..3 {
                near(
                    y[k] / n,
                    vec3(&w["localY"])[k],
                    tol,
                    &format!("{file} {id} localY"),
                );
            }
            assert_eq!(
                [m.release_start.my, m.release_start.mz],
                [
                    w["releaseStart"][0].as_bool().unwrap(),
                    w["releaseStart"][1].as_bool().unwrap()
                ],
                "{file} {id}"
            );
            assert_eq!(
                [m.release_end.my, m.release_end.mz],
                [
                    w["releaseEnd"][0].as_bool().unwrap(),
                    w["releaseEnd"][1].as_bool().unwrap()
                ],
                "{file} {id}"
            );
            let mat = p.materials.iter().find(|x| x.id == m.material).unwrap();
            for (k, v) in [("E", mat.e), ("nu", mat.nu), ("density", mat.density)] {
                near(
                    v,
                    w["material"][k].as_f64().unwrap(),
                    tol,
                    &format!("{file} {id} {k}"),
                );
            }
            let s = p.sections.iter().find(|x| x.id == m.section).unwrap();
            for (k, v) in [
                ("A", s.a),
                ("Iy", s.iy),
                ("Iz", s.iz),
                ("J", s.j),
                ("cy", s.cy),
                ("cz", s.cz),
            ] {
                near(
                    v,
                    w["section"][k].as_f64().unwrap(),
                    tol,
                    &format!("{file} {id} {k}"),
                );
            }
        }
        let cases: BTreeMap<&str, &str> = p
            .load_cases
            .iter()
            .map(|c| (c.id.as_str(), c.category.as_str()))
            .collect();
        let want_cases: BTreeMap<&str, &str> = entry["cases"]
            .as_object()
            .unwrap()
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str().unwrap()))
            .collect();
        assert_eq!(cases, want_cases, "{file}: cases");
        for (id, w) in entry["combinations"].as_object().unwrap() {
            let c = p.combinations.iter().find(|c| &c.id == id).unwrap();
            assert_eq!(c.purpose, w["purpose"].as_str().unwrap());
            let terms: BTreeMap<&str, f64> = c
                .terms
                .iter()
                .map(|t| (t.case.as_str(), t.factor))
                .collect();
            assert_eq!(terms.len(), w["terms"].as_object().unwrap().len());
            for (case, f) in w["terms"].as_object().unwrap() {
                near(
                    terms[case.as_str()],
                    f.as_f64().unwrap(),
                    tol,
                    &format!("{file} {id} {case}"),
                );
            }
        }
        let want_loads = entry["loads"].as_array().unwrap();
        assert_eq!(p.loads.len(), want_loads.len(), "{file}: load count");
        for w in want_loads {
            let case = w["case"].as_str().unwrap();
            let found = p
                .loads
                .iter()
                .any(|l| match (l, w["type"].as_str().unwrap()) {
                    (
                        Load::SelfWeight {
                            case: c,
                            members,
                            factor,
                            ..
                        },
                        "selfWeight",
                    ) => {
                        c == case
                            && members.len() == p.members.len()
                            && (factor - w["factor"].as_f64().unwrap()).abs() < tol
                    }
                    (
                        Load::Uniform {
                            case: c,
                            member,
                            axes,
                            force_per_length,
                            ..
                        },
                        "uniform",
                    ) => {
                        c == case
                            && member == w["member"].as_str().unwrap()
                            && axes == w["axes"].as_str().unwrap()
                            && (0..3).all(|k| {
                                (force_per_length[k] - w["values"][k].as_f64().unwrap()).abs()
                                    <= tol * force_per_length[k].abs().max(1.)
                            })
                    }
                    (
                        Load::Point {
                            case: c,
                            member,
                            axes,
                            station,
                            values,
                            ..
                        },
                        "point",
                    ) => {
                        c == case
                            && member == w["member"].as_str().unwrap()
                            && axes == w["axes"].as_str().unwrap()
                            && (station - w["station"].as_f64().unwrap()).abs() < tol
                            && (0..6).all(|k| {
                                (values[k] - w["values"][k].as_f64().unwrap()).abs()
                                    <= tol * values[k].abs().max(1.)
                            })
                    }
                    (
                        Load::Nodal {
                            case: c,
                            node,
                            values,
                            ..
                        },
                        "nodal",
                    ) => {
                        c == case
                            && node == w["node"].as_str().unwrap()
                            && (0..6).all(|k| {
                                (values[k] - w["values"][k].as_f64().unwrap()).abs()
                                    <= tol * values[k].abs().max(1.)
                            })
                    }
                    _ => false,
                });
            assert!(
                found,
                "{file}: expected load {w} not found in {:#?}",
                p.loads
            );
        }
        p.validate().unwrap_or_else(|d| panic!("{file}: {d:?}"));
    }
}

#[test]
fn dxf_corpus_imports_segments_in_metres() {
    let o = oracle();
    for entry in o["corpus"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|e| e["file"].as_str().unwrap().ends_with(".dxf"))
    {
        let (file, result, report) = import(entry);
        let mut decisions: Vec<&str> = report.decisions.iter().map(|d| d.id.as_str()).collect();
        decisions.sort();
        let want: Vec<&str> = entry["decisions"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        assert_eq!(decisions, want, "{file}: decisions");
        let (p, record) = result.unwrap_or_else(|d| panic!("{file}: {d:?}"));
        let subjects: Vec<&str> = record.ledger.iter().map(|l| l.subject.as_str()).collect();
        for s in entry["ledgerSubjects"].as_array().unwrap() {
            assert!(
                subjects.contains(&s.as_str().unwrap()),
                "{file}: ledger lacks {s}: {subjects:?}"
            );
        }
        assert_eq!(
            p.supports.len() as u64,
            entry["supports"].as_u64().unwrap(),
            "{file}: supports"
        );
        let pos: BTreeMap<&str, [f64; 3]> = p
            .nodes
            .iter()
            .map(|n| (n.id.as_str(), n.position))
            .collect();
        let key = |a: [f64; 3], b: [f64; 3]| {
            let r = |v: [f64; 3]| v.map(|x| (x * 1e6).round() as i64);
            let (a, b) = (r(a), r(b));
            if a < b { (a, b) } else { (b, a) }
        };
        let mut got: Vec<_> = p
            .members
            .iter()
            .map(|m| {
                (
                    p.sections
                        .iter()
                        .find(|s| s.id == m.section)
                        .unwrap()
                        .name
                        .clone(),
                    key(pos[m.start.as_str()], pos[m.end.as_str()]),
                )
            })
            .collect();
        let mut want: Vec<_> = entry["members"]
            .as_array()
            .unwrap()
            .iter()
            .map(|m| {
                (
                    m["layer"].as_str().unwrap().to_string(),
                    key(vec3(&m["a"]), vec3(&m["b"])),
                )
            })
            .collect();
        got.sort();
        want.sort();
        assert_eq!(got, want, "{file}: members");
    }
}

#[test]
fn workbench_exports_are_the_ones_the_independent_tools_checked() {
    let o = oracle();
    for c in o["exportChecks"].as_array().unwrap() {
        let name = c["project"].as_str().unwrap();
        let p = match name {
            "UKR01" => workbench_model::residential_reference().unwrap(),
            _ => Project::parse(
                &std::fs::read_to_string(
                    root()
                        .join("fixtures/exchange")
                        .join(format!("{name}.json")),
                )
                .unwrap(),
            )
            .unwrap(),
        };
        let ifc = export_as(&p, "ifc", "1970-01-01T00:00:00").unwrap();
        assert_eq!(
            ifc.sha256,
            c["ifcSha256"].as_str().unwrap(),
            "{name}: IFC export changed since IfcOpenShell validated it; re-run tools/oracles/exchange_oracle.py"
        );
        assert!(c["ifcValidationIssues"].as_array().unwrap().is_empty());
        let dxf = export_as(&p, "dxf", "").unwrap();
        assert_eq!(
            dxf.sha256,
            c["dxfSha256"].as_str().unwrap(),
            "{name}: DXF export changed since ezdxf audited it"
        );
        assert_eq!(c["dxfAuditErrors"].as_u64(), Some(0));
    }
}

#[test]
fn a_member_without_axis_takes_the_workbench_default_and_says_so() {
    // Axis is mandatory in IFC4; files from lax writers still import.
    let o = oracle();
    let entry = o["corpus"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["file"] == "X-PORTAL-MM.ifc")
        .unwrap();
    let text = std::fs::read_to_string(root().join("fixtures/exchange/X-PORTAL-MM.ifc")).unwrap();
    let line = text
        .lines()
        .find(|l| l.contains("IFCSTRUCTURALCURVEMEMBER(") && l.contains("'C1'"))
        .unwrap();
    let cut = line.rfind(',').unwrap();
    let edited = text.replace(line, &format!("{},$);", &line[..cut]));
    let report = read("ifc", "lax.ifc", &edited).unwrap();
    let mapping = json!({"format": MAPPING_FORMAT, "sourceSha256": report.source.sha256, "answers": entry["mapping"]});
    let (p, record) = commit("ifc", "lax.ifc", &edited, &mapping).unwrap();
    assert!(
        record
            .ledger
            .iter()
            .any(|l| l.subject == "curve member without Axis")
    );
    // Every other member's y comes from its Axis in the rotated placement.
    let c1 = p.members.iter().find(|m| m.local_y == [0., 1., 0.]);
    assert!(c1.is_some(), "the default local y is global Y");
}

#[test]
fn a_connection_between_member_ends_blocks_at_read() {
    let text = std::fs::read_to_string(root().join("fixtures/exchange/X-PORTAL-MM.ifc")).unwrap();
    let id_of = |kind: &str, name: &str| {
        let line = text
            .lines()
            .find(|l| l.contains(kind) && l.contains(&format!("'{name}'")))
            .unwrap();
        line[..line.find('=').unwrap()].to_string()
    };
    let (c1, n3) = (
        id_of("IFCSTRUCTURALCURVEMEMBER(", "C1"),
        id_of("IFCSTRUCTURALPOINTCONNECTION(", "N3"),
    );
    let extra = format!(
        "#999999=IFCRELCONNECTSSTRUCTURALMEMBER('0Mid$Connection00000000',$,$,$,{c1},{n3},$,$,$,$);\nENDSEC;\nEND-ISO-10303-21;"
    );
    let edited = text.replacen("ENDSEC;\nEND-ISO-10303-21;", &extra, 1);
    let report = read("ifc", "mid.ifc", &edited).unwrap();
    assert!(
        report
            .blocking
            .iter()
            .any(|d| d.message.contains("between its ends")),
        "{:?}",
        report.blocking
    );
    let mapping =
        json!({"format": MAPPING_FORMAT, "sourceSha256": report.source.sha256, "answers": {}});
    assert_eq!(
        commit("ifc", "mid.ifc", &edited, &mapping)
            .unwrap_err()
            .code,
        "UNSUPPORTED_FEATURE"
    );
}
