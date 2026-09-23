//! ANSI/AISC 360-22 LRFD — M07 first pin (S2 clause families).

mod classification;
mod compression;
mod flexure;
mod interaction;
mod shear;
mod tension;
pub mod units;

#[cfg(test)]
mod fixture_tests;

use super::{
    CheckOutcome, CodeProfile, DesignDemand, MemberContext, ProfileApplicability, ProfileMetadata,
    PROFILE_AISC_360_22_LRFD,
};

/// Profile. `enabled` remains false until resource verification.
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
                "Continuous-brace flexure path only when Lb ≈ 0; LTB deferred".into(),
                "H1 uses φcPn/φbMn from prior checks or explicit context fields".into(),
                "Profile remains disabled until resources.lock verification is wired".into(),
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

    fn run_checks(&self, demand: &DesignDemand, ctx: &MemberContext) -> Vec<CheckOutcome> {
        let Some(section) = ctx.section.as_ref() else {
            return vec![CheckOutcome::unsupported(
                "profile.section",
                "S2",
                "W-section geometric properties are required for AISC S2 clause math",
            )];
        };

        let mut checks = Vec::new();
        let pu_tension = demand.n.max(0.0);
        let pu_comp = (-demand.n).max(0.0);
        let mu = demand.mz.abs();
        let vu = demand.vz.abs().max(demand.vy.abs());

        if pu_comp > 0.0 || mu > 0.0 {
            checks.push(classification::check_classification(section, ctx.fy));
        }

        if let Some(end) = ctx.tension_end.as_ref() {
            if pu_tension > 0.0 {
                checks.push(tension::check_tension(
                    section, ctx.fy, ctx.fu, end, pu_tension,
                ));
            }
        }

        if pu_comp > 0.0 {
            checks.push(compression::check_compression(
                section,
                ctx.fy,
                ctx.length,
                ctx.kz,
                ctx.ky,
                pu_comp,
            ));
        }

        if mu > 0.0 {
            checks.push(flexure::check_flexure_major_continuous(
                section, ctx.fy, ctx.lb, mu,
            ));
        }

        if vu > 0.0 {
            checks.push(shear::check_shear_major(section, ctx.fy, vu));
        }

        let pc = ctx.phi_c_pn.or_else(|| {
            checks
                .iter()
                .find(|c| c.check_id == "compression")
                .and_then(|c| c.resistance)
        });
        let mcx = ctx.phi_b_mnx.or_else(|| {
            checks
                .iter()
                .find(|c| c.check_id == "flexure")
                .and_then(|c| c.resistance)
        });
        let mcy = ctx.phi_b_mny;

        if pu_comp > 0.0 && (demand.mz.abs() > 0.0 || demand.my.abs() > 0.0) {
            if let (Some(pc), Some(mcx), Some(mcy)) = (pc, mcx, mcy) {
                checks.push(interaction::check_h1(
                    pu_comp,
                    pc,
                    demand.mz.abs(),
                    mcx,
                    demand.my.abs(),
                    mcy,
                ));
            } else {
                checks.push(CheckOutcome::unsupported(
                    "interaction-H1",
                    "H1",
                    "H1 needs φcPn and both φbMnx/φbMny (set context fields when LTB governs)",
                ));
            }
        }

        if checks.is_empty() {
            checks.push(CheckOutcome::unsupported(
                "profile.demand",
                "S2",
                "No S2 demand components were provided for clause evaluation",
            ));
        }
        checks
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
