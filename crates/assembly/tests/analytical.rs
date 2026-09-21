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
