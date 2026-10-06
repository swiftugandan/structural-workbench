//! Schema 1.10.0 (ADR 0031): composite beam drafts bound to a member, their
//! stage cases resolved against the model; 1.9.0 files cannot carry one.
use serde_json::{Value, json};
use workbench_model::{SCHEMA_1_9, import_project};

/// CB01 with one composite beam draft and its design object.
fn composite(c: Value) -> Value {
    let (mut p, _) = import_project(include_str!("../../../fixtures/models/CB01.json")).unwrap();
    let inputs = json!({"slabThickness":0.1905,"ribHeight":0.0762,"ribWidth":0.1524,"ribPitch":0.3048,"concreteStrength":27.579e6,
        "concreteDensity":2322.68,"studDiameter":0.01905,"studFu":448.159e6,"studLength":0.1143,"studsPerRow":1.0,"studRowSpacing":0.3048,
        "firstStudRow":0.1524,"studTransverseSpacing":0.0762,"sideLeft":3.048,"sideRight":3.048,"constructionLb":0.0,"constructionCb":1.0,"camber":0.0});
    let draft = json!({"id":"cb1","kind":"compositeBeam","targetId":"beam","inputSource":"user","inputs":inputs,"soilReference":"","composite":c});
    p.design_previews = vec![serde_json::from_value(draft).unwrap()];
    let mut structure = p.structure.clone();
    structure.sync_records(&p);
    p.structure = structure;
    serde_json::to_value(&p).unwrap()
}

fn block() -> Value {
    json!({"deck":"perpendicular","lightweight":false,"sides":["adjacent","edge"],"studsOverWeb":false,
           "constructionCaseId":"C-CON","compositeCaseId":"C-COMP","wetCaseId":"WET","liveCaseId":"LIVE",
           "liveLimit":360.0,"shrinkageStrain":0.0002,"creepJudgement":true})
}

#[test]
fn a_composite_draft_round_trips() {
    let (p, report) = import_project(&composite(block()).to_string()).unwrap();
    assert!(report.steps.is_empty());
    let c = p.design_previews[0].composite.as_ref().unwrap();
    assert_eq!(c.sides, ["adjacent".to_string(), "edge".to_string()]);
    assert_eq!(p.design_previews[0].inputs["camber"], 0.0);
    assert_eq!(p.structure.design_objects[0].name, "Composite beam");
}

#[test]
fn stage_cases_must_exist_and_inputs_are_validated() {
    let v = composite(block());
    for (pointer, bad) in [
        ("/designPreviews/0/composite/liveCaseId", json!("NOPE")),
        ("/designPreviews/0/composite/deck", json!("hollowcore")),
        (
            "/designPreviews/0/composite/sides",
            json!(["adjacent", "wall"]),
        ),
        ("/designPreviews/0/composite/liveLimit", json!(10.0)),
        ("/designPreviews/0/composite/shrinkageStrain", json!(0.01)),
        ("/designPreviews/0/inputs/studsPerRow", json!(4.0)),
        ("/designPreviews/0/inputs/ribHeight", json!(0.2)),
        ("/designPreviews/0/inputs/studLength", json!(0.2)),
        ("/designPreviews/0/inputs/camber", json!(-0.01)),
    ] {
        let mut x = v.clone();
        *x.pointer_mut(pointer).unwrap() = bad;
        assert!(
            import_project(&x.to_string()).is_err(),
            "{pointer} accepted"
        );
    }
    let mut x = v.clone();
    x["designPreviews"][0]["composite"]["shoring"] = json!(true);
    assert!(import_project(&x.to_string()).is_err());
}

#[test]
fn a_1_9_file_cannot_carry_a_composite_beam() {
    let mut v = composite(block());
    v["schemaVersion"] = json!(SCHEMA_1_9);
    assert!(
        import_project(&v.to_string())
            .unwrap_err()
            .message
            .contains("1.9.0")
    );
}
