//! ANSI/AISC 360-22 LRFD — M07 first pin.
//!
//! Clause implementations stay disabled until `R-CODE-STEEL` and
//! `R-STEEL-EXAMPLES` are acquired into `resources.lock.json`. This module only
//! registers metadata and fail-closed applicability so a second code can plug
//! in beside it without changing the orchestrator.

use super::{
    CheckOutcome, CodeProfile, DesignDemand, MemberContext, ProfileApplicability, ProfileMetadata,
    PROFILE_AISC_360_22_LRFD,
};

/// Stub profile. `enabled` remains false until resource verification.
#[derive(Debug, Default, Clone)]
pub struct Aisc36022LrfdProfile {
    /// Flip only after resources.lock hashes + dossier verification.
    pub resources_verified: bool,
}

impl CodeProfile for Aisc36022LrfdProfile {
    fn metadata(&self) -> ProfileMetadata {
        ProfileMetadata {
            id: PROFILE_AISC_360_22_LRFD.into(),
            standard: "ANSI/AISC 360".into(),
            edition: "2022".into(),
            design_method: "LRFD".into(),
            jurisdiction: None,
            enabled: self.resources_verified,
            resource_gate: "R-CODE-STEEL+R-STEEL-EXAMPLES".into(),
            supported_section_families: vec!["W".into()],
            supported_checks: vec![
                "classification".into(),
                "tension".into(),
                "compression".into(),
                "flexure".into(),
                "shear".into(),
                "interaction-H1".into(),
            ],
            limitations: vec![
                "M07 S2: prismatic doubly-symmetric W-shapes only".into(),
                "User-specified Ky/Kz, Lb, Cb required".into(),
                "Torsion, non-prismatic and non-W shapes return unsupported".into(),
                "No clause math until resources.lock verification".into(),
            ],
        }
    }

    fn applicability(&self, ctx: &MemberContext) -> ProfileApplicability {
        if ctx.torsion_present {
            return ProfileApplicability::Unsupported(
                "Torsion is outside the M07 AISC 360-22 LRFD S2 scope".into(),
            );
        }
        if !ctx.prismatic {
            return ProfileApplicability::Unsupported(
                "Non-prismatic members are outside the M07 AISC scope".into(),
            );
        }
        if !ctx.doubly_symmetric || ctx.section_family != "W" {
            return ProfileApplicability::Unsupported(format!(
                "Section family '{}' is outside the M07 S2 W-shape scope",
                ctx.section_family
            ));
        }
        ProfileApplicability::Applicable
    }

    fn run_checks(&self, _demand: &DesignDemand, _ctx: &MemberContext) -> Vec<CheckOutcome> {
        // Intentionally empty of clause math. Enabling without a lock would be a
        // contract violation; the registry short-circuits when !enabled.
        vec![CheckOutcome::unsupported(
            "profile.clauses",
            "pending",
            "AISC 360-22 LRFD clause implementations await resource lock and formulation dossiers",
        )]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_hss_and_torsion() {
        let profile = Aisc36022LrfdProfile {
            resources_verified: true,
        };
        let mut ctx = MemberContext {
            section_family: "HSS".into(),
            ..MemberContext::default()
        };
        assert!(matches!(
            profile.applicability(&ctx),
            ProfileApplicability::Unsupported(_)
        ));
        ctx.section_family = "W".into();
        ctx.torsion_present = true;
        assert!(matches!(
            profile.applicability(&ctx),
            ProfileApplicability::Unsupported(_)
        ));
    }
}
