//! Model-native input resolution. Catalogue conversions and readiness are Rust-owned.
use crate::{MemberContext, PROFILE_AISC_360_22_LRFD, WSectionProps};
use serde_json::{Value, json};
use workbench_model::{Material, Member, Project, Result, Section, SteelDesign, err};

pub const CATALOGUE_ID: &str = "aisc-shapes-v16.0-subset-1";
pub const MATERIAL_ID: &str = "astm-a992-50-65-v1";
pub const BASIS: &str = "firstOrderUserEffectiveLength";
const INCH: f64 = 0.0254;
const KSI: f64 = 6.894757293168361e6;

// JSON transport can move an f64 by one ULP. This only identifies a catalogue
// binding; it never rounds demands, resistances or engineering comparisons.
fn same_properties<const N: usize>(a: [f64; N], b: [f64; N]) -> bool {
    a.into_iter()
        .zip(b)
        .all(|(x, y)| (x - y).abs() <= 4.0 * f64::EPSILON * x.abs().max(y.abs()))
}

pub fn catalogue() -> Value {
    let mut v: Value = serde_json::from_str(include_str!("../data/aisc-v16-subset.json")).unwrap();
    v["material"] = json!({"id": MATERIAL_ID, "name": "ASTM A992 · Fy 50 ksi / Fu 65 ksi", "source": "AISC v16 S2 example material inputs", "fy":50.0*KSI,"fu":65.0*KSI,"E":29000.0*KSI});
    v
}

pub fn resolve(
    section_ref: &str,
    material_ref: &str,
) -> Result<(Section, Material, WSectionProps)> {
    if material_ref != MATERIAL_ID {
        return Err(err(
            "UNSUPPORTED_FEATURE",
            "Unrecognised steel material reference",
        ));
    }
    let cat = catalogue();
    let shape = cat["shapes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| section_ref == format!("{CATALOGUE_ID}:{}", s["designation"].as_str().unwrap()))
        .ok_or_else(|| {
            err(
                "UNSUPPORTED_FEATURE",
                "Unrecognised versioned W catalogue reference",
            )
        })?;
    let n = |key: &str| shape[key].as_f64().unwrap();
    let section = Section {
        id: String::new(),
        name: shape["designation"].as_str().unwrap().into(),
        a: n("A") * INCH.powi(2),
        iy: n("Iy") * INCH.powi(4),
        iz: n("Ix") * INCH.powi(4),
        j: n("J") * INCH.powi(4),
        cy: n("d") * INCH / 2.0,
        cz: n("bf") * INCH / 2.0,
        provenance: format!("{CATALOGUE_ID}; AISC x → local z, AISC y → local y"),
    };
    let material = Material {
        id: String::new(),
        name: "ASTM A992".into(),
        e: 29000.0 * KSI,
        nu: 0.3,
        density: 7850.0,
    };
    let props = WSectionProps {
        ag: section.a,
        d: n("d") * INCH,
        tw: n("tw") * INCH,
        bf: n("bf") * INCH,
        tf: n("tf") * INCH,
        rx: n("rx") * INCH,
        ry: n("ry") * INCH,
        zx: n("Zx") * INCH.powi(3),
        zy: n("Zy") * INCH.powi(3),
        sx: n("Sx") * INCH.powi(3),
        sy: n("Sy") * INCH.powi(3),
        bf_over_2tf: n("bf/2tf"),
        h_over_tw: n("h/tw"),
        e: material.e,
    };
    Ok((section, material, props))
}

pub fn member<'a>(p: &'a Project, id: &str) -> Result<&'a Member> {
    p.members
        .iter()
        .find(|m| m.id == id)
        .ok_or_else(|| err("DANGLING_REFERENCE", "Select an existing model member"))
}

pub fn readiness(p: &Project, id: &str) -> Result<Value> {
    let m = member(p, id)?;
    let mut missing = Vec::<String>::new();
    let mut unsupported = Vec::<String>::new();
    if let Some(d) = &m.steel_design {
        match resolve(&d.section_ref, &d.material_ref) {
            Err(e) => unsupported.push(e.message),
            Ok((s, mat, _)) => {
                let live = p.sections.iter().find(|s| s.id == m.section).unwrap();
                let live_mat = p.materials.iter().find(|x| x.id == m.material).unwrap();
                if !same_properties(
                    [live.a, live.iy, live.iz, live.j, live.cy, live.cz],
                    [s.a, s.iy, s.iz, s.j, s.cy, s.cz],
                ) {
                    missing.push("Analysis section differs from its catalogue binding; assign the catalogue section again".into());
                }
                if !same_properties(
                    [live_mat.e, live_mat.nu, live_mat.density],
                    [mat.e, mat.nu, mat.density],
                ) {
                    missing.push("Analysis material differs from its design binding; assign the material again".into());
                }
            }
        }
        if d.profile_id != PROFILE_AISC_360_22_LRFD {
            unsupported.push("Profile is outside the validated AISC S2 path".into());
        }
        if d.stability_basis != BASIS {
            missing.push("Confirm first-order analysis with user effective-length factors".into());
        }
        for (name, value) in [("Ky", &d.ky), ("Kz", &d.kz), ("Lb", &d.lb), ("Cb", &d.cb)] {
            if value.value.is_none() {
                missing.push(format!("{name} is not provided"));
            }
        }
        if d.bracing == "notProvided" {
            missing.push("Bracing assumption is not provided".into());
        }
        if d.lb.value == Some(0.0) && d.bracing != "continuous" {
            missing.push("Lb = 0 requires an explicit continuous-bracing assumption".into());
        }
        if d.bracing == "continuous" && d.lb.value != Some(0.0) {
            missing.push("Continuous-bracing assumption requires Lb = 0".into());
        }
    } else {
        missing.push("Assign a recognised catalogue section and steel material".into());
    }
    Ok(
        json!({"memberId":id,"status":if !unsupported.is_empty(){"unsupported"}else if !missing.is_empty(){"incomplete"}else{"ready"},
        "missing":missing,"unsupported":unsupported,"inputs":m.steel_design,
        "stabilityBasis":"First-order analysis with user effective-length factors; second-order / direct analysis not checked",
        "axisConvention":"AISC strong x → local z (Mz, Vy); weak y → local y (My, Vz)",
        "serviceability":"notChecked"}),
    )
}

pub fn context(p: &Project, id: &str) -> Result<MemberContext> {
    let ready = readiness(p, id)?;
    if ready["status"] != "ready" {
        return Err(err("DESIGN_INPUT_INCOMPLETE", ready.to_string()));
    }
    let m = member(p, id)?;
    let d: &SteelDesign = m.steel_design.as_ref().unwrap();
    let (_, _, section) = resolve(&d.section_ref, &d.material_ref)?;
    let a = &p.nodes.iter().find(|n| n.id == m.start).unwrap().position;
    let b = &p.nodes.iter().find(|n| n.id == m.end).unwrap().position;
    let length = (0..3).map(|i| (b[i] - a[i]).powi(2)).sum::<f64>().sqrt();
    Ok(MemberContext {
        member_id: id.into(),
        fy: 50.0 * KSI,
        fu: 65.0 * KSI,
        length,
        ky: d.ky.value.unwrap(),
        kz: d.kz.value.unwrap(),
        lb: d.lb.value.unwrap(),
        cb: d.cb.value.unwrap(),
        section: Some(section),
        ..MemberContext::default()
    })
}
