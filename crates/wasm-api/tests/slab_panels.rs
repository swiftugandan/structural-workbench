//! Slab panels in the model views (ADR 0035): the Rust outline the browser
//! draws, and opt-in surface picking that never beats a node or member.
use serde_json::{Value, json};
use workbench_wasm_api::Kernel;

fn req(k: &mut Kernel, op: &str, p: Value) -> Value {
    let snap: Value = serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"snapshot","operation":"getSnapshot","expectedRevision":null,"payload":{}}).to_string())).unwrap();
    serde_json::from_str(&k.request(&json!({"protocolVersion":1,"requestId":"slab-panels","operation":op,"expectedRevision":snap["revision"],"payload":p}).to_string())).unwrap()
}
fn cmd(k: &mut Kernel, kind: &str, args: Value) -> Value {
    let r = req(
        k,
        "applyCommand",
        json!({"command":{"id":"slab-panels-command","type":kind,"args":args}}),
    );
    assert_eq!(r["status"], "ok", "{r}");
    r
}
/// B04 (one 3 m member n1 (0, 0, 0) → n2 (3, 0, 0)) with one default slab:
/// 6 × 5 m, 1 × 1 m opening at panel (2.5, 2).
fn open() -> (Kernel, Value) {
    let mut k = Kernel::new();
    let p: Value = serde_json::from_str(include_str!("../../../fixtures/models/B04.json")).unwrap();
    assert_eq!(
        req(&mut k, "createProject", json!({"project":p}))["status"],
        "ok"
    );
    let r = cmd(&mut k, "CreateDesignPreview", json!({"kind":"slab"}));
    let d = r["payload"]["project"]["designPreviews"][0].clone();
    (k, d)
}
fn plate(d: &Value, include_opening: bool, placement: Value) -> Value {
    json!({"edges":d["plate"]["edges"],"includeOpening":include_opening,"inputs":d["plate"]["inputs"],"placement":placement})
}
fn place(k: &mut Kernel, d: &Value, include_opening: bool, placement: Value) {
    cmd(
        k,
        "SetDesignPreview",
        json!({"id":d["id"],"inputs":d["inputs"],"soilReference":"","plate":plate(d, include_opening, placement)}),
    );
}
fn slabs(k: &mut Kernel) -> Value {
    let r = req(k, "queryGeometry", json!({"kind":"axes","query":{}}));
    assert_eq!(r["status"], "ok", "{r}");
    r["payload"]["slabs"].clone()
}

#[test]
fn axes_carry_the_analysed_outline_and_its_placement() {
    let (mut k, d) = open();
    let s = &slabs(&mut k)[0];
    assert_eq!(s["id"], d["id"]);
    assert_eq!(
        (
            s["length"].clone(),
            s["width"].clone(),
            s["thickness"].clone()
        ),
        (json!(6.0), json!(5.0), json!(0.225))
    );
    // The plate solve's opening: at the entered corner, not centred.
    assert_eq!(s["opening"], json!([2.5, 3.5, 2.0, 3.0]));
    assert_eq!(s["openingBasis"], "analysed");
    assert!(s["placement"].is_null() && s["corners"].is_null());

    place(&mut k, &d, true, json!([10.0, 20.0, 3.0]));
    let s = &slabs(&mut k)[0];
    assert_eq!(s["placement"], json!([10.0, 20.0, 3.0]));
    // Mid-surface corners, counter-clockwise from the panel corner.
    assert_eq!(
        s["corners"],
        json!([
            [10.0, 20.0, 3.0],
            [16.0, 20.0, 3.0],
            [16.0, 25.0, 3.0],
            [10.0, 25.0, 3.0]
        ])
    );
    assert_eq!(
        s["openingCorners"],
        json!([
            [12.5, 22.0, 3.0],
            [13.5, 22.0, 3.0],
            [13.5, 23.0, 3.0],
            [12.5, 23.0, 3.0]
        ])
    );
    assert_eq!(s["columnNodeIds"], json!([]));

    // Without the opening the plate solve has none, and nor does the drawing.
    place(&mut k, &d, false, json!([10.0, 20.0, 3.0]));
    let s = &slabs(&mut k)[0];
    assert!(s["opening"].is_null() && s["openingCorners"].is_null());

    // Clearing the placement takes the slab out of the model views.
    place(&mut k, &d, true, Value::Null);
    assert!(slabs(&mut k)[0]["corners"].is_null());
}

#[test]
fn surface_picks_are_opt_in_and_lose_to_the_frame() {
    let (mut k, d) = open();
    // Panel x −1…5, y −1…4 at z = 0: m1 runs across it at y = 0. The opening
    // is at x 1.5…2.5, y 1…2.
    place(&mut k, &d, true, json!([-1.0, -1.0, 0.0]));
    let plan =
        json!({"origin":[0,0,0],"basis":[[1,0,0],[0,1,0],[0,0,1]],"center":[0,0],"factor":10});
    let pick = |k: &mut Kernel,
                camera: &Value,
                point: [f64; 2],
                surfaces: Value,
                excluded: Value| {
        let r = req(
            k,
            "queryGeometry",
            json!({"kind":"screenPick","query":{"camera":camera,"point":point,"surfaces":surfaces,"excludedIds":excluded}}),
        );
        assert_eq!(r["status"], "ok", "{r}");
        (
            r["payload"]["entityId"].clone(),
            r["payload"]["kind"].clone(),
        )
    };
    let id = d["id"].clone();
    // Panel interior at (0.5, 3): screen (5, −30).
    assert_eq!(
        pick(&mut k, &plan, [5., -30.], json!("analytical"), json!([])),
        (id.clone(), json!("designObject"))
    );
    // Callers that do not opt in see exactly what they saw before.
    assert_eq!(
        pick(&mut k, &plan, [5., -30.], Value::Null, json!([])),
        (Value::Null, Value::Null)
    );
    // The member over the slab wins.
    assert_eq!(
        pick(&mut k, &plan, [15., 0.], json!("analytical"), json!([])),
        (json!("m1"), json!("member"))
    );
    // Through the opening there is nothing to pick.
    assert_eq!(
        pick(&mut k, &plan, [20., -15.], json!("analytical"), json!([])).0,
        Value::Null
    );
    // Outside the panel.
    assert_eq!(
        pick(&mut k, &plan, [80., -30.], json!("analytical"), json!([])).0,
        Value::Null
    );
    // A hidden slab is not pickable.
    assert_eq!(
        pick(&mut k, &plan, [5., -30.], json!("analytical"), json!([id])).0,
        Value::Null
    );
    // Edge-on, the panel has no area to click.
    let elevation =
        json!({"origin":[0,0,0],"basis":[[1,0,0],[0,0,1],[0,-1,0]],"center":[0,0],"factor":10});
    assert_eq!(
        pick(
            &mut k,
            &elevation,
            [5., 0.5],
            json!("analytical"),
            json!(["m1", "n1", "n2"])
        )
        .0,
        Value::Null
    );
    // An unplaced slab is never picked.
    place(&mut k, &d, true, Value::Null);
    assert_eq!(
        pick(&mut k, &plan, [5., -30.], json!("analytical"), json!([])).0,
        Value::Null
    );
}

#[test]
fn the_drawn_slab_bears_on_the_members_at_its_level() {
    let (mut k, d) = open();
    // At z = 3 nothing supports the panel: the soffit is the support level.
    place(&mut k, &d, true, json!([-1.0, -1.0, 3.0]));
    let s = &slabs(&mut k)[0];
    assert_eq!(s["soffit"], json!(3.0));
    assert_eq!(s["bearingMemberIds"], json!([]));
    assert_eq!(s["pressure"], json!(10e3));
    // At z = 0, m1 (local y horizontal, so its drawn half-height is
    // c_z = 0.2 m) lies in the panel: the slab rests on its top.
    place(&mut k, &d, true, json!([-1.0, -1.0, 0.0]));
    let s = &slabs(&mut k)[0];
    assert_eq!(s["soffit"], json!(0.2));
    assert_eq!(s["bearingMemberIds"], json!(["m1"]));
    // The support level, not the soffit, is what the outline reports.
    assert_eq!(s["corners"][0], json!([-1.0, -1.0, 0.0]));
}

#[test]
fn physical_picks_follow_the_drawn_slab() {
    let (mut k, d) = open();
    place(&mut k, &d, true, json!([-1.0, -1.0, 0.0]));
    // Isometric basis (right-handed, orthonormal).
    let s = 1.0 / 2f64.sqrt();
    let t = 1.0 / 6f64.sqrt();
    let u = 1.0 / 3f64.sqrt();
    let camera = json!({"origin":[0,0,0],"basis":[[s,-s,0],[t,t,2.0*t],[-u,-u,u]],"center":[0,0],"factor":10});
    let screen = |p: [f64; 3]| {
        let dot = |a: [f64; 3]| a[0] * p[0] + a[1] * p[1] + a[2] * p[2];
        [dot([s, -s, 0.]) * 10., -dot([t, t, 2. * t]) * 10.]
    };
    let pick = |k: &mut Kernel, point: [f64; 2], mode: &str| {
        let r = req(
            k,
            "queryGeometry",
            json!({"kind":"screenPick","query":{"camera":camera,"point":point,"surfaces":mode}}),
        );
        assert_eq!(r["status"], "ok", "{r}");
        r["payload"]["entityId"].clone()
    };
    // Just inside the far edge (y = 4) of the drawn top face, soffit 0.2 m
    // plus 0.225 m: on screen this lies beyond the support-level outline.
    let top = screen([0.5, 3.98, 0.425]);
    assert_eq!(pick(&mut k, top, "physical"), d["id"]);
    assert_eq!(pick(&mut k, top, "analytical"), Value::Null);
    // An unknown mode is refused, not ignored.
    let r = req(
        &mut k,
        "queryGeometry",
        json!({"kind":"screenPick","query":{"camera":camera,"point":top,"surfaces":true}}),
    );
    assert_eq!(r["status"], "error");
}
