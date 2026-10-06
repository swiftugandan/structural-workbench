//! Single-plate (shear tab, fin plate) beam end connection under ANSI/AISC
//! 360-22 LRFD (M13, ADR 0030). A plate shop-welded with two fillet welds to
//! a column flange, column web or girder web, field-bolted to an uncoped W
//! beam web with one or two vertical lines of bolts in standard holes,
//! bearing-type, snug-tight.
//!
//! Every limit state is from the held Specification (Chapters F11, J2, J3,
//! J4) or a Manual equation as the held Design Examples v16 reproduce it
//! (II.A-17A, II.A-17B, II.A-18, II.A-19A): the general method with the bolt
//! group eccentricity measured from the support, plate flexure (F11, C_b =
//! 1.84), the Manual Part 10/12 interactions and the 5/8 t_p weld. The
//! conventional configuration of Manual Table 10-9 is not held and is not
//! used. Clause reading: `docs/code-profiles/aisc-360-22-lrfd/dossier-connection.md`.

use serde_json::{Value, json};

use super::super::units::{IN_TO_M, KSI_TO_PA};
use super::bolts::Bolt;
use super::icr;
use crate::profile::{CheckOutcome, CheckStatus};

const PHI_BOLT: f64 = 0.75;
const PHI_BEARING: f64 = 0.75;
const PHI_SHEAR_YIELD: f64 = 1.00;
const PHI_RUPTURE: f64 = 0.75;
const PHI_TENSION_YIELD: f64 = 0.90;
const PHI_FLEXURE: f64 = 0.90;
const PHI_WELD: f64 = 0.75;
/// C_b for the plate of a single-plate connection (Manual Part 10, as used in
/// Design Examples II.A-17B and II.A-19A).
const CB_PLATE: f64 = 1.84;
const STEEL_DENSITY: f64 = 7850.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SupportKind {
    ColumnFlange,
    ColumnWeb,
    GirderWeb,
}

impl SupportKind {
    pub fn label(self) -> &'static str {
        match self {
            SupportKind::ColumnFlange => "column flange",
            SupportKind::ColumnWeb => "column web",
            SupportKind::GirderWeb => "girder web",
        }
    }
}

/// The supported beam: a W shape, uncoped (SI).
#[derive(Debug, Clone, PartialEq)]
pub struct Beam {
    pub designation: String,
    pub d: f64,
    pub tw: f64,
    pub tf: f64,
    pub ag: f64,
    /// Design distance from the outer flange face to the web toe of the fillet.
    pub kdes: f64,
    pub fy: f64,
    pub fu: f64,
}

/// The supporting element the plate is welded to (SI).
#[derive(Debug, Clone, PartialEq)]
pub struct Support {
    pub designation: String,
    pub kind: SupportKind,
    /// Thickness of the element the plate is welded to (flange or web).
    pub thickness: f64,
    pub fu: f64,
    /// For a column web: the column flange width and web thickness, to check
    /// that the beam clears the flange tips.
    pub flange_width: f64,
    pub web_thickness: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SinglePlate {
    pub bolt: Bolt,
    /// Bolts per vertical line.
    pub rows: usize,
    /// Vertical lines of bolts: 1 or 2.
    pub columns: usize,
    pub pitch: f64,
    /// Distance between the two bolt lines (ignored for one line).
    pub gauge: f64,
    pub thickness: f64,
    pub fy: f64,
    pub fu: f64,
    pub elastic_modulus: f64,
    /// Vertical edge distance of the plate (top and bottom bolts).
    pub lev: f64,
    /// Horizontal edge distance of the plate (outer bolt line to plate edge).
    pub leh_plate: f64,
    /// Support face to the bolt line nearest it.
    pub a: f64,
    /// Bolt line nearest the support to the beam end (nominal).
    pub leh_beam: f64,
    /// Beam length underrun deducted from leh_beam for tearout and edges.
    pub underrun: f64,
    /// Beam top to plate top.
    pub top_offset: f64,
    /// Fillet weld leg, both sides.
    pub weld: f64,
    pub fexx: f64,
    /// Deformation at the bolt hole at service load is a design consideration
    /// (J3-6a/J3-6c) or not (J3-6b/J3-6d).
    pub deformation_considered: bool,
    /// The beam is braced against rotation about its longitudinal axis (the
    /// weak-axis moment term of the plate interaction is zero).
    pub braced_against_rotation: Option<bool>,
}

/// Beam end actions on the connection (SI). `v` > 0 when the beam bears down
/// on the support; `n` > 0 is tension pulling the beam away from it; `m` is
/// the major-axis moment the analysis carries through this end.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct ConnectionActions {
    pub v: f64,
    pub n: f64,
    pub m: f64,
    pub v_minor: f64,
    pub m_minor: f64,
    pub torsion: f64,
}

#[derive(Debug, Clone)]
pub struct SinglePlateDesign {
    pub checks: Vec<CheckOutcome>,
    pub geometry: Value,
    pub bolt_group: Value,
    pub free_body: Value,
    pub bill: Value,
}

fn pass_if(ok: bool) -> CheckStatus {
    if ok {
        CheckStatus::Pass
    } else {
        CheckStatus::Fail
    }
}

fn indeterminate(id: &str, clause: &str, reason: impl Into<String>) -> CheckOutcome {
    CheckOutcome {
        status: CheckStatus::Indeterminate,
        ..CheckOutcome::unsupported(id, clause, reason)
    }
}

/// J4.3 (J4-5).
fn block_shear(fu: f64, fy: f64, agv: f64, anv: f64, ant: f64, ubs: f64) -> (f64, Value) {
    let rupture = 0.6 * fu * anv + ubs * fu * ant;
    let yielding = 0.6 * fy * agv + ubs * fu * ant;
    let rn = rupture.min(yielding);
    (
        rn,
        json!({"Agv": agv, "Anv": anv, "Ant": ant, "Ubs": ubs, "rupturePath": rupture, "yieldPath": yielding, "Rn": rn}),
    )
}

/// Plastic section modulus of a rectangle t × l less a vertical line of holes
/// of width `h` centred at `ys` (measured from mid-depth): the net section of
/// Manual Eq. 9-8, from the geometry.
pub fn z_net(t: f64, l: f64, h: f64, ys: &[f64]) -> f64 {
    let mut z = t * l * l / 4.0;
    for &y in ys {
        let y = y.abs();
        if y >= h / 2.0 {
            z -= t * h * y;
        } else {
            // A hole across the plastic neutral axis.
            let above = h / 2.0 + y;
            let below = h / 2.0 - y;
            z -= t * (above * above + below * below) / 2.0;
        }
    }
    z
}

/// Table J2.4 minimum fillet size for the thinner part joined (m).
fn min_fillet(thinner: f64, metric: bool) -> f64 {
    if metric {
        let mm = thinner / 1e-3;
        (if mm <= 6.0 + 1e-9 {
            3.0
        } else if mm <= 13.0 + 1e-9 {
            5.0
        } else if mm <= 19.0 + 1e-9 {
            6.0
        } else {
            8.0
        }) * 1e-3
    } else {
        let inch = thinner / IN_TO_M;
        (if inch <= 0.25 + 1e-9 {
            0.125
        } else if inch <= 0.5 + 1e-9 {
            0.1875
        } else if inch <= 0.75 + 1e-9 {
            0.25
        } else {
            0.3125
        }) * IN_TO_M
    }
}

fn mm(v: f64) -> String {
    format!("{:.1} mm", v * 1e3)
}

fn kn(v: f64) -> String {
    format!("{:.1} kN", v / 1e3)
}

fn unresolved(checks: Vec<CheckOutcome>) -> SinglePlateDesign {
    SinglePlateDesign {
        checks,
        geometry: Value::Null,
        bolt_group: Value::Null,
        free_body: Value::Null,
        bill: json!([]),
    }
}

/// Design the connection.
pub fn design(
    p: &SinglePlate,
    beam: &Beam,
    support: &Support,
    act: &ConnectionActions,
) -> SinglePlateDesign {
    let mut checks = vec![];
    let b = &p.bolt;
    let (n, cols) = (p.rows, p.columns.clamp(1, 2));
    let nb = (n * cols) as f64;
    let (s, g, tp) = (p.pitch, if cols == 2 { p.gauge } else { 0.0 }, p.thickness);
    let l = 2.0 * p.lev + (n as f64 - 1.0) * s;
    let width = p.a + g + p.leh_plate;
    let (dh, dn, d) = (b.hole(), b.net_hole(), b.diameter);
    let leh_beam = p.leh_beam - p.underrun;
    let v = act.v.abs();
    let scale = v.max(act.n.abs()).max(1.0);
    let tension = act.n > 1e-6 * scale;
    let n_t = act.n.max(0.0);
    let r = v.hypot(n_t);
    let metric = b.metric;
    let six_in = if metric { 0.150 } else { 6.0 * IN_TO_M };
    let twelve_in = if metric { 0.300 } else { 12.0 * IN_TO_M };

    // --- Conditions outside the simple shear connection ---
    let m_tol = 1e-6 * (v * l).max(1.0);
    let moment_ok = act.m.abs() <= m_tol;
    checks.push(if moment_ok {
        CheckOutcome::result(
            "connection.momentTransfer",
            "B3.4(a)",
            CheckStatus::Pass,
            act.m.abs(),
            m_tol,
            "N m",
            json!({"M": act.m}),
            "The analysis carries no moment through this end: a simple connection",
        )
    } else {
        CheckOutcome::unsupported(
            "connection.momentTransfer",
            "B3.4(a)",
            format!(
                "The analysis transfers {:.2} kN·m through this end. A single-plate shear connection is a simple connection: release My at this end or use a moment connection (not available)",
                act.m.abs() / 1e3
            ),
        )
    });
    let out_of_plane = act
        .v_minor
        .abs()
        .max(act.m_minor.abs() / l)
        .max(act.torsion.abs() / l);
    if out_of_plane > 1e-6 * scale {
        checks.push(CheckOutcome::unsupported(
            "connection.outOfPlane",
            "J4",
            "Minor-axis shear, minor-axis moment or torsion at this end: the single-plate connection is checked for in-plane shear and axial force only",
        ));
    }
    if act.n < -1e-6 * scale {
        checks.push(CheckOutcome::unsupported(
            "connection.compression",
            "J4.4",
            "Axial compression in the plate needs an effective length for J4.4/Chapter E that the held texts do not give for single plates",
        ));
    }

    // --- Detailing (J3.3–J3.6, J2.2b) and fit ---
    let min_s = (8.0 / 3.0 * d).max(dh + d);
    let max_s = (24.0 * tp.min(beam.tw)).min(twelve_in);
    let worst_spacing = if cols == 2 { s.min(g) } else { s };
    checks.push(CheckOutcome::result(
        "connection.spacing",
        "J3.4, J3.6(a)",
        pass_if(worst_spacing >= min_s - 1e-12 && s <= max_s + 1e-12),
        min_s,
        worst_spacing,
        "m",
        json!({"pitch": s, "gauge": if cols == 2 { json!(g) } else { Value::Null }, "minimum": min_s, "maximumPitch": max_s,
               "rule": "centres ≥ 2⅔d with clear distance ≥ d (J3.4); pitch ≤ min(24t, 12 in.) (J3.6(a))"}),
        format!("Pitch {} (gauge {}), minimum {}", mm(s), if cols == 2 { mm(g) } else { "—".into() }, mm(min_s)),
    ));
    let table = b.min_edge();
    let edges = [
        ("plate vertical", p.lev, tp),
        ("plate horizontal", p.leh_plate, tp),
        ("beam web horizontal", leh_beam, beam.tw),
    ];
    let worst_edge = edges.iter().map(|e| e.1).fold(f64::INFINITY, f64::min);
    let edge_max_bad: Vec<&str> = edges
        .iter()
        .filter(|e| e.1 > (12.0 * e.2).min(six_in) + 1e-12)
        .map(|e| e.0)
        .collect();
    let below_table: Vec<&str> = edges
        .iter()
        .filter(|e| e.1 < table - 1e-12)
        .map(|e| e.0)
        .collect();
    checks.push(CheckOutcome::result(
        "connection.edgeDistance",
        "J3.5 Table J3.4 (footnote a), J3.6",
        pass_if(worst_edge >= d - 1e-12 && edge_max_bad.is_empty()),
        d,
        worst_edge,
        "m",
        json!({"edges": edges.iter().map(|e| json!({"edge": e.0, "value": e.1, "maximum": (12.0 * e.2).min(six_in)})).collect::<Vec<_>>(),
               "tableJ34": table, "belowTable": below_table, "aboveMaximum": edge_max_bad,
               "note": "Edges below Table J3.4 are permitted by footnote a down to d because J3.11 and J4 are checked with the actual distances"}),
        if edge_max_bad.is_empty() {
            format!("Smallest edge {} (Table J3.4 {}, never below d = {})", mm(worst_edge), mm(table), mm(d))
        } else {
            format!("Edge distance above min(12t, 6 in.): {}", edge_max_bad.join(", "))
        },
    ));
    let clear_top = p.top_offset - beam.kdes;
    let clear_bottom = beam.d - beam.kdes - (p.top_offset + l);
    let beam_end_gap = p.a - p.leh_beam;
    let flange_clear = if support.kind == SupportKind::ColumnWeb {
        (support.flange_width - support.web_thickness) / 2.0
    } else {
        0.0
    };
    let fit = clear_top >= -1e-12 && clear_bottom >= -1e-12 && beam_end_gap >= flange_clear - 1e-12;
    checks.push(CheckOutcome::result(
        "connection.fit",
        "Detailing",
        pass_if(fit),
        l,
        beam.d - 2.0 * beam.kdes,
        "m",
        json!({"plateLength": l, "T": beam.d - 2.0 * beam.kdes, "clearTop": clear_top, "clearBottom": clear_bottom,
               "beamEndFromSupport": beam_end_gap, "flangeTipClearance": flange_clear,
               "recommendedMinimumLength": (beam.d - 2.0 * beam.kdes) / 2.0,
               "note": "The plate sits within the beam's flat web (k_des from each flange); the beam end clears the support (a column web's flange tips). A plate length of at least T/2 is recommended for erection stability (Design Example II.A-17A)"}),
        if fit {
            format!("Plate {} within the flat web; beam end {} from the support", mm(l), mm(beam_end_gap))
        } else {
            "The plate does not fit within the beam's flat web, or the beam end does not clear the support".into()
        },
    ));

    // --- Bolt group: J3.7, J3.11a and the instantaneous centre ---
    let (k_bear, k_tear) = if p.deformation_considered {
        (2.4, 1.2)
    } else {
        (3.0, 1.5)
    };
    let r_shear = PHI_BOLT * b.fnv() * b.area();
    let down = act.v >= 0.0;
    let mut bolts = vec![];
    let mut sum = 0.0;
    for i in 0..n {
        for j in 0..cols {
            // Plate: the bolts bear on the plate in the direction of the beam
            // reaction (down for gravity) and, under tension, toward its free edge.
            let edge_row = if down { i == n - 1 } else { i == 0 };
            let plate_v = if edge_row { p.lev - dh / 2.0 } else { s - dh };
            let plate_h = if j == cols - 1 {
                p.leh_plate - dh / 2.0
            } else {
                g - dh
            };
            // Beam web: opposite sense; toward a flange there is no edge
            // (uncoped), so tearout does not apply there.
            let web_edge_row = if down { i == 0 } else { i == n - 1 };
            let web_v = if web_edge_row { f64::INFINITY } else { s - dh };
            let web_h = if j == 0 { leh_beam - dh / 2.0 } else { g - dh };
            let (lc_plate, lc_web) = if tension {
                (plate_v.min(plate_h), web_v.min(web_h))
            } else {
                (plate_v, web_v)
            };
            let plate_bear = PHI_BEARING * k_bear * d * tp * p.fu;
            let plate_tear = PHI_BEARING * k_tear * lc_plate * tp * p.fu;
            let web_bear = PHI_BEARING * k_bear * d * beam.tw * beam.fu;
            let web_tear = if lc_web.is_finite() {
                PHI_BEARING * k_tear * lc_web * beam.tw * beam.fu
            } else {
                f64::INFINITY
            };
            let ri = r_shear
                .min(plate_bear)
                .min(plate_tear)
                .min(web_bear)
                .min(web_tear);
            let governs = [
                ("bolt shear", r_shear),
                ("plate bearing", plate_bear),
                ("plate tearout", plate_tear),
                ("web bearing", web_bear),
                ("web tearout", web_tear),
            ]
            .iter()
            .find(|x| x.1 == ri)
            .unwrap()
            .0;
            sum += ri;
            bolts.push(json!({"row": i + 1, "line": j + 1, "lcPlate": lc_plate, "lcWeb": if lc_web.is_finite() { json!(lc_web) } else { Value::Null },
                "phiRnShear": r_shear, "phiRnPlateBearing": plate_bear, "phiRnPlateTearout": plate_tear, "phiRnWebBearing": web_bear,
                "phiRnWebTearout": if web_tear.is_finite() { json!(web_tear) } else { Value::Null }, "phiRn": ri, "governs": governs}));
        }
    }
    let x_bar = g / 2.0;
    let group: Vec<[f64; 2]> = (0..cols)
        .flat_map(|j| {
            icr::vertical_row(n, s)
                .into_iter()
                .map(move |q| [j as f64 * g - x_bar, q[1]])
        })
        .collect();
    let e = p.a + x_bar;
    // The beam's force on the bolts: down for gravity, away from the support
    // (+x) for tension; its line passes through the support face.
    let dir = if r > 0.0 {
        [n_t / r, if down { -v / r } else { v / r }]
    } else {
        [0.0, -1.0]
    };
    let Some(solution) = icr::solve(&group, [-e, 0.0], dir) else {
        checks.push(CheckOutcome::unsupported(
            "connection.boltGroup",
            "J3.7, J3.11a; instantaneous centre",
            "The instantaneous centre did not converge for this bolt group and load: no bolt group strength is reported",
        ));
        return unresolved(checks);
    };
    let c = solution.c;
    let phi_group = c / nb * sum;
    checks.push(CheckOutcome::result(
        "connection.boltGroup",
        "J3.7, J3.11a; instantaneous centre (User Note to J3.7)",
        pass_if(r <= phi_group),
        r,
        phi_group,
        "N",
        json!({"C": c, "bolts": nb, "eccentricity": e, "loadAngleFromVertical": n_t.atan2(v).to_degrees(),
               "bearingCoefficients": [k_bear, k_tear], "Fnv": b.fnv(), "Ab": b.area(), "hole": dh,
               "perBolt": bolts, "sumPhiRn": sum, "icrResidual": solution.residual, "centre": solution.centre,
               "rule": "φR_n = (C/n) Σ φr_n,i, with φr_n,i the least of bolt shear and the bearing and tearout of the plate and beam web at that bolt"}),
        format!("C = {c:.3} for {} bolts at e = {}: φR_n = {} for R_u = {}", nb as usize, mm(e), kn(phi_group), kn(r)),
    ));

    // --- Plate ---
    let agv = l * tp;
    let shear_yield = PHI_SHEAR_YIELD * 0.6 * p.fy * agv;
    checks.push(CheckOutcome::result(
        "connection.plate.shearYield",
        "J4.2(a) (J4-3)",
        pass_if(v <= shear_yield),
        v,
        shear_yield,
        "N",
        json!({"Agv": agv}),
        "Shear yielding of the plate",
    ));
    let anv = (l - n as f64 * dn) * tp;
    let shear_rupture = PHI_RUPTURE * 0.6 * p.fu * anv;
    checks.push(CheckOutcome::result(
        "connection.plate.shearRupture",
        "J4.2(b) (J4-4), B4.3b",
        pass_if(v <= shear_rupture),
        v,
        shear_rupture,
        "N",
        json!({"Anv": anv}),
        "Shear rupture of the plate on the net section through a bolt line",
    ));
    // Block shear for the beam reaction: shear along the bolt line nearest the
    // support, tension across to the free edge.
    let ubs = if cols == 1 { 1.0 } else { 0.5 };
    let (bs_v, bs_v_detail) = block_shear(
        p.fu,
        p.fy,
        (l - p.lev) * tp,
        (l - p.lev - (n as f64 - 0.5) * dn) * tp,
        (g + p.leh_plate - (cols as f64 - 0.5) * dn) * tp,
        ubs,
    );
    let block_v = PHI_RUPTURE * bs_v;
    checks.push(CheckOutcome::result(
        "connection.plate.blockShear",
        "J4.3 (J4-5)",
        pass_if(v <= block_v),
        v,
        block_v,
        "N",
        bs_v_detail,
        if cols == 1 {
            "L-shaped block, uniform tension (U_bs = 1)"
        } else {
            "L-shaped block across two bolt lines, nonuniform tension (U_bs = 0.5)"
        },
    ));
    let mu = v * p.a;
    let z = tp * l * l / 4.0;
    let sx = tp * l * l / 6.0;
    let mp = p.fy * z;
    let m_yield = mp.min(1.5 * p.fy * sx);
    let lambda = p.a * l / (tp * tp);
    let (e_mod, fy) = (p.elastic_modulus, p.fy);
    let (m_ltb, ltb_case) = if lambda <= 0.08 * e_mod / fy {
        (f64::INFINITY, "F11.2(a): not applicable")
    } else if lambda <= 1.9 * e_mod / fy {
        (
            (CB_PLATE * (1.52 - 0.274 * lambda * fy / e_mod) * fy * sx).min(mp),
            "F11.2(b) (F11-3)",
        )
    } else {
        let fcr = 1.9 * e_mod * CB_PLATE / lambda;
        ((fcr * sx).min(mp), "F11.2(c) (F11-4, F11-5)")
    };
    let phi_mn = PHI_FLEXURE * m_yield.min(m_ltb);
    checks.push(CheckOutcome::result(
        "connection.plate.flexure",
        "F11.1 (F11-1), F11.2; C_b = 1.84 (Manual Part 10)",
        pass_if(mu <= phi_mn),
        mu,
        phi_mn,
        "N m",
        json!({"Mu": mu, "lever": p.a, "Z": z, "S": sx, "Mp": mp, "MnYield": m_yield, "MnLtb": if m_ltb.is_finite() { json!(m_ltb) } else { Value::Null },
               "LbDOverT2": lambda, "ltbCase": ltb_case, "Cb": CB_PLATE, "Lb": p.a}),
        "Plate flexure at the bolt line from the shear at the support distance a",
    ));
    let ys: Vec<f64> = icr::vertical_row(n, s).iter().map(|q| q[1]).collect();
    let znet = z_net(tp, l, dn, &ys);
    let phi_mrup = PHI_RUPTURE * p.fu * znet;
    checks.push(CheckOutcome::result(
        "connection.plate.flexuralRupture",
        "J4.5; Manual Eq. 9-8 (Design Example II.A-17B)",
        pass_if(mu <= phi_mrup),
        mu,
        phi_mrup,
        "N m",
        json!({"Znet": znet}),
        "Flexural rupture on the net section through a bolt line",
    ));
    let tension_yield = PHI_TENSION_YIELD * p.fy * l * tp;
    let tension_rupture = PHI_RUPTURE * p.fu * anv;
    let braced = p.braced_against_rotation;
    let interaction = |id: &str,
                       clause: &str,
                       pc: f64,
                       mc: f64,
                       vc: f64,
                       what: &str|
     -> CheckOutcome {
        match braced {
            None => indeterminate(
                id,
                clause,
                "Confirm whether the beam is braced against rotation about its longitudinal axis",
            ),
            Some(false) => CheckOutcome::unsupported(
                id,
                clause,
                "A beam free to rotate about its axis puts weak-axis moment on the plate, which is not implemented",
            ),
            Some(true) => {
                let pr = n_t / pc;
                let ratio = if pr < 0.2 {
                    (n_t / (2.0 * pc) + mu / mc).powi(2) + (v / vc).powi(2)
                } else {
                    (pr + 8.0 / 9.0 * mu / mc).powi(2) + (v / vc).powi(2)
                };
                CheckOutcome::result(
                    id,
                    clause,
                    pass_if(ratio <= 1.0),
                    ratio,
                    1.0,
                    "-",
                    json!({"Pr/Pc": pr, "Mr/Mc": mu / mc, "Vr/Vc": v / vc, "Pc": pc, "Mc": mc, "Vc": vc,
                           "equation": if pr < 0.2 { "Manual Eq. 12-2" } else { "Manual Eq. 12-3" }}),
                    format!("Interaction of axial, flexural and shear {what} in the plate"),
                )
            }
        }
    };
    checks.push(interaction(
        "connection.plate.interactionYield",
        "Manual Eqs. 10-8, 12-2, 12-3 (Design Examples II.A-17B, II.A-19A)",
        tension_yield,
        phi_mn,
        shear_yield,
        "yielding",
    ));
    let c_prime = icr::moment_only(&group);
    let m_max = b.fnv() / 0.90 * b.area() * c_prime;
    let t_max = 6.0 * m_max / (p.fy * l * l);
    checks.push(CheckOutcome::result(
        "connection.plate.ductility",
        "Manual Eqs. 10-6, 10-7 (Design Example II.A-19A)",
        pass_if(tp <= t_max),
        tp,
        t_max,
        "m",
        json!({"Cprime": c_prime, "Mmax": m_max, "tmax": t_max}),
        "The plate yields in flexure before the bolts fracture",
    ));
    if tension {
        checks.push(CheckOutcome::result(
            "connection.plate.tensionYield",
            "J4.1(a) (J4-1)",
            pass_if(n_t <= tension_yield),
            n_t,
            tension_yield,
            "N",
            json!({"Ag": l * tp}),
            "Tensile yielding of the plate",
        ));
        checks.push(CheckOutcome::result(
            "connection.plate.tensionRupture",
            "J4.1(b) (J4-2), Table D3.1 case 1",
            pass_if(n_t <= tension_rupture),
            n_t,
            tension_rupture,
            "N",
            json!({"An": anv, "U": 1.0}),
            "Tensile rupture of the plate",
        ));
        let horiz = g + p.leh_plate;
        let (l_shape, l_detail) = block_shear(
            p.fu,
            p.fy,
            horiz * tp,
            (horiz - (cols as f64 - 0.5) * dn) * tp,
            (l - p.lev - (n as f64 - 0.5) * dn) * tp,
            1.0,
        );
        let (u_shape, u_detail) = block_shear(
            p.fu,
            p.fy,
            2.0 * horiz * tp,
            2.0 * (horiz - (cols as f64 - 0.5) * dn) * tp,
            (l - 2.0 * p.lev - (n as f64 - 1.0) * dn) * tp,
            1.0,
        );
        let block_n = PHI_RUPTURE * l_shape.min(u_shape);
        let ratio = (v / block_v).powi(2) + (n_t / block_n).powi(2);
        checks.push(CheckOutcome::result(
            "connection.plate.blockShearInteraction",
            "J4.3 (J4-5); Manual Eq. 12-1 (Design Example II.A-17B)",
            pass_if(ratio <= 1.0),
            ratio,
            1.0,
            "-",
            json!({"phiRnShear": block_v, "phiRnAxial": block_n, "LShape": l_detail, "UShape": u_detail}),
            "Plate block shear under shear and tension",
        ));
        checks.push(interaction(
            "connection.plate.interactionRupture",
            "Manual Eqs. 12-2, 12-3 (Design Example II.A-17B)",
            tension_rupture,
            phi_mrup,
            shear_rupture,
            "rupture",
        ));
    }

    // --- Weld (J2.2b, J2.4) ---
    let develop = 5.0 / 8.0 * tp;
    let thinner = tp.min(support.thickness);
    let w_min = min_fillet(thinner, metric);
    let size_ok = p.weld >= develop - 1e-12 && p.weld >= w_min - 1e-12 && l >= 4.0 * p.weld - 1e-12;
    checks.push(CheckOutcome::result(
        "connection.weld.size",
        "J2.2b Table J2.4; 5/8 t_p (Manual Part 10, Design Examples II.A-17B, II.A-19A)",
        pass_if(size_ok),
        develop.max(w_min),
        p.weld,
        "m",
        json!({"developPlate": develop, "tableJ24Minimum": w_min, "thinnerPart": thinner, "minimumLength": 4.0 * p.weld,
               "note": "Two fillets of 5/8 t_p develop the plate, so the weld is not the weak link under the indeterminate moment at the support"}),
        format!("Fillet {} each side; 5/8 t_p = {}, Table J2.4 minimum {}", mm(p.weld), mm(develop), mm(w_min)),
    ));
    let awe = 2.0 * p.weld / 2f64.sqrt() * l;
    let weld_rn = PHI_WELD * 0.6 * p.fexx * awe;
    checks.push(CheckOutcome::result(
        "connection.weld.strength",
        "J2.4 (J2-4), Table J2.5; k_ds = 1.0",
        pass_if(r <= weld_rn),
        r,
        weld_rn,
        "N",
        json!({"Awe": awe, "Fnw": 0.6 * p.fexx, "kds": 1.0,
               "note": "k_ds = 1.0: the weld group is not loaded through its centroid, so the J2-5 increase is not taken"}),
        "Two fillet welds along the plate under the resultant",
    ));

    // --- Support at the weld ---
    let support_rn = PHI_RUPTURE * 0.6 * support.fu * 2.0 * l * support.thickness;
    checks.push(CheckOutcome::result(
        "connection.support.shearRupture",
        "J4.2(b) (J4-4)",
        pass_if(v <= support_rn),
        v,
        support_rn,
        "N",
        json!({"Anv": 2.0 * l * support.thickness, "planes": 2}),
        format!(
            "Shear rupture of the {} along both weld lines",
            support.kind.label()
        ),
    ));
    let sixteenths = p.weld / (IN_TO_M / 16.0);
    let t_min = 3.09 * sixteenths / (support.fu / KSI_TO_PA) * IN_TO_M;
    checks.push(CheckOutcome::result(
        "connection.support.thickness",
        "Manual Eq. 9-6 (Design Examples II.A-17A, II.A-18, II.A-19A)",
        pass_if(support.thickness >= t_min - 1e-12),
        t_min,
        support.thickness,
        "m",
        json!({"D": sixteenths, "tmin": t_min, "note": "Plate on one side of the support"}),
        format!(
            "The {} matches the weld's shear rupture strength",
            support.kind.label()
        ),
    ));

    // --- Beam ---
    let beam_shear = PHI_SHEAR_YIELD * 0.6 * beam.fy * beam.d * beam.tw;
    checks.push(CheckOutcome::result(
        "connection.beam.shearYield",
        "J4.2(a) (J4-3)",
        pass_if(v <= beam_shear),
        v,
        beam_shear,
        "N",
        json!({"Agv": beam.d * beam.tw}),
        "Shear yielding of the beam web (uncoped: shear rupture and block shear do not apply)",
    ));
    if tension {
        let beam_ty = PHI_TENSION_YIELD * beam.fy * beam.ag;
        checks.push(CheckOutcome::result(
            "connection.beam.tensionYield",
            "J4.1(a) (J4-1)",
            pass_if(n_t <= beam_ty),
            n_t,
            beam_ty,
            "N",
            json!({"Ag": beam.ag}),
            "Tensile yielding of the beam",
        ));
        let u = (beam.d - 2.0 * beam.tf) * beam.tw / beam.ag;
        let an = beam.ag - n as f64 * dn * beam.tw;
        let beam_tr = PHI_RUPTURE * beam.fu * an * u;
        checks.push(CheckOutcome::result(
            "connection.beam.tensionRupture",
            "J4.1(b) (J4-2), D3",
            pass_if(n_t <= beam_tr),
            n_t,
            beam_tr,
            "N",
            json!({"An": an, "U": u, "Ae": an * u, "note": "U is the connected web's share of the gross area (D3)"}),
            "Tensile rupture of the beam at the bolt line",
        ));
        let horiz = leh_beam + g;
        let (bs, detail) = block_shear(
            beam.fu,
            beam.fy,
            2.0 * horiz * beam.tw,
            2.0 * (horiz - (cols as f64 - 0.5) * dn) * beam.tw,
            ((n as f64 - 1.0) * (s - dn)) * beam.tw,
            1.0,
        );
        let beam_bs = PHI_RUPTURE * bs;
        checks.push(CheckOutcome::result(
            "connection.beam.blockShear",
            "J4.3 (J4-5)",
            pass_if(n_t <= beam_bs),
            n_t,
            beam_bs,
            "N",
            detail,
            "U-shaped block of the beam web under tension, with the length underrun",
        ));
    }

    // --- Free body, geometry and bill of materials ---
    let free_body = json!({
        "boltGroupCentroid": {"V": act.v, "N": act.n, "M": 0.0},
        "boltLineNearSupport": {"V": act.v, "N": act.n, "M": act.v * x_bar},
        "supportFace": {"V": act.v, "N": act.n, "M": act.v * e},
        "supportReaction": {"V": -act.v, "N": -act.n, "M": -act.v * e},
        "note": "The connection is in equilibrium with the beam end actions: the support face carries V, N and V·e with e = a + (gauge/2 for two lines); the plate's critical flexural section is the bolt line nearest the support (V·a)"
    });
    let rows_y: Vec<f64> = (0..n)
        .map(|i| p.top_offset + p.lev + i as f64 * s)
        .collect();
    let lines_x: Vec<f64> = (0..cols).map(|j| p.a + j as f64 * g).collect();
    let geometry = json!({
        "units": "m",
        "origin": "support face at x = 0, beam top at y = 0, y downward",
        "plate": {"x0": 0.0, "x1": width, "y0": p.top_offset, "y1": p.top_offset + l, "thickness": tp, "width": width, "length": l},
        "bolts": {"x": lines_x, "y": rows_y, "hole": dh, "diameter": d, "designation": b.designation},
        "beam": {"designation": beam.designation, "depth": beam.d, "flange": beam.tf, "kdes": beam.kdes, "end": beam_end_gap, "web": beam.tw},
        "support": {"designation": support.designation, "kind": support.kind, "thickness": support.thickness},
        "weld": {"size": p.weld, "length": l, "sides": 2},
        "dimensions": [
            {"label": "a", "value": p.a, "from": [0.0, p.top_offset - 0.0], "to": [p.a, p.top_offset], "axis": "x"},
            {"label": "leh (plate)", "value": p.leh_plate, "from": [p.a + g, p.top_offset], "to": [width, p.top_offset], "axis": "x"},
            {"label": "leh (beam)", "value": p.leh_beam, "from": [beam_end_gap, rows_y[n - 1]], "to": [p.a, rows_y[n - 1]], "axis": "x"},
            {"label": "lev", "value": p.lev, "from": [width, p.top_offset], "to": [width, rows_y[0]], "axis": "y"},
            {"label": "s", "value": s, "from": [width, rows_y[0]], "to": [width, rows_y[n - 1]], "axis": "y", "count": n - 1},
            {"label": "l", "value": l, "from": [0.0, p.top_offset], "to": [0.0, p.top_offset + l], "axis": "y"},
            {"label": "gauge", "value": g, "from": [p.a, p.top_offset], "to": [p.a + g, p.top_offset], "axis": "x", "present": cols == 2},
        ],
    });
    let plate_mass = STEEL_DENSITY * tp * width * l
        - STEEL_DENSITY * tp * std::f64::consts::PI * dh * dh / 4.0 * nb;
    let bill = json!([
        {"item": "Plate", "description": format!("PL {} × {} × {}", mm(tp), mm(width), mm(l)), "material": format!("Fy {:.0} MPa, Fu {:.0} MPa", p.fy / 1e6, p.fu / 1e6),
         "quantity": 1, "thickness": tp, "width": width, "length": l, "massKg": plate_mass},
        {"item": "Bolts", "description": format!("{} {} {}, standard holes, snug-tight", b.designation, b.group_label(), if b.threads_excluded { "threads excluded (X)" } else { "threads included (N)" }),
         "quantity": nb as usize, "diameter": d, "hole": dh, "note": "Length by grip: plate + beam web + washer, from the bolt supplier's tables"},
        {"item": "Fillet weld", "description": format!("{} fillet both sides, E{:.0}", mm(p.weld), p.fexx / KSI_TO_PA), "quantity": 2, "size": p.weld, "length": l, "totalLength": 2.0 * l},
    ]);
    let bolt_group = json!({"C": c, "Cprime": c_prime, "centre": solution.centre, "residual": solution.residual, "iterations": solution.iterations,
        "forces": solution.forces, "eccentricity": e, "positions": group});
    SinglePlateDesign {
        checks,
        geometry,
        bolt_group,
        free_body,
        bill,
    }
}
