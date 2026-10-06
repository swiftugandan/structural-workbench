//! M17 composite beam against the held AISC Design Examples v16 I.1 and I.2.

use serde_json::Value;

use super::super::units::{IN_TO_M, KIP_TO_N, KSI_TO_PA};
use super::*;
use crate::native;

const FT: f64 = 0.3048;
const KIP_FT: f64 = KIP_TO_N * FT;

fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../../../../../fixtures/design/aisc-360-22-lrfd/composite-beam.published.json"
    ))
    .unwrap()
}

fn f(v: &Value) -> f64 {
    v.as_f64().unwrap_or_else(|| panic!("not a number: {v}"))
}

thread_local! {
    static MISMATCHES: std::cell::RefCell<Vec<String>> = const { std::cell::RefCell::new(vec![]) };
}

fn compare(p: &Value, key: &str, got: f64) {
    let (want, tol) = (f(&p[key]["value"]), f(&p[key]["rounding"]));
    if (got - want).abs() > tol + 1e-9 {
        MISMATCHES.with(|m| {
            m.borrow_mut()
                .push(format!("{key}: {got} vs {want} ± {tol}"))
        });
    }
}

fn no_mismatches() {
    MISMATCHES.with(|m| {
        let m = m.borrow();
        assert!(m.is_empty(), "{}", m.join("\n"));
    });
}

/// An example's beam in SI from the catalogue.
fn beam(designation: &str) -> SteelBeam {
    let r = format!("aisc-shapes-v16.0-subset-1:{designation}");
    let (_, _, section) = native::resolve(&r, "astm-a992-50-65-v1").unwrap();
    let ix = native::shape_row(&r).unwrap()["Ix"].as_f64().unwrap() * IN_TO_M.powi(4);
    SteelBeam {
        designation: designation.into(),
        section,
        ix,
        fy: 50.0 * KSI_TO_PA,
    }
}

fn example(name: &str) -> (CompositeBeam, Value, Value) {
    let x = &fixture()["examples"][name];
    let i = &x["inputs"];
    let inch = |k: &str| f(&i[k]) * IN_TO_M;
    let deck = match i["deck"].as_str().unwrap() {
        "parallel" => Deck::Parallel,
        "perpendicular" => Deck::Perpendicular,
        _ => Deck::Solid,
    };
    let spacing: Vec<f64> = i["spacing"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| f(v) * FT)
        .collect();
    let c = CompositeBeam {
        span: f(&i["span"]) * FT,
        beam: beam(i["beam"].as_str().unwrap()),
        slab: Slab {
            thickness: inch("slab"),
            deck,
            rib_height: inch("hr"),
            rib_width: inch("wr"),
            rib_pitch: inch("pitch"),
            fc: f(&i["fc"]) * KSI_TO_PA,
            density: f(&i["wc"]) * 16.018_463_373_960_14,
            lightweight: false,
        },
        studs: Studs {
            diameter: inch("stud"),
            fu: f(&i["studFu"]) * KSI_TO_PA,
            length: 4.5 * IN_TO_M,
            per_row: 1,
            row_spacing: 12.0 * IN_TO_M,
            first_row: 6.0 * IN_TO_M,
            transverse_spacing: 3.0 * IN_TO_M,
            over_web: false,
            emid_ht: None,
        },
        sides: [Side::Adjacent(spacing[0]), Side::Adjacent(spacing[1])],
        construction_lb: i.get("constructionLb").map_or(0.0, |v| f(v) * FT),
        construction_cb: i.get("constructionCb").map_or(1.0, f),
        camber: 0.0,
        pre_composite_limit: Some(360.0),
        live_limit: Some(360.0),
        long_term_limit: Some(240.0),
        shrinkage_strain: Some(0.0002),
        creep_judgement: Some(true),
    };
    (c, x["inputs"].clone(), x["published"].clone())
}

/// A diagram of a uniform load w (kip/ft) plus point loads P (kips) at the
/// third points, sagging positive, on 361 stations including the load points.
fn diagram(span: f64, w_kip_ft: f64, p_kips: f64) -> Diagram {
    let w = w_kip_ft * KIP_TO_N / FT;
    let p = p_kips * KIP_TO_N;
    let n = 360;
    let stations: Vec<f64> = (0..=n).map(|k| span * k as f64 / n as f64).collect();
    let a = span / 3.0;
    let moment = stations
        .iter()
        .map(|&x| {
            w * x * (span - x) / 2.0
                + p * if x <= a {
                    x
                } else if x <= span - a {
                    a
                } else {
                    span - x
                }
        })
        .collect();
    let shear = stations
        .iter()
        .map(|&x| {
            w * (span / 2.0 - x)
                + p * if x < a {
                    1.0
                } else if x <= span - a {
                    0.0
                } else {
                    -1.0
                }
        })
        .collect();
    Diagram {
        stations,
        moment,
        shear,
    }
}

#[test]
fn example_i_2_direct_calculation() {
    let (c, i, p) = example("I.2");
    let kip = |v: f64| v / KIP_TO_N;
    let span = c.span;
    compare(&p, "beff", effective_width(span, &c.sides) / IN_TO_M);
    let layers = layers(&c.slab, effective_width(span, &c.sides));
    let ac = concrete_area(&layers);
    compare(&p, "Ac", ac / IN_TO_M / IN_TO_M);
    compare(&p, "Cconcrete", kip(0.85 * c.slab.fc * ac));
    compare(&p, "Csteel", kip(c.beam.fy * c.beam.section.ag));
    // Plastic strength at the example's 50 % composite trial.
    let pl = plastic_moment(&c, 560.0 * KIP_TO_N);
    compare(&p, "x560", pl.x / IN_TO_M);
    compare(&p, "a560", pl.a / IN_TO_M);
    compare(&p, "d1_560", pl.d1 / IN_TO_M);
    compare(&p, "Mn560", pl.mn / KIP_FT);
    assert_eq!(pl.pna, "top flange");
    // Stud strength (Rg = 1.0, Rp = 0.75: deck parallel, w_r/h_r = 2).
    let (qn, qc, _, rg, rp, _) = stud_strength(&c.slab, &c.studs);
    assert_eq!((rg, rp), (1.0, 0.75));
    compare(&p, "Qn", kip(qn));
    compare(&p, "QnConcrete", kip(qc));
    compare(&p, "Ec", c.slab.ec() / KSI_TO_PA);
    // Lower-bound and transformed stiffness with ΣQn = 581 kips.
    let q = 581.0 * KIP_TO_N;
    let pl = plastic_moment(&c, q);
    compare(&p, "a581", pl.a / IN_TO_M);
    compare(&p, "x581", pl.x / IN_TO_M);
    let (ilb, y_ena, d1) = lower_bound_inertia(&c, q);
    compare(&p, "d1_581", d1 / IN_TO_M);
    compare(&p, "YENA", y_ena / IN_TO_M);
    compare(&p, "ILB", ilb / IN_TO_M.powi(4));
    let n = c.beam.section.e / c.slab.ec();
    compare(&p, "n", n);
    let (itr, ena) = transformed_section(&c);
    compare(&p, "Itr", itr / IN_TO_M.powi(4));
    compare(
        &p,
        "enaInDeck",
        (ena - (c.slab.thickness - c.slab.rib_height)) / IN_TO_M,
    );
    let cf = (0.85 * c.slab.fc * ac).min(c.beam.fy * c.beam.section.ag);
    compare(
        &p,
        "Iequiv",
        (c.beam.ix + (q / cf).min(1.0).sqrt() * (itr - c.beam.ix)) / IN_TO_M.powi(4),
    );
    // Deflections from the moment diagrams.
    let e = c.beam.section.e;
    let (dw, _) = deflection(
        &diagram(span, f(&i["wetUniform"]), f(&i["wetPoint"])),
        span,
        e * c.beam.ix,
    );
    compare(&p, "deltaWet", dw / IN_TO_M);
    let (dl, _) = deflection(&diagram(span, 0.0, f(&i["livePoint"])), span, e * ilb);
    compare(&p, "deltaLive", dl / IN_TO_M);
    // Construction (Lb = 10 ft, Cb = 1.0), composite and shear via design().
    let stages = Stages {
        construction: diagram(
            span,
            f(&i["constructionUniform"]),
            f(&i["constructionPoint"]),
        ),
        composite: diagram(span, f(&i["compositeUniform"]), f(&i["compositePoint"])),
        wet: Some(diagram(span, f(&i["wetUniform"]), f(&i["wetPoint"]))),
        live: Some(diagram(span, 0.0, f(&i["livePoint"]))),
        sustained: Some(diagram(span, 0.0, 4.5)),
        regular_loading: true,
        load_points: vec![span / 3.0, 2.0 * span / 3.0],
    };
    let d = design(&c, &stages);
    let check = |id: &str| {
        d.checks
            .iter()
            .find(|x| x.check_id == id)
            .unwrap_or_else(|| panic!("no {id}"))
            .clone()
    };
    let con = check("composite.construction.flexure");
    compare(&p, "phiMnConstruction", con.resistance.unwrap() / KIP_FT);
    compare(&p, "MuConstruction", con.demand.unwrap() / KIP_FT);
    compare(
        &p,
        "MuComposite",
        check("composite.flexure").demand.unwrap() / KIP_FT,
    );
    let sh = check("composite.shear");
    compare(&p, "phiVn", kip(sh.resistance.unwrap()));
    compare(&p, "Vu", kip(sh.demand.unwrap()));
    no_mismatches();
}

#[test]
fn example_i_1_against_the_manual_tables() {
    let (mut c, i, p) = example("I.1");
    let kip = |v: f64| v / KIP_TO_N;
    let span = c.span;
    compare(&p, "beff", effective_width(span, &c.sides) / IN_TO_M);
    let beff = effective_width(span, &c.sides);
    let ac = concrete_area(&layers(&c.slab, beff));
    compare(&p, "Ac", ac / IN_TO_M / IN_TO_M);
    let cf = (0.85 * c.slab.fc * ac).min(c.beam.fy * c.beam.section.ag);
    compare(&p, "Cf", kip(cf));
    // Weak position (Rp = 0.6), one and two studs per rib.
    compare(&p, "Qn1", kip(stud_strength(&c.slab, &c.studs).0));
    c.studs.per_row = 2;
    compare(&p, "Qn2", kip(stud_strength(&c.slab, &c.studs).0));
    c.studs.per_row = 1;
    let pl = plastic_moment(&c, 386.0 * KIP_TO_N);
    compare(&p, "a386", pl.a / IN_TO_M);
    compare(&p, "phiMn386", 0.9 * pl.mn / KIP_FT);
    let (ilb, _, _) = lower_bound_inertia(&c, 386.0 * KIP_TO_N);
    compare(&p, "ILB", ilb / IN_TO_M.powi(4));
    compare(&p, "composite390", 100.0 * 390.0 * KIP_TO_N / cf);
    let e = c.beam.section.e;
    let (dw, _) = deflection(
        &diagram(span, f(&i["wetUniform"]), 0.0),
        span,
        e * c.beam.ix,
    );
    compare(&p, "deltaWet", dw / IN_TO_M);
    // The example's table I_LB (2,520 in.⁴) with the full live load.
    let (dl, _) = deflection(
        &diagram(span, f(&i["liveUniform"]), 0.0),
        span,
        e * 2520.0 * IN_TO_M.powi(4),
    );
    compare(&p, "deltaLive", dl / IN_TO_M);
    let stages = Stages {
        construction: diagram(span, f(&i["constructionUniform"]), 0.0),
        composite: diagram(span, f(&i["compositeUniform"]), 0.0),
        wet: Some(diagram(span, f(&i["wetUniform"]), 0.0)),
        live: Some(diagram(span, f(&i["liveUniform"]), 0.0)),
        sustained: Some(diagram(span, 0.1, 0.0)),
        regular_loading: true,
        load_points: vec![],
    };
    let d = design(&c, &stages);
    let check = |id: &str| d.checks.iter().find(|x| x.check_id == id).unwrap().clone();
    compare(
        &p,
        "phiMnSteel",
        check("composite.construction.flexure").resistance.unwrap() / KIP_FT,
    );
    compare(
        &p,
        "MuConstruction",
        check("composite.construction.flexure").demand.unwrap() / KIP_FT,
    );
    compare(
        &p,
        "MuComposite",
        check("composite.flexure").demand.unwrap() / KIP_FT,
    );
    compare(
        &p,
        "phiVn",
        kip(check("composite.shear").resistance.unwrap()),
    );
    no_mismatches();
}

#[test]
fn deflection_integration_matches_closed_forms() {
    // Uniform load and a central point load on a simply supported span.
    let (l, ei) = (9.0, 2.0e8 * 1.0e-4);
    let n = 400;
    let stations: Vec<f64> = (0..=n).map(|k| l * k as f64 / n as f64).collect();
    let w = 10e3;
    let uniform = Diagram {
        moment: stations.iter().map(|&x| w * x * (l - x) / 2.0).collect(),
        shear: vec![0.0; n + 1],
        stations: stations.clone(),
    };
    let (d, at) = deflection(&uniform, l, ei);
    assert!(
        (d - 5.0 * w * l.powi(4) / (384.0 * ei)).abs() < 1e-5 * d,
        "{d}"
    );
    assert!((at - l / 2.0).abs() < 1e-12);
    let p = 50e3;
    let point = Diagram {
        moment: stations.iter().map(|&x| p * x.min(l - x) / 2.0).collect(),
        shear: vec![0.0; n + 1],
        stations,
    };
    let (d, _) = deflection(&point, l, ei);
    assert!((d - p * l.powi(3) / (48.0 * ei)).abs() < 1e-5 * d, "{d}");
}

#[test]
fn stud_force_limits_the_strength_near_the_supports() {
    // A point load near a support needs the studs between it and the support
    // (I8.2c): with few studs there the governing section moves to the load.
    let (c, _, _) = example("I.2");
    let span = c.span;
    let n = 360;
    let stations: Vec<f64> = (0..=n).map(|k| span * k as f64 / n as f64).collect();
    let (a, p) = (span / 10.0, 600e3);
    let moment: Vec<f64> = stations
        .iter()
        .map(|&x| {
            if x <= a {
                p * (span - a) / span * x
            } else {
                p * a / span * (span - x)
            }
        })
        .collect();
    let stages = Stages {
        construction: Diagram {
            stations: stations.clone(),
            moment: vec![0.0; n + 1],
            shear: vec![0.0; n + 1],
        },
        composite: Diagram {
            stations,
            moment,
            shear: vec![0.0; n + 1],
        },
        load_points: vec![a],
        ..Default::default()
    };
    let d = design(&c, &stages);
    let flex = d
        .checks
        .iter()
        .find(|x| x.check_id == "composite.flexure")
        .unwrap();
    let at = flex.intermediates["station"].as_f64().unwrap();
    assert!((at - a).abs() < span / n as f64 + 1e-9, "governing at {at}");
    assert!(
        flex.intermediates["sumQn"].as_f64().unwrap() < flex.intermediates["Cf"].as_f64().unwrap()
    );
    // Irregular loading: slip capacity is indeterminate, never passed.
    let slip = d
        .checks
        .iter()
        .find(|x| x.check_id == "composite.slipCapacity")
        .unwrap();
    assert_eq!(slip.status, crate::profile::CheckStatus::Indeterminate);
}

#[test]
fn time_dependent_and_unsupported_conditions_block_a_pass() {
    let (mut c, i, _) = example("I.1");
    let span = c.span;
    let stages = Stages {
        construction: diagram(span, f(&i["constructionUniform"]), 0.0),
        composite: diagram(span, f(&i["compositeUniform"]), 0.0),
        wet: Some(diagram(span, f(&i["wetUniform"]), 0.0)),
        live: Some(diagram(span, f(&i["liveUniform"]), 0.0)),
        sustained: Some(diagram(span, 0.1, 0.0)),
        regular_loading: true,
        load_points: vec![],
    };
    let status = |c: &CompositeBeam, s: &Stages, id: &str| {
        design(c, s)
            .checks
            .iter()
            .find(|x| x.check_id == id)
            .unwrap()
            .status
            .clone()
    };
    use crate::profile::CheckStatus::*;
    c.creep_judgement = None;
    assert_eq!(status(&c, &stages, "composite.creep"), Indeterminate);
    c.creep_judgement = Some(false);
    assert_eq!(status(&c, &stages, "composite.creep"), Unsupported);
    c.creep_judgement = Some(true);
    c.shrinkage_strain = None;
    assert_eq!(
        status(&c, &stages, "composite.longTermDeflection"),
        Indeterminate
    );
    c.shrinkage_strain = Some(0.0002);
    // Negative moment in the composite stage is unsupported.
    let mut hogging = stages.clone();
    hogging.composite.moment[0] = -100e3;
    assert_eq!(
        status(&c, &hogging, "composite.negativeFlexure"),
        Unsupported
    );
    // Missing service cases and limits are indeterminate.
    let mut none = stages.clone();
    none.live = None;
    assert_eq!(status(&c, &none, "composite.liveDeflection"), Indeterminate);
    c.live_limit = None;
    assert_eq!(
        status(&c, &stages, "composite.liveDeflection"),
        Indeterminate
    );
}

#[test]
fn example_i_2_with_its_rounded_inputs() {
    // The example rounds d/2 = 11.95 in. to 12.0 and E_c = 3,492 ksi to
    // 3,490 ksi (n = 8.31). Fed those, the formulas reproduce its stiffness
    // values to the printed digits.
    let (mut c, _, p) = example("I.2");
    c.beam.section.d = 24.0 * IN_TO_M;
    // w_c such that E_c = w_c^1.5 √4 = 3,490 ksi.
    c.slab.density = (3490.0_f64 / 2.0).powf(2.0 / 3.0) * 16.018_463_373_960_14;
    let q = 581.0 * KIP_TO_N;
    let (ilb, y_ena, _) = lower_bound_inertia(&c, q);
    let (itr, ena) = transformed_section(&c);
    let in4 = IN_TO_M.powi(4);
    let close = |got: f64, want: f64, tol: f64, what: &str| {
        assert!((got - want).abs() <= tol, "{what}: {got} vs {want}")
    };
    close(ilb / in4, f(&p["ILB"]["value"]), 5.0, "ILB");
    close(y_ena / IN_TO_M, f(&p["YENA"]["value"]), 0.05, "YENA");
    close(itr / in4, f(&p["Itr"]["value"]), 10.0, "Itr");
    close(
        (ena - 4.5 * IN_TO_M) / IN_TO_M,
        f(&p["enaInDeck"]["value"]),
        0.015,
        "ENA",
    );
    let cf = 1120.0 * KIP_TO_N;
    close(
        (c.beam.ix + (q / cf).sqrt() * (itr - c.beam.ix)) / in4,
        f(&p["Iequiv"]["value"]),
        5.0,
        "Iequiv",
    );
    let pl = plastic_moment(&c, 560.0 * KIP_TO_N);
    // 17,000 kip-in. as printed (three figures).
    close(pl.mn / (KIP_TO_N * IN_TO_M), 17000.0, 50.0, "Mn");
}

#[test]
fn matches_the_independent_oracle() {
    let oracle: Value = serde_json::from_str(include_str!(
        "../../../../../../fixtures/design/aisc-360-22-lrfd/composite-oracle.json"
    ))
    .unwrap();
    let tol = f(&oracle["tolerance"]);
    let close = |got: f64, want: f64, what: &str, name: &str| {
        assert!(
            (got - want).abs() <= tol * want.abs().max(1e-30) + 1e-14,
            "{name} {what}: {got} vs {want}"
        );
    };
    for case in oracle["cases"].as_array().unwrap() {
        let i = &case["inputs"];
        let name = i["name"].as_str().unwrap();
        let deck = match i["deck"].as_str().unwrap() {
            "parallel" => Deck::Parallel,
            "perpendicular" => Deck::Perpendicular,
            _ => Deck::Solid,
        };
        let c = CompositeBeam {
            span: f(&i["span"]),
            beam: beam(i["beam"].as_str().unwrap()),
            slab: Slab {
                thickness: f(&i["t"]),
                deck,
                rib_height: f(&i["hr"]),
                rib_width: f(&i["wr"]),
                rib_pitch: f(&i["pitch"]),
                fc: f(&i["fc"]),
                density: f(&i["wc"]) * 16.018_463_373_960_14,
                lightweight: false,
            },
            studs: Studs {
                diameter: f(&i["dsa"]),
                fu: f(&i["studFu"]),
                length: 4.5 * IN_TO_M,
                per_row: i["perRow"].as_u64().unwrap() as usize,
                row_spacing: 0.3,
                first_row: 0.15,
                transverse_spacing: 0.08,
                over_web: false,
                emid_ht: None,
            },
            sides: [
                Side::Adjacent(f(&i["spacing"])),
                Side::Adjacent(f(&i["spacing"])),
            ],
            construction_lb: 0.0,
            construction_cb: 1.0,
            camber: 0.0,
            pre_composite_limit: None,
            live_limit: None,
            long_term_limit: None,
            shrinkage_strain: None,
            creep_judgement: None,
        };
        let beff = effective_width(c.span, &c.sides);
        close(beff, f(&case["beff"]), "beff", name);
        close(
            concrete_area(&layers(&c.slab, beff)),
            f(&case["Ac"]),
            "Ac",
            name,
        );
        close(c.slab.ec(), f(&case["Ec"]), "Ec", name);
        close(
            stud_strength(&c.slab, &c.studs).0,
            f(&case["Qn"]),
            "Qn",
            name,
        );
        let (itr, ena) = transformed_section(&c);
        close(itr, f(&case["Itr"]), "Itr", name);
        close(ena, f(&case["ena"]), "ENA", name);
        for force in case["forces"].as_array().unwrap() {
            let cf = f(&force["C"]);
            let p = plastic_moment(&c, cf);
            close(p.mn, f(&force["Mn"]), "Mn", name);
            close(p.x, f(&force["pnaDepth"]), "PNA", name);
            close(lower_bound_inertia(&c, cf).0, f(&force["ILB"]), "ILB", name);
        }
        // Deflections: Δ·EI of a uniform load and of third-point loads.
        let dfl = &case["deflections"];
        let span = c.span;
        let w = f(&dfl["w"]) / (KIP_TO_N / FT);
        let p = f(&dfl["P"]) / KIP_TO_N;
        let (du, _) = deflection(&diagram(span, w, 0.0), span, 1.0);
        assert!(
            (du - f(&dfl["uniformOverEI"])).abs() <= 2e-5 * du,
            "{name} uniform {du}"
        );
        let (dp, _) = deflection(&diagram(span, 0.0, p), span, 1.0);
        assert!(
            (dp - f(&dfl["thirdPointsOverEI"])).abs() <= 1e-9 * dp,
            "{name} third points {dp}"
        );
    }
}
