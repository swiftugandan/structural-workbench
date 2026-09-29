# ADR 0019 — AISC flexure: lateral-torsional and flange local buckling (M07-LTB, S3)

## Status

Accepted with M07-LTB (2026-09-29). Dossier:
`docs/code-profiles/aisc-360-22-lrfd/dossier-S3.md`.

## Context

S2 checked major-axis flexure only for continuously braced compact W-shapes
(F2-1) and returned UNSUPPORTED for any unbraced length. Two defects followed:
real members with discrete bracing could not be checked, and the standalone
path credited any W with Mp regardless of flange compactness — a W14×99
(bf/2tf = 9.34 > λpf = 9.15) was given its full plastic moment unless a
separate model-native gate intervened. The locked Design Examples contain
Spec-direct ("B") examples for inelastic LTB (F.1-2B), elastic LTB (F.1-3B)
and noncompact-flange local buckling (F.3B).

## Decision

1. **One flexure check owns classification.** The profile's flexure check
   classifies the flange and web (Table B4.1b) and applies F2-1 or F3-1, then
   LTB when Lb > 0, taking the least nominal strength capped at Mp. The
   model-native duplicate gate that refused noncompact flexure is removed.
2. **LTB per F2.2 with c = 1**, Lp (F2-5), Lr (F2-6), inelastic F2-2 and
   elastic F2-3/F2-4. F3.1 applies the same LTB provisions to noncompact
   flanges.
3. **rts and ho are derived by the Spec's definitions**: ho = d − tf and
   rts² = √(Iy Cw)/Sx with Cw = Iy ho²/4, from catalogue Table 1-1 values. The
   derivation must reproduce the published W18×50 rts and ho; the catalogue
   gains no untraceable tabulated values.
4. **Cb is an explicit user input** (≥ 1.0). Deriving Cb from the model's
   moment diagram over each unbraced segment is a later slice.
5. **Fail-closed boundaries**: slender flanges (F3-2), noncompact or slender
   webs (F4, F5), missing classification data and, for Lb > 0, missing
   Iy, J, ry, d or tf are UNSUPPORTED.

## Consequences

- UI seeds that asserted "LTB unsupported" now run the published LTB
  examples; a slender-flange seed keeps three unsupported cases.
- Model-native members with Lb > 0 and bracing other than continuous receive
  a governed flexure result instead of UNSUPPORTED.
- Parent M07 S2 regressions still pass on the same build.
