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
