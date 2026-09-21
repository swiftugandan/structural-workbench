use workbench_model::Project;
fn value() -> serde_json::Value {
    serde_json::from_str(&std::fs::read_to_string("../../fixtures/models/B02.json").unwrap())
        .unwrap()
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
    let base = value();
    let cases = vec![
        ("N01", "DUPLICATE_ID"),
        ("N02", "ZERO_LENGTH_MEMBER"),
        ("N03", "DANGLING_REFERENCE"),
        ("N04", "INVALID_SECTION"),
        ("N05", "INVALID_LOCAL_AXIS"),
        ("N07", "INVALID_RESTRAINT"),
        ("N08", "INVALID_LOAD"),
        ("N09", "UNSUPPORTED_FEATURE"),
        ("N10", "DUPLICATE_SELF_WEIGHT"),
        ("N11", "UNSUPPORTED_SCHEMA"),
    ];
    for (id, expected) in cases {
        let mut p = base.clone();
        match id{"N01"=>{let n=p["nodes"][0].clone();p["nodes"].as_array_mut().unwrap().push(n)},"N02"=>p["nodes"][1]["position"]=serde_json::json!([0,0,0]),"N03"=>p["members"][0]["section"]="missing".into(),"N04"=>p["sections"][0]["A"]=(-0.01).into(),"N05"=>p["members"][0]["localY"]=serde_json::json!([1,0,0]),"N07"=>{p["supports"][0]["fixed"][0]=false.into();p["supports"][0]["prescribed"][0]=0.001.into()},"N08"=>p["loads"].as_array_mut().unwrap().push(serde_json::json!({"id":"point1","case":"LC1","type":"point","member":"m1","axes":"local","station":1.1,"values":[0,0,-1000,0,0,0]})),"N09"=>p["members"][0]["releaseStart"]["mx"]=true.into(),"N10"=>{for id in ["w1","w2"]{p["loads"].as_array_mut().unwrap().push(serde_json::json!({"id":id,"case":"LC1","type":"selfWeight","members":["m1"],"factor":1.0}))}},"N11"=>p["schemaVersion"]="9.0.0".into(),_=>unreachable!()};
        assert_eq!(
            Project::parse(&p.to_string()).unwrap_err().code,
            expected,
            "{id}"
        )
    }
}
