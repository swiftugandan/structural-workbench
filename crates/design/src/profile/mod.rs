//! Pluggable design-code profiles.
//!
//! Shared types and the [`CodeProfile`] trait stay code-agnostic. Concrete
//! packages (AISC, Eurocode, …) live in submodules and register themselves.

pub mod aisc36022;

use serde_json::{json, Value};

/// Stable profile id for ANSI/AISC 360-22 LRFD (M07 first pin).
pub const PROFILE_AISC_360_22_LRFD: &str = "aisc-360-22-lrfd";

/// Outcome of one mandatory or optional check.
#[derive(Debug, Clone, PartialEq)]
pub enum CheckStatus {
    Pass,
    Fail,
    Unsupported,
    Indeterminate,
}

impl CheckStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pass => "pass",
            Self::Fail => "fail",
            Self::Unsupported => "unsupported",
            Self::Indeterminate => "indeterminate",
        }
    }
}

/// Simultaneous member actions from one real combination/station.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct DesignDemand {
    pub n: f64,
    pub vy: f64,
    pub vz: f64,
    pub my: f64,
    pub mz: f64,
    pub t: f64,
    pub combination_id: String,
    pub station: f64,
}

/// Geometry/material/restraint inputs required by member checks.
#[derive(Debug, Clone, PartialEq)]
pub struct MemberContext {
    pub member_id: String,
    pub section_family: String,
    pub doubly_symmetric: bool,
    pub prismatic: bool,
    pub fy: f64,
    pub fu: f64,
    pub length: f64,
    pub ky: f64,
    pub kz: f64,
    pub lb: f64,
    pub cb: f64,
    pub torsion_present: bool,
}

impl Default for MemberContext {
    fn default() -> Self {
        Self {
            member_id: String::new(),
            section_family: "W".into(),
            doubly_symmetric: true,
            prismatic: true,
            fy: 0.0,
            fu: 0.0,
            length: 0.0,
            ky: 1.0,
            kz: 1.0,
            lb: 0.0,
            cb: 1.0,
            torsion_present: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct CheckOutcome {
    pub check_id: String,
    pub status: CheckStatus,
    pub clause: String,
    pub demand: Option<f64>,
    pub resistance: Option<f64>,
    pub utilisation: Option<f64>,
    pub units: String,
    pub assumptions: Vec<String>,
    pub intermediates: Value,
    pub message: String,
}

impl CheckOutcome {
    pub fn unsupported(check_id: &str, clause: &str, message: impl Into<String>) -> Self {
        Self {
            check_id: check_id.into(),
            status: CheckStatus::Unsupported,
            clause: clause.into(),
            demand: None,
            resistance: None,
            utilisation: None,
            units: String::new(),
            assumptions: Vec::new(),
            intermediates: json!({}),
            message: message.into(),
        }
    }

    pub fn to_json(&self) -> Value {
        json!({
            "checkId": self.check_id,
            "status": self.status.as_str(),
            "clause": self.clause,
            "demand": self.demand,
            "resistance": self.resistance,
            "utilisation": self.utilisation,
            "units": self.units,
            "assumptions": self.assumptions,
            "intermediates": self.intermediates,
            "message": self.message,
        })
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct DesignRun {
    pub profile_id: String,
    pub member_id: String,
    pub combination_id: String,
    pub station: f64,
    pub overall: CheckStatus,
    pub checks: Vec<CheckOutcome>,
    pub limitations: Vec<String>,
}

impl DesignRun {
    pub fn overall_from_checks(checks: &[CheckOutcome]) -> CheckStatus {
        if checks.iter().any(|c| c.status == CheckStatus::Unsupported) {
            return CheckStatus::Unsupported;
        }
        if checks.iter().any(|c| c.status == CheckStatus::Indeterminate) {
            return CheckStatus::Indeterminate;
        }
        if checks.iter().any(|c| c.status == CheckStatus::Fail) {
            return CheckStatus::Fail;
        }
        CheckStatus::Pass
    }

    pub fn to_json(&self) -> Value {
        json!({
            "profileId": self.profile_id,
            "memberId": self.member_id,
            "combinationId": self.combination_id,
            "station": self.station,
            "overall": self.overall.as_str(),
            "checks": self.checks.iter().map(CheckOutcome::to_json).collect::<Vec<_>>(),
            "limitations": self.limitations,
        })
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum ProfileApplicability {
    Applicable,
    Unsupported(String),
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProfileMetadata {
    pub id: String,
    pub standard: String,
    pub edition: String,
    pub design_method: String,
    pub jurisdiction: Option<String>,
    pub enabled: bool,
    pub resource_gate: String,
    pub supported_section_families: Vec<String>,
    pub supported_checks: Vec<String>,
    pub limitations: Vec<String>,
}

impl ProfileMetadata {
    pub fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "standard": self.standard,
            "edition": self.edition,
            "designMethod": self.design_method,
            "jurisdiction": self.jurisdiction,
            "enabled": self.enabled,
            "resourceGate": self.resource_gate,
            "supportedSectionFamilies": self.supported_section_families,
            "supportedChecks": self.supported_checks,
            "limitations": self.limitations,
        })
    }
}

/// Swappable design-code package.
pub trait CodeProfile: Send + Sync {
    fn metadata(&self) -> ProfileMetadata;
    fn applicability(&self, ctx: &MemberContext) -> ProfileApplicability;
    fn run_checks(&self, demand: &DesignDemand, ctx: &MemberContext) -> Vec<CheckOutcome>;
}

#[derive(Default)]
pub struct ProfileRegistry {
    profiles: Vec<Box<dyn CodeProfile>>,
}

impl ProfileRegistry {
    pub fn new() -> Self {
        Self {
            profiles: Vec::new(),
        }
    }

    pub fn register(&mut self, profile: Box<dyn CodeProfile>) {
        self.profiles.push(profile);
    }

    pub fn metadata(&self) -> Vec<ProfileMetadata> {
        self.profiles.iter().map(|p| p.metadata()).collect()
    }

    pub fn enabled_profiles(&self) -> Vec<ProfileMetadata> {
        self.metadata().into_iter().filter(|m| m.enabled).collect()
    }

    pub fn get(&self, profile_id: &str) -> Option<&dyn CodeProfile> {
        self.profiles
            .iter()
            .find(|p| p.metadata().id == profile_id)
            .map(|p| p.as_ref())
    }

    pub fn evaluate(
        &self,
        profile_id: &str,
        demand: &DesignDemand,
        ctx: &MemberContext,
    ) -> Result<DesignRun, String> {
        let profile = self
            .get(profile_id)
            .ok_or_else(|| format!("Unknown design profile '{profile_id}'"))?;
        let meta = profile.metadata();
        let mut checks = Vec::new();
        let mut limitations = meta.limitations.clone();

        if !meta.enabled {
            checks.push(CheckOutcome::unsupported(
                "profile.resources",
                "resource-gate",
                format!(
                    "Profile '{profile_id}' is registered but not enabled until {} verifies",
                    meta.resource_gate
                ),
            ));
        } else {
            match profile.applicability(ctx) {
                ProfileApplicability::Unsupported(reason) => {
                    checks.push(CheckOutcome::unsupported(
                        "profile.applicability",
                        "scope",
                        reason,
                    ));
                }
                ProfileApplicability::Applicable => {
                    checks.extend(profile.run_checks(demand, ctx));
                }
            }
        }

        Ok(DesignRun {
            profile_id: meta.id,
            member_id: ctx.member_id.clone(),
            combination_id: demand.combination_id.clone(),
            station: demand.station,
            overall: DesignRun::overall_from_checks(&checks),
            checks,
            limitations,
        })
    }
}
