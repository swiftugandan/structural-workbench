# ADR 0028 — Pad footing ground contact and EC2 design

## Status

Accepted for M11 (2026-10-01). Follows ADR 0026: the footing design is part of the edition-labelled `ec2-uk-na` demonstration.

## Context

Until now the pad footing draft only recorded the exact support reaction, and its contact state was "indeterminate". M11 asks for:
- an explicitly defined soil-pressure model;
- the eccentricity and contact domain;
- bearing inputs, flexure, shear and punching under the pinned code;
- reinforcement details.

Soil capacity stays an input unless a separately validated geotechnical calculation provides it. EN 1997 is not held, so the workbench computes no ground resistance.

## Decision

1. **Contact kernel** (`workbench-design::footing`, `docs/formulations/footing.md`).
   - A rigid rectangular base on linear tensionless ground: the closed form for full contact, and Newton's method on the plane with exact polygon integrals for partial contact.
   - No downward force, or a resultant off the base, is refused, never reported as a pressure.
   - The horizontal forces add h·H to the base moments.
2. **EC2 footing design** (`ec2uk/footing.rs`, `dossier-footing.md`).
   - The ULS column actions bend the base. The engineer names the bearing case or combination; it adds the base self-weight and overburden and is compared with the allowable bearing input.
   - The bottom bars are sized in each direction for the larger of face bending, the 9.8.2.2 tie force and A_s,min, within the 9.3.1.1(3) spacing, anchoring straight at h/2, with the least steel.
   - The checks are one-way shear at d, punching at control perimeters up to 2d (ground force removed) with the eccentricity factor, the face check, and cover including the 4.4.1.3(4) casting minimum.
3. **Schema.** `codeInputs` for padFooting gains `castOnBlinding` and `bearingCombinationId`, part of the still-unreleased 1.8.0 (ADR 0027).
4. **Run results.**
   - In model mode the footing's `checks` become five rows: Contact and bearing; Bending and tie force; Anchorage; Shear and punching; Cover and bar size.
   - `contactState` is full, partial or noEquilibrium.
   - The schedule lists the designed straight bars along X and Y.
   - The report carries a footing section with the demonstration banner.
5. **Mechanics labels.** The contact pressures are mechanics from explicit inputs; the bearing value remains the engineer's.

## Consequences

- A footing under a support with no downward force, or with an eccentricity beyond the base, fails with that reason. The B04 cantilever's lateral reaction is such a case.
- The JRC footing example reconciles from the report's own effective pressure. Its self-weight deduction and its rounded anchorage comparison are documented, not reproduced.
