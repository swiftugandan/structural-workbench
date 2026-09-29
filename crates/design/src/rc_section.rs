//! Rectangular RC section mechanics (M08-A, ADR 0012). Code-agnostic: every
//! material parameter is an explicit input and results are mechanics, never a
//! code PASS/FAIL. Formulation: docs/formulations/rc-section.md.
use serde::{Deserialize, Serialize};
use workbench_model::{Result, err};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RcRectangle {
    pub width: f64,
    pub depth: f64,
}

/// Layer depth is measured from the compression face.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BarLayer {
    pub depth: f64,
    pub area: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SteelLaw {
    pub yield_strength: f64,
    pub modulus: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum ConcreteLaw {
    #[serde(rename_all = "camelCase")]
    RectangularBlock {
        intensity: f64,
        depth_ratio: f64,
        ultimate_strain: f64,
    },
    #[serde(rename_all = "camelCase")]
    ParabolaRectangle {
        peak: f64,
        strain_at_peak: f64,
        ultimate_strain: f64,
        exponent: f64,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ElasticInputs {
    pub concrete_modulus: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tensile_strength: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub service_moment: Option<f64>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TensionState {
    TensionYielded,
    TensionElastic,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerState {
    pub strain: f64,
    pub steel_stress: f64,
    /// Net layer force (bar minus displaced concrete), compression positive.
    pub force: f64,
    /// |strain| ≥ yield strain, in tension or compression.
    pub yielded: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UltimateState {
    pub neutral_axis_depth: f64,
    pub moment: f64,
    pub concrete_force: f64,
    pub curvature: f64,
    pub classification: TensionState,
    /// x / deepest layer depth. Mechanics ratio, not a code ductility limit.
    pub depth_ratio: f64,
    pub layers: Vec<LayerState>,
    /// |ΣF| / max(C, Σ|F_i|) at the returned neutral axis.
    pub relative_residual: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElasticState {
    pub modular_ratio: f64,
    pub uncracked_area: f64,
    pub uncracked_centroid: f64,
    pub uncracked_inertia: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cracking_moment: Option<f64>,
    pub cracked_neutral_axis: f64,
    pub cracked_inertia: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service_concrete_stress: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service_steel_stress: Option<Vec<f64>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BarRow {
    pub width: f64,
    pub side_cover: f64,
    pub link_diameter: f64,
    pub bar_diameter: f64,
    pub count: u32,
    /// Caller-supplied, provenance-tracked; the kernel never defaults it.
    pub minimum_clear_spacing: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowFit {
    pub area: f64,
    pub clear_spacing: Option<f64>,
    pub depth_from_face: f64,
    pub fits: bool,
}

pub(crate) fn positive(name: &str, v: f64) -> Result<()> {
    if !v.is_finite() {
        return Err(err("NONFINITE_INPUT", format!("{name} must be finite")));
    }
    if v <= 0.0 {
        return Err(err("INVALID_SCHEMA", format!("{name} must be positive")));
    }
    Ok(())
}

fn validate_section(s: &RcRectangle, layers: &[BarLayer]) -> Result<()> {
    positive("Section width", s.width)?;
    positive("Section depth", s.depth)?;
    if layers.is_empty() {
        return Err(err(
            "DESIGN_INPUT_INCOMPLETE",
            "At least one reinforcement layer is required",
        ));
    }
    for l in layers {
        positive("Layer area", l.area)?;
        positive("Layer depth", l.depth)?;
        if l.depth >= s.depth {
            return Err(err(
                "INVALID_SCHEMA",
                "Layer depth must lie inside the section",
            ));
        }
    }
    Ok(())
}

impl SteelLaw {
    pub(crate) fn validate(&self) -> Result<()> {
        positive("Steel yield strength", self.yield_strength)?;
        positive("Steel modulus", self.modulus)
    }
    pub(crate) fn stress(&self, strain: f64) -> f64 {
        (self.modulus * strain).clamp(-self.yield_strength, self.yield_strength)
    }
    pub fn yield_strain(&self) -> f64 {
        self.yield_strength / self.modulus
    }
}

impl ConcreteLaw {
    pub(crate) fn validate(&self) -> Result<()> {
        match *self {
            Self::RectangularBlock {
                intensity,
                depth_ratio,
                ultimate_strain,
            } => {
                positive("Block intensity", intensity)?;
                positive("Block depth ratio", depth_ratio)?;
                positive("Ultimate strain", ultimate_strain)?;
                if depth_ratio > 1.0 {
                    return Err(err("INVALID_SCHEMA", "Block depth ratio must not exceed 1"));
                }
            }
            Self::ParabolaRectangle {
                peak,
                strain_at_peak,
                ultimate_strain,
                exponent,
            } => {
                positive("Peak stress", peak)?;
                positive("Strain at peak", strain_at_peak)?;
                positive("Ultimate strain", ultimate_strain)?;
                positive("Parabola exponent", exponent)?;
                if strain_at_peak > ultimate_strain {
                    return Err(err(
                        "INVALID_SCHEMA",
                        "Strain at peak must not exceed ultimate strain",
                    ));
                }
            }
        }
        Ok(())
    }

    pub(crate) fn ultimate_strain(&self) -> f64 {
        match *self {
            Self::RectangularBlock {
                ultimate_strain, ..
            }
            | Self::ParabolaRectangle {
                ultimate_strain, ..
            } => ultimate_strain,
        }
    }

    /// Stress displaced by a compressed bar at depth `d` with strain `strain`.
    fn displaced_stress(&self, x: f64, d: f64, strain: f64) -> f64 {
        if strain <= 0.0 {
            return 0.0;
        }
        match *self {
            Self::RectangularBlock {
                intensity,
                depth_ratio,
                ..
            } => {
                if d < depth_ratio * x {
                    intensity
                } else {
                    0.0
                }
            }
            Self::ParabolaRectangle {
                peak,
                strain_at_peak,
                exponent,
                ..
            } => {
                if strain >= strain_at_peak {
                    peak
                } else {
                    peak * (1.0 - (1.0 - strain / strain_at_peak).powf(exponent))
                }
            }
        }
    }

    /// Concrete resultant and its moment about the compression face for
    /// neutral-axis depth `x` (closed forms in strain space).
    fn resultant(&self, b: f64, x: f64) -> (f64, f64) {
        match *self {
            Self::RectangularBlock {
                intensity,
                depth_ratio,
                ..
            } => {
                let a = depth_ratio * x;
                (intensity * b * a, intensity * b * a * a / 2.0)
            }
            Self::ParabolaRectangle {
                peak,
                strain_at_peak: e2,
                ultimate_strain: ecu,
                exponent: n,
            } => {
                // ∫σ dε and ∫εσ dε over [0, εcu].
                let i0 = peak * e2 * n / (n + 1.0) + peak * (ecu - e2);
                let i1 = peak * e2 * e2 * (0.5 - 1.0 / ((n + 1.0) * (n + 2.0)))
                    + peak * (ecu * ecu - e2 * e2) / 2.0;
                let scale = b * x / ecu;
                // y = x(1 − ε/εcu) ⇒ ∫σ y dy = scale · x · (i0 − i1/εcu).
                (scale * i0, scale * x * (i0 - i1 / ecu))
            }
        }
    }
}

struct Parts {
    concrete_force: f64,
    concrete_moment: f64,
    layers: Vec<LayerState>,
}

fn ultimate_parts(
    s: &RcRectangle,
    layers: &[BarLayer],
    steel: &SteelLaw,
    law: &ConcreteLaw,
    x: f64,
) -> Parts {
    let ecu = law.ultimate_strain();
    let (concrete_force, concrete_moment) = law.resultant(s.width, x);
    let layers = layers
        .iter()
        .map(|l| {
            let strain = ecu * (1.0 - l.depth / x);
            let steel_stress = steel.stress(strain);
            let force = l.area * (steel_stress - law.displaced_stress(x, l.depth, strain));
            LayerState {
                strain,
                steel_stress,
                force,
                yielded: strain.abs() >= steel.yield_strain(),
            }
        })
        .collect();
    Parts {
        concrete_force,
        concrete_moment,
        layers,
    }
}

fn net_force(p: &Parts) -> f64 {
    p.concrete_force + p.layers.iter().map(|l| l.force).sum::<f64>()
}

/// Bisection on a continuous function with f(lo) < 0 < f(hi) until the
/// bracket stops shrinking in f64.
fn bisect(mut lo: f64, mut hi: f64, f: impl Fn(f64) -> f64) -> f64 {
    loop {
        let mid = lo + (hi - lo) / 2.0;
        if mid <= lo || mid >= hi {
            return mid;
        }
        if f(mid) < 0.0 {
            lo = mid;
        } else {
            hi = mid;
        }
    }
}

/// Pure-flexure ultimate state by strain compatibility (N = 0).
pub fn ultimate(
    s: &RcRectangle,
    layers: &[BarLayer],
    steel: &SteelLaw,
    law: &ConcreteLaw,
) -> Result<UltimateState> {
    validate_section(s, layers)?;
    steel.validate()?;
    law.validate()?;
    let f = |x: f64| net_force(&ultimate_parts(s, layers, steel, law, x));
    let lo = s.depth * f64::EPSILON;
    if !(f(lo) < 0.0 && f(s.depth) > 0.0) {
        return Err(err(
            "UNSUPPORTED_FEATURE",
            "No flexural equilibrium with the neutral axis inside the section",
        ));
    }
    let x = bisect(lo, s.depth, f);
    let p = ultimate_parts(s, layers, steel, law, x);
    let moment = -p
        .layers
        .iter()
        .zip(layers)
        .map(|(state, l)| state.force * l.depth)
        .sum::<f64>()
        - p.concrete_moment;
    let scale = p
        .layers
        .iter()
        .map(|l| l.force.abs())
        .sum::<f64>()
        .max(p.concrete_force);
    let relative_residual = net_force(&p).abs() / scale;
    // Classified by the extreme (deepest) tension layer, the conventional
    // ductility measure; a shallow layer just below the neutral axis does not decide it.
    let ey = steel.yield_strain();
    let deepest_index = layers
        .iter()
        .enumerate()
        .max_by(|a, b| a.1.depth.total_cmp(&b.1.depth))
        .map(|(i, _)| i)
        .unwrap();
    let classification = if -p.layers[deepest_index].strain >= ey {
        TensionState::TensionYielded
    } else {
        TensionState::TensionElastic
    };
    let deepest = layers[deepest_index].depth;
    let out = UltimateState {
        neutral_axis_depth: x,
        moment,
        concrete_force: p.concrete_force,
        curvature: law.ultimate_strain() / x,
        classification,
        depth_ratio: x / deepest,
        layers: p.layers,
        relative_residual,
    };
    if !(out.moment.is_finite() && out.relative_residual.is_finite()) {
        return Err(err(
            "NONFINITE_RESULT",
            "Ultimate section state is not finite",
        ));
    }
    Ok(out)
}

/// Uncracked and cracked transformed-section properties and service stresses.
pub fn elastic(
    s: &RcRectangle,
    layers: &[BarLayer],
    steel: &SteelLaw,
    e: &ElasticInputs,
) -> Result<ElasticState> {
    validate_section(s, layers)?;
    positive("Steel modulus", steel.modulus)?;
    positive("Concrete modulus", e.concrete_modulus)?;
    if let Some(fct) = e.tensile_strength {
        positive("Concrete tensile strength", fct)?;
    }
    if let Some(m) = e.service_moment
        && !m.is_finite()
    {
        return Err(err("NONFINITE_INPUT", "Service moment must be finite"));
    }
    let (b, h) = (s.width, s.depth);
    let m = steel.modulus / e.concrete_modulus;
    let sum_a: f64 = layers.iter().map(|l| l.area).sum();
    let sum_ad: f64 = layers.iter().map(|l| l.area * l.depth).sum();
    let uncracked_area = b * h + (m - 1.0) * sum_a;
    let ybar = (b * h * h / 2.0 + (m - 1.0) * sum_ad) / uncracked_area;
    let uncracked_inertia = b * h.powi(3) / 12.0
        + b * h * (h / 2.0 - ybar).powi(2)
        + (m - 1.0)
            * layers
                .iter()
                .map(|l| l.area * (l.depth - ybar).powi(2))
                .sum::<f64>();
    let k = |x: f64, d: f64| if d < x { m - 1.0 } else { m };
    let first_moment = |x: f64| {
        b * x * x / 2.0
            + layers
                .iter()
                .map(|l| k(x, l.depth) * l.area * (x - l.depth))
                .sum::<f64>()
    };
    let x = bisect(0.0, h, first_moment);
    let cracked_inertia = b * x.powi(3) / 3.0
        + layers
            .iter()
            .map(|l| k(x, l.depth) * l.area * (x - l.depth).powi(2))
            .sum::<f64>();
    Ok(ElasticState {
        modular_ratio: m,
        uncracked_area,
        uncracked_centroid: ybar,
        uncracked_inertia,
        cracking_moment: e
            .tensile_strength
            .map(|fct| fct * uncracked_inertia / (h - ybar)),
        cracked_neutral_axis: x,
        cracked_inertia,
        service_concrete_stress: e.service_moment.map(|mm| mm * x / cracked_inertia),
        service_steel_stress: e.service_moment.map(|mm| {
            layers
                .iter()
                .map(|l| m * mm * (x - l.depth) / cracked_inertia)
                .collect()
        }),
    })
}

/// Single-row bar geometry across the width. No code spacing rule is applied.
pub fn row_fit(r: &BarRow) -> Result<RowFit> {
    positive("Row width", r.width)?;
    positive("Bar diameter", r.bar_diameter)?;
    positive("Link diameter", r.link_diameter)?;
    positive("Side cover", r.side_cover)?;
    positive("Minimum clear spacing", r.minimum_clear_spacing)?;
    if r.count == 0 {
        return Err(err("INVALID_SCHEMA", "Bar count must be at least 1"));
    }
    let n = f64::from(r.count);
    let clear_width = r.width - 2.0 * (r.side_cover + r.link_diameter) - n * r.bar_diameter;
    let clear_spacing = (r.count >= 2).then(|| clear_width / (n - 1.0));
    Ok(RowFit {
        area: n * std::f64::consts::PI * r.bar_diameter * r.bar_diameter / 4.0,
        clear_spacing,
        depth_from_face: r.side_cover + r.link_diameter + r.bar_diameter / 2.0,
        fits: clear_width >= 0.0 && clear_spacing.is_none_or(|sp| sp >= r.minimum_clear_spacing),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    const FIXTURE: &str = include_str!("../../../fixtures/design/rc-section-mechanics/cases.json");

    fn close(case: &str, what: &str, got: f64, want: f64, rel: f64) {
        let tol = rel * want.abs().max(f64::MIN_POSITIVE);
        assert!(
            (got - want).abs() <= tol,
            "{case} {what}: got {got:e}, want {want:e} (|Δ|={:e}, tol={tol:e})",
            (got - want).abs()
        );
    }

    fn parse<T: serde::de::DeserializeOwned>(v: &Value) -> T {
        serde_json::from_value(v.clone()).unwrap()
    }

    #[test]
    fn oracle_ultimate_and_elastic_cases() {
        let doc: Value = serde_json::from_str(FIXTURE).unwrap();
        let rel = doc["tolerance"]["relative"].as_f64().unwrap();
        let abs_strain = doc["tolerance"]["absoluteStrain"].as_f64().unwrap();
        let cases = doc["cases"].as_array().unwrap();
        assert!(cases.len() >= 6);
        for c in cases {
            let id = c["id"].as_str().unwrap();
            let s: RcRectangle = parse(&c["section"]);
            let layers: Vec<BarLayer> = parse(&c["layers"]);
            let steel: SteelLaw = parse(&c["steel"]);
            let law: ConcreteLaw = parse(&c["concrete"]);
            let u = ultimate(&s, &layers, &steel, &law).unwrap();
            let w = &c["expected"]["ultimate"];
            close(
                id,
                "x",
                u.neutral_axis_depth,
                w["neutralAxisDepth"].as_f64().unwrap(),
                rel,
            );
            close(id, "Mu", u.moment, w["moment"].as_f64().unwrap(), rel);
            close(
                id,
                "C",
                u.concrete_force,
                w["concreteForce"].as_f64().unwrap(),
                rel,
            );
            close(
                id,
                "curvature",
                u.curvature,
                w["curvature"].as_f64().unwrap(),
                rel,
            );
            close(
                id,
                "x/d",
                u.depth_ratio,
                w["depthRatio"].as_f64().unwrap(),
                rel,
            );
            assert_eq!(
                serde_json::to_value(u.classification).unwrap(),
                w["classification"],
                "{id} classification"
            );
            assert!(
                u.relative_residual < 1e-12,
                "{id} residual {}",
                u.relative_residual
            );
            for (i, (got, want)) in u
                .layers
                .iter()
                .zip(w["layers"].as_array().unwrap())
                .enumerate()
            {
                assert_eq!(
                    got.yielded,
                    want["yielded"].as_bool().unwrap(),
                    "{id} layer {i} yielded"
                );
                let ws = want["strain"].as_f64().unwrap();
                assert!(
                    (got.strain - ws).abs() <= abs_strain,
                    "{id} layer {i} strain"
                );
                assert!(
                    (got.steel_stress - want["steelStress"].as_f64().unwrap()).abs()
                        <= steel.modulus * abs_strain,
                    "{id} layer {i} steel stress"
                );
            }
            if let Some(we) = c["expected"].get("elastic") {
                let e: ElasticInputs = parse(&c["elastic"]);
                let r = elastic(&s, &layers, &steel, &e).unwrap();
                for (what, got) in [
                    ("modularRatio", Some(r.modular_ratio)),
                    ("uncrackedArea", Some(r.uncracked_area)),
                    ("uncrackedCentroid", Some(r.uncracked_centroid)),
                    ("uncrackedInertia", Some(r.uncracked_inertia)),
                    ("crackingMoment", r.cracking_moment),
                    ("crackedNeutralAxis", Some(r.cracked_neutral_axis)),
                    ("crackedInertia", Some(r.cracked_inertia)),
                    ("serviceConcreteStress", r.service_concrete_stress),
                ] {
                    // Optional outputs must be present exactly when the oracle produced them.
                    assert_eq!(
                        got.is_some(),
                        we.get(what).is_some(),
                        "{id} {what} presence"
                    );
                    if let Some(got) = got {
                        close(id, what, got, we[what].as_f64().unwrap(), rel);
                    }
                }
                let steel_stresses = r.service_steel_stress.unwrap_or_default();
                let want_stresses = we["serviceSteelStress"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default();
                assert_eq!(
                    steel_stresses.len(),
                    want_stresses.len(),
                    "{id} service steel stresses"
                );
                for (got, want) in steel_stresses.iter().zip(&want_stresses) {
                    close(id, "serviceSteelStress", *got, want.as_f64().unwrap(), rel);
                }
            }
        }
    }

    #[test]
    fn oracle_row_fits() {
        let doc: Value = serde_json::from_str(FIXTURE).unwrap();
        for r in doc["rows"].as_array().unwrap() {
            let id = r["id"].as_str().unwrap();
            let row: BarRow = serde_json::from_value(
                r.as_object()
                    .unwrap()
                    .iter()
                    .filter(|(k, _)| *k != "id" && *k != "expected")
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect(),
            )
            .unwrap();
            let got = row_fit(&row).unwrap();
            let w = &r["expected"];
            assert_eq!(got.fits, w["fits"].as_bool().unwrap(), "{id} fits");
            close(id, "area", got.area, w["area"].as_f64().unwrap(), 1e-15);
            close(
                id,
                "depth",
                got.depth_from_face,
                w["depthFromFace"].as_f64().unwrap(),
                1e-15,
            );
            match (got.clear_spacing, w["clearSpacing"].as_f64()) {
                (Some(g), Some(e)) => close(id, "spacing", g, e, 1e-12),
                (None, None) => {}
                other => panic!("{id} spacing mismatch {other:?}"),
            }
        }
    }

    #[test]
    fn balanced_boundary_brackets_classification() {
        // Closed-form balanced depth for the rectangular block, independent of the fixture.
        let s = RcRectangle {
            width: 0.3,
            depth: 0.6,
        };
        let steel = SteelLaw {
            yield_strength: 460e6,
            modulus: 200e9,
        };
        let law = ConcreteLaw::RectangularBlock {
            intensity: 20e6,
            depth_ratio: 0.75,
            ultimate_strain: 0.003,
        };
        let d = 0.55;
        let xb = 0.003 * d / (0.003 + steel.yield_strain());
        let ab = 20e6 * 0.3 * 0.75 * xb / 460e6;
        let run = |a: f64| ultimate(&s, &[BarLayer { depth: d, area: a }], &steel, &law).unwrap();
        assert_eq!(
            run(ab * 0.9999).classification,
            TensionState::TensionYielded
        );
        assert_eq!(
            run(ab * 1.0001).classification,
            TensionState::TensionElastic
        );
        close("balanced", "x", run(ab).neutral_axis_depth, xb, 1e-12);
    }

    #[test]
    fn rejects_invalid_inputs_without_coercion() {
        let s = RcRectangle {
            width: 0.3,
            depth: 0.6,
        };
        let steel = SteelLaw {
            yield_strength: 460e6,
            modulus: 200e9,
        };
        let law = ConcreteLaw::RectangularBlock {
            intensity: 20e6,
            depth_ratio: 0.75,
            ultimate_strain: 0.003,
        };
        let code = |r: Result<UltimateState>| r.unwrap_err().code;
        assert_eq!(
            code(ultimate(&s, &[], &steel, &law)),
            "DESIGN_INPUT_INCOMPLETE"
        );
        assert_eq!(
            code(ultimate(
                &s,
                &[BarLayer {
                    depth: 0.6,
                    area: 1e-3
                }],
                &steel,
                &law
            )),
            "INVALID_SCHEMA"
        );
        assert_eq!(
            code(ultimate(
                &s,
                &[BarLayer {
                    depth: f64::NAN,
                    area: 1e-3
                }],
                &steel,
                &law
            )),
            "NONFINITE_INPUT"
        );
        let bad_block = ConcreteLaw::RectangularBlock {
            intensity: 20e6,
            depth_ratio: 1.2,
            ultimate_strain: 0.003,
        };
        assert_eq!(
            code(ultimate(
                &s,
                &[BarLayer {
                    depth: 0.55,
                    area: 1e-3
                }],
                &steel,
                &bad_block
            )),
            "INVALID_SCHEMA"
        );
        let bad_parabola = ConcreteLaw::ParabolaRectangle {
            peak: 20e6,
            strain_at_peak: 0.004,
            ultimate_strain: 0.003,
            exponent: 2.0,
        };
        assert_eq!(
            code(ultimate(
                &s,
                &[BarLayer {
                    depth: 0.55,
                    area: 1e-3
                }],
                &steel,
                &bad_parabola
            )),
            "INVALID_SCHEMA"
        );
        let row = BarRow {
            width: 0.3,
            side_cover: 0.035,
            link_diameter: 0.01,
            bar_diameter: 0.02,
            count: 0,
            minimum_clear_spacing: 0.02,
        };
        assert_eq!(row_fit(&row).unwrap_err().code, "INVALID_SCHEMA");
    }

    #[test]
    fn unknown_concrete_law_is_rejected_on_decode() {
        let v = serde_json::json!({"kind":"bilinear","peak":1.0});
        assert!(serde_json::from_value::<ConcreteLaw>(v).is_err());
    }
}
