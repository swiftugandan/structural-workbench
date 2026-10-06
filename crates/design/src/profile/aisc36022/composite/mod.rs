//! Simply supported composite beam under ANSI/AISC 360-22 LRFD Chapter I
//! (M17, ADR 0031): an unshored W beam with steel headed stud anchors under a
//! solid slab or a slab on formed steel deck (ribs perpendicular or parallel
//! to the beam), checked through its stages:
//!
//! - construction (I3.1b): the steel section alone under the loads applied
//!   before the concrete hardens, by Chapter F;
//! - composite (I3.2a, I3.2d, I8.2): the plastic stress distribution with the
//!   stud force available at every station, so concentrated loads are
//!   developed (I8.2c); shear on the steel section alone (I4.3 → Chapter G);
//! - service: the wet-concrete deflection on the steel section, the live load
//!   deflection on the lower-bound moment of inertia (Commentary C-I3-1), and
//!   the long-term deflection with the Commentary's shrinkage model; creep
//!   has no method in the held texts and needs the engineer's judgement.
//!
//! Clause reading: `docs/code-profiles/aisc-360-22-lrfd/dossier-composite.md`.

use serde_json::{Value, json};

use super::flexure::{
    evaluate_flange_local_buckling, evaluate_flexure_major_yielding, evaluate_ltb, flange_limits,
};
use super::shear::evaluate_shear_major_g21a;
use super::units::{IN_TO_M, KSI_TO_PA};
use crate::profile::{CheckOutcome, CheckStatus, WSectionProps};

#[cfg(test)]
mod tests;

const PHI_B: f64 = 0.90;
/// Pounds per cubic foot in kg/m³.
const PCF: f64 = 16.018_463_373_960_14;
const FT_TO_M: f64 = 0.3048;
const KIP_PER_FT: f64 = 4_448.221_615_260_5 / FT_TO_M;

/// The steel beam: a catalogue W section and its steel.
#[derive(Debug, Clone, PartialEq)]
pub struct SteelBeam {
    pub designation: String,
    pub section: WSectionProps,
    /// Strong-axis second moment of area I_x (m⁴).
    pub ix: f64,
    pub fy: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Deck {
    /// Solid slab, no formed deck.
    Solid,
    /// Deck ribs perpendicular to the beam.
    Perpendicular,
    /// Deck ribs parallel to the beam.
    Parallel,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Slab {
    /// Total slab thickness t (to the top of the steel beam).
    pub thickness: f64,
    pub deck: Deck,
    /// Nominal rib height h_r.
    pub rib_height: f64,
    /// Average rib width w_r.
    pub rib_width: f64,
    /// Rib pitch (centre to centre of ribs).
    pub rib_pitch: f64,
    pub fc: f64,
    /// Concrete density (kg/m³).
    pub density: f64,
    pub lightweight: bool,
}

impl Slab {
    /// E_c = w_c^1.5 √f'c in the Specification's US form (I8.2a), w_c in
    /// lb/ft³ and f'c in ksi, converted exactly to Pa.
    pub fn ec(&self) -> f64 {
        (self.density / PCF).powf(1.5) * (self.fc / KSI_TO_PA).sqrt() * KSI_TO_PA
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Studs {
    pub diameter: f64,
    pub fu: f64,
    /// Installed length, base to top of head.
    pub length: f64,
    /// Studs in each row across the flange (1–3).
    pub per_row: usize,
    /// Rows along the beam at this spacing (for perpendicular deck, the
    /// spacing of the ribs used).
    pub row_spacing: f64,
    /// First row from each support.
    pub first_row: f64,
    /// Transverse spacing between studs of one row.
    pub transverse_spacing: f64,
    /// Studs welded to the flange directly over the web.
    pub over_web: bool,
    /// e_mid-ht for perpendicular deck (I8.2a); None means not known.
    pub emid_ht: Option<f64>,
}

/// One side of the beam for the effective width (I3.1a).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Side {
    /// Centre-to-centre distance to the adjacent beam.
    Adjacent(f64),
    /// Distance to the slab edge.
    Edge(f64),
}

#[derive(Debug, Clone, PartialEq)]
pub struct CompositeBeam {
    pub span: f64,
    pub beam: SteelBeam,
    pub slab: Slab,
    pub studs: Studs,
    pub sides: [Side; 2],
    /// Unbraced length and C_b of the bare steel before the concrete hardens.
    pub construction_lb: f64,
    pub construction_cb: f64,
    pub camber: f64,
    /// Deflection limits as L/n; None leaves the check indeterminate.
    pub pre_composite_limit: Option<f64>,
    pub live_limit: Option<f64>,
    pub long_term_limit: Option<f64>,
    /// Restrained shrinkage strain ε_sh (Commentary I3.2: 0.0002 when the
    /// aggregate coefficient is not known); None leaves it indeterminate.
    pub shrinkage_strain: Option<f64>,
    /// The engineer's judgement on creep: Some(true) when judged and accounted
    /// for, Some(false) when it must be calculated (not implemented).
    pub creep_judgement: Option<bool>,
}

/// A diagram along the span: stations from the left support (m), moment
/// (sagging positive, N m) and shear (N).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Diagram {
    pub stations: Vec<f64>,
    pub moment: Vec<f64>,
    pub shear: Vec<f64>,
}

/// The actions of each stage, from the analysis.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Stages {
    /// Factored loads applied before the concrete hardens.
    pub construction: Diagram,
    /// Factored total loads (pre-composite and composite).
    pub composite: Diagram,
    /// Service loads on the steel alone (wet concrete and self weight).
    pub wet: Option<Diagram>,
    /// Service live load on the composite section.
    pub live: Option<Diagram>,
    /// Service sustained load applied after hardening (for long-term).
    pub sustained: Option<Diagram>,
    /// Uniform load or equally spaced point loads (Commentary I3.2d.1).
    pub regular_loading: bool,
    /// Positions of concentrated loads in the composite stage (I8.2c).
    pub load_points: Vec<f64>,
}

#[derive(Debug, Clone)]
pub struct CompositeDesign {
    pub checks: Vec<CheckOutcome>,
    pub section: Value,
    pub studs: Value,
    pub deflections: Value,
}

/// A horizontal concrete layer: depth from the slab top to its top, its
/// thickness and its width.
#[derive(Debug, Clone, Copy)]
struct Layer {
    top: f64,
    thickness: f64,
    width: f64,
}

/// Effective width (I3.1a).
pub fn effective_width(span: f64, sides: &[Side; 2]) -> f64 {
    sides
        .iter()
        .map(|s| match *s {
            Side::Adjacent(spacing) => (span / 8.0).min(spacing / 2.0),
            Side::Edge(edge) => (span / 8.0).min(edge),
        })
        .sum()
}

/// The concrete in compression and stiffness (I3.2c.2, I3.2c.3): above the
/// deck, plus the ribs for deck parallel to the beam (width b w_r/pitch).
fn layers(slab: &Slab, beff: f64) -> Vec<Layer> {
    match slab.deck {
        Deck::Solid => vec![Layer {
            top: 0.0,
            thickness: slab.thickness,
            width: beff,
        }],
        Deck::Perpendicular => vec![Layer {
            top: 0.0,
            thickness: slab.thickness - slab.rib_height,
            width: beff,
        }],
        Deck::Parallel => vec![
            Layer {
                top: 0.0,
                thickness: slab.thickness - slab.rib_height,
                width: beff,
            },
            Layer {
                top: slab.thickness - slab.rib_height,
                thickness: slab.rib_height,
                width: beff * (slab.rib_width / slab.rib_pitch).min(1.0),
            },
        ],
    }
}

/// A_c (I3-1a).
fn concrete_area(layers: &[Layer]) -> f64 {
    layers.iter().map(|l| l.width * l.thickness).sum()
}

/// The 0.85 f'c block carrying `c`: its depth from the slab top and the
/// depth of its centroid.
fn block(layers: &[Layer], fc: f64, c: f64) -> (f64, f64) {
    let mut left = c;
    let (mut moment, mut depth) = (0.0, 0.0);
    for l in layers {
        let full = 0.85 * fc * l.width * l.thickness;
        let take = left.min(full);
        let h = take / (0.85 * fc * l.width);
        moment += take * (l.top + h / 2.0);
        depth = l.top + h;
        left -= take;
        if left <= 0.0 {
            break;
        }
    }
    (depth, if c > 0.0 { moment / c } else { 0.0 })
}

/// Lower-bound moment of inertia (Commentary C-I3-1, C-I3-2) for the stud
/// force ΣQ_n (capped at C_f by the caller): (I_LB, Y_ENA from the steel top, d1).
fn lower_bound(beam: &SteelBeam, slab: &Slab, layers: &[Layer], q: f64) -> (f64, f64, f64) {
    let s = &beam.section;
    let (_, centroid) = block(layers, slab.fc, q);
    let d1 = slab.thickness - centroid;
    let d3 = s.d / 2.0;
    let qa = q / beam.fy;
    let y_ena = (s.ag * d3 + qa * (2.0 * d3 + d1)) / (s.ag + qa);
    (
        beam.ix + s.ag * (y_ena - d3).powi(2) + qa * (2.0 * d3 + d1 - y_ena).powi(2),
        y_ena,
        d1,
    )
}

/// Plastic strength for a slab force C (Commentary C-I3-6 … C-I3-10).
#[derive(Debug, Clone, PartialEq)]
pub struct Plastic {
    pub c: f64,
    pub a: f64,
    pub d1: f64,
    pub d2: f64,
    pub d3: f64,
    pub pna: &'static str,
    /// PNA depth below the top of the steel (0 when in the slab).
    pub x: f64,
    pub mn: f64,
}

fn plastic(beam: &SteelBeam, slab: &Slab, layers: &[Layer], c: f64) -> Plastic {
    let s = &beam.section;
    let py = beam.fy * s.ag;
    let (a, centroid) = block(layers, slab.fc, c);
    let d1 = slab.thickness - centroid;
    let d3 = s.d / 2.0;
    // Steel compression C_s = (P_y − C)/2, in the top flange, then the web.
    let cs = ((py - c) / 2.0).max(0.0);
    let flange = s.bf * s.tf * beam.fy;
    let (pna, x, d2) = if cs <= 1e-9 * py {
        ("slab", 0.0, 0.0)
    } else if cs <= flange {
        let x = cs / (s.bf * beam.fy);
        ("top flange", x, x / 2.0)
    } else {
        let x = s.tf + (cs - flange) / (s.tw * beam.fy);
        let web = cs - flange;
        (
            "web",
            x,
            (flange * s.tf / 2.0 + web * (s.tf + (x - s.tf) / 2.0)) / cs,
        )
    };
    Plastic {
        c,
        a,
        d1,
        d2,
        d3,
        pna,
        x,
        mn: c * (d1 + d2) + py * (d3 - d2),
    }
}

/// Q_n of one stud (I8-1) with R_g, R_p from I8.2a.
pub fn stud_strength(slab: &Slab, studs: &Studs) -> (f64, f64, f64, f64, f64, Option<String>) {
    let asa = std::f64::consts::PI * studs.diameter * studs.diameter / 4.0;
    let concrete = 0.5 * asa * (slab.fc * slab.ec()).sqrt();
    let two_in = 2.0 * IN_TO_M;
    let (rg, rp, note) = match slab.deck {
        Deck::Solid => (1.0, 0.75, None),
        Deck::Parallel => {
            if slab.rib_width / slab.rib_height >= 1.5 {
                (1.0, 0.75, None)
            } else if studs.per_row == 1 {
                (0.85, 0.75, None)
            } else {
                (
                    0.85,
                    0.75,
                    Some(
                        "I8.2a gives R_g for one stud only when w_r/h_r < 1.5 with deck parallel"
                            .to_string(),
                    ),
                )
            }
        }
        Deck::Perpendicular => {
            let rg = match studs.per_row {
                1 => 1.0,
                2 => 0.85,
                _ => 0.7,
            };
            let rp = if studs.emid_ht.is_some_and(|e| e >= two_in) {
                0.75
            } else {
                0.6
            };
            (rg, rp, None)
        }
    };
    let steel = rg * rp * asa * studs.fu;
    (concrete.min(steel), concrete, steel, rg, rp, note)
}

/// Row positions along the span.
fn rows(span: f64, studs: &Studs) -> Vec<f64> {
    let mut out = vec![];
    let mut x = studs.first_row;
    while x <= span - studs.first_row + 1e-9 && studs.row_spacing > 0.0 {
        out.push(x);
        x += studs.row_spacing;
    }
    out
}

/// ΣQ_n available at x: the studs between x and the nearer support in each
/// direction, the lesser of the two (the slab force at x is anchored both
/// ways).
fn studs_at(rows: &[f64], per_row: usize, qn: f64, x: f64) -> f64 {
    let left = rows.iter().filter(|&&r| r <= x + 1e-12).count();
    let right = rows.iter().filter(|&&r| r >= x - 1e-12).count();
    left.min(right) as f64 * per_row as f64 * qn
}

/// Chord-relative deflection from a sagging moment diagram on a simply
/// supported span: Δ(x) = ∫ M(ξ) m(x, ξ) dξ / EI, with m the moment of a
/// unit load at x. M is taken linear between stations (exact for point
/// loads) and each interval is integrated exactly (Simpson on a quadratic);
/// the largest magnitude and where.
pub fn deflection(d: &Diagram, span: f64, ei: f64) -> (f64, f64) {
    let n = d.stations.len();
    let mut best: (f64, f64) = (0.0, 0.0);
    for i in 0..n {
        let x = d.stations[i];
        let g = |xi: f64| {
            if xi <= x {
                xi * (span - x) / span
            } else {
                x * (span - xi) / span
            }
        };
        let mut sum = 0.0;
        for k in 1..n {
            let (a, b) = (d.stations[k - 1], d.stations[k]);
            let (m0, m1) = (d.moment[k - 1], d.moment[k]);
            let mid = 0.5 * (a + b);
            sum += (b - a) / 6.0 * (m0 * g(a) + 4.0 * 0.5 * (m0 + m1) * g(mid) + m1 * g(b));
        }
        let delta = sum / ei;
        if delta.abs() > best.0.abs() {
            best = (delta, x);
        }
    }
    best
}

/// Fully composite transformed section, concrete in tension neglected:
/// (I_tr, ENA depth below the slab top).
fn transformed(beam: &SteelBeam, slab: &Slab, layers: &[Layer], n: f64) -> (f64, f64) {
    let s = &beam.section;
    let zs = slab.thickness + s.d / 2.0;
    let first = |y: f64| -> f64 {
        let mut m = 0.0;
        for l in layers {
            let h = (y - l.top).clamp(0.0, l.thickness);
            m += l.width / n * h * (y - l.top - h / 2.0);
        }
        m - s.ag * (zs - y)
    };
    let (mut lo, mut hi) = (0.0, slab.thickness + s.d);
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        if first(mid) > 0.0 {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    let y = 0.5 * (lo + hi);
    let mut i = beam.ix + s.ag * (zs - y).powi(2);
    for l in layers {
        let h = (y - l.top).clamp(0.0, l.thickness);
        let w = l.width / n;
        i += w * h.powi(3) / 12.0 + w * h * (y - l.top - h / 2.0).powi(2);
    }
    (i, y)
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

fn mm(v: f64) -> String {
    format!("{:.1} mm", v * 1e3)
}

/// Design the composite beam through its stages.
pub fn design(c: &CompositeBeam, st: &Stages) -> CompositeDesign {
    let mut checks = vec![];
    let (b, slab, studs, l) = (&c.beam, &c.slab, &c.studs, c.span);
    let s = &b.section;
    let e = s.e;
    let inch = IN_TO_M;
    let beff = effective_width(l, &c.sides);
    let layers = layers(slab, beff);
    let ac = concrete_area(&layers);
    let py = b.fy * s.ag;
    let cf = (0.85 * slab.fc * ac).min(py);

    // --- Materials and section (I1.3, I3.2a) ---
    let (fc_lo, fc_hi) = if slab.lightweight {
        (3.0, 6.0)
    } else {
        (3.0, 10.0)
    };
    let fc_ksi = slab.fc / KSI_TO_PA;
    let mat_ok = (fc_lo - 1e-9..=fc_hi + 1e-9).contains(&fc_ksi) && b.fy <= 75.0 * KSI_TO_PA + 1e-6;
    checks.push(CheckOutcome::result(
        "composite.materials",
        "I1.3",
        pass_if(mat_ok),
        slab.fc,
        fc_hi * KSI_TO_PA,
        "Pa",
        json!({"fc": slab.fc, "range": [fc_lo * KSI_TO_PA, fc_hi * KSI_TO_PA], "Fy": b.fy, "FyMax": 75.0 * KSI_TO_PA, "lightweight": slab.lightweight}),
        format!("f'c {:.1} MPa within {:.0}–{:.0} MPa; Fy ≤ 525 MPa", slab.fc / 1e6, fc_lo * 6.894757, fc_hi * 6.894757),
    ));
    let web_limit = 3.76 * (e / b.fy).sqrt();
    if s.h_over_tw > web_limit {
        checks.push(CheckOutcome::unsupported(
            "composite.web",
            "I3.2a(b)",
            "The web exceeds 3.76√(E/F_y): the elastic stress distribution (first yield, shoring history) is not implemented",
        ));
    } else {
        checks.push(CheckOutcome::result(
            "composite.web",
            "I3.2a(a)",
            CheckStatus::Pass,
            s.h_over_tw,
            web_limit,
            "-",
            json!({}),
            "Compact web: the plastic stress distribution applies",
        ));
    }

    // --- Deck and studs (I3.2c, I8.1, I8.2, I8.2d) ---
    let above_deck = slab.thickness
        - if slab.deck == Deck::Solid {
            0.0
        } else {
            slab.rib_height
        };
    let projection = studs.length
        - if slab.deck == Deck::Solid {
            0.0
        } else {
            slab.rib_height
        };
    let cover = slab.thickness - studs.length;
    if slab.deck != Deck::Solid {
        let rules = [
            (
                "rib height ≤ 3 in. (75 mm)",
                slab.rib_height <= 3.0 * inch + 1e-9,
            ),
            (
                "average rib width ≥ 2 in. (50 mm)",
                slab.rib_width >= 2.0 * inch - 1e-9,
            ),
            (
                "stud ≥ 1½ in. (38 mm) above the deck",
                projection >= 1.5 * inch - 1e-9,
            ),
            (
                "slab ≥ 2 in. (50 mm) above the deck",
                above_deck >= 2.0 * inch - 1e-9,
            ),
            (
                "cover ≥ ½ in. (13 mm) over the studs",
                cover >= 0.5 * inch - 1e-9,
            ),
        ];
        let failed: Vec<&str> = rules.iter().filter(|r| !r.1).map(|r| r.0).collect();
        checks.push(CheckOutcome::result(
            "composite.deck",
            "I3.2c.1",
            pass_if(failed.is_empty()),
            slab.rib_height,
            3.0 * inch,
            "m",
            json!({"ribHeight": slab.rib_height, "ribWidth": slab.rib_width, "aboveDeck": above_deck, "studProjection": projection, "cover": cover, "failed": failed}),
            if failed.is_empty() { "Formed steel deck within I3.2c.1".into() } else { format!("Outside I3.2c.1: {}", failed.join("; ")) },
        ));
    } else {
        checks.push(CheckOutcome::result(
            "composite.deck",
            "I8.2, I3.2c.1(b)",
            pass_if(cover >= 0.5 * inch - 1e-9),
            0.5 * inch,
            cover,
            "m",
            json!({"cover": cover}),
            "Solid slab: cover over the studs",
        ));
    }
    let solid = slab.deck == Deck::Solid;
    let dia_max = if solid { 1.0 * inch } else { 0.75 * inch };
    let flange_ok = studs.over_web || studs.diameter <= 2.5 * s.tf + 1e-12;
    checks.push(CheckOutcome::result(
        "composite.studDiameter",
        "I8.1",
        pass_if(studs.diameter <= dia_max + 1e-12 && flange_ok),
        studs.diameter,
        if studs.over_web {
            dia_max
        } else {
            dia_max.min(2.5 * s.tf)
        },
        "m",
        json!({"maximum": dia_max, "flangeLimit": 2.5 * s.tf, "overWeb": studs.over_web}),
        format!(
            "Ø{} studs; ≤ {}{}",
            mm(studs.diameter),
            mm(dia_max),
            if studs.over_web {
                " (over the web)"
            } else {
                " and ≤ 2.5 t_f"
            }
        ),
    ));
    let min_len = 4.0 * studs.diameter;
    checks.push(CheckOutcome::result(
        "composite.studLength",
        "I8.2",
        pass_if(studs.length >= min_len - 1e-12),
        min_len,
        studs.length,
        "m",
        json!({}),
        "Installed length at least four diameters",
    ));
    let longitudinal_min = if slab.deck == Deck::Perpendicular {
        4.0
    } else {
        6.0
    } * studs.diameter;
    let max_spacing = (8.0 * slab.thickness).min(36.0 * inch);
    let transverse_ok =
        studs.per_row == 1 || studs.transverse_spacing >= 4.0 * studs.diameter - 1e-12;
    let spacing_ok = studs.row_spacing >= longitudinal_min - 1e-12
        && studs.row_spacing <= max_spacing + 1e-12
        && transverse_ok;
    checks.push(CheckOutcome::result(
        "composite.studSpacing",
        "I8.2d(d), (e)",
        pass_if(spacing_ok),
        studs.row_spacing,
        max_spacing,
        "m",
        json!({"rowSpacing": studs.row_spacing, "minimumLongitudinal": longitudinal_min, "maximum": max_spacing,
               "transverse": studs.transverse_spacing, "minimumTransverse": 4.0 * studs.diameter}),
        format!("Rows at {} (minimum {}, maximum {})", mm(studs.row_spacing), mm(longitudinal_min), mm(max_spacing)),
    ));

    // --- Stud strength (I8.2a) ---
    let (qn, q_concrete, q_steel, rg, rp, q_note) = stud_strength(slab, studs);
    let row_x = rows(l, studs);
    let studs_json = json!({"Qn": qn, "concreteLimit": q_concrete, "steelLimit": q_steel, "Rg": rg, "Rp": rp, "Ec": slab.ec(),
        "rows": row_x, "perRow": studs.per_row, "total": row_x.len() * studs.per_row});
    if let Some(note) = q_note {
        checks.push(CheckOutcome::unsupported(
            "composite.studStrength",
            "I8.2a",
            note,
        ));
    }

    // --- Construction stage (I3.1b → Chapter F) ---
    let yield_mp = evaluate_flexure_major_yielding(s, b.fy).mn;
    let ltb = evaluate_ltb(s, b.fy, c.construction_lb, c.construction_cb);
    // F3: noncompact flanges reduce M_n; slender flanges are unsupported.
    let (lpf, lrf) = flange_limits(e, b.fy);
    let flb = if s.bf_over_2tf <= lpf {
        f64::INFINITY
    } else {
        evaluate_flange_local_buckling(s, b.fy)
    };
    if s.bf_over_2tf > lrf {
        checks.push(CheckOutcome::unsupported(
            "composite.construction.flange",
            "F3.2",
            "Slender compression flange: F3-2 is not implemented",
        ));
    }
    let mn_steel = yield_mp.min(ltb.mn.unwrap_or(f64::INFINITY)).min(flb);
    let phi_steel = PHI_B * mn_steel;
    let mu_con = st
        .construction
        .moment
        .iter()
        .map(|m| m.abs())
        .fold(0.0, f64::max);
    checks.push(CheckOutcome::result(
        "composite.construction.flexure",
        "I3.1b; F2, F3",
        pass_if(mu_con <= phi_steel),
        mu_con,
        phi_steel,
        "N m",
        json!({"Mp": yield_mp, "Mltb": ltb.mn, "ltbBranch": ltb.branch, "Mflb": flb, "Lb": c.construction_lb, "Cb": c.construction_cb, "Lp": ltb.lp, "Lr": ltb.lr}),
        format!("The steel section alone before the concrete hardens (L_b = {})", mm(c.construction_lb)),
    ));

    // --- Composite flexure (I3.2a, I3.2d, I8.2c) ---
    // Checked at the section of maximum moment, with the studs between it and
    // the nearer support (uniform distribution, I8.2d(a)), and at every
    // concentrated load with the studs between it and the nearer support
    // (I8.2c). Between them the Specification relies on redistribution.
    let mut worst: Option<(f64, f64, f64, f64, Plastic)> = None;
    let m_scale = st
        .composite
        .moment
        .iter()
        .map(|m| m.abs())
        .fold(0.0, f64::max)
        .max(1.0);
    let negative = st.composite.moment.iter().any(|&m| m < -1e-6 * m_scale);
    let peak = (0..st.composite.stations.len())
        .max_by(|&a, &b| st.composite.moment[a].total_cmp(&st.composite.moment[b]));
    let mut sections: Vec<usize> = peak.into_iter().collect();
    for &xp in &st.load_points {
        if let Some(k) = (0..st.composite.stations.len()).min_by(|&a, &b| {
            (st.composite.stations[a] - xp)
                .abs()
                .total_cmp(&(st.composite.stations[b] - xp).abs())
        }) {
            sections.push(k);
        }
    }
    for k in sections {
        let x = st.composite.stations[k];
        let mu = st.composite.moment[k];
        if mu <= 0.0 {
            continue;
        }
        let q = studs_at(&row_x, studs.per_row, qn, x);
        let p = plastic(b, slab, &layers, q.min(cf));
        let ratio = mu / (PHI_B * p.mn);
        if worst.as_ref().is_none_or(|w| ratio > w.0) {
            worst = Some((ratio, x, mu, q, p));
        }
    }
    let mut q_design = 0.0;
    if let Some((ratio, x, mu, q, p)) = &worst {
        q_design = q.min(cf);
        checks.push(CheckOutcome::result(
            "composite.flexure",
            "I3.2a, I3.2d.1, I8.2c; Commentary C-I3-6 to C-I3-10",
            pass_if(*ratio <= 1.0),
            *mu,
            PHI_B * p.mn,
            "N m",
            json!({"station": x, "sumQn": q, "C": p.c, "Cf": cf, "a": p.a, "d1": p.d1, "d2": p.d2, "d3": p.d3, "pna": p.pna, "pnaDepth": p.x,
                   "Mn": p.mn, "composite": p.c / cf, "beff": beff, "Ac": ac}),
            format!("Governing at {:.2} m: C = {:.0} kN ({:.0} % composite), PNA in the {}", x, p.c / 1e3, 100.0 * p.c / cf, p.pna),
        ));
    }
    if negative {
        checks.push(CheckOutcome::unsupported(
            "composite.negativeFlexure",
            "I3.2b",
            "Negative moment in the composite stage (a continuous or cantilevered beam): negative flexure is not implemented",
        ));
    }

    // --- Shear on the steel section (I4.3 → G2.1) ---
    let shear = evaluate_shear_major_g21a(s, b.fy);
    let g21a = s.h_over_tw <= 2.24 * (e / b.fy).sqrt();
    let vu = st
        .construction
        .shear
        .iter()
        .chain(&st.composite.shear)
        .map(|v| v.abs())
        .fold(0.0, f64::max);
    checks.push(if g21a {
        CheckOutcome::result(
            "composite.shear",
            "I4.3; G2.1(a)",
            pass_if(vu <= shear.phi_v_vn),
            vu,
            shear.phi_v_vn,
            "N",
            json!({"Aw": shear.aw, "Cv1": 1.0}),
            "Shear on the steel section alone",
        )
    } else {
        CheckOutcome::unsupported(
            "composite.shear",
            "G2.1(b)",
            "Web beyond 2.24√(E/F_y): G2.1(b) is not implemented",
        )
    });

    // --- Slip capacity (I3.2d.1; Commentary prescriptive conditions) ---
    let span_ok = l <= 30.0 * FT_TO_M + 1e-9;
    let degree = q_design / cf;
    let shear_span = l / 2.0;
    let average = if shear_span > 0.0 {
        q_design / shear_span
    } else {
        0.0
    };
    let avg_ok = average >= 16.0 * KIP_PER_FT;
    let met: Vec<&str> = [
        ("span ≤ 30 ft (9.1 m)", span_ok),
        ("≥ 50 % composite", degree >= 0.5 - 1e-12),
        ("≥ 16 kip/ft (230 kN/m) of connectors", avg_ok),
    ]
    .iter()
    .filter(|x| x.1)
    .map(|x| x.0)
    .collect();
    checks.push(if !st.regular_loading {
        indeterminate(
            "composite.slipCapacity",
            "I3.2d.1; Commentary I3.2d.1",
            "Loading is neither uniform nor equally spaced point loads: the prescriptive slip-capacity conditions do not apply and the analytical procedures are not implemented",
        )
    } else if met.is_empty() {
        indeterminate(
            "composite.slipCapacity",
            "I3.2d.1; Commentary I3.2d.1",
            "None of the prescriptive slip-capacity conditions is met; the analytical procedures are not implemented",
        )
    } else {
        CheckOutcome::result(
            "composite.slipCapacity",
            "I3.2d.1; Commentary I3.2d.1",
            CheckStatus::Pass,
            degree,
            0.5,
            "-",
            json!({"span": l, "degree": degree, "averagePerLength": average, "met": met}),
            format!("Shear connection ductility: {}", met.join("; ")),
        )
    });

    // --- Service: stiffnesses (Commentary C-I3-1 … C-I3-3) ---
    let n = e / slab.ec();
    let (itr, ena) = transformed(b, slab, &layers, n);
    let q_lb = q_design;
    let (ilb, y_ena, _) = lower_bound(b, slab, &layers, q_lb);
    let ratio_q = (q_lb / cf).min(1.0);
    let iequiv = b.ix + ratio_q.sqrt() * (itr - b.ix);

    let limit_check = |id: &str,
                       clause: &str,
                       delta: f64,
                       n_limit: Option<f64>,
                       what: &str,
                       detail: Value|
     -> CheckOutcome {
        match n_limit {
            None => indeterminate(
                id,
                clause,
                format!("Enter the {what} deflection limit (L/n)"),
            ),
            Some(nl) => CheckOutcome::result(
                id,
                clause,
                pass_if(delta.abs() <= l / nl),
                delta.abs(),
                l / nl,
                "m",
                detail,
                format!(
                    "{what} deflection {} against L/{nl:.0} = {}",
                    mm(delta.abs()),
                    mm(l / nl)
                ),
            ),
        }
    };
    let mut deflections = json!({"Is": b.ix, "Itr": itr, "ILB": ilb, "Iequiv": iequiv, "n": n, "enaFromSlabTop": ena,
        "yEnaFromSteelTop": y_ena, "sumQnForStiffness": q_lb});
    match &st.wet {
        Some(d) => {
            let (dw, at) = deflection(d, l, e * b.ix);
            deflections["wet"] =
                json!({"delta": dw, "at": at, "net": dw.abs() - c.camber, "camber": c.camber});
            checks.push(limit_check(
                "composite.preCompositeDeflection",
                "I3.1b; Commentary I3.1b",
                dw,
                c.pre_composite_limit,
                "Pre-composite (wet concrete)",
                json!({"delta": dw, "at": at, "I": b.ix, "camber": c.camber, "netAfterCamber": dw.abs() - c.camber}),
            ));
        }
        None => checks.push(indeterminate(
            "composite.preCompositeDeflection",
            "I3.1b",
            "Choose the wet-concrete service case",
        )),
    }
    match &st.live {
        Some(d) => {
            let (dl, at) = deflection(d, l, e * ilb);
            deflections["live"] = json!({"delta": dl, "at": at});
            checks.push(limit_check(
                "composite.liveDeflection",
                "Commentary I3.2, C-I3-1",
                dl,
                c.live_limit,
                "Live load",
                json!({"delta": dl, "at": at, "ILB": ilb, "Iequiv": iequiv}),
            ));
        }
        None => checks.push(indeterminate(
            "composite.liveDeflection",
            "Commentary I3.2",
            "Choose the service live case",
        )),
    }
    // Long-term: sustained load on I_LB plus shrinkage (Commentary I3.2(c),
    // Figure C-I3.2): Δ_sh = P_sh e L²/(8 E I_tr), P_sh = ε_sh E_c A_c, e from
    // the slab centroid to the transformed section's elastic neutral axis.
    let slab_centroid = layers
        .iter()
        .map(|x| x.width * x.thickness * (x.top + x.thickness / 2.0))
        .sum::<f64>()
        / ac;
    let ecc = ena - slab_centroid;
    match (c.shrinkage_strain, &st.sustained) {
        (Some(esh), Some(d)) => {
            let p_sh = esh * slab.ec() * ac;
            let d_sh = p_sh * ecc * l * l / (8.0 * e * itr);
            let (ds, at) = deflection(d, l, e * ilb);
            let total = ds.abs() + d_sh.abs();
            deflections["longTerm"] = json!({"sustained": ds, "at": at, "shrinkage": d_sh, "Psh": p_sh, "eccentricity": ecc, "total": total});
            checks.push(limit_check(
                "composite.longTermDeflection",
                "Commentary I3.2(c), Figure C-I3.2",
                total,
                c.long_term_limit,
                "Long-term (sustained + shrinkage)",
                json!({"sustained": ds, "shrinkage": d_sh, "Psh": p_sh, "eccentricity": ecc, "esh": esh, "Itr": itr}),
            ));
        }
        (None, _) => checks.push(indeterminate(
            "composite.longTermDeflection",
            "Commentary I3.2(c)",
            "Enter the restrained shrinkage strain ε_sh (the Commentary gives 0.02 % when the aggregate's coefficient is not known)",
        )),
        (_, None) => checks.push(indeterminate("composite.longTermDeflection", "Commentary I3.2(c)", "Choose the sustained service case")),
    }
    checks.push(match c.creep_judgement {
        None => indeterminate(
            "composite.creep",
            "Commentary I3.2(c)",
            "Creep: the held texts give no method; record the engineer's judgement (small unless spans are long and permanent loads large)",
        ),
        Some(false) => CheckOutcome::unsupported("composite.creep", "Commentary I3.2(c)", "Creep deflection must be calculated, which is not implemented"),
        Some(true) => CheckOutcome::result(
            "composite.creep",
            "Commentary I3.2(c)",
            CheckStatus::Pass,
            0.0,
            0.0,
            "-",
            json!({"basis": "engineer's judgement"}),
            "Creep judged by the engineer and accounted for (Commentary I3.2(c): engineering judgement required)",
        ),
    });

    let section = json!({
        "beff": beff, "Ac": ac, "Cf": cf, "Py": py, "layers": layers.iter().map(|x| json!({"top": x.top, "thickness": x.thickness, "width": x.width})).collect::<Vec<_>>(),
        "slab": {"thickness": slab.thickness, "deck": slab.deck, "ribHeight": slab.rib_height, "ribWidth": slab.rib_width, "ribPitch": slab.rib_pitch},
        "beam": {"designation": b.designation, "d": s.d, "bf": s.bf, "tf": s.tf, "tw": s.tw},
        "studs": {"diameter": studs.diameter, "length": studs.length, "perRow": studs.per_row, "transverse": studs.transverse_spacing},
        "plastic": worst.as_ref().map(|w| json!({"station": w.1, "a": w.4.a, "pna": w.4.pna, "pnaDepth": w.4.x, "C": w.4.c, "Mn": w.4.mn})),
        "constructionMn": mn_steel,
    });
    CompositeDesign {
        checks,
        section,
        studs: studs_json,
        deflections,
    }
}

/// The plastic strength at a given slab force (exposed for tests and oracle
/// comparison).
pub fn plastic_moment(c: &CompositeBeam, slab_force: f64) -> Plastic {
    let beff = effective_width(c.span, &c.sides);
    let layers = layers(&c.slab, beff);
    plastic(&c.beam, &c.slab, &layers, slab_force)
}

/// I_LB, Y_ENA and d1 for a stud force (exposed for tests).
pub fn lower_bound_inertia(c: &CompositeBeam, q: f64) -> (f64, f64, f64) {
    let beff = effective_width(c.span, &c.sides);
    let layers = layers(&c.slab, beff);
    lower_bound(&c.beam, &c.slab, &layers, q)
}

/// I_tr and the elastic neutral axis below the slab top.
pub fn transformed_section(c: &CompositeBeam) -> (f64, f64) {
    let beff = effective_width(c.span, &c.sides);
    let layers = layers(&c.slab, beff);
    transformed(&c.beam, &c.slab, &layers, c.beam.section.e / c.slab.ec())
}
