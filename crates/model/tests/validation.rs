use workbench_model::Project;
fn value() -> serde_json::Value {
    serde_json::from_str(&std::fs::read_to_string("../../fixtures/models/B02.json").unwrap())
        .unwrap()
}

fn point(station: f64, member: &str, axes: &str, fz: f64) -> serde_json::Value {
    serde_json::json!({
        "id": "point1",
        "case": "LC1",
        "type": "point",
        "member": member,
        "axes": axes,
        "station": station,
        "values": [0.0, 0.0, fz, 0.0, 0.0, 0.0]
    })
}

fn mutate(id: &str, base: &serde_json::Value) -> serde_json::Value {
    let mut p = base.clone();
    match id {
        "N01" => {
            let n = p["nodes"][0].clone();
            p["nodes"].as_array_mut().unwrap().push(n);
        }
        "N02" => p["nodes"][1]["position"] = serde_json::json!([0, 0, 0]),
        "N03" => p["members"][0]["section"] = "missing".into(),
        "N04" => p["sections"][0]["A"] = (-0.01).into(),
        "N05" => p["members"][0]["localY"] = serde_json::json!([1, 0, 0]),
        "N07" => {
            p["supports"][0]["fixed"][0] = false.into();
            p["supports"][0]["prescribed"][0] = 0.001.into();
        }
        "N08" => p["loads"]
            .as_array_mut()
            .unwrap()
            .push(point(1.1, "m1", "local", -1000.)),
        "N09" => p["members"][0]["releaseStart"]["mx"] = true.into(),
        "N10" => {
            for id in ["w1", "w2"] {
                p["loads"].as_array_mut().unwrap().push(serde_json::json!({
                    "id": id,
                    "case": "LC1",
                    "type": "selfWeight",
                    "members": ["m1"],
                    "factor": 1.0
                }));
            }
        }
        "N11" => p["schemaVersion"] = "9.0.0".into(),
        "N12" => p["loads"]
            .as_array_mut()
            .unwrap()
            .push(point(0.0, "m1", "global", -1000.)),
        "N13" => p["loads"]
            .as_array_mut()
            .unwrap()
            .push(point(1.0, "m1", "global", -1000.)),
        "N14" => p["loads"]
            .as_array_mut()
            .unwrap()
            .push(point(0.5, "missing", "global", -1000.)),
        "N15" => p["loads"]
            .as_array_mut()
            .unwrap()
            .push(point(0.5, "m1", "other", -1000.)),
        "N16" => p["combinations"].as_array_mut().unwrap().push(serde_json::json!({
            "id": "C1",
            "name": "dup",
            "purpose": "analysis",
            "terms": [
                {"case": "LC1", "factor": 1.0},
                {"case": "LC1", "factor": 1.5}
            ]
        })),
        "N17" => p["combinations"].as_array_mut().unwrap().push(serde_json::json!({
            "id": "C1",
            "name": "empty",
            "purpose": "analysis",
            "terms": []
        })),
        "N18" => p["combinations"].as_array_mut().unwrap().push(serde_json::json!({
            "id": "C1",
            "name": "missing",
            "purpose": "analysis",
            "terms": [{"case": "LCx", "factor": 1.0}]
        })),
        "N19" => p["loads"].as_array_mut().unwrap().push(serde_json::json!({
            "id": "point1",
            "case": "LC1",
            "type": "point",
            "member": "m1",
            "axes": "global",
            "station": 0.5,
            "values": [0.0, 0.0, null, 0.0, 0.0, 0.0]
        })),
        "N20" => p["loads"].as_array_mut().unwrap().push(serde_json::json!({
            "id": "u1",
            "case": "LC1",
            "type": "uniform",
            "member": "m1",
            "axes": "other",
            "forcePerLength": [0.0, 0.0, -1000.0]
        })),
        "N21" => p["members"][0]["releaseStart"]["vy"] = true.into(),
        "N23" => p["members"][0]["releaseStart"]["ux"] = true.into(),
        _ => unreachable!("parse-phase case {id}"),
    }
    p
}

#[test]
fn rejects_unknown_and_negative_fields() {
    let mut p = value();
    p["sections"][0]["Iy"] = (-1.).into();
    assert_eq!(
        Project::parse(&p.to_string()).unwrap_err().code,
        "INVALID_SECTION"
    );
    p = value();
    p["inventedStiffness"] = 1.into();
    assert_eq!(
        Project::parse(&p.to_string()).unwrap_err().code,
        "INVALID_SCHEMA"
    );
}

#[test]
fn geometry_diagnostics() {
    let mut p = value();
    p["nodes"][1]["position"] = serde_json::json!([0, 0, 0]);
    assert_eq!(
        Project::parse(&p.to_string()).unwrap_err().code,
        "ZERO_LENGTH_MEMBER"
    );
    p = value();
    p["members"][0]["localY"] = serde_json::json!([1, 0, 0]);
    assert_eq!(
        Project::parse(&p.to_string()).unwrap_err().code,
        "INVALID_LOCAL_AXIS"
    );
}

#[test]
fn labels_units_revision_do_not_change_hash() {
    let p = Project::parse(&value().to_string()).unwrap();
    let h = p.hash();
    let mut q = p.clone();
    q.name = "Different".into();
    q.display_units = "SI".into();
    q.revision += 1;
    q.materials[0].name = "Renamed".into();
    assert_eq!(h, q.hash());
    q.sections[0].iy *= 2.;
    assert_ne!(h, q.hash());
}

#[test]
fn negative_seed_diagnostics() {
    let corpus: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string("../../fixtures/negative-cases.json").unwrap())
            .unwrap();
    let base = value();
    let mut checked = 0;
    for case in corpus["cases"].as_array().unwrap() {
        let phase = case.get("phase").and_then(|v| v.as_str()).unwrap_or("parse");
        if phase != "parse" {
            continue;
        }
        let id = case["id"].as_str().unwrap();
        let expected = case["expectedDiagnostic"].as_str().unwrap();
        let p = mutate(id, &base);
        assert_eq!(
            Project::parse(&p.to_string()).unwrap_err().code,
            expected,
            "{id}"
        );
        checked += 1;
    }
    // N01–N05, N07–N21, N23 (parse); N06/N22 are analyse/envelope phases
    assert_eq!(checked, 21, "unexpected parse-phase negative case count");
}
