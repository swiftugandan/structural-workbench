//! Design rules: mechanics-v1 stress screen + pluggable code profiles.
//!
//! Code profiles are registered behind [`profile::CodeProfile`]. A profile is
//! advertised in capabilities and may return Pass/Fail only after its resource
//! lock and clause corpus verify. Until then evaluateDesign returns UNSUPPORTED.

mod profile;

pub use profile::{
    CheckOutcome, CheckStatus, CodeProfile, DesignDemand, DesignRun, MemberContext,
    ProfileApplicability, ProfileMetadata, ProfileRegistry, TensionEndProps, WSectionProps,
    PROFILE_AISC_360_22_LRFD,
};
pub use profile::aisc36022::{
    aisc_s2_resources_verified, verify_vault_pdfs_if_present, Aisc36022LrfdProfile,
};

use workbench_model::Section;

/// σₓ = N/A + My z / Iy − Mz y / Iz at fibre (y, z) in local section axes.
pub fn longitudinal_stress(
    n: f64,
    my: f64,
    mz: f64,
    s: &Section,
    y: f64,
    z: f64,
) -> f64 {
    n / s.a + my * z / s.iy - mz * y / s.iz
}

/// Four-corner extrema using ±cy, ±cz. Returns (maximum, minimum).
pub fn corner_stress_extrema(n: f64, my: f64, mz: f64, s: &Section) -> (f64, f64) {
    let corners = [
        (s.cy, s.cz),
        (s.cy, -s.cz),
        (-s.cy, s.cz),
        (-s.cy, -s.cz),
    ];
    let mut max = f64::NEG_INFINITY;
    let mut min = f64::INFINITY;
    for (y, z) in corners {
        let v = longitudinal_stress(n, my, mz, s, y, z);
        max = max.max(v);
        min = min.min(v);
    }
    (max, min)
}

/// Default registry used by WASM and native CLI.
pub fn default_registry() -> ProfileRegistry {
    let mut registry = ProfileRegistry::new();
    registry.register(Box::new(Aisc36022LrfdProfile::default()));
    registry
}

#[cfg(test)]
mod tests {
    use super::*;
    use workbench_model::Section;

    fn b12_section() -> Section {
        Section {
            id: "sec1".into(),
            name: "B12".into(),
            a: 0.01,
            iy: 1e-5,
            iz: 2e-5,
            j: 1e-5,
            cy: 0.1,
            cz: 0.2,
            provenance: "B12 fixture".into(),
        }
    }

    #[test]
    fn b12_corner_extrema_and_axis_probes() {
        let s = b12_section();
        let n = 100_000.0;
        let my = 2000.0;
        let mz = 3000.0;
        let (max, min) = corner_stress_extrema(n, my, mz, &s);
        assert!((max - 65e6).abs() < 1e-3, "max {max}");
        assert!((min - -45e6).abs() < 1e-3, "min {min}");
        let at_y0 = longitudinal_stress(n, my, mz, &s, 0.0, s.cz);
        assert!((at_y0 - 50e6).abs() < 1e-3, "y0 {at_y0}");
        let at_z0 = longitudinal_stress(n, my, mz, &s, s.cy, 0.0);
        assert!((at_z0 - -5e6).abs() < 1e-3, "z0 {at_z0}");
    }

    #[test]
    fn registry_enables_aisc_when_lock_and_fixtures_verify() {
        assert!(aisc_s2_resources_verified());
        let registry = default_registry();
        let meta = registry.metadata();
        assert_eq!(meta.len(), 1);
        assert_eq!(meta[0].id, PROFILE_AISC_360_22_LRFD);
        assert!(meta[0].enabled);
        assert_eq!(registry.enabled_profiles().len(), 1);

        let demand = DesignDemand {
            n: 0.0,
            vy: 0.0,
            vz: 0.0,
            my: 0.0,
            mz: 0.0,
            t: 0.0,
            combination_id: "ULS1".into(),
            station: 0.5,
        };
        let ctx = MemberContext {
            member_id: "m1".into(),
            section_family: "W".into(),
            doubly_symmetric: true,
            prismatic: true,
            fy: 345e6,
            fu: 450e6,
            length: 6.0,
            ky: 1.0,
            kz: 1.0,
            lb: 6.0,
            cb: 1.0,
            torsion_present: false,
            ..MemberContext::default()
        };
        let run = registry
            .evaluate(PROFILE_AISC_360_22_LRFD, &demand, &ctx)
            .expect("profile registered");
        // Enabled, but empty demand without section props → unsupported section gate.
        assert_eq!(run.overall, CheckStatus::Unsupported);
        assert!(
            run.checks
                .iter()
                .any(|c| c.check_id == "profile.section" || c.check_id == "profile.demand")
        );
    }

    #[test]
    fn unknown_profile_is_error() {
        let registry = default_registry();
        let demand = DesignDemand::default();
        let ctx = MemberContext::default();
        let err = registry
            .evaluate("does-not-exist", &demand, &ctx)
            .unwrap_err();
        assert!(err.contains("Unknown design profile"));
    }

    #[test]
    fn overall_fail_beats_unsupported() {
        let checks = vec![
            CheckOutcome::result(
                "tension",
                "D2",
                CheckStatus::Fail,
                1.0,
                0.5,
                "N",
                serde_json::json!({}),
                "fail",
            ),
            CheckOutcome::unsupported("flexure", "F2", "LTB deferred"),
        ];
        assert_eq!(DesignRun::overall_from_checks(&checks), CheckStatus::Fail);
    }
}
