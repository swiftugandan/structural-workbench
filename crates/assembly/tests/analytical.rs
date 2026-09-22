use serde_json::Value;
use workbench_assembly::analyse;
use workbench_model::Project;
fn fixture(id: &str) -> Project {
    Project::parse(&std::fs::read_to_string(format!("../../fixtures/models/{id}.json")).unwrap())
        .unwrap()
}
#[test]
fn analytical_b01_to_b11() {
    let corpus: Value =
        serde_json::from_str(&std::fs::read_to_string("../../fixtures/benchmarks.json").unwrap())
            .unwrap();
    let mut checks = 0;
    for b in corpus["benchmarks"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|b| b["kind"] == "analysis")
    {
        let id = b["id"].as_str().unwrap();
        let p = fixture(id);
        let r = analyse(&p, b["resultCase"].as_str().unwrap()).unwrap();
        for c in b["checks"].as_array().unwrap() {
            let selector = c["selector"].as_str().unwrap();
            let parts: Vec<_> = selector.split('.').collect();
            let actual = match parts[0] {
                "node" => {
                    let i = r.node_ids.iter().position(|n| n == parts[1]).unwrap();
                    let j = ["ux", "uy", "uz", "rx", "ry", "rz"]
                        .iter()
                        .position(|x| *x == parts[2])
                        .unwrap();
                    r.node_displacements[i * 6 + j]
                }
                "reaction" => {
                    let i = r
                        .reaction_support_ids
                        .iter()
                        .position(|n| n == parts[1])
                        .unwrap();
                    let j = ["fx", "fy", "fz", "mx", "my", "mz"]
                        .iter()
                        .position(|x| *x == parts[2])
                        .unwrap();
                    r.reactions[i * 6 + j]
                }
                "member" => {
                    let m = r.members.iter().find(|m| m.id == parts[1]).unwrap();
                    let station = parts[2]
                        .strip_prefix("station")
                        .unwrap()
                        .replace('_', ".")
                        .parse::<f64>()
                        .unwrap();
                    let s = m
                        .samples
                        .iter()
                        .find(|s| (s.station - station).abs() < 1e-12)
                        .unwrap();
                    let value = if parts[3] == "uz" {
                        s.displacement[2]
                    } else {
                        s.actions[["n", "vy", "vz", "t", "my", "mz"]
                            .iter()
                            .position(|x| *x == parts[3])
                            .unwrap()]
                    };
                    if parts.last() == Some(&"abs") {
                        value.abs()
                    } else {
                        value
                    }
                }
                _ => panic!("Unknown selector"),
            };
            let expected = c["expected"].as_f64().unwrap();
            let atol = match c["quantity"].as_str().unwrap() {
                "translation" => 1e-9,
                "rotation" => 1e-10,
                _ => 1e-3,
            };
            assert!(
                (actual - expected).abs() <= atol + 1e-6 * expected.abs(),
                "{id} {selector}: {actual} vs {expected}"
            );
            checks += 1;
        }
        assert!(r.numerical_checks["scaledResidual"].as_f64().unwrap() <= 1e-10);
    }
    assert_eq!(checks, 33);
}
#[test]
fn b07_key_stations_capture_exact_midspan_moment() {
    let p = fixture("B07");
    let r = analyse(&p, "LC1").unwrap();
    let m = r.members.iter().find(|m| m.id == "m1").unwrap();
    let peak = m
        .key_stations
        .iter()
        .filter(|s| s.kind == "extremum" && s.components.iter().any(|c| c == "My"))
        .map(|s| s.actions[4])
        .max_by(|a, b| a.abs().partial_cmp(&b.abs()).unwrap())
        .expect("My extremum key station");
    // qL²/8 = 10000 * 36 / 8 = 45000 N·m for simply supported UDL
    assert!(
        (peak.abs() - 45000.).abs() <= 1e-3,
        "exact My peak {peak}, expected ±45000"
    );
    let station = m
        .key_stations
        .iter()
        .find(|s| s.kind == "extremum" && s.components.iter().any(|c| c == "My"))
        .unwrap()
        .station;
    assert!((station - 0.5).abs() < 1e-9);
}
#[test]
fn r01_my_releases_under_udl_match_simply_supported() {
    let p = fixture("R01");
    let r = analyse(&p, "LC1").unwrap();
    let m = r.members.iter().find(|m| m.id == "m1").unwrap();
    // End moments (section My) nearly zero; midspan My ≈ qL²/8.
    let my0 = m.key_stations.iter().find(|s| s.station == 0.).unwrap().actions[4];
    let my1 = m.key_stations.iter().find(|s| (s.station - 1.).abs() < 1e-15).unwrap().actions[4];
    assert!(my0.abs() < 1e-3, "start My {my0}");
    assert!(my1.abs() < 1e-3, "end My {my1}");
    let mid = m
        .key_stations
        .iter()
        .find(|s| s.kind == "extremum")
        .unwrap()
        .actions[4];
    assert!((mid.abs() - 45000.).abs() < 1e-2, "mid My {mid}");
    // Midspan deflection matches simply-supported UDL: 5 q L^4 / (384 EI)
    let uz = m.samples.iter().find(|s| (s.station - 0.5).abs() < 1e-12).unwrap().displacement[2];
    assert!((uz + 0.010546875).abs() < 1e-8, "uz {uz}");
}
#[test]
fn p01_interior_point_matches_b05_closed_form() {
    let p = fixture("P01");
    let r = analyse(&p, "LC1").unwrap();
    // Physical inventory only — no analytical child IDs.
    assert_eq!(r.members.len(), 1);
    assert_eq!(r.node_ids, vec!["n1".to_string(), "n2".to_string()]);
    assert_eq!(&r.model_hash, &p.hash());
    let m = r.members.iter().find(|m| m.id == "m1").unwrap();
    assert!((m.length - 6.).abs() < 1e-12);
    // Midspan deflection −P L³/(48 EI) = −0.005625
    let uz = m
        .samples
        .iter()
        .find(|s| (s.station - 0.5).abs() < 1e-12)
        .unwrap()
        .displacement[2];
    assert!((uz + 0.005625).abs() < 1e-9, "uz {uz}");
    // Midspan My = P L / 4 = 30000 (continuous through the jump)
    let disc: Vec<_> = m
        .key_stations
        .iter()
        .filter(|s| s.kind == "discontinuity" && (s.station - 0.5).abs() < 1e-12)
        .collect();
    assert_eq!(disc.len(), 2);
    assert_eq!(disc[0].side.as_deref(), Some("left"));
    assert_eq!(disc[1].side.as_deref(), Some("right"));
    assert!((disc[0].actions[4].abs() - 30000.).abs() < 1e-3);
    assert!((disc[1].actions[4].abs() - 30000.).abs() < 1e-3);
    // Shear jumps across the concentrated force.
    assert!(disc[0].components.iter().any(|c| c == "Vz"));
    let jump = (disc[0].actions[2] - disc[1].actions[2]).abs();
    assert!((jump - 20000.).abs() < 1e-2, "Vz jump {jump}");
    assert!((r.reactions[2] - 10000.).abs() < 1e-3);
    assert!((r.reactions[8] - 10000.).abs() < 1e-3);
}
#[test]
fn point_station_at_end_is_invalid() {
    let mut raw: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string("../../fixtures/models/P01.json").unwrap(),
    )
    .unwrap();
    raw["loads"][0]["station"] = 0.0.into();
    assert_eq!(
        Project::parse(&raw.to_string()).unwrap_err().code,
        "INVALID_LOAD"
    );
}
#[test]
fn n06_removed_support_is_unstable_at_analyse() {
    let mut raw: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string("../../fixtures/models/B02.json").unwrap(),
    )
    .unwrap();
    // Corpus N06: remove s1 only (leave other supports if any).
    raw["supports"]
        .as_array_mut()
        .unwrap()
        .retain(|s| s["id"] != "s1");
    let p = Project::parse(&raw.to_string()).unwrap();
    assert_eq!(analyse(&p, "LC1").unwrap_err().code, "UNSTABLE_MODEL");
}
#[test]
fn n22_envelope_rejects_single_case() {
    use workbench_assembly::envelope;
    let p = fixture("B02");
    assert_eq!(
        envelope(&p, &["LC1".into()]).unwrap_err().code,
        "INVALID_LOAD"
    );
}
#[test]
fn analytical_id_collision_is_rejected() {
    let mut raw: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string("../../fixtures/models/P01.json").unwrap(),
    )
    .unwrap();
    raw["nodes"].as_array_mut().unwrap().push(serde_json::json!({
        "id": "an_m1_500000",
        "position": [1.0, 0.0, 0.0]
    }));
    let p = Project::parse(&raw.to_string()).unwrap();
    assert_eq!(analyse(&p, "LC1").unwrap_err().code, "DUPLICATE_ID");
}
#[test]
fn v01_envelope_exposes_governing_combination() {
    use workbench_assembly::envelope;
    let p = fixture("V01");
    let env = envelope(
        &p,
        &["LC1".into(), "LC2".into(), "C_uls".into()],
    )
    .unwrap();
    assert_eq!(env.analysis_type, "envelope");
    assert_eq!(env.case_or_combination_ids.len(), 3);
    assert!(
        env.diagnostics
            .iter()
            .any(|d| d["code"] == "ENVELOPE_NOT_SIMULTANEOUS")
    );
    let m = env.members.iter().find(|m| m.id == "m1").unwrap();
    let my = m.actions.iter().find(|a| a.component == "My").unwrap();
    // C_uls mid My = 1.2*45000 + 1.5*30000 = 99000 (section sign negative under −Z load)
    assert_eq!(my.min.case_or_combination_id, "C_uls");
    assert!(
        (my.min.value + 99000.).abs() < 1e-1,
        "governing My {} expected −99000",
        my.min.value
    );
    assert!((my.min.station.unwrap() - 0.5).abs() < 1e-9);
    // Midspan uz: 1.2*(-0.010546875) + 1.5*(-0.005625) = -0.02109375
    let uz = m
        .displacements
        .iter()
        .find(|d| d.component == "uz")
        .unwrap();
    assert_eq!(uz.min.case_or_combination_id, "C_uls");
    assert!(
        (uz.min.value + 0.02109375).abs() < 1e-8,
        "governing uz {}",
        uz.min.value
    );
    // Reaction Fz: LC1 qL/2=30000, LC2 P/2=10000 → C_uls 51000
    let s1 = env.supports.iter().find(|s| s.id == "s1").unwrap();
    let fz = s1.reactions.iter().find(|r| r.component == "fz").unwrap();
    assert_eq!(fz.max.case_or_combination_id, "C_uls");
    assert!((fz.max.value - 51000.).abs() < 1e-1, "fz {}", fz.max.value);
}
#[test]
fn edits_scaling_and_instability() {
    let mut p = fixture("B02");
    let a = analyse(&p, "LC1").unwrap();
    p.sections[0].iy *= 2.;
    let b = analyse(&p, "LC1").unwrap();
    assert!((a.node_displacements[8] / 2. - b.node_displacements[8]).abs() < 1e-12);
    assert!((a.reactions[4] - b.reactions[4]).abs() < 1e-8);
    p.supports.clear();
    assert_eq!(analyse(&p, "LC1").unwrap_err().code, "UNSTABLE_MODEL");
}
#[test]
fn translation_and_storage_order_invariance() {
    let mut p = fixture("B02");
    let a = analyse(&p, "LC1").unwrap();
    let h = p.hash();
    p.nodes.reverse();
    assert_eq!(h, p.hash());
    for n in &mut p.nodes {
        for x in &mut n.position {
            *x += 10000.;
        }
    }
    let b = analyse(&p, "LC1").unwrap();
    for (x, y) in a.node_displacements.iter().zip(b.node_displacements) {
        assert!((x - y).abs() < 1e-10)
    }
}
#[test]
fn load_scale_and_superposition() {
    let mut p = fixture("B02");
    let a = analyse(&p, "LC1").unwrap();
    if let workbench_model::Load::Nodal { values, .. } = &mut p.loads[0] {
        values[2] *= -2.5;
    }
    let b = analyse(&p, "LC1").unwrap();
    for (x, y) in a.node_displacements.iter().zip(b.node_displacements) {
        assert!((x * (-2.5) - y).abs() < 1e-10)
    }
}

#[test]
fn m01_global_rotation_relabelling_reordering_and_endpoint_reversal() {
    // Rodrigues rotation about unit [1,2,3], independent of production local axes.
    let axis = [1. / 14f64.sqrt(), 2. / 14f64.sqrt(), 3. / 14f64.sqrt()];
    let angle = 0.731_f64;
    let rotate = |v: [f64; 3]| {
        let dot = (0..3).map(|i| axis[i] * v[i]).sum::<f64>();
        let cross = [
            axis[1] * v[2] - axis[2] * v[1],
            axis[2] * v[0] - axis[0] * v[2],
            axis[0] * v[1] - axis[1] * v[0],
        ];
        std::array::from_fn::<_, 3, _>(|i| {
            v[i] * angle.cos() + cross[i] * angle.sin() + axis[i] * dot * (1. - angle.cos())
        })
    };
    let p = fixture("B02");
    let expected = analyse(&p, "LC1").unwrap();
    let mut rotated = p.clone();
    for n in &mut rotated.nodes {
        n.position = rotate(n.position);
    }
    for m in &mut rotated.members {
        m.local_y = rotate(m.local_y);
    }
    for l in &mut rotated.loads {
        if let workbench_model::Load::Nodal { values, .. } = l {
            let f = rotate(values[..3].try_into().unwrap());
            let m = rotate(values[3..].try_into().unwrap());
            values[..3].copy_from_slice(&f);
            values[3..].copy_from_slice(&m);
        }
    }
    let actual = analyse(&rotated, "LC1").unwrap();
    for i in 0..p.nodes.len() {
        for offset in [0, 3] {
            let want = rotate(
                expected.node_displacements[i * 6 + offset..i * 6 + offset + 3]
                    .try_into()
                    .unwrap(),
            );
            for j in 0..3 {
                assert!((want[j] - actual.node_displacements[i * 6 + offset + j]).abs() < 1e-10);
            }
        }
    }
    for m in &mut rotated.members {
        std::mem::swap(&mut m.start, &mut m.end);
    }
    let reversed = analyse(&rotated, "LC1").unwrap();
    for (a, b) in actual
        .node_displacements
        .iter()
        .zip(reversed.node_displacements)
    {
        assert!((a - b).abs() < 1e-10);
    }
    let hash = rotated.hash();
    rotated.nodes.reverse();
    rotated.members.reverse();
    rotated.supports.reverse();
    assert_eq!(hash, rotated.hash());
    for n in &mut rotated.nodes {
        let old = n.id.clone();
        n.id = format!("renamed_{}", old);
        for m in &mut rotated.members {
            if m.start == old {
                m.start = n.id.clone();
            }
            if m.end == old {
                m.end = n.id.clone();
            }
        }
        for s in &mut rotated.supports {
            if s.node == old {
                s.node = n.id.clone();
            }
        }
        for l in &mut rotated.loads {
            if let workbench_model::Load::Nodal { node, .. } = l {
                if *node == old {
                    *node = n.id.clone();
                }
            }
        }
    }
    rotated.canonicalise();
    let renamed = analyse(&rotated, "LC1").unwrap();
    for (a, b) in actual
        .node_displacements
        .iter()
        .zip(renamed.node_displacements)
    {
        assert!((a - b).abs() < 1e-10);
    }
    let mut udl = fixture("B07");
    let expected = analyse(&udl, "LC1").unwrap();
    for m in &mut udl.members {
        std::mem::swap(&mut m.start, &mut m.end);
    }
    let reversed = analyse(&udl, "LC1").unwrap();
    for (a, b) in expected
        .node_displacements
        .iter()
        .zip(reversed.node_displacements)
    {
        assert!((a - b).abs() < 1e-10);
    }
}
