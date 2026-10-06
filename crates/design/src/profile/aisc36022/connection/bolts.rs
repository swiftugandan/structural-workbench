//! Bolt data from ANSI/AISC 360-22 Section J3: Table J3.2 nominal shear
//! stress, Table J3.3/J3.3M standard hole diameters, Table J3.4/J3.4M minimum
//! edge distances and the B4.3b net-area allowance. US customary sizes are
//! stored in inches and metric sizes in millimetres, exactly as tabulated.

use super::super::units::{IN_TO_M, KSI_TO_PA};

const MM: f64 = 1e-3;
const MPA: f64 = 1e6;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum BoltGroup {
    /// Group 120, e.g. ASTM F3125 Grade A325.
    #[serde(rename = "group120")]
    Group120,
    /// Group 150, e.g. ASTM F3125 Grade A490.
    #[serde(rename = "group150")]
    Group150,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Bolt {
    /// Designation as entered: "3/4", "7/8", "1-1/8", "M20", …
    pub designation: String,
    /// Nominal diameter (m).
    pub diameter: f64,
    pub metric: bool,
    pub group: BoltGroup,
    /// Threads excluded from the shear plane (X) or not (N).
    pub threads_excluded: bool,
}

/// US customary sizes of Tables J3.3 and J3.4: (d, standard hole, minimum
/// edge distance), inches.
const US: [(&str, f64, f64, f64); 7] = [
    ("1/2", 0.5, 9.0 / 16.0, 0.75),
    ("5/8", 0.625, 11.0 / 16.0, 0.875),
    ("3/4", 0.75, 13.0 / 16.0, 1.0),
    ("7/8", 0.875, 15.0 / 16.0, 1.125),
    ("1", 1.0, 1.125, 1.25),
    ("1-1/8", 1.125, 1.25, 1.5),
    ("1-1/4", 1.25, 1.375, 1.625),
];
/// Metric sizes of Tables J3.3M and J3.4M: (d, standard hole, minimum edge
/// distance), mm.
const METRIC: [(&str, f64, f64, f64); 8] = [
    ("M12", 12.0, 14.0, 18.0),
    ("M16", 16.0, 18.0, 22.0),
    ("M20", 20.0, 22.0, 26.0),
    ("M22", 22.0, 24.0, 28.0),
    ("M24", 24.0, 27.0, 30.0),
    ("M27", 27.0, 30.0, 34.0),
    ("M30", 30.0, 33.0, 38.0),
    ("M36", 36.0, 39.0, 46.0),
];

impl Bolt {
    /// A tabulated size, or None.
    pub fn new(designation: &str, group: BoltGroup, threads_excluded: bool) -> Option<Self> {
        let (diameter, metric) = if let Some(r) = US.iter().find(|r| r.0 == designation) {
            (r.1 * IN_TO_M, false)
        } else if let Some(r) = METRIC.iter().find(|r| r.0 == designation) {
            (r.1 * MM, true)
        } else {
            return None;
        };
        Some(Self {
            designation: designation.into(),
            diameter,
            metric,
            group,
            threads_excluded,
        })
    }

    /// The tabulated designations.
    pub fn designations() -> Vec<&'static str> {
        US.iter()
            .map(|r| r.0)
            .chain(METRIC.iter().map(|r| r.0))
            .collect()
    }

    /// Standard hole diameter, Table J3.3 / J3.3M (m).
    pub fn hole(&self) -> f64 {
        if self.metric {
            METRIC.iter().find(|r| r.0 == self.designation).unwrap().2 * MM
        } else {
            US.iter().find(|r| r.0 == self.designation).unwrap().2 * IN_TO_M
        }
    }

    /// Minimum edge distance from the centre of a standard hole, Table J3.4 /
    /// J3.4M (m).
    pub fn min_edge(&self) -> f64 {
        if self.metric {
            METRIC.iter().find(|r| r.0 == self.designation).unwrap().3 * MM
        } else {
            US.iter().find(|r| r.0 == self.designation).unwrap().3 * IN_TO_M
        }
    }

    /// B4.3b: the hole width for net area is the nominal hole plus 1/16 in.
    /// (2 mm).
    pub fn net_hole(&self) -> f64 {
        self.hole()
            + if self.metric {
                2.0 * MM
            } else {
                IN_TO_M / 16.0
            }
    }

    /// Nominal shear stress in bearing-type connections, Table J3.2 (Pa).
    pub fn fnv(&self) -> f64 {
        let (n_ksi, x_ksi, n_mpa, x_mpa) = match self.group {
            BoltGroup::Group120 => (54.0, 68.0, 370.0, 470.0),
            BoltGroup::Group150 => (68.0, 84.0, 470.0, 580.0),
        };
        match (self.metric, self.threads_excluded) {
            (false, false) => n_ksi * KSI_TO_PA,
            (false, true) => x_ksi * KSI_TO_PA,
            (true, false) => n_mpa * MPA,
            (true, true) => x_mpa * MPA,
        }
    }

    /// Nominal unthreaded body area A_b (m²).
    pub fn area(&self) -> f64 {
        std::f64::consts::PI * self.diameter * self.diameter / 4.0
    }

    /// Group label for reports and the bill of materials.
    pub fn group_label(&self) -> &'static str {
        match self.group {
            BoltGroup::Group120 => "Group 120",
            BoltGroup::Group150 => "Group 150",
        }
    }
}
