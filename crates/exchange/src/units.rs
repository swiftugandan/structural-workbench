//! Physical quantities the exchange reads, their SI factors, and the choices
//! offered when a file leaves a unit undefined.
use serde::Serialize;

/// Dimensions as exponents of (length, force, mass).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Quantity {
    Length,
    Force,
    Mass,
    Area,
    MomentOfInertia,
    SectionModulus,
    ModulusOfElasticity,
    MassDensity,
    LinearForce,
    LinearMoment,
    Torque,
    LinearStiffness,
    RotationalStiffness,
}

impl Quantity {
    pub const ALL: [Quantity; 13] = [
        Quantity::Length,
        Quantity::Force,
        Quantity::Mass,
        Quantity::Area,
        Quantity::MomentOfInertia,
        Quantity::SectionModulus,
        Quantity::ModulusOfElasticity,
        Quantity::MassDensity,
        Quantity::LinearForce,
        Quantity::LinearMoment,
        Quantity::Torque,
        Quantity::LinearStiffness,
        Quantity::RotationalStiffness,
    ];
    /// The IFC unit type that governs this quantity.
    pub fn ifc_unit_type(self) -> &'static str {
        match self {
            Quantity::Length => "LENGTHUNIT",
            Quantity::Force => "FORCEUNIT",
            Quantity::Mass => "MASSUNIT",
            Quantity::Area => "AREAUNIT",
            Quantity::MomentOfInertia => "MOMENTOFINERTIAUNIT",
            Quantity::SectionModulus => "SECTIONMODULUSUNIT",
            Quantity::ModulusOfElasticity => "MODULUSOFELASTICITYUNIT",
            Quantity::MassDensity => "MASSDENSITYUNIT",
            Quantity::LinearForce => "LINEARFORCEUNIT",
            Quantity::LinearMoment => "LINEARMOMENTUNIT",
            Quantity::Torque => "TORQUEUNIT",
            Quantity::LinearStiffness => "LINEARSTIFFNESSUNIT",
            Quantity::RotationalStiffness => "ROTATIONALSTIFFNESSUNIT",
        }
    }
    pub fn from_ifc_unit_type(t: &str) -> Option<Quantity> {
        Quantity::ALL.into_iter().find(|q| q.ifc_unit_type() == t)
    }
    /// The quantity of an IFC measure type name, e.g. `IFCAREAMEASURE`.
    pub fn from_ifc_measure(t: &str) -> Option<Quantity> {
        Some(match t {
            "IFCLENGTHMEASURE" | "IFCPOSITIVELENGTHMEASURE" | "IFCNONNEGATIVELENGTHMEASURE" => {
                Quantity::Length
            }
            "IFCFORCEMEASURE" => Quantity::Force,
            "IFCMASSMEASURE" => Quantity::Mass,
            "IFCAREAMEASURE" => Quantity::Area,
            "IFCMOMENTOFINERTIAMEASURE" => Quantity::MomentOfInertia,
            "IFCSECTIONMODULUSMEASURE" => Quantity::SectionModulus,
            "IFCMODULUSOFELASTICITYMEASURE" => Quantity::ModulusOfElasticity,
            "IFCMASSDENSITYMEASURE" => Quantity::MassDensity,
            "IFCLINEARFORCEMEASURE" => Quantity::LinearForce,
            "IFCLINEARMOMENTMEASURE" => Quantity::LinearMoment,
            "IFCTORQUEMEASURE" => Quantity::Torque,
            "IFCLINEARSTIFFNESSMEASURE" => Quantity::LinearStiffness,
            "IFCROTATIONALSTIFFNESSMEASURE" => Quantity::RotationalStiffness,
            _ => return None,
        })
    }
    /// Exponents of (length, force, mass).
    pub fn dimensions(self) -> (i32, i32, i32) {
        match self {
            Quantity::Length => (1, 0, 0),
            Quantity::Force => (0, 1, 0),
            Quantity::Mass => (0, 0, 1),
            Quantity::Area => (2, 0, 0),
            Quantity::MomentOfInertia => (4, 0, 0),
            Quantity::SectionModulus => (3, 0, 0),
            Quantity::ModulusOfElasticity => (-2, 1, 0),
            Quantity::MassDensity => (-3, 0, 1),
            Quantity::LinearForce => (-1, 1, 0),
            Quantity::LinearMoment => (0, 1, 0),
            Quantity::Torque => (1, 1, 0),
            Quantity::LinearStiffness => (-1, 1, 0),
            // Per radian; plane angles are not converted.
            Quantity::RotationalStiffness => (1, 1, 0),
        }
    }
    pub fn is_base(self) -> bool {
        matches!(self, Quantity::Length | Quantity::Force | Quantity::Mass)
    }
    pub fn si_symbol(self) -> &'static str {
        match self {
            Quantity::Length => "m",
            Quantity::Force => "N",
            Quantity::Mass => "kg",
            Quantity::Area => "m²",
            Quantity::MomentOfInertia => "m⁴",
            Quantity::SectionModulus => "m³",
            Quantity::ModulusOfElasticity => "Pa",
            Quantity::MassDensity => "kg/m³",
            Quantity::LinearForce => "N/m",
            Quantity::LinearMoment => "N·m/m",
            Quantity::Torque => "N·m",
            Quantity::LinearStiffness => "N/m",
            Quantity::RotationalStiffness => "N·m/rad",
        }
    }
    pub fn key(self) -> String {
        serde_json::to_value(self)
            .unwrap()
            .as_str()
            .unwrap()
            .to_string()
    }
}

/// Common named units offered when a base unit is undefined: (key, label,
/// SI factor).
pub fn base_choices(q: Quantity) -> &'static [(&'static str, &'static str, f64)] {
    match q {
        Quantity::Length => &[
            ("m", "metre", 1.0),
            ("mm", "millimetre", 1e-3),
            ("cm", "centimetre", 1e-2),
            ("ft", "foot", 0.3048),
            ("in", "inch", 0.0254),
        ],
        Quantity::Force => &[
            ("N", "newton", 1.0),
            ("kN", "kilonewton", 1e3),
            ("lbf", "pound-force", 4.4482216152605),
            ("kip", "kip", 4448.2216152605),
        ],
        Quantity::Mass => &[
            ("kg", "kilogram", 1.0),
            ("t", "tonne", 1e3),
            ("lb", "pound", 0.45359237),
        ],
        _ => &[],
    }
}

/// SI prefixes of ISO 10303-41 / IfcSIPrefix.
pub fn si_prefix(p: &str) -> Option<f64> {
    Some(match p {
        "EXA" => 1e18,
        "PETA" => 1e15,
        "TERA" => 1e12,
        "GIGA" => 1e9,
        "MEGA" => 1e6,
        "KILO" => 1e3,
        "HECTO" => 1e2,
        "DECA" => 1e1,
        "DECI" => 1e-1,
        "CENTI" => 1e-2,
        "MILLI" => 1e-3,
        "MICRO" => 1e-6,
        "NANO" => 1e-9,
        "PICO" => 1e-12,
        "FEMTO" => 1e-15,
        "ATTO" => 1e-18,
        _ => return None,
    })
}

/// Unprefixed IfcSIUnitName factors to SI base (kg for mass: GRAM is 1e-3).
pub fn si_name(n: &str) -> Option<f64> {
    Some(match n {
        "METRE" | "SQUARE_METRE" | "CUBIC_METRE" | "NEWTON" | "PASCAL" | "SECOND" | "RADIAN"
        | "JOULE" | "WATT" | "HERTZ" | "KELVIN" | "DEGREE_CELSIUS" => 1.0,
        "GRAM" => 1e-3,
        _ => return None,
    })
}

/// A prefix applies to the unit, so a squared unit squares it (mm² = 1e-6 m²).
pub fn si_power(n: &str) -> i32 {
    match n {
        "SQUARE_METRE" => 2,
        "CUBIC_METRE" => 3,
        _ => 1,
    }
}
