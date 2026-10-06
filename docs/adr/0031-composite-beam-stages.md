# ADR 0031 — Composite beam through construction and service stages (M17)

## Status

Accepted for M17 (2026-10-06). It follows ADR 0026: the composite beam is part of the edition-labelled `aisc-360-22-lrfd` demonstration, enabled because its locked resources verify.

## Context

M17 asks for a supported steel–concrete composite member compared through its construction and service stages, with a design record. The specification requires:

- stage-dependent section and stiffness, connectors, effective widths and creep and shrinkage assumptions under one pinned code package;
- correct separation of pre-composite and composite actions;
- unsupported time-dependent assumptions that block a complete design result.

The held texts are ANSI/AISC 360-22 Chapter I with its Commentary (R-CODE-STEEL), and Design Examples v16 I.1 and I.2 (R-STEEL-EXAMPLES). R-COMPOSITE-CODE resolves to that chapter. EN 1994 is not held.

## Decision

1. **Family.** An unshored, simply supported W beam with steel headed stud anchors under one of:
   - a solid slab;
   - a slab on formed steel deck with ribs perpendicular to the beam;
   - a slab on formed steel deck with ribs parallel to the beam.

   Positive flexure only. A negative moment in the composite stage is unsupported (I3.2b is not implemented).
2. **Stages from the model.** The engineer assigns a case or combination to each stage:
   - construction (factored, applied before the concrete hardens);
   - composite (factored total);
   - wet concrete (service, on the steel alone);
   - live (service, on the composite section);
   - sustained after hardening (service).

   Each stage's moment and shear diagram comes from the exact member actions of its case (`member_actions_at`, 361 stations plus the point-load stations). Sagging is +M_z with the beam's local y toward the slab; another orientation is refused.
3. **Strength.**
   - **Construction (I3.1b):** the steel alone by Chapter F, i.e. F2 yielding and lateral-torsional buckling with the engineer's L_b and C_b, and F3 for noncompact flanges.
   - **Composite (I3.2a):** the plastic stress distribution, Commentary C-I3-6 to C-I3-10, with C = min(0.85 f'c A_c, F_y A_s, ΣQ_n). It is checked at the maximum-moment section and at every concentrated load (I8.2c). ΣQ_n is the studs strictly between that section and the nearer support (uniform distribution, I8.2d(a)).
   - **Effective width (I3.1a)** and A_c (I3.2c.2/3: concrete in the ribs only for parallel deck, at the rib's share of the pitch).
   - **Shear (I4.3):** G2.1(a) on the steel alone.
   - **Studs:**
     - I8-1, with R_g and R_p from the I8.2a table. R_p is 0.6 for perpendicular deck unless e_mid-ht ≥ 2 in. is entered.
     - E_c by the US form of I8.2a, converted exactly. The metric 0.043 form differs by about 5 %.
     - Detailing: I8.1, I8.2, I8.2d and the deck rules of I3.2c.1.
   - **Slip capacity (I3.2d.1):** the Commentary's prescriptive conditions (span ≤ 30 ft, ≥ 50 % composite, or ≥ 16 kip/ft), for uniform or equally spaced point loads. Otherwise the check is indeterminate; the analytical procedures are not implemented.
4. **Service.** Deflections integrate each stage's moment diagram against the unit-load moment, exactly for piecewise-linear moments, relative to the chord:
   - wet concrete on I_s, net of the camber (Design Example I.1 cambers to meet the recommended limit);
   - live on I_LB (Commentary C-I3-1, C-I3-2), with ΣQ_n at the governing section capped at C_f;
   - long-term: the sustained load on I_LB plus shrinkage by the Commentary's model (Figure C-I3.2). Here P_sh = ε_sh E_c A_c, the eccentricity runs from the slab centroid to the elastic neutral axis of the fully composite transformed section (concrete in tension neglected), and Δ = P_sh e L²/(8 E I_tr). The engineer enters ε_sh; the Commentary gives 0.02 % when the aggregate coefficient is not known.
   - The limits L/n are the engineer's. A missing limit or case leaves its check indeterminate.
5. **Creep.** The held texts give no method ("engineering judgement is required"). Not judged is indeterminate; judged "must be calculated" is unsupported. Only the engineer's recorded judgement passes it, so a time-dependent assumption can never pass silently.
6. **Schema 1.10.0.**
   - A `compositeBeam` draft binds to a member.
   - Its `composite` block holds the deck kind, lightweight flag, side kinds, studs-over-web, e_mid-ht, the five stage references (which must exist), the limits, ε_sh, the creep judgement and the regular-loading confirmation.
   - The numeric geometry is in `inputs`. Camber and the construction L_b may be zero.
7. **Outputs.** The checks, the section at the governing station (concrete layers, block depth, PNA), the stage diagrams, the stiffnesses (I_s, I_LB, I_tr, I_equiv for information), the deflections by stage, and a bill of materials (beam with camber, studs). All are Rust's; the browser draws them, and the report carries them.

## Consequences

- Continuous composite beams, shored construction, slender webs (I3.2a(b)), deck orientations other than perpendicular or parallel, and channel anchors are separate slices.
- Vibration (Design Guide 11, not held) is outside.
- Verification:
  - Design Examples I.1 (Manual tables) and I.2 (direct calculation), each value within its rounding chain;
  - I.2 again with the example's own rounded inputs (d/2 = 12.0 in., E_c = 3,490 ksi), reproducing its stiffnesses and M_n;
  - an independent oracle (`tools/oracles/composite_oracle.py`: fibre force balance PNA, bisected transformed ENA, two-area I_LB, closed-form deflections) to 1e-8;
  - the I.1 model `fixtures/models/CB01.json` through the protocol and the browser.
