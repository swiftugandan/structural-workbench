//! Workflow previews. Missing numerical/code resources never produce a PASS.
use serde_json::{Value, json};
use workbench_design::rc_column;
use workbench_design::rc_section::{
    self, BarLayer, BarRow, ConcreteLaw, ElasticInputs, RcRectangle, SteelLaw,
};
use workbench_design::{
    CodeProfile, DesignDemand, DesignRun, Ec2UkNaProfile, MemberContext, ProfileApplicability,
    RcBarRow, RcBeamContext, RcFace, RcLinks,
};
use workbench_model::{
    DesignPreview, MECHANICS_COMMON_KEYS, Project, Result, SectionMechanicsInputs, SlabPlateInputs,
    digest, err,
};
use workbench_results::KeyStation;

fn fields(kind: &str) -> Vec<(&'static str, &'static str, f64, &'static str, f64)> {
    let mut f = match kind {
        "rcBeam" => vec![
            ("width", "Width", 0.3, "mm", 1000.),
            ("depth", "Depth", 0.6, "mm", 1000.),
            ("cover", "Cover", 0.035, "mm", 1000.),
            ("topBarDiameter", "Top bar diameter", 0.02, "mm", 1000.),
            ("topBarCount", "Top bars", 4., "", 1.),
            (
                "bottomBarDiameter",
                "Bottom bar diameter",
                0.02,
                "mm",
                1000.,
            ),
            ("bottomBarCount", "Bottom bars", 4., "", 1.),
            ("linkDiameter", "Link diameter", 0.01, "mm", 1000.),
            ("linkSpacing", "Link spacing", 0.2, "mm", 1000.),
            ("linkLegs", "Link legs", 2., "", 1.),
        ],
        // Width along the member's local y, depth along local z (ADR 0022).
        "rcColumn" => vec![
            ("width", "Width (local y)", 0.4, "mm", 1000.),
            ("depth", "Depth (local z)", 0.4, "mm", 1000.),
            ("cover", "Cover", 0.035, "mm", 1000.),
            ("barDiameter", "Bar diameter", 0.025, "mm", 1000.),
            ("barsAlongWidth", "Bars along width (per face)", 3., "", 1.),
            ("barsAlongDepth", "Bars along depth (per face)", 3., "", 1.),
            ("linkDiameter", "Link diameter", 0.01, "mm", 1000.),
        ],
        "slab" => vec![
            ("length", "Length X", 6., "m", 1.),
            ("width", "Length Y", 5., "m", 1.),
            ("thickness", "Thickness", 0.225, "mm", 1000.),
            ("cover", "Nominal cover", 0.03, "mm", 1000.),
            ("meshSize", "Target mesh size", 0.4, "mm", 1000.),
            ("openingWidth", "Opening Y", 1., "m", 1.),
            ("openingLength", "Opening X", 1., "m", 1.),
        ],
        "padFooting" => vec![
            ("length", "Length X", 2.4, "m", 1.),
            ("width", "Length Y", 2.1, "m", 1.),
            ("thickness", "Thickness", 0.55, "mm", 1000.),
            ("cover", "Cover", 0.05, "mm", 1000.),
            ("columnWidth", "Column X", 0.4, "mm", 1000.),
            ("columnDepth", "Column Y", 0.4, "mm", 1000.),
            (
                "bearingPressure",
                "Allowable bearing input",
                200000.,
                "kPa",
                0.001,
            ),
            ("embedment", "Foundation depth", 1.2, "m", 1.),
            ("soilUnitWeight", "Soil unit weight", 18000., "N/m³", 1.),
        ],
        _ => vec![],
    };
    f.extend([
        (
            "concreteStrength",
            "Concrete strength input",
            30e6,
            "MPa",
            1e-6,
        ),
        (
            "rebarStrength",
            "Reinforcement strength input",
            500e6,
            "MPa",
            1e-6,
        ),
    ]);
    f
}
/// (key, label, synthetic default, unit, display scale, law or "all"). Defaults are the
/// RC-SR-BLOCK oracle fixture values, never code coefficients (ADR 0012).
type MechanicsField = (
    &'static str,
    &'static str,
    f64,
    &'static str,
    f64,
    &'static str,
);
const MECHANICS_FIELDS: &[MechanicsField] = &[
    (
        "blockIntensity",
        "Stress-block intensity",
        20e6,
        "MPa",
        1e-6,
        "rectangularBlock",
    ),
    (
        "blockDepthRatio",
        "Stress-block depth ratio λ",
        0.75,
        "",
        1.,
        "rectangularBlock",
    ),
    (
        "parabolaPeak",
        "Peak concrete stress",
        20e6,
        "MPa",
        1e-6,
        "parabolaRectangle",
    ),
    (
        "strainAtPeak",
        "Strain at peak stress",
        0.002,
        "",
        1.,
        "parabolaRectangle",
    ),
    (
        "parabolaExponent",
        "Parabola exponent n",
        2.,
        "",
        1.,
        "parabolaRectangle",
    ),
    (
        "ultimateStrain",
        "Ultimate concrete strain",
        0.003,
        "",
        1.,
        "all",
    ),
    (
        "steelYieldStrength",
        "Steel yield strength (mechanics)",
        460e6,
        "MPa",
        1e-6,
        "all",
    ),
    ("steelModulus", "Steel modulus", 200e9, "GPa", 1e-9, "all"),
    (
        "concreteModulus",
        "Concrete modulus",
        30e9,
        "GPa",
        1e-9,
        "all",
    ),
    (
        "concreteTensileStrength",
        "Concrete tensile strength",
        2.8e6,
        "MPa",
        1e-6,
        "all",
    ),
    (
        "minimumClearSpacing",
        "Minimum clear bar spacing",
        0.025,
        "mm",
        1000.,
        "all",
    ),
    // Column drafts only (pivot C of the strain domain, ADR 0022).
    (
        "fullCompressionStrain",
        "Full-compression strain (pivot C)",
        0.002,
        "",
        1.,
        "rcColumn",
    ),
];
const MECHANICS_LAWS: &[(&str, &str)] = &[
    ("rectangularBlock", "Rectangular stress block"),
    ("parabolaRectangle", "Parabola-rectangle"),
];
fn mechanics_default(kind: &str, law: &str, key: &str) -> Option<f64> {
    MECHANICS_FIELDS
        .iter()
        .find(|f| f.0 == key && (f.5 == "all" || f.5 == law || f.5 == kind))
        .map(|f| f.2)
}
fn mechanics_keys(kind: &str, law: &str) -> Result<Vec<&'static str>> {
    SectionMechanicsInputs::keys(kind, law)
        .ok_or_else(|| err("INVALID_SCHEMA", "Unknown section-mechanics law"))
}
fn default_mechanics(kind: &str) -> SectionMechanicsInputs {
    let law = "rectangularBlock";
    let keys = mechanics_keys(kind, law).unwrap();
    SectionMechanicsInputs {
        law: law.into(),
        inputs: keys
            .iter()
            .map(|k| (k.to_string(), mechanics_default(kind, law, k).unwrap()))
            .collect(),
        input_sources: keys
            .iter()
            .map(|k| (k.to_string(), "syntheticFixture".to_string()))
            .collect(),
    }
}
/// Parse edited mechanics inputs; provenance is `user` only where the value
/// differs from the previously stored value (or the synthetic default for a
/// newly introduced key).
fn edit_mechanics(
    kind: &str,
    old: Option<&SectionMechanicsInputs>,
    args: &Value,
) -> Result<SectionMechanicsInputs> {
    let law = args["law"]
        .as_str()
        .ok_or_else(|| err("INVALID_SCHEMA", "Section-mechanics law is required"))?;
    let keys = mechanics_keys(kind, law)?;
    let mut inputs = std::collections::BTreeMap::new();
    let mut sources = std::collections::BTreeMap::new();
    for key in keys {
        let unit = MECHANICS_FIELDS.iter().find(|f| f.0 == key).unwrap().3;
        let mut v = args["inputs"][key].clone();
        super::quantity(
            &mut v,
            match unit {
                "MPa" | "GPa" => "stress",
                "" => "dimensionless",
                _ => "length",
            },
        )?;
        let value = v.as_f64().ok_or_else(|| {
            err(
                "INVALID_SCHEMA",
                format!("Section-mechanics input {key} must be numeric"),
            )
        })?;
        let previous = old.and_then(|m| {
            m.inputs
                .get(key)
                .map(|v| (*v, m.input_sources[key].clone()))
        });
        let source = match previous {
            Some((p, s)) if p == value => s,
            Some(_) => "user".into(),
            None if mechanics_default(kind, law, key) == Some(value) => "syntheticFixture".into(),
            None => "user".into(),
        };
        inputs.insert(key.to_string(), value);
        sources.insert(key.to_string(), source);
    }
    let m = SectionMechanicsInputs {
        law: law.into(),
        inputs,
        input_sources: sources,
    };
    m.validate(kind)?;
    Ok(m)
}
/// (key, label, synthetic default, unit, display scale). The defaults are
/// the P-OPEN-OS oracle panel's load and material, never code values.
type PlateField = (&'static str, &'static str, f64, &'static str, f64);
const PLATE_FIELDS: &[PlateField] = &[
    ("pressure", "Uniform pressure (down)", 10e3, "kPa", 1e-3),
    ("elasticModulus", "Elastic modulus", 30e9, "GPa", 1e-9),
    ("poissonRatio", "Poisson's ratio ν", 0.2, "", 1.),
    ("openingX", "Opening corner X", 2.5, "m", 1.),
    ("openingY", "Opening corner Y", 2., "m", 1.),
];
const PLATE_EDGE_LABELS: [&str; 4] = ["Edge x = 0", "Edge x = Lx", "Edge y = 0", "Edge y = Ly"];
fn default_plate() -> SlabPlateInputs {
    let mut input_sources: std::collections::BTreeMap<String, String> = PLATE_FIELDS
        .iter()
        .map(|f| (f.0.to_string(), "syntheticFixture".to_string()))
        .collect();
    for k in ["edges", "includeOpening"] {
        input_sources.insert(k.into(), "syntheticFixture".into());
    }
    SlabPlateInputs {
        edges: std::array::from_fn(|_| "simple".to_string()),
        include_opening: true,
        inputs: PLATE_FIELDS
            .iter()
            .map(|f| (f.0.to_string(), f.2))
            .collect(),
        input_sources,
    }
}
/// Parse edited plate inputs; provenance becomes `user` only where a value
/// differs from the stored one (or, when none is stored, from the default).
fn edit_plate(old: Option<&SlabPlateInputs>, args: &Value) -> Result<SlabPlateInputs> {
    let base = old.cloned().unwrap_or_else(default_plate);
    let mut next = base.clone();
    for &(key, _, _, unit, _) in PLATE_FIELDS {
        let mut v = args["inputs"][key].clone();
        super::quantity(
            &mut v,
            match unit {
                "kPa" | "GPa" => "stress",
                "" => "dimensionless",
                _ => "length",
            },
        )?;
        let value = v.as_f64().ok_or_else(|| {
            err(
                "INVALID_SCHEMA",
                format!("Plate input {key} must be numeric"),
            )
        })?;
        if value != base.inputs[key] {
            next.inputs.insert(key.into(), value);
            next.input_sources.insert(key.into(), "user".into());
        }
    }
    let edges: [String; 4] = serde_json::from_value(args["edges"].clone()).map_err(|_| {
        err(
            "INVALID_SCHEMA",
            "Plate edges must list four edge conditions",
        )
    })?;
    if edges != base.edges {
        next.edges = edges;
        next.input_sources.insert("edges".into(), "user".into());
    }
    let include = args["includeOpening"]
        .as_bool()
        .ok_or_else(|| err("INVALID_SCHEMA", "includeOpening must be true or false"))?;
    if include != base.include_opening {
        next.include_opening = include;
        next.input_sources
            .insert("includeOpening".into(), "user".into());
    }
    next.validate()?;
    Ok(next)
}
pub fn templates() -> Value {
    json!([("rcBeam","RC beam"),("rcColumn","RC column"),("slab","Slab"),("padFooting","Pad footing")].iter().map(|(kind,name)|{
        let mut t = json!({"kind":kind,"name":name,"mock":true,"fields":fields(kind).into_iter().map(|(key,label,value,unit,scale)|json!({"key":key,"label":label,"defaultValue":value,"unit":unit,"displayScale":scale})).collect::<Vec<_>>()});
        if *kind == "slab" {
            t["plate"] = json!({
                "fields": PLATE_FIELDS.iter().map(|(key,label,value,unit,scale)|json!({"key":key,"label":label,"defaultValue":value,"unit":unit,"displayScale":scale})).collect::<Vec<_>>(),
                "edgeLabels": PLATE_EDGE_LABELS,
                "edgeConditions": workbench_model::SLAB_EDGE_CONDITIONS,
                "defaultEdges": ["simple", "simple", "simple", "simple"],
                "defaultIncludeOpening": true,
            });
        }
        if ["rcBeam", "rcColumn"].contains(kind) {
            // Kind-only fields are listed for every law of that kind.
            t["mechanics"] = json!({
                "laws": MECHANICS_LAWS.iter().map(|(id,label)|json!({"id":id,"label":label})).collect::<Vec<_>>(),
                "defaultLaw": "rectangularBlock",
                "fields": MECHANICS_FIELDS.iter().filter(|f| !["rcBeam","rcColumn"].contains(&f.5) || f.5 == *kind)
                    .map(|(key,label,value,unit,scale,law)|json!({"key":key,"label":label,"defaultValue":value,"unit":unit,"displayScale":scale,"law":if law == kind {"all"} else {law}})).collect::<Vec<_>>(),
            });
        }
        t
    }).collect::<Vec<_>>())
}
pub fn apply(v: &mut Value, c: &Value) -> Result<()> {
    if v.get("designPreviews").is_none() {
        v["designPreviews"] = json!([]);
    }
    let a = &c["args"];
    if c["type"] == "CreateDesignPreview" {
        let kind = a["kind"].as_str().unwrap_or("");
        if !["rcBeam", "rcColumn", "slab", "padFooting"].contains(&kind) {
            return Err(err("INVALID_SCHEMA", "Unknown preview kind"));
        }
        let id = format!(
            "dp{}",
            &digest(format!("{}:{}", c["id"], v["revision"]).as_bytes())[..16]
        );
        let draft = DesignPreview {
            id,
            kind: kind.into(),
            target_id: a["targetId"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(String::from),
            input_source: "syntheticFixture".into(),
            input_sources: fields(kind)
                .iter()
                .map(|(k, _, _, _, _)| (k.to_string(), "syntheticFixture".to_string()))
                .collect(),
            inputs: fields(kind)
                .iter()
                .map(|(k, _, v, _, _)| (k.to_string(), *v))
                .collect(),
            soil_reference:
                "Synthetic starter input; replace with a referenced geotechnical report".into(),
            mechanics: ["rcBeam", "rcColumn"]
                .contains(&kind)
                .then(|| default_mechanics(kind)),
            // Never defaulted: only the user can confirm anchorage (ADR 0016).
            tension_anchorage_confirmed: None,
            plate: (kind == "slab").then(default_plate),
        };
        v["designPreviews"]
            .as_array_mut()
            .unwrap()
            .push(serde_json::to_value(draft).unwrap());
    } else {
        let id = a["id"].as_str().unwrap_or("");
        let index = v["designPreviews"]
            .as_array()
            .unwrap()
            .iter()
            .position(|d| d["id"] == id)
            .ok_or_else(|| err("DANGLING_REFERENCE", "Unknown design preview"))?;
        if c["type"] == "DeleteDesignPreview" {
            v["designPreviews"].as_array_mut().unwrap().remove(index);
            return Ok(());
        }
        let kind = v["designPreviews"][index]["kind"]
            .as_str()
            .unwrap()
            .to_string();
        let mut inputs = a["inputs"].clone();
        for (key, _, _, unit, _) in fields(&kind) {
            if key == "soilUnitWeight" {
                let n = inputs[key]
                    .as_f64()
                    .or_else(|| inputs[key].as_str().and_then(|s| s.parse().ok()))
                    .ok_or_else(|| {
                        err("INVALID_SCHEMA", "Soil unit weight must be numeric in N/m³")
                    })?;
                inputs[key] = json!(n);
            } else {
                super::quantity(
                    &mut inputs[key],
                    match unit {
                        "MPa" | "kPa" => "stress",
                        "" => "dimensionless",
                        _ => "length",
                    },
                )?;
            }
        }
        let old = &v["designPreviews"][index];
        let sources: serde_json::Map<String, Value> = fields(&kind)
            .iter()
            .map(|(key, _, _, _, _)| {
                // Numeric comparison: an untouched `3` equals a stored `3.0`.
                let source = if inputs[*key].as_f64() != old["inputs"][*key].as_f64() {
                    "user"
                } else {
                    old["inputSources"][*key]
                        .as_str()
                        .unwrap_or(old["inputSource"].as_str().unwrap_or("syntheticFixture"))
                };
                (key.to_string(), json!(source))
            })
            .collect();
        let all_user = sources.values().all(|s| s == "user");
        let all_mock = sources.values().all(|s| s == "syntheticFixture");
        v["designPreviews"][index]["inputSources"] = json!(sources);
        v["designPreviews"][index]["inputs"] = inputs;
        v["designPreviews"][index]["inputSource"] = json!(if all_user {
            "user"
        } else if all_mock {
            "syntheticFixture"
        } else {
            "mixed"
        });
        let sectional = ["rcBeam", "rcColumn"].contains(&kind.as_str());
        if sectional && !a["mechanics"].is_null() {
            let old: Option<SectionMechanicsInputs> =
                serde_json::from_value(v["designPreviews"][index]["mechanics"].clone()).ok();
            v["designPreviews"][index]["mechanics"] =
                serde_json::to_value(edit_mechanics(&kind, old.as_ref(), &a["mechanics"])?)
                    .unwrap();
        } else if !sectional && !a["mechanics"].is_null() {
            return Err(err(
                "INVALID_SCHEMA",
                "Section mechanics apply only to RC beam and column drafts",
            ));
        }
        if kind == "slab" && !a["plate"].is_null() {
            let old: Option<SlabPlateInputs> =
                serde_json::from_value(v["designPreviews"][index]["plate"].clone()).ok();
            v["designPreviews"][index]["plate"] =
                serde_json::to_value(edit_plate(old.as_ref(), &a["plate"])?).unwrap();
        } else if kind != "slab" && !a["plate"].is_null() {
            return Err(err(
                "INVALID_SCHEMA",
                "Plate analysis inputs apply only to slab drafts",
            ));
        }
        // Only an explicit `true` records the user's anchorage confirmation;
        // anything else leaves it unconfirmed (ADR 0016).
        match (kind.as_str(), a["tensionAnchorageConfirmed"].as_bool()) {
            ("rcBeam", Some(true)) => {
                v["designPreviews"][index]["tensionAnchorageConfirmed"] = json!(true);
            }
            (_, Some(true)) => {
                return Err(err(
                    "INVALID_SCHEMA",
                    "Tension anchorage confirmation applies only to RC beam drafts",
                ));
            }
            _ => {
                v["designPreviews"][index]
                    .as_object_mut()
                    .unwrap()
                    .remove("tensionAnchorageConfirmed");
            }
        }
        v["designPreviews"][index]["soilReference"] =
            json!(a["soilReference"].as_str().unwrap_or(""));
        if let Some(id) = a["targetId"].as_str().filter(|s| !s.is_empty()) {
            v["designPreviews"][index]["targetId"] = json!(id);
        } else {
            v["designPreviews"][index]
                .as_object_mut()
                .unwrap()
                .remove("targetId");
        }
    }
    Ok(())
}
/// The explicit concrete and steel laws recorded on a draft (ADR 0012).
fn mechanics_laws(m: &SectionMechanicsInputs) -> (ConcreteLaw, SteelLaw) {
    let mi = &m.inputs;
    let steel = SteelLaw {
        yield_strength: mi["steelYieldStrength"],
        modulus: mi["steelModulus"],
    };
    let law = if m.law == "rectangularBlock" {
        ConcreteLaw::RectangularBlock {
            intensity: mi["blockIntensity"],
            depth_ratio: mi["blockDepthRatio"],
            ultimate_strain: mi["ultimateStrain"],
        }
    } else {
        ConcreteLaw::ParabolaRectangle {
            peak: mi["parabolaPeak"],
            strain_at_peak: mi["strainAtPeak"],
            ultimate_strain: mi["ultimateStrain"],
            exponent: mi["parabolaExponent"],
        }
    };
    (law, steel)
}

/// Perimeter bars of an rcColumn draft: `barsAlongWidth` on each ±z face,
/// `barsAlongDepth` on each ±y face (corners shared), centres inset by
/// cover + link + half a bar. Origin at the section centre.
fn column_bars(v: &std::collections::BTreeMap<String, f64>) -> Vec<rc_column::ColumnBar> {
    let dia = v["barDiameter"];
    let inset = v["cover"] + v["linkDiameter"] + dia / 2.;
    let (a, c) = (v["width"] / 2. - inset, v["depth"] / 2. - inset);
    let (nw, nd) = (v["barsAlongWidth"] as usize, v["barsAlongDepth"] as usize);
    let area = std::f64::consts::PI * dia * dia / 4.;
    let at = |k: usize, n: usize, half: f64| -half + 2. * half * k as f64 / (n - 1) as f64;
    let mut bars = vec![];
    for z in [-c, c] {
        for k in 0..nw {
            bars.push(rc_column::ColumnBar {
                y: at(k, nw, a),
                z,
                area,
            });
        }
    }
    for y in [-a, a] {
        for k in 1..nd - 1 {
            bars.push(rc_column::ColumnBar {
                y,
                z: at(k, nd, c),
                area,
            });
        }
    }
    bars
}

/// Biaxial section mechanics of an rcColumn draft (ADR 0022): the axial
/// range, M_Rd(N_Ed, θ_Ed) and a mechanics utilisation at every key station
/// of the bound member (model mode), and the resistance contour at the
/// governing axial force. Never a code resistance or a check status.
fn column_mechanics(d: &DesignPreview, stations: Option<&[KeyStation]>) -> Value {
    let Some(m) = &d.mechanics else {
        return json!({"status":"notConfigured","reason":"No explicit section-mechanics material law is recorded for this draft"});
    };
    let (concrete, steel) = mechanics_laws(m);
    let section = rc_column::ColumnSection {
        width: d.inputs["width"],
        depth: d.inputs["depth"],
        bars: column_bars(&d.inputs),
    };
    let column = match rc_column::Column::new(rc_column::ColumnInputs {
        section: section.clone(),
        concrete,
        steel,
        limits: rc_column::StrainLimits {
            full_compression_strain: m.inputs["fullCompressionStrain"],
            steel_strain_limit: None,
        },
    }) {
        Ok(c) => c,
        Err(e) => return json!({"status":"unsupported","code":e.code,"reason":e.message}),
    };
    let range = column.axial_range();
    let mut rows = vec![];
    let mut governing: Option<(usize, f64)> = None;
    let mut beyond = false;
    for (i, st) in stations.unwrap_or(&[]).iter().enumerate() {
        // Frame N is tension positive; the section works compression positive.
        let (n_ed, my_ed, mz_ed) = (-st.actions[0], st.actions[4], st.actions[5]);
        let base = json!({"station":st.station,"kind":st.kind,"side":st.side,"actions":st.actions,"nEd":n_ed,"myEd":my_ed,"mzEd":mz_ed,"mEd":my_ed.hypot(mz_ed)});
        let row = match column.check(n_ed, my_ed, mz_ed) {
            Ok(c) => match c.utilisation.filter(|u| u.is_finite()) {
                Some(u) => {
                    if governing.is_none_or(|(_, g)| u > g) {
                        governing = Some((i, u));
                    }
                    merge(
                        base,
                        json!({"status":"evaluated","utilisation":u,"axialRatio":c.axial_ratio,"capacity":c.capacity}),
                    )
                }
                None => {
                    beyond = true;
                    merge(
                        base,
                        json!({"status":"beyondAxialRange","utilisation":null,"axialRatio":c.axial_ratio}),
                    )
                }
            },
            Err(e) => merge(
                base,
                json!({"status":"refused","utilisation":null,"code":e.code,"reason":e.message}),
            ),
        };
        rows.push(row);
    }
    // The contour is drawn at the governing station's N_Ed, or at N = 0
    // without model actions.
    let n_contour = governing.map_or(0., |(i, _)| rows[i]["nEd"].as_f64().unwrap());
    let contour = column.interaction_contour(n_contour, 72).map_or_else(
        |e| json!({"status":"unavailable","code":e.code,"reason":e.message}),
        |pts| json!({"status":"evaluated","nEd":n_contour,"points":pts.iter().map(|r| [r.my, r.mz]).collect::<Vec<_>>()}),
    );
    json!({
        "status": "evaluated",
        "basis": "mechanics",
        "codeProfile": null,
        "kernel": "workbench-design::rc_column",
        "formulation": "docs/formulations/rc-column.md",
        "section": {"width":section.width,"depth":section.depth,"bars":section.bars,"barCount":section.bars.len(),
            "steelArea":section.bars.iter().map(|b| b.area).sum::<f64>()},
        "law": m.law,
        "materialInputs": m.inputs,
        "materialSources": m.input_sources,
        "axialRange": range,
        "convention": "N compression positive (N = −N_frame); frame My and Mz unchanged: My < 0 compresses the +z face, Mz > 0 the +y face; θ = atan2(Mz, My)",
        "demand": if stations.is_some() {json!({"status":"evaluated","basis":"modelKeyStations"})} else {json!({"status":"unavailable","reason":"Station actions need a bound member and the current model case/combination"})},
        "stations": rows,
        "governing": governing.map(|(i, u)| json!({"index":i,"station":rows[i]["station"],"utilisation":u,"nEd":rows[i]["nEd"],"mEd":rows[i]["mEd"],"mRd":rows[i]["capacity"]["mRd"]})),
        "beyondAxialRange": beyond,
        "contour": contour,
        "limitations": ["Checked at the member's key stations (ends, component extrema, discontinuities) only","No slenderness, second-order moments, minimum eccentricity, partial factors or detailing"],
    })
}
/// Code-agnostic section mechanics for an rcBeam draft (ADR 0012). Each face
/// has one row of its own bars; `cover` is taken to the link. Sagging puts
/// the top face in compression, hogging the bottom. When `demand` is an
/// evaluated model demand (ADR 0014), each state's governing moment is its
/// cracked-section service moment. Results are mechanics only and never feed
/// a check status.
fn section_mechanics(d: &DesignPreview, demand: &Value) -> Value {
    let Some(m) = &d.mechanics else {
        return json!({"status":"notConfigured","reason":"No explicit section-mechanics material law is recorded for this draft"});
    };
    let v = &d.inputs;
    let mi = &m.inputs;
    let row = |face: &str| BarRow {
        width: v["width"],
        side_cover: v["cover"],
        link_diameter: v["linkDiameter"],
        bar_diameter: v[&format!("{face}BarDiameter")],
        count: v[&format!("{face}BarCount")] as u32,
        minimum_clear_spacing: mi["minimumClearSpacing"],
    };
    let base = json!({"basis":"mechanics","codeProfile":null,"law":m.law,"inputs":mi,"inputSources":m.input_sources,
        "arrangement":"One row per face (top and bottom bar inputs); cover measured to the link; layer depths from the compression face",
        "limitations":["Mechanics only — not a code resistance; no partial factors or code limits applied","Pure flexure (N = 0) about the width axis; concrete tension ignored at ultimate and in the cracked state","Material-law parameters are explicit inputs with recorded provenance","Service stresses use the cracked transformed section under the governing model moment of the one bound case/combination, which is not classified as a serviceability combination; no stress limits applied"]});
    let (top, bottom) = match (
        rc_section::row_fit(&row("top")),
        rc_section::row_fit(&row("bottom")),
    ) {
        (Ok(t), Ok(b)) => (t, b),
        (Err(e), _) | (_, Err(e)) => {
            return merge(base, json!({"status":"unsupported","reason":e.message}));
        }
    };
    let fits = json!({"top":top,"bottom":bottom});
    if !(top.fits && bottom.fits) {
        let faces: Vec<&str> = [("top", top.fits), ("bottom", bottom.fits)]
            .iter()
            .filter(|(_, ok)| !ok)
            .map(|(f, _)| *f)
            .collect();
        return merge(
            base,
            json!({"status":"rowDoesNotFit","rowFits":fits,"reason":format!("The {} bar row does not fit the width with the stated clear spacing; ultimate state not evaluated", faces.join(" and "))}),
        );
    }
    let section = RcRectangle {
        width: v["width"],
        depth: v["depth"],
    };
    let (law, steel) = mechanics_laws(m);
    // Layers are ordered [compression-face row, opposite row] with depths from
    // the compression face.
    let state = |name: &str,
                 compression: &str,
                 near: &rc_section::RowFit,
                 far: &rc_section::RowFit|
     -> Value {
        let governing = &demand[name];
        let elastic_inputs = ElasticInputs {
            concrete_modulus: mi["concreteModulus"],
            tensile_strength: Some(mi["concreteTensileStrength"]),
            service_moment: governing["moment"].as_f64(),
        };
        let layers = [
            BarLayer {
                depth: near.depth_from_face,
                area: near.area,
            },
            BarLayer {
                depth: v["depth"] - far.depth_from_face,
                area: far.area,
            },
        ];
        match (
            rc_section::ultimate(&section, &layers, &steel, &law),
            rc_section::elastic(&section, &layers, &steel, &elastic_inputs),
        ) {
            (Ok(u), Ok(e)) => {
                let service = governing["moment"].as_f64().map_or(Value::Null, |m| {
                    json!({"moment":m,"combinationId":demand["combinationId"],"station":governing["station"],"side":governing["side"],
                        "stressBasis":"crackedSection","belowCrackingMoment":e.cracking_moment.map(|mcr| m < mcr)})
                });
                json!({"status":"evaluated","compressionFace":compression,"layers":layers,"ultimate":u,"elastic":e,"serviceMoment":service})
            }
            (Err(e), _) | (_, Err(e)) => {
                json!({"status":"unsupported","compressionFace":compression,"reason":e.message})
            }
        }
    };
    let sagging = state("sagging", "top", &top, &bottom);
    let hogging = state("hogging", "bottom", &bottom, &top);
    let status = if sagging["status"] == "evaluated" && hogging["status"] == "evaluated" {
        "evaluated"
    } else {
        "unsupported"
    };
    merge(
        base,
        json!({"status":status,"rowFits":fits,"sagging":sagging,"hogging":hogging}),
    )
}
/// Governing flexural demand about the draft width axis (ADR 0014). The draft
/// width runs along member local y and its depth along local z; the top face is
/// local +z. With σ = N/A + My z/Iy, My < 0 compresses the top face (sagging)
/// and My > 0 the bottom face (hogging). One bound combination only; no ratio.
fn flexural_demand(
    p: &Project,
    member_id: &str,
    stations: &[KeyStation],
    combination: &str,
) -> Result<Value> {
    let m = p
        .members
        .iter()
        .find(|m| m.id == member_id)
        .ok_or_else(|| err("DANGLING_REFERENCE", "Bound member is not in the model"))?;
    let position = |id: &str| {
        p.nodes
            .iter()
            .find(|n| n.id == id)
            .map(|n| n.position)
            .ok_or_else(|| {
                err(
                    "DANGLING_REFERENCE",
                    "Bound member node is not in the model",
                )
            })
    };
    let (_, axes) = workbench_geometry::axes(position(&m.start)?, position(&m.end)?, m.local_y);
    let top = axes[2];
    // `sign` is the My sign that compresses the face; ties keep the first station.
    let governing = |sign: f64| {
        stations
            .iter()
            .filter(|s| sign * s.actions[4] > 0.)
            .fold(None, |best: Option<&KeyStation>, s| match best {
                Some(b) if sign * b.actions[4] >= sign * s.actions[4] => Some(b),
                _ => Some(s),
            })
            .map_or(Value::Null, |s| {
                json!({"moment":sign * s.actions[4],"station":s.station,"kind":s.kind,"side":s.side,"actions":s.actions})
            })
    };
    Ok(
        json!({"status":"evaluated","basis":"modelKeyStations","combinationId":combination,"memberId":member_id,
        "component":"My","actionOrder":["N","Vy","Vz","T","My","Mz"],
        "convention":"Draft width along local y, depth along local z; top face = local +z. My < 0 compresses the top face (sagging), My > 0 the bottom face (hogging)",
        "topFaceDirection":top,
        "topFaceOrientation":if top[2] > 0. {"up"} else if top[2] < 0. {"down"} else {"horizontal"},
        "sagging":governing(-1.),"hogging":governing(1.),"utilisation":null,
        "limitations":["Governing key stations of the one bound case/combination; no envelope across combinations","Axial force, shear, torsion and Mz at these stations are not considered by the pure-flexure mechanics","No utilisation ratio or status: the capacity is mechanics, not a code resistance"]}),
    )
}
/// EC2 UK NA beam checks for an rcBeam draft at the governing sagging,
/// hogging and shear key stations of the one bound combination (ADR 0016).
/// The profile is disabled: its checks run for review only, are labelled as a
/// disabled-profile preview and never change the preview's checks or overall.
fn code_profile_preview(
    d: &DesignPreview,
    demand: &Value,
    stations: &[KeyStation],
    combination: &str,
) -> Value {
    let profile = Ec2UkNaProfile::default();
    let meta = profile.metadata();
    let v = &d.inputs;
    let base = json!({"profileId":meta.id,"profileEnabled":meta.enabled,"basis":"disabledProfilePreview",
        "resourceGate":meta.resource_gate,"ndp":profile.ndp.label,
        "interpretation":{"concreteStrength":"fck (characteristic cylinder strength)","rebarStrength":"fyk for longitudinal bars and links"},
        "tensionAnchorageConfirmed":d.tension_anchorage_confirmed == Some(true),
        "limitations":meta.limitations});
    let Some(m) = &d.mechanics else {
        return merge(
            base,
            json!({"status":"unavailable","reason":"The draft has no section-mechanics inputs (minimum clear spacing)"}),
        );
    };
    let fit = |face: &str| {
        rc_section::row_fit(&BarRow {
            width: v["width"],
            side_cover: v["cover"],
            link_diameter: v["linkDiameter"],
            bar_diameter: v[&format!("{face}BarDiameter")],
            count: v[&format!("{face}BarCount")] as u32,
            minimum_clear_spacing: m.inputs["minimumClearSpacing"],
        })
    };
    let (top, bottom) = match (fit("top"), fit("bottom")) {
        (Ok(t), Ok(b)) if t.fits && b.fits => (t, b),
        (Ok(_), Ok(_)) => {
            return merge(
                base,
                json!({"status":"unavailable","reason":"A bar row does not fit the width; code checks not evaluated"}),
            );
        }
        (Err(e), _) | (_, Err(e)) => {
            return merge(base, json!({"status":"unavailable","reason":e.message}));
        }
    };
    let ctx = MemberContext {
        member_id: demand["memberId"].as_str().unwrap_or("").into(),
        section_family: "RC rectangle".into(),
        rc_beam: Some(RcBeamContext {
            width: v["width"],
            depth: v["depth"],
            cover_to_link: v["cover"],
            fck: v["concreteStrength"],
            fyk: v["rebarStrength"],
            rows: vec![
                RcBarRow {
                    face: RcFace::Top,
                    area: top.area,
                    centroid_from_face: top.depth_from_face,
                },
                RcBarRow {
                    face: RcFace::Bottom,
                    area: bottom.area,
                    centroid_from_face: bottom.depth_from_face,
                },
            ],
            links: Some(RcLinks {
                legs: v["linkLegs"] as u32,
                diameter: v["linkDiameter"],
                spacing: v["linkSpacing"],
                fyk: v["rebarStrength"],
            }),
            tension_steel_anchored: d.tension_anchorage_confirmed,
        }),
        ..Default::default()
    };
    if let ProfileApplicability::Unsupported(reason) = profile.applicability(&ctx) {
        return merge(base, json!({"status":"unsupported","reason":reason}));
    }
    // Governing shear: the key station with the largest |Vz|; ties keep the first.
    let shear = stations
        .iter()
        .filter(|s| s.actions[2] != 0.)
        .fold(None, |best: Option<&KeyStation>, s| match best {
            Some(b) if b.actions[2].abs() >= s.actions[2].abs() => Some(b),
            _ => Some(s),
        })
        .map_or(
            Value::Null,
            |s| json!({"station":s.station,"kind":s.kind,"side":s.side,"actions":s.actions}),
        );
    // One entry per distinct key station: a station that governs several roles
    // (e.g. hogging and shear at a fixed end) is checked once, listing its roles.
    let mut stations_by_role: Vec<(Vec<&str>, &Value)> = Vec::new();
    for (role, g) in [
        ("sagging", &demand["sagging"]),
        ("hogging", &demand["hogging"]),
        ("shear", &shear),
    ] {
        if g.is_null() {
            continue;
        }
        match stations_by_role
            .iter_mut()
            .find(|(_, h)| h["station"] == g["station"] && h["side"] == g["side"])
        {
            Some((roles, _)) => roles.push(role),
            None => stations_by_role.push((vec![role], g)),
        }
    }
    let governing: Vec<Value> = stations_by_role
        .into_iter()
        .map(|(roles, g)| {
            let a: Vec<f64> = g["actions"].as_array().unwrap().iter().map(|x| x.as_f64().unwrap()).collect();
            let station = DesignDemand {
                n: a[0],
                vy: a[1],
                vz: a[2],
                t: a[3],
                my: a[4],
                mz: a[5],
                combination_id: combination.into(),
                station: g["station"].as_f64().unwrap(),
            };
            let checks = profile.run_checks(&station, &ctx);
            json!({"roles":roles,"station":g["station"],"kind":g["kind"],"side":g["side"],"actions":a,
                "overall":DesignRun::overall_from_checks(&checks).as_str(),
                "checks":checks.iter().map(|c| c.to_json()).collect::<Vec<_>>()})
        })
        .collect();
    merge(
        base,
        json!({"status":"evaluated","combinationId":combination,"governing":governing}),
    )
}
/// plate-v1 analysis of a slab draft's panel (ADR 0021): mechanics only, never
/// a check status. Element-centre (unsmoothed) actions are the design values;
/// Wood–Armer moments are moments to resist, not reinforcement.
fn plate_analysis(p: &Project, d: &DesignPreview) -> Result<Value> {
    use workbench_plate::{Edge, Panel, PlateMaterial, wood_armer};
    let plate = d.plate.as_ref().ok_or_else(|| {
        err(
            "DESIGN_INPUT_INCOMPLETE",
            "Record plate analysis inputs (pressure, material, edges) for this slab first",
        )
    })?;
    let v = &d.inputs;
    let opening = plate.include_opening.then(|| {
        let (x0, y0) = (plate.inputs["openingX"], plate.inputs["openingY"]);
        [x0, x0 + v["openingLength"], y0, y0 + v["openingWidth"]]
    });
    let edges = plate.edges.each_ref().map(|e| match e.as_str() {
        "free" => Edge::Free,
        "simple" => Edge::Simple,
        _ => Edge::Clamped,
    });
    let panel = Panel {
        lx: v["length"],
        ly: v["width"],
        opening,
        edges,
        target: v["meshSize"],
    };
    let material = PlateMaterial {
        e: plate.inputs["elasticModulus"],
        nu: plate.inputs["poissonRatio"],
        t: v["thickness"],
    };
    let q = plate.inputs["pressure"];
    let budget = p.analysis_settings.memory_limit_mi_b as usize * 1024 * 1024 / 2;
    let s = workbench_plate::solve(&panel, &material, q, budget)?;
    let c = workbench_plate::convergence(&panel, &material, q, &s, budget)?;
    let (count, aspect, smallest) = s.mesh.quality();
    let mut warnings = vec![];
    if aspect > workbench_plate::ASPECT_WARNING {
        warnings.push(json!({"code":"MESH_ASPECT","message":format!("Largest cell aspect ratio {aspect:.2} exceeds {}", workbench_plate::ASPECT_WARNING)}));
    }
    let design: Vec<[f64; 4]> = s
        .element_actions
        .iter()
        .map(|a| wood_armer(a.mx, a.my, a.mxy))
        .collect();
    let centre = |e: usize| {
        let (i, j) = s.mesh.element_grid[e];
        [
            (s.mesh.xs[i] + s.mesh.xs[i + 1]) / 2.,
            (s.mesh.ys[j] + s.mesh.ys[j + 1]) / 2.,
        ]
    };
    let governing = |value: &dyn Fn(usize) -> f64| {
        let e = (0..count)
            .max_by(|&a, &b| value(a).total_cmp(&value(b)))
            .unwrap();
        json!({"value":value(e),"element":e,"cell":s.mesh.element_grid[e],"at":centre(e)})
    };
    let column = |f: &dyn Fn(usize) -> f64| (0..count).map(f).collect::<Vec<_>>();
    let a = &s.element_actions;
    let extremes = s.extremes();
    let limit = 0.05;
    Ok(json!({
        "status": "evaluated",
        "basis": "mechanics",
        "codeProfile": null,
        "family": "plate-v1",
        "formulation": "docs/formulations/plate.md",
        "panel": {"lengthX":panel.lx,"lengthY":panel.ly,"thickness":material.t,"opening":opening,"edges":plate.edges,"targetMeshSize":panel.target},
        "load": {"pressure":q,"direction":"down","source":plate.input_sources["pressure"]},
        "material": {"elasticModulus":material.e,"poissonRatio":material.nu,"shearCorrection":5.0/6.0,"sources":{"elasticModulus":plate.input_sources["elasticModulus"],"poissonRatio":plate.input_sources["poissonRatio"]}},
        "mesh": {"elements":count,"nodes":s.mesh.nodes.len(),"freeDofs":s.free_dofs,"maxAspect":aspect,"smallestCell":smallest,"xs":s.mesh.xs,"ys":s.mesh.ys,"warnings":warnings},
        "equilibrium": {"applied":s.applied,"reactions":s.reaction_z,"relativeImbalance":s.balance,"solverResidual":s.residual},
        "extremes": {"maxDeflection":extremes.max_deflection,"maxMx":extremes.max_mx,"maxMy":extremes.max_my,"minMx":extremes.min_mx,"minMy":extremes.min_my},
        "convergence": {"coarseMeshSize":2.0*panel.target,"coarseElements":c.coarse_elements,"change":c.change,"indicatorLimit":limit,"withinLimit":c.change <= limit,
            "note":"Indicator only: the panel re-solved at twice the mesh size. Peak moments at re-entrant opening corners are singular and mesh-dependent."},
        "designMoments": {
            "method": "woodArmer",
            "bottomX": governing(&|e| design[e][0]),
            "bottomY": governing(&|e| design[e][1]),
            "topX": governing(&|e| design[e][2]),
            "topY": governing(&|e| design[e][3]),
        },
        "edgeMoments": s.edge_moments.iter().map(|m| json!({"edge":m.edge,"position":m.position,"moment":m.moment})).collect::<Vec<_>>(),
        "fields": {
            "recovery": "elementCentre",
            "cells": s.mesh.element_grid,
            "mx": column(&|e| a[e].mx),
            "my": column(&|e| a[e].my),
            "mxy": column(&|e| a[e].mxy),
            "qx": column(&|e| a[e].qx),
            "qy": column(&|e| a[e].qy),
            "bottomX": column(&|e| design[e][0]),
            "bottomY": column(&|e| design[e][1]),
            "topX": column(&|e| design[e][2]),
            "topY": column(&|e| design[e][3]),
            "nodes": s.mesh.node_grid,
            "w": s.displacements.iter().map(|u| u[2]).collect::<Vec<_>>(),
        },
        "units": {"moment":"N m/m","shear":"N/m","deflection":"m","length":"m","pressure":"Pa"},
        "signs": "Moments sagging positive (bottom face in tension); w positive up; Wood–Armer values are magnitudes to resist on each face",
    }))
}
fn merge(mut a: Value, b: Value) -> Value {
    for (k, v) in b.as_object().unwrap() {
        a[k] = v.clone();
    }
    a
}
pub fn evaluate(p: &Project, input: &Value) -> Result<Value> {
    if input["modelHash"] != p.hash() {
        return Err(err(
            "STALE_RESULT",
            "Preview request belongs to another model",
        ));
    }
    let id = input["draftId"].as_str().unwrap_or("");
    let draft = p
        .design_previews
        .iter()
        .find(|d| d.id == id)
        .ok_or_else(|| err("DANGLING_REFERENCE", "Unknown preview"))?;
    let mut source = json!({"kind":"syntheticFixture","mock":true,"fixtureId":format!("{}-workflow-illustration-v1",draft.kind),"units":"SI","actions":[0,40000,0,0,0,120000],"note":"Illustrative upstream actions, not a solver result"});
    if draft.kind == "padFooting" {
        source = json!({"kind":"syntheticFixture","mock":true,"fixtureId":"pad-footing-reaction-v1","foundationActions":[0,0,-800000,40000,60000,0],"axes":"Global [Fx,Fy,Fz,Mx,My,Mz], N and N m","note":"Synthetic downward load and biaxial moments; no contact solution"});
    }
    if draft.kind == "slab" {
        source = json!({"kind":"syntheticFixture","mock":true,"fixtureId":"slab-plate-actions-v1","units":"N m/m","rawPlateActions":{"mx":-62000,"my":-31000,"mxy":8500},"designTransform":"unavailable","meshConvergence":"notChecked","note":"No validated plate/shell analysis; never use a frame-member result as a slab action"});
    }
    let mut plate = Value::Null;
    let mut stations: Option<Vec<KeyStation>> = None;
    if draft.kind == "slab" {
        plate = json!({"status":"notRun","reason":"Choose the plate analysis source to solve this panel"});
    }
    let mut demand = json!({"status":"unavailable","reason":"Model flexural demand needs a bound member and the current model case/combination; synthetic actions are illustrative"});
    let mut code = json!({"status":"unavailable","basis":"disabledProfilePreview","reason":"EC2 checks need actual model actions from a bound member and the current case/combination"});
    if input["sourceMode"] == "plate" {
        if draft.kind != "slab" {
            return Err(err(
                "INVALID_SCHEMA",
                "The plate analysis source applies only to slab drafts",
            ));
        }
        plate = plate_analysis(p, draft)?;
        source = json!({"kind":"plateAnalysis","mock":false,"family":"plate-v1","units":"N m/m","pressureSource":plate["load"]["source"],
            "note":"Plate analysis of the draft panel under its entered pressure; not connected to the frame model"});
    } else if input["sourceMode"] == "model" {
        if draft.kind == "slab" {
            return Err(err(
                "UNSUPPORTED_FEATURE",
                "Validated plate actions are unavailable; only synthetic slab preview is supported",
            ));
        }
        let target = draft
            .target_id
            .as_ref()
            .ok_or_else(|| err("DESIGN_INPUT_INCOMPLETE", "Choose a model member/support"))?;
        let case = input["caseId"].as_str().unwrap_or("");
        let a = workbench_assembly::analyse(p, case)?;
        if input["resultId"] != a.result_id || !a.converged {
            return Err(err(
                "STALE_RESULT",
                "Current converged case/combination is required",
            ));
        }
        source = json!({"kind":"modelAnalysis","mock":false,"resultId":a.result_id,"modelHash":a.model_hash,"sourceRevision":a.source_revision,"solverBuildHash":a.solver_build_hash,"settingsHash":a.settings_hash,"combinationId":case,"targetId":target});
        if draft.kind == "rcColumn" {
            let m = a
                .members
                .iter()
                .find(|m| &m.id == target)
                .ok_or_else(|| err("DANGLING_REFERENCE", "Member result unavailable"))?;
            source["stations"] = serde_json::to_value(&m.key_stations).unwrap();
            stations = Some(m.key_stations.clone());
            source["note"] = json!(
                "Actual model actions at the member's key stations; the draft section is not applied to frame stiffness"
            );
        } else if draft.kind == "rcBeam" {
            let m = a
                .members
                .iter()
                .find(|m| &m.id == target)
                .ok_or_else(|| err("DANGLING_REFERENCE", "Member result unavailable"))?;
            source["stations"] = serde_json::to_value(&m.key_stations).unwrap();
            demand = flexural_demand(p, target, &m.key_stations, case)?;
            code = code_profile_preview(draft, &demand, &m.key_stations, case);
            source["note"] = json!(
                "Actual model actions; preview section is not applied to frame stiffness, and no concrete resistance is calculated"
            );
        } else {
            let i = a
                .reaction_support_ids
                .iter()
                .position(|id| id == target)
                .ok_or_else(|| err("DANGLING_REFERENCE", "Support reaction unavailable"))?;
            let reaction = &a.reactions[i * 6..i * 6 + 6];
            source["supportReaction"] = json!(reaction);
            source["foundationActions"] = json!(reaction.iter().map(|v| -v).collect::<Vec<_>>());
            source["axes"] = json!(
                "Global [Fx,Fy,Fz,Mx,My,Mz], SI; foundation actions oppose support-on-structure reactions"
            );
            source["note"] = json!(
                "Exact simultaneous support reaction; no soil/contact solution or frame-foundation coupling"
            );
        }
    } else if input["sourceMode"] != "synthetic" {
        return Err(err(
            "INVALID_SCHEMA",
            "Choose model or synthetic upstream source",
        ));
    }
    let checks: Vec<&str> = match draft.kind.as_str() {
        // Biaxial section mechanics are reported under `columnMechanics`.
        "rcColumn" => vec![
            "Axial and biaxial bending",
            "Slenderness and second-order effects",
            "Minimum eccentricity",
            "Shear",
            "Detailing",
        ],
        "rcBeam" => vec![
            "Flexure",
            "Shear",
            "Minimum/maximum reinforcement",
            "Cover and spacing",
            "Anchorage",
            "Serviceability",
        ],
        // Plate solution, convergence and design-moment transformation are
        // reported under `plateAnalysis`; these are the code checks.
        "slab" => vec![
            "Top X/Y reinforcement",
            "Bottom X/Y reinforcement",
            "Minimum/maximum reinforcement",
            "Punching",
            "Deflection",
        ],
        _ => vec![
            "Compression-only contact",
            "Bearing",
            "Sliding/overturning",
            "Flexure",
            "One-way shear",
            "Punching",
            "Detailing",
        ],
    };
    let schedule = if draft.kind == "rcBeam" {
        json!([("ILL-T1","Top","top"),("ILL-B1","Bottom","bottom")].iter().map(|(mark,region,face)|json!({"mark":mark,"region":region,"diameter":draft.inputs[&format!("{face}BarDiameter")],"quantity":draft.inputs[&format!("{face}BarCount")],"cutLength":null,"source":"illustrationOnly","status":"unverified"})).collect::<Vec<_>>())
    } else {
        json!([])
    };
    let mut run = json!({"contractVersion":1,"draftId":id,"kind":draft.kind,"overall":"unsupported","mock":true,"codeProfile":null,"modelHash":p.hash(),"sourceRevision":p.revision,
        "inputHash":digest(&serde_json::to_vec(draft).unwrap()),"inputs":draft,"sourceProvenance":source,"schedule":schedule,
        "checks":checks.iter().map(|name|json!({"name":name,"status":"unsupported","utilisation":null,"reason":if *name=="Flexure"&&draft.kind=="rcBeam"{"Code profile unavailable. Section mechanics are reported separately and are not a code resistance"}else{"Required numerical family or locked code/example resources are unavailable"}})).collect::<Vec<_>>(),
        "contactState":if draft.kind=="padFooting"{"indeterminate"}else{"notApplicable"},
        "reinforcementFields":["Top X","Top Y","Bottom X","Bottom Y"],
        "soilProvenance":if draft.kind=="padFooting"{json!({"source":draft.input_sources.get("bearingPressure").unwrap_or(&draft.input_source),"reference":draft.soil_reference,"bearingPressure":draft.inputs["bearingPressure"],"computedByWorkbench":false})}else{Value::Null},
        "sectionMechanics":if draft.kind=="rcBeam"{section_mechanics(draft,&demand)}else{Value::Null},
        "flexuralDemand":if draft.kind=="rcBeam"{demand}else{Value::Null},
        "codeProfilePreview":if draft.kind=="rcBeam"{code}else{Value::Null},
        "plateAnalysis":plate,
        "columnMechanics":if draft.kind=="rcColumn"{column_mechanics(draft,stations.as_deref())}else{Value::Null},
        "limitations":["MOCK WORKFLOW — no code-compliance claim","Dimensions are draft inputs; frame geometry/stiffness is unchanged","Illustrations are not construction details; quantities/fit/anchorage and cut lengths are unverified"]});
    run["previewRunId"] = json!(digest(&serde_json::to_vec(&run).unwrap()));
    Ok(run)
}
