//! EN 1992-1-1:2004 slab design with the UK National Annex (2009), M10 /
//! ADR 0029: reinforcement from the plate-v1 element-centre Wood–Armer
//! moments (6.1, 9.3.1.1), one-way shear from the element shears (6.2.2),
//! span/effective depth (7.4.2), punching at the panel's column supports
//! (6.4) and cover (4.4.1). The reinforcement map is per element and is the
//! design value itself: nothing is averaged or smoothed. Clause reading in
//! `docs/code-profiles/ec2-uk-na/dossier-slab.md`.

use serde_json::{Value, json};

use super::Ec2Ndp;
use super::detailing::{SPACING_FLOOR, SPACING_K1, SPACING_K2, basic_span_depth, cover_for, indeterminate, k_factor, table_3_1};
use crate::profile::{CheckOutcome, CheckStatus};

/// Mesh bar sizes the design chooses from.
pub const SLAB_BARS: [f64; 5] = [0.010, 0.012, 0.016, 0.020, 0.025];
/// Spacings tried, 75–400 mm in 25 mm steps.
const SPACINGS: std::ops::RangeInclusive<u32> = 3..=16;
/// UK NA 6.4.3(6): β for internal, edge and corner columns.
const BETA: [(&str, f64); 3] = [("internal", 1.15), ("edge", 1.4), ("corner", 1.5)];
/// UK NA 6.4.4(1): k1 for punching (σ_cp = 0 here).
/// UK NA 6.4.5(4): the outer perimeter at k d inside u_out, k = 1.5.
const K_OUT: f64 = 1.5;

#[derive(Debug, Clone, Default, PartialEq)]
pub struct SlabDetailing {
    pub exposure_class: Option<String>,
    pub cover_durability: Option<f64>,
    pub aggregate_size: Option<f64>,
    pub structural_system: Option<String>,
    pub partitions_sensitive: Option<bool>,
    /// Column dimensions c_x × c_y for punching at every column support.
    pub column_size: Option<[f64; 2]>,
}

/// One element of the plate mesh: its cell bounds and design actions.
#[derive(Debug, Clone, Copy)]
pub struct SlabElement {
    pub x0: f64,
    pub x1: f64,
    pub y0: f64,
    pub y1: f64,
    /// Wood–Armer [bottom X, bottom Y, top X, top Y], N m/m, ≥ 0.
    pub design: [f64; 4],
    /// Transverse shears q_x, q_y, N/m.
    pub qx: f64,
    pub qy: f64,
}

#[derive(Debug, Clone, Copy)]
pub struct SlabColumnSupport {
    pub x: f64,
    pub y: f64,
    /// Upward support force on the slab (N).
    pub reaction: f64,
}

#[derive(Debug, Clone)]
pub struct SlabContext {
    pub lx: f64,
    pub ly: f64,
    pub thickness: f64,
    pub cover: f64,
    pub fck: f64,
    pub fyk: f64,
    /// The opening [x0, x1, y0, y1] when included.
    pub opening: Option<[f64; 4]>,
    pub elements: Vec<SlabElement>,
    pub columns: Vec<SlabColumnSupport>,
    pub detailing: SlabDetailing,
}

/// A uniform mesh layer.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Layer {
    pub diameter: f64,
    pub spacing: f64,
    /// A_s per metre width.
    pub area: f64,
    pub effective_depth: f64,
}

#[derive(Debug, Clone)]
pub struct SlabDesign {
    pub checks: Vec<CheckOutcome>,
    /// Bottom X, bottom Y, top X, top Y.
    pub layers: [Option<Layer>; 4],
    /// A_s,req per element and layer (m²/m): the reinforcement map.
    pub required: Vec<[f64; 4]>,
    pub detail: Value,
}

const NAMES: [&str; 4] = ["bottomX", "bottomY", "topX", "topY"];

/// A_s per metre for M (N m/m) with the 3.1.7(3) block; None if no
/// singly reinforced solution exists.
fn as_per_metre(m: f64, d: f64, fcd: f64, fyd: f64) -> Option<f64> {
    if m <= 0. {
        return Some(0.);
    }
    let qa = fyd * fyd * 0.4 / (0.8 * fcd);
    let disc = (fyd * d).powi(2) - 4. * qa * m;
    (disc >= 0.).then(|| (fyd * d - disc.sqrt()) / (2. * qa))
}

/// Design the slab panel.
pub fn design(ndp: &Ec2Ndp, c: &SlabContext) -> SlabDesign {
    let fcd = ndp.alpha_cc_flexure * c.fck / ndp.gamma_c;
    let fyd = c.fyk / ndp.gamma_s;
    let (fctm, _, _) = table_3_1(c.fck);
    let mut checks = vec![];
    let mut layers: [Option<Layer>; 4] = [None; 4];
    let mut required = vec![[0.; 4]; c.elements.len()];
    let s_max = (3. * c.thickness).min(0.400);
    let dg = c.detailing.aggregate_size;
    let mut details = vec![];
    // Bottom X and top X are the outer layers; Y layers sit inside them.
    for layer in 0..4 {
        let outer = layer % 2 == 0;
        let mut best: Option<(Layer, f64, f64, Vec<f64>)> = None;
        for phi in SLAB_BARS {
            let inner_offset = if outer { 0. } else { layers[layer - 1].map_or(phi, |l| l.diameter) };
            let d = c.thickness - c.cover - inner_offset - phi / 2.;
            let per: Vec<Option<f64>> = c.elements.iter().map(|e| as_per_metre(e.design[layer], d, fcd, fyd)).collect();
            if per.iter().any(|a| a.is_none()) {
                continue;
            }
            let per: Vec<f64> = per.into_iter().map(|a| a.unwrap()).collect();
            let demand = per.iter().cloned().fold(0., f64::max);
            // 9.3.1.1(1) → 9.2.1.1(1): minimum for each layer that carries moment.
            let as_min = if demand > 0. { (0.26 * fctm / c.fyk).max(0.0013) * d } else { 0. };
            let need = demand.max(as_min);
            if need <= 0. {
                // No moment on this face anywhere: no layer.
                best = None;
                break;
            }
            let bar = std::f64::consts::PI * phi * phi / 4.;
            let s_min = dg.map(|g| (SPACING_K1 * phi).max(g + SPACING_K2).max(SPACING_FLOOR)).unwrap_or(SPACING_FLOOR.max(phi));
            for k in SPACINGS.rev() {
                let s = k as f64 * 0.025;
                if s > s_max + 1e-12 || s - phi < s_min {
                    continue;
                }
                let area = bar / s;
                if area >= need - 1e-15 {
                    if best.as_ref().is_none_or(|(b, _, _, _)| area < b.area - 1e-15) {
                        best = Some((Layer { diameter: phi, spacing: s, area, effective_depth: d }, demand, as_min, per.clone()));
                    }
                    break;
                }
            }
        }
        let name = NAMES[layer];
        match best {
            Some((l, demand, as_min, per)) => {
                layers[layer] = Some(l);
                for (i, a) in per.iter().enumerate() {
                    required[i][layer] = *a;
                }
                checks.push(CheckOutcome::result(
                    &format!("ec2.slab.flexure.{name}"),
                    "6.1, 9.3.1.1, 9.2.1.1",
                    CheckStatus::Pass,
                    demand.max(as_min),
                    l.area,
                    "m2",
                    json!({"layer": name, "maxRequired": demand, "asMin": as_min, "sMax": s_max, "d": l.effective_depth}),
                    format!("Ø{:.0} at {:.0} mm covers the largest element demand and A_s,min", l.diameter * 1e3, l.spacing * 1e3),
                ));
                details.push(json!({"layer": name, "mesh": l}));
            }
            None if c.elements.iter().all(|e| e.design[layer] <= 0.) => {}
            None => checks.push(CheckOutcome::result(
                &format!("ec2.slab.flexure.{name}"),
                "6.1, 9.3.1.1",
                CheckStatus::Fail,
                c.elements.iter().map(|e| e.design[layer]).fold(0., f64::max),
                0.,
                "N m",
                json!({"layer": name}),
                "No mesh of Ø10–25 at 75–400 mm resists the largest design moment: thicken the slab",
            )),
        }
    }
    // One-way shear (6.2.2) per element with the smaller ρ_l of the two faces.
    let crdc = ndp.crdc_numerator / ndp.gamma_c;
    let fck = c.fck / 1e6;
    let mut worst = (0., Value::Null);
    for e in &c.elements {
        for (q, dir) in [(e.qx.abs(), 0usize), (e.qy.abs(), 1)] {
            let (b, t) = (layers[dir], layers[dir + 2]);
            let d = b.map_or(c.thickness - c.cover, |l| l.effective_depth);
            let rho = b.map_or(0., |l| l.area / l.effective_depth).min(t.map_or(0., |l| l.area / l.effective_depth)).min(0.02);
            let k = (1. + (0.2 / d).sqrt()).min(2.);
            let vmin = 0.035 * k.powf(1.5) * fck.sqrt();
            let vrdc = (crdc * k * (100. * rho * fck).cbrt()).max(vmin) * 1e6 * d;
            let ratio = q / vrdc;
            if ratio > worst.0 {
                worst = (ratio, json!({"element": [e.x0, e.x1, e.y0, e.y1], "direction": if dir == 0 {"x"} else {"y"},
                    "vEd": q, "vRdc": vrdc, "rhoL": rho, "d": d}));
            }
        }
    }
    checks.push(CheckOutcome::result(
        "ec2.slab.shear",
        "6.2.2(1)",
        if worst.0 <= 1. { CheckStatus::Pass } else { CheckStatus::Fail },
        worst.0,
        1.,
        "-",
        json!({"critical": worst.1, "assumptions": ["ρ_l is the smaller of the two faces' meshes in the shear direction (conservative)",
            "Element-centre shears; the 6.2.2(6) reduction near supports is not applied"]}),
        "Demand is the largest v_Ed/V_Rd,c over the elements",
    ));
    checks.push(deflection(c, &layers, &required));
    checks.extend(punching(ndp, c, &layers));
    let phi = layers.iter().flatten().map(|l| l.diameter).fold(0., f64::max);
    checks.push(cover_for(c.cover, 0., phi, c.detailing.cover_durability, c.detailing.aggregate_size));
    SlabDesign { checks, layers, required, detail: json!({"fcd": fcd, "fyd": fyd, "sMax": s_max, "layers": details}) }
}

/// 7.4.2: span/depth on the governing span with the bottom steel in its
/// direction (two-way slabs: the shorter span; flat slabs: the longer,
/// with 8.5/l_eff for sensitive partitions over 8.5 m).
fn deflection(c: &SlabContext, layers: &[Option<Layer>; 4], required: &[[f64; 4]]) -> CheckOutcome {
    let clause = "7.4.2; UK NA Table NA.5";
    let (Some(system), Some(partitions)) = (c.detailing.structural_system.as_deref(), c.detailing.partitions_sensitive) else {
        return indeterminate("ec2.slab.deflection", clause, "Enter the structural system and whether the slab supports sensitive partitions");
    };
    let flat = system == "flatSlab";
    let along_x = if flat { c.lx >= c.ly } else { c.lx <= c.ly };
    let span = if along_x { c.lx } else { c.ly };
    let layer = if along_x { 0 } else { 1 };
    let Some(l) = layers[layer] else {
        return indeterminate("ec2.slab.deflection", clause, "No bottom reinforcement in the governing span direction");
    };
    let as_req = required.iter().map(|r| r[layer]).fold(0., f64::max);
    let rho = as_req / l.effective_depth;
    let Some(k) = k_factor(system) else {
        return indeterminate("ec2.slab.deflection", clause, "Unknown structural system");
    };
    let basic = basic_span_depth(k, c.fck / 1e6, rho.max(1e-9), 0.);
    // 310/σ_s ≈ (500/f_yk)(A_s,prov/A_s,req) ≤ 1.5 (UK NA Table NA.5, note).
    let stress = (500. / (c.fyk / 1e6) * l.area / as_req.max(1e-15)).min(1.5);
    let limit_partition = if partitions {
        if flat && span > 8.5 { 8.5 / span } else if !flat && span > 7. { 7. / span } else { 1. }
    } else {
        1.
    };
    let limit = (basic * stress * limit_partition).min(40. * k);
    let actual = span / l.effective_depth;
    CheckOutcome::result(
        "ec2.slab.deflection",
        clause,
        if actual <= limit { CheckStatus::Pass } else { CheckStatus::Fail },
        actual,
        limit,
        "-",
        json!({"span": span, "direction": if along_x {"x"} else {"y"}, "system": system, "K": k, "rho": rho, "basic": basic,
               "stressFactor": stress, "partitionFactor": limit_partition, "d": l.effective_depth}),
        format!("l/d = {actual:.1} against {limit:.1}"),
    )
}

/// 6.4: punching at each column support, with β from UK NA 6.4.3(6), u1 at
/// 2d clipped to the panel, the face check and (UK NA 6.4.5(3)) v_Ed ≤ 2 v_Rd,c
/// at u1; shear reinforcement (6.52) at s_r = 0.75d when v_Ed > v_Rd,c.
fn punching(ndp: &Ec2Ndp, c: &SlabContext, layers: &[Option<Layer>; 4]) -> Vec<CheckOutcome> {
    let clause = "6.4.2–6.4.5; UK NA 6.4.3(6), 6.4.4(1), 6.4.5(3)";
    if c.columns.is_empty() {
        return vec![];
    }
    let Some([cx, cy]) = c.detailing.column_size else {
        return vec![indeterminate("ec2.slab.punching", clause, "Enter the column dimensions c_x × c_y for punching")];
    };
    let (Some(tx), Some(ty)) = (layers[2], layers[3]) else {
        return vec![indeterminate("ec2.slab.punching", clause, "No top reinforcement over the columns")];
    };
    let d = (tx.effective_depth + ty.effective_depth) / 2.;
    let rho = ((tx.area / tx.effective_depth) * (ty.area / ty.effective_depth)).sqrt().min(0.02);
    c.columns
        .iter()
        .enumerate()
        .map(|(i, col)| {
            let id = format!("ec2.slab.punching.{}", i + 1);
            // Free edges within 2d of the column face define edge and corner columns.
            let near = |dist: f64| dist < 2. * d;
            let (ex, ey) = (
                near(col.x - cx / 2.) || near(c.lx - col.x - cx / 2.),
                near(col.y - cy / 2.) || near(c.ly - col.y - cy / 2.),
            );
            let position = match (ex, ey) {
                (true, true) => "corner",
                (true, false) | (false, true) => "edge",
                _ => "internal",
            };
            if let Some([x0, x1, y0, y1]) = c.opening {
                let gap = (x0 - (col.x + cx / 2.)).max(col.x - cx / 2. - x1).max(y0 - (col.y + cy / 2.)).max(col.y - cy / 2. - y1);
                if gap <= 6. * d {
                    return CheckOutcome::unsupported(&id, clause, "An opening within 6d of the column: the 6.4.2(3) ineffective perimeter is not implemented");
                }
            }
            if col.reaction <= 0. {
                return CheckOutcome::unsupported(&id, clause, "The column pulls the slab down (uplift): punching under a hanging reaction is not implemented");
            }
            if position != "internal" {
                return CheckOutcome::unsupported(&id, clause, format!("{position} column: the reduced perimeters of Figures 6.15/6.20 are not implemented"));
            }
            let beta = BETA.iter().find(|(p, _)| *p == position).unwrap().1;
            let p = punching_internal(ndp, col.reaction, beta, cx, cy, d, rho, c.fck, c.fyk);
            let mut detail = p.detail;
            detail["position"] = json!(position);
            CheckOutcome::result(&id, clause, p.status, p.demand, p.resistance, "MPa", detail, p.message)
        })
        .collect()
}

/// One internal column's punching result.
pub(crate) struct Punching {
    pub status: CheckStatus,
    pub demand: f64,
    pub resistance: f64,
    pub detail: Value,
    pub message: String,
}

/// 6.4 at an internal c_x × c_y column: the face check (6.4.5(3), UK NA
/// v_Rd,max = 0.5 ν f_cd), v_Ed = β V/(u1 d) at u1 = 2(c_x + c_y) + 4π d
/// against v_Rd,c (6.47), the UK limit 2 v_Rd,c at u1, and the (6.52)
/// reinforcement at s_r = 0.75 d with u_out,ef = β V/(v_Rd,c d) (6.54).
pub(crate) fn punching_internal(ndp: &Ec2Ndp, v: f64, beta: f64, cx: f64, cy: f64, d: f64, rho: f64, fck_pa: f64, fyk: f64) -> Punching {
    let fck = fck_pa / 1e6;
    let k = (1. + (0.2 / d).sqrt()).min(2.);
    let crdc = ndp.crdc_numerator / ndp.gamma_c;
    let vmin = 0.035 * k.powf(1.5) * fck.sqrt();
    let vrdc = (crdc * k * (100. * rho * fck).cbrt()).max(vmin);
    let fcd = ndp.alpha_cc_shear * fck_pa / ndp.gamma_c;
    let nu = 0.6 * (1. - fck / 250.);
    let vrd_max = 0.5 * nu * fcd / 1e6;
    let fywd_ef = (250. + 0.25 * d * 1e3).min(fyk / ndp.gamma_s / 1e6);
    let u0 = 2. * (cx + cy);
    let u1 = u0 + 4. * std::f64::consts::PI * d;
    let v0 = beta * v / (u0 * d) / 1e6;
    let v1 = beta * v / (u1 * d) / 1e6;
    let mut detail = json!({"beta": beta, "vEd": v, "u0": u0, "u1": u1, "d": d, "rhoL": rho, "k": k,
        "vRdc": vrdc, "vmin": vmin, "vRdMax": vrd_max, "vEd0": v0, "vEd1": v1});
    let face_ok = v0 <= vrd_max;
    let status;
    let message;
    if !face_ok {
        status = CheckStatus::Fail;
        message = "v_Ed at the column face exceeds 0.5 ν f_cd".to_string();
    } else if v1 <= vrdc {
        status = CheckStatus::Pass;
        message = "No punching shear reinforcement needed (v_Ed ≤ v_Rd,c at u1)".into();
    } else if v1 > 2. * vrdc {
        status = CheckStatus::Fail;
        message = "v_Ed exceeds 2 v_Rd,c at u1 (UK NA 6.4.5(3)): thicken the slab or enlarge the column".into();
    } else {
        // (6.52) at s_r = 0.75 d, sin α = 1; u_out,ef from (6.54); outer perimeter k d inside it.
        let sr = 0.75 * d;
        let asw = (v1 - 0.75 * vrdc) * 1e6 * u1 * d / (1.5 * (d / sr) * fywd_ef * 1e6);
        let u_out = beta * v / (vrdc * 1e6 * d);
        let a_out = (u_out - u0) / (2. * std::f64::consts::PI);
        detail["reinforcement"] = json!({"aswPerPerimeter": asw, "sr": sr, "fywdEf": fywd_ef * 1e6, "uOut": u_out,
            "aOut": a_out, "lastPerimeterFromFace": a_out - K_OUT * d, "firstPerimeterMax": 0.5 * d});
        status = CheckStatus::Pass;
        message = format!("Punching reinforcement required: A_sw ≥ {:.0} mm² per perimeter at s_r = {:.0} mm to {:.0} mm from the face", asw * 1e6, sr * 1e3, (a_out - K_OUT * d) * 1e3);
    }
    Punching { status, demand: v1, resistance: if v1 <= vrdc { vrdc } else { 2. * vrdc }, detail, message }
}
