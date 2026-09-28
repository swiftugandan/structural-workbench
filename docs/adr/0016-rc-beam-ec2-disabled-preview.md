# ADR 0016 — EC2 checks in the RC beam preview from the disabled profile (schema 1.3.0)

## Status

Accepted for M08-B3 (2026-09-28).

## Context

ADR 0015 added the `ec2-uk-na` beam profile, registered disabled. Reviewing its checks against a real model needs two engineering inputs the rcBeam draft did not record:

- the number of link legs, which the transverse spacing rule (9.2.2(8)) and the shear area (Asw) depend on;
- whether the tension steel is anchored at least l_bd + d beyond the checked section, which decides whether Asl counts in V_Rd,c (Fig. 6.3).

The profile's gate (`registry.evaluate`) returns only "resources not verified", so the checks cannot be seen through it.

## Decision

1. **Schema 1.3.0.** rcBeam inputs gain `linkLegs`, an integer from 2 to 8 with per-field provenance. Drafts gain an optional `tensionAnchorageConfirmed` boolean, for rcBeam only. The 1.2.0 contract is archived as `contracts/project-v1.2.schema.json`.
2. **Migration 1.2.0 → 1.3.0.** `linkLegs` is set to 2 with `syntheticFixture` provenance, because earlier drafts drew one closed link per set. The anchorage confirmation is never added. A 1.2.0 draft that already carries either 1.3.0 field is refused, not guessed. The chain 1.1.0 → 1.2.0 → 1.3.0 runs in order.
3. **Anchorage is explicit.** Only an explicit `true` in `SetDesignPreview` records it. Any save without it clears it, so no path can invent a confirmation. Unconfirmed, the profile sets ρl = 0 (ADR 0015).
4. **Disabled-profile preview.** In model mode, `evaluateDesignPreview` adds `codeProfilePreview`. It calls the profile's `applicability` and `run_checks` directly, bypassing the enablement gate for review only.
   - The context comes from the draft. Bar rows reuse `rc_section::row_fit`, so bar positions match the mechanics. `concreteStrength` is read as fck, and `rebarStrength` as fyk for both bars and links; the output states this interpretation.
   - Checks run at the governing sagging and hogging stations (ADR 0014) and at the key station with the largest |Vz|, with each station's full simultaneous action vector from the one bound combination.
   - Stations that coincide are checked once and list all their roles.
   - Synthetic sources, rows that do not fit, and out-of-scope sections report `unavailable` or `unsupported`.
5. **Never a design result.** The preview is labelled `basis: disabledProfilePreview` with `profileEnabled: false`. It never changes the preview's check matrix or `overall`, and the UI shows it under a "DISABLED PROFILE PREVIEW" banner. The profile's companion checks keep every station's own overall unsupported.

## Consequences

- Files written by this build cannot be opened by builds that only know 1.2.0. Tests that pinned the current schema string now expect 1.3.0.
- Wiring expectations come from the independent oracles: RC-PREVIEW-EC2-UK-DEFAULT (rc_section oracle, EC2 block parameters) and `previewDefaultDraftUk` (EC2 beam oracle). They cover the default draft on B08 and a propped cantilever whose unequal end shears prove the governing-shear choice.
- The propped-cantilever case exposed a solver defect. A model with exactly one active DOF panicked inside `sprs-ldl`'s ordering (`assert n > 1`). The solver now factorises the scaled 1×1 system directly and keeps its pivot, residual and finiteness checks.
