//! EN 1992-1-1:2004 pad footing design with the UK National Annex (2009),
//! M11 / ADR 0028: ground contact from the code-agnostic `footing` kernel,
//! bearing against the engineer's allowable value, bending at the column
//! faces (6.1), the 9.8.2.2 tie force and straight-bar anchorage, one-way
//! shear (6.2.2), punching of the column base (6.4.4(2), 6.4.5(3)), minimum
//! steel and spacing (9.3.1.1, 9.2.1.1, 8.2), cover (4.4.1) and the bottom
//! reinforcement sized in each direction. Clause reading in
//! `docs/code-profiles/ec2-uk-na/dossier-footing.md`.

use serde_json::{Value, json};

use super::Ec2Ndp;
use super::detailing::{SPACING_FLOOR, SPACING_K1, SPACING_K2, anchorage_length, cover_for, indeterminate, table_3_1};
use crate::footing::{Contact, contact, load_within};
use crate::profile::{CheckOutcome, CheckStatus};

/// EN 1991-1-1 Table A.1: normal-weight reinforced concrete, 25 kN/m³.
pub const CONCRETE_WEIGHT: f64 = 25e3;
/// Bar sizes the design chooses from (BS 8666 preferred, ≥ φ_min, 9.8.2.1(1)).
pub const FOOTING_BARS: [f64; 6] = [0.010, 0.012, 0.016, 0.020, 0.025, 0.032];
/// UK NA 9.8.2.1(1): φ_min = 8 mm (recommended).
const PHI_MIN: f64 = 0.008;
/// UK NA 4.4.1.3(4): k1 on prepared ground or blinding, k2 directly against soil.
const C_BLINDING: f64 = 0.040;
const C_SOIL: f64 = 0.075;
/// Table 6.1: k against c1/c2 for rectangular loaded areas.
const K_TABLE: [(f64, f64); 4] = [(0.5, 0.45), (1.0, 0.60), (2.0, 0.70), (3.0, 0.80)];
/// Control perimeters sampled within 2d for punching (6.4.4(2)).
const PUNCHING_SAMPLES: usize = 80;
/// Segments per quarter circle when the rounded control perimeter is integrated.
const ARC_SEGMENTS: usize = 48;

#[derive(Debug, Clone, Default, PartialEq)]
pub struct PadFootingDetailing {
    pub exposure_class: Option<String>,
    pub cover_durability: Option<f64>,
    pub aggregate_size: Option<f64>,
    pub cast_on_blinding: Option<bool>,
}

/// A rectangular pad: L along global X, B along global Y, thickness h, a
/// concentric column c_x × c_y, nominal cover to the bottom bars.
#[derive(Debug, Clone)]
pub struct PadFootingContext {
    pub length: f64,
    pub width: f64,
    pub thickness: f64,
    pub cover: f64,
    pub column_x: f64,
    pub column_y: f64,
    pub fck: f64,
    pub fyk: f64,
    /// Allowable bearing pressure (the engineer's input, never computed).
    pub bearing_pressure: f64,
    /// Depth of the underside below ground, and the soil unit weight, for the
    /// overburden in the bearing check.
    pub embedment: f64,
    pub soil_unit_weight: f64,
    pub detailing: PadFootingDetailing,
}

/// Column actions on the top of the footing, global axes: N downward
/// positive, moments about X and Y, horizontal forces.
#[derive(Debug, Clone, Default)]
pub struct FootingActions {
    pub n: f64,
    pub mx: f64,
    pub my: f64,
    pub hx: f64,
    pub hy: f64,
    pub combination_id: String,
}

impl FootingActions {
    /// Moments about the base centre; the horizontal forces act at height h:
    /// r × F with r = (0, 0, h) adds (−h H_y, h H_x).
    pub fn base_moments(&self, h: f64) -> (f64, f64) {
        (self.mx - h * self.hy, self.my + h * self.hx)
    }
    /// The ground resultant for a downward force `n`: e_x = M_y/N, e_y = −M_x/N.
    pub fn eccentricity(&self, h: f64, n: f64) -> (f64, f64) {
        let (mx, my) = self.base_moments(h);
        (my / n, -mx / n)
    }
}

/// One direction's bottom bars.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bars {
    pub diameter: f64,
    pub count: u32,
    pub spacing: f64,
    pub area: f64,
    pub effective_depth: f64,
}

#[derive(Debug, Clone)]
pub struct FootingDesign {
    pub checks: Vec<CheckOutcome>,
    pub bars_x: Option<Bars>,
    pub bars_y: Option<Bars>,
    pub detail: Value,
}

/// A direction of the footing in local coordinates: u along the bars, v
/// across them. `along_x` maps (u, v) to (x, y); otherwise to (v, u).
#[derive(Clone, Copy)]
pub(crate) struct Dir {
    name: &'static str,
    along_x: bool,
    span: f64,
    width: f64,
    column: f64,
}

impl Dir {
    pub(crate) fn of(c: &PadFootingContext, along_x: bool) -> Dir {
        if along_x {
            Dir { name: "x", along_x, span: c.length, width: c.width, column: c.column_x }
        } else {
            Dir { name: "y", along_x, span: c.width, width: c.length, column: c.column_y }
        }
    }
    /// A local polygon in global coordinates, kept counter-clockwise.
    fn global(&self, local: Vec<[f64; 2]>) -> Vec<[f64; 2]> {
        if self.along_x {
            local
        } else {
            let mut g: Vec<[f64; 2]> = local.into_iter().map(|[u, v]| [v, u]).collect();
            g.reverse();
            g
        }
    }
    /// The full-width strip u ∈ [from, to].
    fn strip(&self, from: f64, to: f64) -> Vec<[f64; 2]> {
        let w = self.width / 2.;
        self.global(vec![[from, -w], [to, -w], [to, w], [from, w]])
    }
    /// ∫q and ∫q u over the strip.
    fn load(&self, contact: &Contact, from: f64, to: f64) -> (f64, f64) {
        let r = load_within(contact, &self.strip(from, to));
        (r[0], if self.along_x { r[1] } else { r[2] })
    }
}

fn design_strengths(ndp: &Ec2Ndp, c: &PadFootingContext) -> (f64, f64) {
    (ndp.alpha_cc_flexure * c.fck / ndp.gamma_c, c.fyk / ndp.gamma_s)
}

/// The larger face moment of a direction: ∫q (u − a/2) beyond each face.
fn face_moment(c: &Contact, d: Dir) -> f64 {
    let (a, s) = (d.column / 2., d.span / 2.);
    let (r1, m1) = d.load(c, a, s);
    let (r2, m2) = d.load(c, -s, -a);
    (m1 - a * r1).max(-(m2 + a * r2))
}

/// 9.8.2.2: F_s(x) = R z_e/z_i with R the ground force within x of an edge,
/// z_e from its centroid to N_Ed at 0.15 a inside the column face (e = 0.15 b
/// in Figure 9.13), z_i = 0.9 d; from the +u or −u edge.
pub(crate) fn tie_force(c: &Contact, d: Dir, zi: f64, x: f64, positive_edge: bool) -> f64 {
    let (s, xn) = (d.span / 2., d.column / 2. - 0.15 * d.column);
    if positive_edge {
        let (r, m) = d.load(c, s - x, s);
        if r <= 0. { 0. } else { r * (m / r - xn) / zi }
    } else {
        let (r, m) = d.load(c, -s, -s + x);
        if r <= 0. { 0. } else { r * (-m / r - xn) / zi }
    }
}

pub(crate) fn tie_max(c: &Contact, d: Dir, zi: f64) -> (f64, f64) {
    let reach = d.span / 2. - (d.column / 2. - 0.15 * d.column);
    let mut best = (0., 0.);
    for edge in [true, false] {
        // Dense sampling, then golden-section refinement around the best sample.
        let n = 400;
        let mut k_best = 1;
        let mut f_best = f64::NEG_INFINITY;
        for k in 1..=n {
            let f = tie_force(c, d, zi, reach * k as f64 / n as f64, edge);
            if f > f_best {
                f_best = f;
                k_best = k;
            }
        }
        let (mut lo, mut hi) = (reach * (k_best - 1) as f64 / n as f64, (reach * (k_best + 1) as f64 / n as f64).min(reach));
        for _ in 0..80 {
            let (m1, m2) = (lo + (hi - lo) * 0.382, lo + (hi - lo) * 0.618);
            if tie_force(c, d, zi, m1, edge) < tie_force(c, d, zi, m2, edge) { lo = m1 } else { hi = m2 }
        }
        let x = (lo + hi) / 2.;
        let f = tie_force(c, d, zi, x, edge).max(f_best);
        if f > best.0 {
            best = (f, x);
        }
    }
    best
}

/// A_s for M on a rectangle b × d with the 3.1.7(3) block (λ = 0.8, η = 1);
/// None when no single-reinforced solution exists.
pub fn as_for_moment(m: f64, b: f64, d: f64, fcd: f64, fyd: f64) -> Option<f64> {
    if m <= 0. {
        return Some(0.);
    }
    // M = A f_yd (d − 0.4 x), x = A f_yd/(0.8 b f_cd).
    let qa = fyd * fyd * 0.4 / (0.8 * b * fcd);
    let disc = (fyd * d).powi(2) - 4. * qa * m;
    (disc >= 0.).then(|| (fyd * d - disc.sqrt()) / (2. * qa))
}

fn k_table(ratio: f64) -> f64 {
    if ratio <= K_TABLE[0].0 {
        return K_TABLE[0].1;
    }
    for w in K_TABLE.windows(2) {
        let ((r0, k0), (r1, k1)) = (w[0], w[1]);
        if ratio <= r1 {
            return k0 + (k1 - k0) * (ratio - r0) / (r1 - r0);
        }
    }
    K_TABLE[3].1
}

/// The control perimeter at distance a from a c_x × c_y column, as a polygon.
fn rounded_rectangle(cx: f64, cy: f64, a: f64) -> Vec<[f64; 2]> {
    let mut out = vec![];
    for (qx, qy, start) in [(1., 1., 0.), (-1., 1., 0.5), (-1., -1., 1.), (1., -1., 1.5)] {
        for k in 0..=ARC_SEGMENTS {
            let t = std::f64::consts::PI * (start + 0.5 * k as f64 / ARC_SEGMENTS as f64);
            out.push([qx * cx / 2. + a * t.cos(), qy * cy / 2. + a * t.sin()]);
        }
    }
    out
}

/// The perimeter's exact area (the polygon is used only for the pressure integral).
fn rounded_area(cx: f64, cy: f64, a: f64) -> f64 {
    cx * cy + 2. * a * (cx + cy) + std::f64::consts::PI * a * a
}

/// Design the footing for the ULS column actions and check bearing for the
/// engineer's bearing actions.
pub fn design(ndp: &Ec2Ndp, c: &PadFootingContext, uls: &FootingActions, bearing: Option<&FootingActions>) -> FootingDesign {
    let mut checks = vec![];
    let (fcd, fyd) = design_strengths(ndp, c);
    let fck = c.fck / 1e6;
    // Bearing: column force plus base self-weight and overburden.
    let bearing_detail = match bearing {
        None => {
            checks.push(indeterminate(
                "ec2.footing.bearing",
                "EN 1997-1 6.5.2 (allowable pressure input)",
                "Choose the case or combination for the bearing check (the allowable pressure is compared with that combination)",
            ));
            Value::Null
        }
        Some(b) => {
            let area = c.length * c.width;
            let self_weight = CONCRETE_WEIGHT * area * c.thickness;
            let soil = c.soil_unit_weight * (c.embedment - c.thickness).max(0.) * (area - c.column_x * c.column_y);
            let n = b.n + self_weight + soil;
            let (ex, ey) = b.eccentricity(c.thickness, n);
            match contact(c.length, c.width, n, ex, ey) {
                Ok(k) => {
                    checks.push(CheckOutcome::result(
                        "ec2.footing.bearing",
                        "EN 1997-1 6.5.2 (allowable pressure input)",
                        if k.q_max <= c.bearing_pressure { CheckStatus::Pass } else { CheckStatus::Fail },
                        k.q_max,
                        c.bearing_pressure,
                        "Pa",
                        json!({"combinationId": b.combination_id, "n": n, "selfWeight": self_weight, "overburden": soil,
                               "ex": ex, "ey": ey, "contact": k}),
                        format!("q_max under {} ({} contact) vs the allowable bearing input", b.combination_id, k.state),
                    ));
                    json!({"combinationId": b.combination_id, "n": n, "contact": k})
                }
                Err(e) => {
                    checks.push(CheckOutcome::result(
                        "ec2.footing.bearing",
                        "EN 1997-1 6.5.2",
                        CheckStatus::Fail,
                        n,
                        0.,
                        "N",
                        json!({"combinationId": b.combination_id, "ex": ex, "ey": ey, "code": e.code}),
                        e.message.clone(),
                    ));
                    Value::Null
                }
            }
        }
    };
    // Structural design: the column force alone bends the base (self-weight
    // and overburden are carried by their own ground reaction).
    let (ex, ey) = uls.eccentricity(c.thickness, uls.n);
    let k = match contact(c.length, c.width, uls.n, ex, ey) {
        Ok(k) => k,
        Err(e) => {
            checks.push(CheckOutcome::result(
                "ec2.footing.contact",
                "9.8.2, 6.4.4(2)",
                CheckStatus::Fail,
                uls.n,
                0.,
                "N",
                json!({"ex": ex, "ey": ey, "code": e.code}),
                e.message.clone(),
            ));
            return FootingDesign { checks, bars_x: None, bars_y: None, detail: json!({"bearing": bearing_detail}) };
        }
    };
    // Contact itself is a state, not a ratio: reported with no utilisation.
    let mut contact_check = CheckOutcome::result(
        "ec2.footing.contact",
        "9.8.2, 6.4.4(2)",
        CheckStatus::Pass,
        k.contact_fraction,
        1.,
        "-",
        json!({"combinationId": uls.combination_id, "ex": ex, "ey": ey, "contact": k}),
        format!("{} contact over {:.1} % of the base under {}", k.state, 100. * k.contact_fraction, uls.combination_id),
    );
    contact_check.utilisation = None;
    checks.push(contact_check);
    let cover_req = c.detailing.cast_on_blinding.map(|b| if b { C_BLINDING } else { C_SOIL });
    let (fctm, _, _) = table_3_1(c.fck);
    let dg = c.detailing.aggregate_size;
    let mut chosen: [Option<Bars>; 2] = [None, None];
    let mut details = vec![];
    // x bars are the lower layer, y bars sit on them.
    for (slot, along_x) in [(0, true), (1, false)] {
        let d = Dir::of(c, along_x);
        let m = face_moment(&k, d);
        let mut best: Option<(Bars, Value)> = None;
        for phi in FOOTING_BARS {
            let lower = if along_x { 0. } else { chosen[0].map_or(FOOTING_BARS[0], |b| b.diameter) };
            let depth = c.thickness - c.cover - lower - phi / 2.;
            let zi = 0.9 * depth;
            let (fs_max, x_at) = tie_max(&k, d, zi);
            let as_flex = as_for_moment(m, d.width, depth, fcd, fyd);
            let Some(as_flex) = as_flex else { continue };
            let as_tie = fs_max / fyd;
            let as_min = (0.26 * fctm / c.fyk).max(0.0013) * d.width * depth;
            let required = as_flex.max(as_tie).max(as_min);
            let bar = std::f64::consts::PI * phi * phi / 4.;
            // UK NA 9.3.1.1(3): principal bars at ≤ min(3h, 400 mm).
            let s_max = (3. * c.thickness).min(0.400);
            let run = d.width - 2. * c.cover - phi;
            let mut n = ((required / bar).ceil() as u32).max(2);
            n = n.max((run / s_max).ceil() as u32 + 1);
            let spacing = run / (n - 1) as f64;
            let clear = spacing - phi;
            let s_min = dg.map(|g| (SPACING_K1 * phi).max(g + SPACING_K2).max(SPACING_FLOOR)).unwrap_or(SPACING_FLOOR.max(phi));
            if clear < s_min {
                continue;
            }
            let area = n as f64 * bar;
            // 9.8.2.2(5): straight bars anchor F_s(x_min) within x_min = h/2.
            let x_min = c.thickness / 2.;
            let fs_xmin = tie_force(&k, d, zi, x_min, true).max(tie_force(&k, d, zi, x_min, false));
            let cd = (c.cover).min(clear / 2.);
            let lbd = anchorage_length(ndp, c.fck, c.fyk, phi, true, cd).lbd_tension;
            let lb_needed = lbd * fs_xmin / (area * fyd);
            let anchors = lb_needed + c.cover <= x_min + 1e-12;
            if !anchors {
                continue;
            }
            let bars = Bars { diameter: phi, count: n, spacing, area, effective_depth: depth };
            let detail = json!({"direction": d.name, "faceMoment": m, "asFlexure": as_flex, "asTie": as_tie, "asMin": as_min,
                "asRequired": required, "tieForceMax": fs_max, "tieMaxAt": x_at, "zi": zi, "sMax": s_max, "clearSpacing": clear,
                "sMin": s_min, "anchorage": {"xMin": x_min, "fsAtXmin": fs_xmin, "lbd": lbd, "lbNeeded": lb_needed, "cover": c.cover}});
            if best.as_ref().is_none_or(|(b, _)| area < b.area - 1e-12) {
                best = Some((bars, detail));
            }
        }
        match best {
            Some((bars, detail)) => {
                chosen[slot] = Some(bars);
                checks.push(CheckOutcome::result(
                    &format!("ec2.footing.flexure.{}", d.name),
                    "6.1, 9.8.2.2, 9.3.1.1, 9.2.1.1",
                    CheckStatus::Pass,
                    detail["asRequired"].as_f64().unwrap(),
                    bars.area,
                    "m2",
                    detail.clone(),
                    format!("{} Ø{:.0} at {:.0} mm: max of face bending, the 9.8.2.2 tie force and A_s,min", bars.count, bars.diameter * 1e3, bars.spacing * 1e3),
                ));
                checks.push(CheckOutcome::result(
                    &format!("ec2.footing.anchorage.{}", d.name),
                    "9.8.2.2(5), 8.4",
                    CheckStatus::Pass,
                    detail["anchorage"]["lbNeeded"].as_f64().unwrap() + c.cover,
                    c.thickness / 2.,
                    "m",
                    detail["anchorage"].clone(),
                    "Straight bars anchor F_s(x_min) within x_min = h/2",
                ));
                details.push(detail);
            }
            None => {
                checks.push(CheckOutcome::result(
                    &format!("ec2.footing.flexure.{}", d.name),
                    "6.1, 9.8.2.2, 8.2, 9.3.1.1",
                    CheckStatus::Fail,
                    m,
                    0.,
                    "N m",
                    json!({"direction": d.name, "faceMoment": m}),
                    "No bar arrangement from Ø10–32 fits, anchors straight at h/2 and resists the face moment: deepen or enlarge the base",
                ));
            }
        }
    }
    let [bx, by] = chosen;
    if let (Some(bx), Some(by)) = (bx, by) {
        // One-way shear (6.2.2) at d from each face.
        for (along_x, bars) in [(true, bx), (false, by)] {
            let d = Dir::of(c, along_x);
            let dd = bars.effective_depth;
            let from = d.column / 2. + dd;
            let v = if from >= d.span / 2. { 0. } else { d.load(&k, from, d.span / 2.).0.max(d.load(&k, -d.span / 2., -from).0) };
            let kk = (1. + (0.2 / dd).sqrt()).min(2.);
            let rho = (bars.area / (d.width * dd)).min(0.02);
            let crdc = ndp.crdc_numerator / ndp.gamma_c;
            let vmin = 0.035 * kk.powf(1.5) * fck.sqrt();
            let vrdc = (crdc * kk * (100. * rho * fck).cbrt()).max(vmin) * 1e6 * d.width * dd;
            checks.push(CheckOutcome::result(
                &format!("ec2.footing.shear.{}", d.name),
                "6.2.2(1)",
                if v <= vrdc { CheckStatus::Pass } else { CheckStatus::Fail },
                v,
                vrdc,
                "N",
                json!({"section": from, "d": dd, "k": kk, "rhoL": rho, "vmin": vmin}),
                "Ground force beyond d from the column face against V_Rd,c",
            ));
        }
        checks.extend(punching(ndp, c, uls, &k, bx, by));
        let phi = bx.diameter.max(by.diameter);
        checks.push(cover_for(c.cover, 0., phi, c.detailing.cover_durability, c.detailing.aggregate_size));
        checks.push(match cover_req {
            None => indeterminate(
                "ec2.footing.cast-cover",
                "4.4.1.3(4); UK NA k1 = 40 mm, k2 = 75 mm",
                "Choose whether the base is cast on blinding or directly against the ground",
            ),
            Some(req) => CheckOutcome::result(
                "ec2.footing.cast-cover",
                "4.4.1.3(4); UK NA k1 = 40 mm, k2 = 75 mm",
                if c.cover >= req - 1e-12 { CheckStatus::Pass } else { CheckStatus::Fail },
                req,
                c.cover,
                "m",
                json!({"castOnBlinding": c.detailing.cast_on_blinding}),
                "Demand is the minimum nominal cover for the casting surface",
            ),
        });
        checks.push(CheckOutcome::result(
            "ec2.footing.bar-diameter",
            "9.8.2.1(1); UK NA φ_min = 8 mm",
            if bx.diameter.min(by.diameter) >= PHI_MIN { CheckStatus::Pass } else { CheckStatus::Fail },
            PHI_MIN,
            bx.diameter.min(by.diameter),
            "m",
            json!({}),
            "Demand is φ_min, resistance the smaller bar",
        ));
    }
    FootingDesign {
        checks,
        bars_x: bx,
        bars_y: by,
        detail: json!({"bearing": bearing_detail, "uls": {"combinationId": uls.combination_id, "n": uls.n, "ex": ex, "ey": ey, "contact": k},
                       "directions": details, "fcd": fcd, "fyd": fyd}),
    }
}

/// 6.4.4(2) and 6.4.5(3): the column base at control perimeters a ∈ (0, 2d]
/// with the ground force inside each removed, the eccentricity factor of
/// (6.51) in each direction, and the face check v ≤ 0.5 ν f_cd.
fn punching(ndp: &Ec2Ndp, c: &PadFootingContext, uls: &FootingActions, k: &Contact, bx: Bars, by: Bars) -> Vec<CheckOutcome> {
    let fck = c.fck / 1e6;
    let d = (bx.effective_depth + by.effective_depth) / 2.;
    let rho = ((bx.area / (c.width * bx.effective_depth)) * (by.area / (c.length * by.effective_depth))).sqrt().min(0.02);
    let kk = (1. + (0.2 / d).sqrt()).min(2.);
    let crdc = ndp.crdc_numerator / ndp.gamma_c;
    let vmin = 0.035 * kk.powf(1.5) * fck.sqrt();
    let (cx, cy) = (c.column_x, c.column_y);
    // Moments transferred by the column (6.51), each with its own k and W.
    let terms = [(uls.my.abs(), cx, cy), (uls.mx.abs(), cy, cx)];
    let mut worst = (f64::NEG_INFINITY, Value::Null);
    for i in 1..=PUNCHING_SAMPLES {
        let a = 2. * d * i as f64 / PUNCHING_SAMPLES as f64;
        let u = 2. * (cx + cy) + 2. * std::f64::consts::PI * a;
        // Full contact: the region is symmetric about the column (and base)
        // centre, so the linear terms vanish and the force is exact.
        let inside = if k.state == "full" {
            k.plane.p0 * rounded_area(cx, cy, a).min(c.length * c.width)
        } else {
            load_within(k, &rounded_rectangle(cx, cy, a))[0]
        };
        let v_red = (uls.n - inside).max(0.);
        let beta = 1.
            + terms
                .iter()
                .map(|&(m, c1, c2)| {
                    let w = c1 * c1 / 2. + c1 * c2 + 2. * c2 * a + 4. * a * a + std::f64::consts::PI * a * c1;
                    if v_red > 0. { k_table(c1 / c2) * m * u / (v_red * w) } else { 0. }
                })
                .sum::<f64>();
        let v_ed = v_red / (u * d) * beta / 1e6;
        let v_rd = (crdc * kk * (100. * rho * fck).cbrt()).max(vmin) * 2. * d / a;
        let ratio = v_ed / v_rd;
        if ratio > worst.0 {
            worst = (ratio, json!({"a": a, "u": u, "groundInside": inside, "areaInside": rounded_area(cx, cy, a),
                "vEdRed": v_red, "beta": beta, "vEd": v_ed, "vRd": v_rd}));
        }
    }
    let u0 = 2. * (cx + cy);
    let nu = 0.6 * (1. - fck / 250.);
    let fcd = ndp.alpha_cc_shear * c.fck / ndp.gamma_c;
    let beta0 = 1. + terms.iter().map(|&(m, c1, c2)| {
        let w = c1 * c1 / 2. + c1 * c2;
        if uls.n > 0. { k_table(c1 / c2) * m * u0 / (uls.n * w) } else { 0. }
    }).sum::<f64>();
    let v0 = beta0 * uls.n / (u0 * d);
    let vmax = 0.5 * nu * fcd;
    vec![
        CheckOutcome::result(
            "ec2.footing.punching",
            "6.4.4(2), (6.48)-(6.51)",
            if worst.0 <= 1. + 1e-12 { CheckStatus::Pass } else { CheckStatus::Fail },
            worst.0,
            1.,
            "-",
            json!({"d": d, "rhoL": rho, "k": kk, "vmin": vmin, "critical": worst.1, "samples": PUNCHING_SAMPLES}),
            "Demand is the largest v_Ed/v_Rd over control perimeters a ≤ 2d",
        ),
        CheckOutcome::result(
            "ec2.footing.punching-face",
            "6.4.5(3); UK NA v_Rd,max = 0.5 ν f_cd",
            if v0 <= vmax { CheckStatus::Pass } else { CheckStatus::Fail },
            v0,
            vmax,
            "Pa",
            json!({"u0": u0, "beta": beta0, "nu": nu}),
            "Shear stress at the column face",
        ),
    ]
}
