//! Biaxial RC column section mechanics (M12, ADR 0022). Code-agnostic: every
//! material parameter and strain limit is an explicit input and results are
//! mechanics, never a code PASS/FAIL. Formulation: docs/formulations/rc-column.md.
//!
//! Conventions: local section axes y (width b) and z (depth h), origin at the
//! rectangle centre. Strain and stress are compression positive, as in
//! [`crate::rc_section`]. The axial force N is compression positive (the frame
//! force with its sign reversed). The moments are the frame's local moments:
//! My = −∫σ z dA and Mz = ∫σ y dA, so a negative My compresses the +z face
//! and a positive Mz the +y face. SI units throughout.
use serde::{Deserialize, Serialize};
use workbench_model::{Result, err};

use crate::rc_section::{ConcreteLaw, SteelLaw, positive};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ColumnBar {
    pub y: f64,
    pub z: f64,
    pub area: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ColumnSection {
    /// Along local y (m).
    pub width: f64,
    /// Along local z (m).
    pub depth: f64,
    pub bars: Vec<ColumnBar>,
}

/// Ultimate strain domain inputs (EN 1992-1-1:2004 6.1, Figure 6.1 shape;
/// every value is the caller's, never a code default).
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrainLimits {
    /// Pivot C: the strain of a section in uniform compression.
    pub full_compression_strain: f64,
    /// Pivot A: the tensile strain limit of the reinforcement. Absent means
    /// no limit, so the pure tension resistance is only approached.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub steel_strain_limit: Option<f64>,
}

/// ε(y, z) = e0 + ky y + kz z, compression positive.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StrainPlane {
    pub e0: f64,
    pub ky: f64,
    pub kz: f64,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Resultants {
    /// Compression positive (N).
    pub n: f64,
    /// Frame local moments (N m).
    pub my: f64,
    pub mz: f64,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Pivot {
    /// A: the extreme tension bar at the steel strain limit.
    SteelStrainLimit,
    /// B: the most compressed fibre at the ultimate concrete strain.
    UltimateCompression,
    /// C: full compression, rotating about the Figure 6.1 point C.
    FullCompression,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AxialRange {
    /// Uniform full-compression strain resultant (N, compression positive).
    pub squash: f64,
    /// Pure tension resistance (N, negative).
    pub tension: f64,
    /// False when there is no steel strain limit: the tension resistance is
    /// then only approached as the curvature grows without bound.
    pub tension_attained: bool,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Capacity {
    /// Resistance moment along the demand direction (N m, ≥ 0).
    pub m_rd: f64,
    pub my: f64,
    pub mz: f64,
    /// Axial force of the returned strain plane (N).
    pub n: f64,
    /// Direction (from +y towards +z, rad) in which compression increases.
    pub neutral_axis_angle: f64,
    /// Neutral-axis depth from the most compressed fibre along that direction
    /// (m); absent for a uniform strain plane.
    pub neutral_axis_depth: Option<f64>,
    pub plane: StrainPlane,
    pub pivot: Pivot,
    pub angle_iterations: u32,
    pub depth_iterations: u32,
    /// |direction of (My, Mz) − θ| (rad).
    pub direction_error: f64,
    /// |N − N_Ed| / max(|N_squash|, |N_tension|).
    pub axial_residual: f64,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ColumnCheck {
    pub n_ed: f64,
    pub my_ed: f64,
    pub mz_ed: f64,
    /// |(My_Ed, Mz_Ed)| (N m).
    pub m_ed: f64,
    /// N_Ed / N_squash in compression, N_Ed / N_tension in tension.
    pub axial_ratio: f64,
    /// M_Ed / M_Rd(N_Ed, θ_Ed); zero when M_Ed = 0; absent when N_Ed lies
    /// outside the axial range.
    pub utilisation: Option<f64>,
    pub capacity: Option<Capacity>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ColumnInputs {
    pub section: ColumnSection,
    pub concrete: ConcreteLaw,
    pub steel: SteelLaw,
    pub limits: StrainLimits,
}

/// A validated column section with its material laws and strain limits.
#[derive(Clone, Debug)]
pub struct Column {
    inputs: ColumnInputs,
}

/// Sampled neutral-axis directions for the direction brackets.
const ANGLE_SAMPLES: usize = 72;
/// Samples per pivot branch when bracketing N = N_Ed along the domain.
const DOMAIN_SAMPLES: usize = 16;
/// Gauss–Legendre, 8 points on [−1, 1].
const GAUSS8: [(f64, f64); 8] = [
    (-0.960_289_856_497_536_3, 0.101_228_536_290_376_26),
    (-0.796_666_477_413_626_7, 0.222_381_034_453_374_47),
    (-0.525_532_409_916_329, 0.313_706_645_877_887_3),
    (-0.183_434_642_495_649_8, 0.362_683_783_378_362),
    (0.183_434_642_495_649_8, 0.362_683_783_378_362),
    (0.525_532_409_916_329, 0.313_706_645_877_887_3),
    (0.796_666_477_413_626_7, 0.222_381_034_453_374_47),
    (0.960_289_856_497_536_3, 0.101_228_536_290_376_26),
];

/// The resistance contour at one axial force, seen from the section centre.
enum Around {
    /// A uniform strain plane (N_Ed at the squash or attained tension limit)
    /// whose moment about the centre vanishes: the resistance is zero.
    Limit(Capacity),
    /// Moment directions at the sampled neutral-axis angles; the contour
    /// winds once around the centre.
    Phases([f64; ANGLE_SAMPLES + 1]),
}

/// Geometry of the section seen along the compression direction n.
struct Frame {
    n: [f64; 2],
    /// max n·p over the corners (the most compressed fibre).
    u_top: f64,
    /// Section extent along n.
    height: f64,
    /// Depth of the extreme (deepest) bar below the most compressed fibre.
    bar_depth: f64,
    /// Corner depths below the most compressed fibre.
    corner_depths: [f64; 4],
}

/// The concrete stress along the strain gradient on one depth interval.
enum Branch {
    Zero,
    Constant(f64),
    /// peak (1 − u^n), u = 1 − ε/ε_c2.
    Parabola {
        peak: f64,
        e2: f64,
        exponent: f64,
    },
}

fn wrap(x: f64) -> f64 {
    let t = std::f64::consts::TAU;
    let r = x.rem_euclid(t);
    if r > std::f64::consts::PI { r - t } else { r }
}

/// Bisection with g(lo) ≤ 0 < g(hi) until the bracket stops shrinking in
/// f64 or is below `floor`; returns the root and the iteration count. The
/// floor keeps a root at 0 from descending through subnormal numbers.
fn bisect(mut lo: f64, mut hi: f64, floor: f64, mut g: impl FnMut(f64) -> f64) -> (f64, u32) {
    let mut iterations = 0;
    loop {
        let mid = lo + (hi - lo) / 2.0;
        if mid <= lo || mid >= hi || hi - lo <= floor {
            return (mid, iterations);
        }
        iterations += 1;
        if g(mid) < 0.0 {
            lo = mid;
        } else {
            hi = mid;
        }
    }
}

/// ∫₀¹ q(t) dt for q(t) = a + b t + c t².
fn poly_integral([a, b, c]: [f64; 3]) -> f64 {
    a + b / 2.0 + c / 3.0
}

/// ∫₀¹ u(t)^n q(t) dt with u(t) = ua + (ub − ua) t ≥ 0. Analytic in u when u
/// varies by at least a tenth of its size; otherwise (nearly uniform strain,
/// where the analytic difference loses digits) Gauss–Legendre, whose error is
/// then below 1e-25 relative because the singularity of u^n lies over ten
/// interval lengths away.
fn power_poly_integral(ua: f64, ub: f64, exponent: f64, q: [f64; 3]) -> f64 {
    let top = ua.max(ub);
    if top <= 0.0 {
        return 0.0;
    }
    if (ub - ua).abs() >= 0.1 * top {
        power_poly_analytic(ua, ub, exponent, q)
    } else {
        power_poly_gauss(ua, ub, exponent, q)
    }
}

fn power_poly_analytic(ua: f64, ub: f64, exponent: f64, [a, b, c]: [f64; 3]) -> f64 {
    let delta = ub - ua;
    // q(t(u)) = A + B u + C u², t = (u − ua)/Δ.
    let cc = c / (delta * delta);
    let bb = b / delta - 2.0 * c * ua / (delta * delta);
    let aa = a - b * ua / delta + c * ua * ua / (delta * delta);
    let i = |m: f64| (ub.powf(m + 1.0) - ua.powf(m + 1.0)) / (m + 1.0);
    (aa * i(exponent) + bb * i(exponent + 1.0) + cc * i(exponent + 2.0)) / delta
}

fn power_poly_gauss(ua: f64, ub: f64, exponent: f64, [a, b, c]: [f64; 3]) -> f64 {
    GAUSS8
        .iter()
        .map(|&(x, w)| {
            let t = 0.5 * (x + 1.0);
            0.5 * w * (ua + (ub - ua) * t).powf(exponent) * (a + b * t + c * t * t)
        })
        .sum()
}

/// Quadratic through samples at t = 1/4, 1/2, 3/4 as [a, b, c].
fn quadratic(g1: f64, g2: f64, g3: f64) -> [f64; 3] {
    let c = 8.0 * (g1 - 2.0 * g2 + g3);
    let b = 2.0 * (g3 - g1) - c;
    [g2 - b / 2.0 - c / 4.0, b, c]
}

impl Column {
    pub fn new(inputs: ColumnInputs) -> Result<Self> {
        let s = &inputs.section;
        positive("Section width", s.width)?;
        positive("Section depth", s.depth)?;
        if s.bars.is_empty() {
            return Err(err(
                "DESIGN_INPUT_INCOMPLETE",
                "At least one reinforcing bar is required",
            ));
        }
        for bar in &s.bars {
            positive("Bar area", bar.area)?;
            if !(bar.y.is_finite() && bar.z.is_finite()) {
                return Err(err("NONFINITE_INPUT", "Bar position must be finite"));
            }
            let r = (bar.area / std::f64::consts::PI).sqrt();
            if bar.y.abs() + r > s.width / 2.0 || bar.z.abs() + r > s.depth / 2.0 {
                return Err(err(
                    "INVALID_SCHEMA",
                    "Each bar (a disc of its area) must lie inside the concrete section",
                ));
            }
        }
        inputs.steel.validate()?;
        inputs.concrete.validate()?;
        let ecu = inputs.concrete.ultimate_strain();
        positive(
            "Full-compression strain",
            inputs.limits.full_compression_strain,
        )?;
        if inputs.limits.full_compression_strain > ecu {
            return Err(err(
                "INVALID_SCHEMA",
                "The full-compression strain must not exceed the ultimate concrete strain",
            ));
        }
        if let Some(eud) = inputs.limits.steel_strain_limit {
            positive("Steel strain limit", eud)?;
        }
        Ok(Self { inputs })
    }

    pub fn inputs(&self) -> &ColumnInputs {
        &self.inputs
    }

    /// Concrete stress at compressive strain ε. The rectangular block is the
    /// strain-threshold law σ = intensity for ε > (1 − λ) ε_cu: on every
    /// pivot-B plane that is the block of depth λx from the most compressed
    /// fibre, and it extends to full compression without a new parameter.
    fn concrete_stress(&self, e: f64) -> f64 {
        if e <= 0.0 {
            return 0.0;
        }
        match self.inputs.concrete {
            ConcreteLaw::RectangularBlock {
                intensity,
                depth_ratio,
                ultimate_strain,
            } => {
                if e > (1.0 - depth_ratio) * ultimate_strain {
                    intensity
                } else {
                    0.0
                }
            }
            ConcreteLaw::ParabolaRectangle {
                peak,
                strain_at_peak,
                exponent,
                ..
            } => {
                if e >= strain_at_peak {
                    peak
                } else {
                    peak * (1.0 - (1.0 - e / strain_at_peak).powf(exponent))
                }
            }
        }
    }

    fn corners(&self) -> [[f64; 2]; 4] {
        let (b, h) = (
            self.inputs.section.width / 2.0,
            self.inputs.section.depth / 2.0,
        );
        [[-b, -h], [b, -h], [b, h], [-b, h]]
    }

    fn frame(&self, alpha: f64) -> Frame {
        let n = [alpha.cos(), alpha.sin()];
        let us = self.corners().map(|[y, z]| n[0] * y + n[1] * z);
        let u_top = us.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        let u_bot = us.iter().copied().fold(f64::INFINITY, f64::min);
        let bar_depth = self
            .inputs
            .section
            .bars
            .iter()
            .map(|b| u_top - (n[0] * b.y + n[1] * b.z))
            .fold(f64::NEG_INFINITY, f64::max);
        Frame {
            n,
            u_top,
            height: u_top - u_bot,
            bar_depth,
            corner_depths: us.map(|u| u_top - u),
        }
    }

    /// Length and first moments [w, ∫y, ∫z] of the chord n·p = u.
    fn chord(&self, n: [f64; 2], u: f64) -> [f64; 3] {
        let (b, h) = (
            self.inputs.section.width / 2.0,
            self.inputs.section.depth / 2.0,
        );
        let t = [-n[1], n[0]];
        let (mut lo, mut hi) = (f64::NEG_INFINITY, f64::INFINITY);
        for (base, dir, half) in [(u * n[0], t[0], b), (u * n[1], t[1], h)] {
            if dir == 0.0 {
                if base.abs() > half {
                    return [0.0; 3];
                }
                continue;
            }
            let (a1, a2) = ((-half - base) / dir, (half - base) / dir);
            lo = lo.max(a1.min(a2));
            hi = hi.min(a1.max(a2));
        }
        if hi <= lo {
            return [0.0; 3];
        }
        let w = hi - lo;
        let mid = (hi + lo) / 2.0;
        [w, w * (u * n[0] + mid * t[0]), w * (u * n[1] + mid * t[1])]
    }

    /// Exact concrete resultants [N, ∫σy, ∫σz] for ε(s) = e_top − κ s, s the
    /// depth below the most compressed fibre, κ > 0.
    fn concrete(&self, f: &Frame, e_top: f64, kappa: f64) -> [f64; 3] {
        let mut cuts = [0.0; 8];
        let mut count = 0;
        let mut push = |s: f64| {
            if s > 0.0 && s < f.height {
                cuts[count] = s;
                count += 1;
            }
        };
        for s in f.corner_depths {
            push(s);
        }
        let threshold = match self.inputs.concrete {
            ConcreteLaw::RectangularBlock {
                depth_ratio,
                ultimate_strain,
                ..
            } => (1.0 - depth_ratio) * ultimate_strain,
            ConcreteLaw::ParabolaRectangle { strain_at_peak, .. } => strain_at_peak,
        };
        push(e_top / kappa);
        push((e_top - threshold) / kappa);
        let mut breaks = [0.0; 10];
        breaks[1..=count].copy_from_slice(&cuts[..count]);
        breaks[count + 1] = f.height;
        let breaks = &mut breaks[..count + 2];
        breaks.sort_by(f64::total_cmp);
        let mut total = [0.0; 3];
        for w in breaks.windows(2) {
            let (s0, s1) = (w[0], w[1]);
            let length = s1 - s0;
            if length <= 0.0 {
                continue;
            }
            let e_mid = e_top - kappa * (s0 + s1) / 2.0;
            let branch = match self.inputs.concrete {
                _ if e_mid <= 0.0 => Branch::Zero,
                ConcreteLaw::RectangularBlock { intensity, .. } => {
                    if e_mid > threshold {
                        Branch::Constant(intensity)
                    } else {
                        Branch::Zero
                    }
                }
                ConcreteLaw::ParabolaRectangle {
                    peak,
                    strain_at_peak,
                    exponent,
                    ..
                } => {
                    if e_mid >= strain_at_peak {
                        Branch::Constant(peak)
                    } else {
                        Branch::Parabola {
                            peak,
                            e2: strain_at_peak,
                            exponent,
                        }
                    }
                }
            };
            if matches!(branch, Branch::Zero) {
                continue;
            }
            let sample = |t: f64| self.chord(f.n, f.u_top - (s0 + length * t));
            let (g1, g2, g3) = (sample(0.25), sample(0.5), sample(0.75));
            for k in 0..3 {
                let q = quadratic(g1[k], g2[k], g3[k]);
                total[k] += length
                    * match branch {
                        Branch::Zero => 0.0,
                        Branch::Constant(stress) => stress * poly_integral(q),
                        Branch::Parabola { peak, e2, exponent } => {
                            let u = |s: f64| (1.0 - (e_top - kappa * s) / e2).max(0.0);
                            peak * (poly_integral(q)
                                - power_poly_integral(u(s0), u(s1), exponent, q))
                        }
                    };
            }
        }
        total
    }

    /// Concrete displaced by one bar: (force, offset of its centroid from the
    /// bar centre along n). The parabola-rectangle stress is continuous, so it
    /// is taken at the bar centre as in [`crate::rc_section`]. The block
    /// stress jumps at its edge, where a point bar would make N jump as the
    /// edge crosses it; the bar is a disc of its own area, and the displaced
    /// concrete is the block over the circular segment inside the block.
    fn displaced(&self, area: f64, e: f64, kappa: f64) -> (f64, f64) {
        match self.inputs.concrete {
            ConcreteLaw::ParabolaRectangle { .. } => (area * self.concrete_stress(e), 0.0),
            ConcreteLaw::RectangularBlock {
                intensity,
                depth_ratio,
                ultimate_strain,
            } => {
                let threshold = (1.0 - depth_ratio) * ultimate_strain;
                if kappa == 0.0 {
                    return (if e > threshold { intensity * area } else { 0.0 }, 0.0);
                }
                let r = (area / std::f64::consts::PI).sqrt();
                // The block is n·(p − centre) > δ.
                let delta = (threshold - e) / kappa;
                if delta >= r {
                    (0.0, 0.0)
                } else if delta <= -r {
                    (intensity * area, 0.0)
                } else {
                    let root = (r * r - delta * delta).sqrt();
                    let segment = r * r * (delta / r).acos() - delta * root;
                    let offset = if segment > 0.0 {
                        2.0 / 3.0 * root.powi(3) / segment
                    } else {
                        0.0
                    };
                    (intensity * segment, offset)
                }
            }
        }
    }

    fn bars(&self, f: &Frame, e_top: f64, kappa: f64) -> [f64; 3] {
        let mut total = [0.0; 3];
        for bar in &self.inputs.section.bars {
            let e = e_top - kappa * (f.u_top - (f.n[0] * bar.y + f.n[1] * bar.z));
            let steel = bar.area * self.inputs.steel.stress(e);
            let (concrete, offset) = self.displaced(bar.area, e, kappa);
            total[0] += steel - concrete;
            total[1] += steel * bar.y - concrete * (bar.y + offset * f.n[0]);
            total[2] += steel * bar.z - concrete * (bar.z + offset * f.n[1]);
        }
        total
    }

    fn resultants_on(&self, f: &Frame, e_top: f64, kappa: f64) -> Resultants {
        let c = if kappa == 0.0 {
            let stress = self.concrete_stress(e_top);
            let area = self.inputs.section.width * self.inputs.section.depth;
            [stress * area, 0.0, 0.0]
        } else {
            self.concrete(f, e_top, kappa)
        };
        let s = self.bars(f, e_top, kappa);
        Resultants {
            n: c[0] + s[0],
            my: -(c[2] + s[2]),
            mz: c[1] + s[1],
        }
    }

    /// Section resultants of an arbitrary strain plane. The laws are applied
    /// as given (not truncated at the ultimate strain).
    pub fn resultants(&self, plane: StrainPlane) -> Result<Resultants> {
        if !(plane.e0.is_finite() && plane.ky.is_finite() && plane.kz.is_finite()) {
            return Err(err("NONFINITE_INPUT", "Strain plane must be finite"));
        }
        let kappa = plane.ky.hypot(plane.kz);
        if kappa == 0.0 {
            return Ok(self.resultants_on(&self.frame(0.0), plane.e0, 0.0));
        }
        let f = self.frame(plane.kz.atan2(plane.ky));
        Ok(self.resultants_on(&f, plane.e0 + kappa * f.u_top, kappa))
    }

    fn ultimate_strain(&self) -> f64 {
        self.inputs.concrete.ultimate_strain()
    }

    /// Ultimate plane of the Figure 6.1 domain for parameter τ: [0, 1] pivot A
    /// (only with a steel strain limit), (1, 2] pivot B, [2, 3] pivot C.
    /// Returns (e_top, κ, pivot).
    fn domain(&self, f: &Frame, tau: f64) -> (f64, f64, Pivot) {
        let ecu = self.ultimate_strain();
        let ec = self.inputs.limits.full_compression_strain;
        let eud = self.inputs.limits.steel_strain_limit;
        if tau < 1.0 {
            let eud = eud.expect("pivot A needs a steel strain limit");
            let e_top = -eud + tau * (ecu + eud);
            (e_top, (e_top + eud) / f.bar_depth, Pivot::SteelStrainLimit)
        } else if tau <= 2.0 {
            let x_ab = eud.map_or(0.0, |eud| ecu * f.bar_depth / (ecu + eud));
            let x = x_ab + (tau - 1.0) * (f.height - x_ab);
            (ecu, ecu / x, Pivot::UltimateCompression)
        } else {
            let s_c = (1.0 - ec / ecu) * f.height;
            let e_bottom = (tau - 2.0) * ec;
            let kappa = (ec - e_bottom) / (f.height - s_c);
            (ec + kappa * s_c, kappa, Pivot::FullCompression)
        }
    }

    fn tau_low(&self) -> f64 {
        if self.inputs.limits.steel_strain_limit.is_some() {
            0.0
        } else {
            1.0 + f64::EPSILON
        }
    }

    /// Squash and tension resistances (uniform strain planes).
    pub fn axial_range(&self) -> AxialRange {
        let f = self.frame(0.0);
        let ec = self.inputs.limits.full_compression_strain;
        let squash = self.resultants_on(&f, ec, 0.0).n;
        let (tension, tension_attained) = match self.inputs.limits.steel_strain_limit {
            Some(eud) => (self.resultants_on(&f, -eud, 0.0).n, true),
            None => (
                -self
                    .inputs
                    .section
                    .bars
                    .iter()
                    .map(|b| b.area * self.inputs.steel.yield_strength)
                    .sum::<f64>(),
                false,
            ),
        };
        AxialRange {
            squash,
            tension,
            tension_attained,
        }
    }

    fn axial_scale(&self, range: &AxialRange) -> f64 {
        range.squash.abs().max(range.tension.abs())
    }

    /// The ultimate plane at angle α carrying N_Ed: (frame, τ, resultants,
    /// iterations). N is continuous along the domain but not always monotone:
    /// rotating about pivot C with unequal reinforcement on the two faces can
    /// lower it. Every sign change of N − N_Ed over 16 samples per pivot
    /// branch is solved and the plane with the largest moment (the outermost
    /// ultimate state at this angle) is kept; a pair of roots closer than one
    /// sample spacing can be missed, which only understates the resistance.
    fn at_angle(&self, alpha: f64, n_ed: f64) -> Result<(Frame, f64, Resultants, u32)> {
        let f = self.frame(alpha);
        let n_of = |tau: f64| {
            let (e, k, _) = self.domain(&f, tau);
            self.resultants_on(&f, e, k).n
        };
        let lo = self.tau_low();
        let mut taus = [0.0; 3 * DOMAIN_SAMPLES + 1];
        let branches: &[(f64, f64)] = if self.inputs.limits.steel_strain_limit.is_some() {
            &[(0.0, 1.0), (1.0, 2.0), (2.0, 3.0)]
        } else {
            &[(lo, 2.0), (2.0, 3.0)]
        };
        let mut count = 0;
        for &(a, b) in branches {
            for k in 0..DOMAIN_SAMPLES {
                taus[count] = a + (b - a) * k as f64 / DOMAIN_SAMPLES as f64;
                count += 1;
            }
        }
        taus[count] = 3.0;
        let taus = &taus[..=count];
        let mut values = [0.0; 3 * DOMAIN_SAMPLES + 1];
        for (v, &t) in values.iter_mut().zip(taus) {
            *v = n_of(t) - n_ed;
        }
        let values = &values[..=count];
        if values[0] > 0.0 || values[count] < 0.0 {
            return Err(err(
                "INVALID_LOAD",
                "The axial force lies outside the section's ultimate strain domain",
            ));
        }
        let mut best: Option<(f64, Resultants, u32)> = None;
        let mut keep = |tau: f64, iterations: u32| {
            let (e, k, _) = self.domain(&f, tau);
            let r = self.resultants_on(&f, e, k);
            if best
                .as_ref()
                .is_none_or(|(_, b, _)| r.my.hypot(r.mz) > b.my.hypot(b.mz))
            {
                best = Some((tau, r, iterations));
            }
        };
        let floor = 3.0 * f64::EPSILON;
        for i in 0..count {
            let (t0, t1, g0, g1) = (taus[i], taus[i + 1], values[i], values[i + 1]);
            if g0 == 0.0 {
                keep(t0, 0);
            } else if g0 < 0.0 && g1 > 0.0 {
                let (t, its) = bisect(t0, t1, floor, |t| n_of(t) - n_ed);
                keep(t, its);
            } else if g0 > 0.0 && g1 < 0.0 {
                let (t, its) = bisect(t0, t1, floor, |t| n_ed - n_of(t));
                keep(t, its);
            }
        }
        if values[count] == 0.0 {
            keep(3.0, 0);
        }
        let (tau, r, iterations) =
            best.ok_or_else(|| err("INTERNAL", "No ultimate plane carries the axial force"))?;
        Ok((f, tau, r, iterations))
    }

    fn capacity_at(
        &self,
        alpha: f64,
        n_ed: f64,
        theta: f64,
        range: &AxialRange,
        angle_iterations: u32,
    ) -> Result<Capacity> {
        let (f, tau, r, depth_iterations) = self.at_angle(alpha, n_ed)?;
        let (e_top, kappa, pivot) = self.domain(&f, tau);
        let direction = r.mz.atan2(r.my);
        Ok(Capacity {
            m_rd: r.my.hypot(r.mz),
            my: r.my,
            mz: r.mz,
            n: r.n,
            neutral_axis_angle: alpha.rem_euclid(std::f64::consts::TAU),
            neutral_axis_depth: (kappa > 0.0).then(|| e_top / kappa),
            plane: StrainPlane {
                e0: e_top - kappa * f.u_top,
                ky: kappa * f.n[0],
                kz: kappa * f.n[1],
            },
            pivot,
            angle_iterations,
            depth_iterations,
            direction_error: wrap(direction - theta).abs(),
            axial_residual: (r.n - n_ed).abs() / self.axial_scale(range),
        })
    }

    /// The contour at `n_ed` around the section centre. Refuses N_Ed outside
    /// the axial range (`INVALID_LOAD`) and a contour that does not surround
    /// the centre (`UNSUPPORTED_FEATURE`: eccentric reinforcement near the
    /// axial limits, where a ray from the centre does not measure the demand).
    fn around(&self, n_ed: f64, range: &AxialRange) -> Result<Around> {
        let scale = self.axial_scale(range);
        let off_centre = || {
            err(
                "UNSUPPORTED_FEATURE",
                "At this axial force the resistance contour does not surround the section centre",
            )
        };
        let uniform = |e: f64, pivot: Pivot| -> Result<Around> {
            let r = self.resultants_on(&self.frame(0.0), e, 0.0);
            let m = r.my.hypot(r.mz);
            if m > 1e-12 * scale * self.inputs.section.width.max(self.inputs.section.depth) {
                return Err(off_centre());
            }
            Ok(Around::Limit(Capacity {
                m_rd: 0.0,
                my: 0.0,
                mz: 0.0,
                n: r.n,
                neutral_axis_angle: 0.0,
                neutral_axis_depth: None,
                plane: StrainPlane {
                    e0: e,
                    ky: 0.0,
                    kz: 0.0,
                },
                pivot,
                angle_iterations: 0,
                depth_iterations: 0,
                direction_error: 0.0,
                axial_residual: (r.n - n_ed).abs() / scale,
            }))
        };
        if n_ed > range.squash
            || n_ed < range.tension
            || (n_ed == range.tension && !range.tension_attained)
        {
            return Err(err(
                "INVALID_LOAD",
                format!(
                    "N_Ed = {n_ed:e} N lies outside the axial resistance range [{:e}, {:e}] N",
                    range.tension, range.squash
                ),
            ));
        }
        if n_ed == range.squash {
            return uniform(
                self.inputs.limits.full_compression_strain,
                Pivot::FullCompression,
            );
        }
        if let Some(eud) = self.inputs.limits.steel_strain_limit
            && n_ed == range.tension
        {
            return uniform(-eud, Pivot::SteelStrainLimit);
        }
        let step = std::f64::consts::TAU / ANGLE_SAMPLES as f64;
        let mut phases = [0.0; ANGLE_SAMPLES + 1];
        for (k, phase) in phases.iter_mut().enumerate() {
            let (_, _, r, _) = self.at_angle(step * k as f64, n_ed)?;
            *phase = r.mz.atan2(r.my);
        }
        let winding: f64 = phases.windows(2).map(|w| wrap(w[1] - w[0])).sum();
        if (winding - std::f64::consts::TAU).abs() > 1e-6 {
            return Err(off_centre());
        }
        Ok(Around::Phases(phases))
    }

    /// Resistance moment at axial force `n_ed` along the demand direction
    /// θ = atan2(Mz, My) (rad). Nested bisection: N-equilibrium over the
    /// strain domain at each neutral-axis angle, and the angle whose moment
    /// points along θ. Where several angles give θ the smallest resistance is
    /// returned.
    pub fn moment_capacity(&self, n_ed: f64, theta: f64) -> Result<Capacity> {
        if !(n_ed.is_finite() && theta.is_finite()) {
            return Err(err(
                "NONFINITE_INPUT",
                "Axial force and direction must be finite",
            ));
        }
        let range = self.axial_range();
        let phases = match self.around(n_ed, &range)? {
            Around::Limit(c) => return Ok(c),
            Around::Phases(p) => p,
        };
        let step = std::f64::consts::TAU / ANGLE_SAMPLES as f64;
        let mut best: Option<Capacity> = None;
        for k in 0..ANGLE_SAMPLES {
            let (d0, d1) = (wrap(phases[k] - theta), wrap(phases[k + 1] - theta));
            if !(d0 <= 0.0 && d1 > 0.0 && d1 - d0 < std::f64::consts::PI) {
                continue;
            }
            let (lo, hi) = (step * k as f64, step * (k + 1) as f64);
            let mut failure = None;
            let (alpha, iterations) = bisect(lo, hi, 4.0 * f64::EPSILON, |a| {
                match self.at_angle(a, n_ed) {
                    Ok((_, _, r, _)) => wrap(r.mz.atan2(r.my) - theta),
                    Err(e) => {
                        failure = Some(e);
                        0.0
                    }
                }
            });
            if let Some(e) = failure {
                return Err(e);
            }
            let c = self.capacity_at(alpha, n_ed, theta, &range, iterations)?;
            // A bracket around a jump of the direction (the outermost root
            // switching branch) is not a crossing. The attainable direction
            // accuracy is the moment roundoff over the resistance itself.
            let moment_scale =
                self.axial_scale(&range) * self.inputs.section.width.max(self.inputs.section.depth);
            if c.direction_error > 1e-9 + 1e-12 * moment_scale / c.m_rd {
                continue;
            }
            if best.as_ref().is_none_or(|b| c.m_rd < b.m_rd) {
                best = Some(c);
            }
        }
        best.ok_or_else(|| {
            err(
                "UNSUPPORTED_FEATURE",
                "No neutral-axis angle gives a moment in the demand direction",
            )
        })
    }

    /// Utilisation of the demand (N_Ed compression positive, frame My, Mz).
    pub fn check(&self, n_ed: f64, my_ed: f64, mz_ed: f64) -> Result<ColumnCheck> {
        if !(n_ed.is_finite() && my_ed.is_finite() && mz_ed.is_finite()) {
            return Err(err("NONFINITE_INPUT", "Design actions must be finite"));
        }
        let range = self.axial_range();
        let axial_ratio = if n_ed >= 0.0 {
            n_ed / range.squash
        } else {
            n_ed / range.tension
        };
        let m_ed = my_ed.hypot(mz_ed);
        let inside = n_ed <= range.squash
            && (n_ed > range.tension || (n_ed == range.tension && range.tension_attained));
        let (utilisation, capacity) = if !inside {
            (None, None)
        } else if m_ed == 0.0 {
            // The centre itself must lie inside the contour.
            self.around(n_ed, &range)?;
            (Some(0.0), None)
        } else {
            let c = self.moment_capacity(n_ed, mz_ed.atan2(my_ed))?;
            (
                Some(if c.m_rd > 0.0 {
                    m_ed / c.m_rd
                } else {
                    f64::INFINITY
                }),
                Some(c),
            )
        };
        Ok(ColumnCheck {
            n_ed,
            my_ed,
            mz_ed,
            m_ed,
            axial_ratio,
            utilisation,
            capacity,
        })
    }

    /// Points of the resistance contour at `n_ed`, one per neutral-axis
    /// angle, in angle order (for display).
    pub fn interaction_contour(&self, n_ed: f64, count: usize) -> Result<Vec<Resultants>> {
        if !(3..=720).contains(&count) {
            return Err(err("INVALID_SETTINGS", "Contour needs 3 to 720 points"));
        }
        let range = self.axial_range();
        if !(n_ed.is_finite() && n_ed < range.squash && n_ed > range.tension) {
            return Err(err(
                "INVALID_LOAD",
                "The contour needs an axial force strictly inside the resistance range",
            ));
        }
        (0..count)
            .map(|k| {
                let alpha = std::f64::consts::TAU * k as f64 / count as f64;
                self.at_angle(alpha, n_ed).map(|(_, _, r, _)| r)
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn column(law: ConcreteLaw, ec: f64, eud: Option<f64>) -> Column {
        let bars = vec![
            ColumnBar {
                y: -0.1,
                z: 0.24,
                area: 3.1e-4,
            },
            ColumnBar {
                y: 0.1,
                z: 0.24,
                area: 3.1e-4,
            },
            ColumnBar {
                y: -0.1,
                z: -0.245,
                area: 2.0e-4,
            },
            ColumnBar {
                y: 0.1,
                z: -0.245,
                area: 2.0e-4,
            },
            ColumnBar {
                y: 0.1,
                z: 0.0,
                area: 1.1e-4,
            },
        ];
        Column::new(ColumnInputs {
            section: ColumnSection {
                width: 0.3,
                depth: 0.6,
                bars,
            },
            concrete: law,
            steel: SteelLaw {
                yield_strength: 500e6,
                modulus: 200e9,
            },
            limits: StrainLimits {
                full_compression_strain: ec,
                steel_strain_limit: eud,
            },
        })
        .unwrap()
    }

    /// With the block law the whole section sits in the block late in pivot
    /// C; rotating about C with more steel on the compressed (+y) face than
    /// the other raises N above the uniform squash load. The axial range is
    /// the uniform planes', so those eccentric states are reported beyond it
    /// (they do not surround the section centre).
    #[test]
    fn eccentric_states_above_uniform_squash_are_out_of_range() {
        let c = column(
            ConcreteLaw::RectangularBlock {
                intensity: 17e6,
                depth_ratio: 0.8,
                ultimate_strain: 0.0035,
            },
            0.00175,
            None,
        );
        let f = c.frame(0.0);
        let n_of = |tau: f64| {
            let (e, k, _) = c.domain(&f, tau);
            c.resultants_on(&f, e, k).n
        };
        let peak = (0..=20000)
            .map(|i| n_of(2.0 + i as f64 / 20000.0))
            .fold(f64::NEG_INFINITY, f64::max);
        let squash = c.axial_range().squash;
        assert!(peak > squash && (n_of(3.0) - squash).abs() <= 1e-12 * squash);
        let n_ed = 0.5 * (peak + squash);
        assert_eq!(
            c.moment_capacity(n_ed, 0.0).unwrap_err().code,
            "INVALID_LOAD"
        );
        let check = c.check(n_ed, 0.0, 1e3).unwrap();
        assert!(check.axial_ratio > 1.0 && check.utilisation.is_none());
    }

    /// N rises along the ultimate strain domain at every neutral-axis angle
    /// for the parabola law, and the domain is continuous across the pivots.
    #[test]
    fn axial_force_increases_along_the_domain() {
        let laws = [(
            ConcreteLaw::ParabolaRectangle {
                peak: 30e6,
                strain_at_peak: 0.0022,
                ultimate_strain: 0.0031,
                exponent: 1.75,
            },
            0.0022,
        )];
        for (law, ec) in laws {
            for eud in [None, Some(0.0225)] {
                let c = column(law.clone(), ec, eud);
                let scale = c.axial_scale(&c.axial_range());
                for k in 0..36 {
                    let f = c.frame(std::f64::consts::TAU * k as f64 / 36.0);
                    let lo = c.tau_low();
                    let samples = 3000;
                    let mut last = f64::NEG_INFINITY;
                    for i in 0..=samples {
                        let tau = lo + (3.0 - lo) * i as f64 / samples as f64;
                        let (e, kap, _) = c.domain(&f, tau);
                        let n = c.resultants_on(&f, e, kap).n;
                        assert!(
                            n >= last - 1e-12 * scale,
                            "{law:?} {eud:?} α {k}: N falls at τ {tau}"
                        );
                        last = n;
                    }
                    for tau in [1.0, 2.0] {
                        if tau == 1.0 && eud.is_none() {
                            continue;
                        }
                        let a = c.domain(&f, tau - 1e-12);
                        let b = c.domain(&f, tau + 1e-12);
                        assert!(
                            (a.0 - b.0).abs() < 1e-12 && (a.1 - b.1).abs() < 1e-9,
                            "pivot jump at τ {tau}"
                        );
                    }
                }
            }
        }
    }

    /// The analytic and Gauss branches of ∫u^n q agree around the switch
    /// (Δ = u/9), and both match exact polynomial integration for n = 2.
    #[test]
    fn power_integral_branches_agree() {
        let q = [0.7, -0.4, 0.25];
        for n in [1.0, 1.75, 2.0, 2.5] {
            for ua in [0.3, 0.8, 1.0] {
                for d in [ua / 20.0, ua / 9.0, ua / 5.0, -ua / 9.0] {
                    let (x, y) = (
                        power_poly_analytic(ua, ua + d, n, q),
                        power_poly_gauss(ua, ua + d, n, q),
                    );
                    assert!(
                        (x - y).abs() <= 1e-12 * x.abs(),
                        "n {n} ua {ua} Δ {d}: {x} vs {y}"
                    );
                }
            }
        }
        for ua in [0.0, 0.3, 1.0] {
            for d in [0.5, 0.01] {
                // ∫₀¹ (ua + d t)² (a + b t + c t²) dt, expanded.
                let p = [ua * ua, 2.0 * ua * d, d * d];
                let mut exact = 0.0;
                for (i, pi) in p.iter().enumerate() {
                    for (j, qj) in q.iter().enumerate() {
                        exact += pi * qj / (i + j + 1) as f64;
                    }
                }
                let got = power_poly_integral(ua, ua + d, 2.0, q);
                assert!(
                    (got - exact).abs() <= 1e-14 * exact.abs(),
                    "ua {ua} Δ {d}: {got} vs {exact}"
                );
            }
        }
    }
}
