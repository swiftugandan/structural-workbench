# S3 dossier — aisc-360-22-lrfd flexure breadth (M07-LTB)

Expands major-axis flexure of prismatic doubly symmetric W-shapes with compact
webs beyond the S2 continuous-brace yielding path. Numbers are reconstituted
from Manual Companion Vol. 1 Design Examples v16.0 (`R-STEEL-EXAMPLES`) against
Spec 360-22 (`R-CODE-STEEL`). This file cites example IDs, clause IDs and
published numeric results only — no copyrighted prose.

Machine fixtures: `fixtures/design/aisc-360-22-lrfd/S3-*.json`; regressions in
`crates/design/src/profile/aisc36022/fixture_tests.rs` (`s3_*`).

## Seed map

| Fixture id | Example | Spec clauses exercised | Published controlling LRFD check |
| --- | --- | --- | --- |
| `S3-F12B` | F.1-2B | F1-1 (Cb given), F2-5, F2-6, F2-2 | W18×50, Lb = 11.7 ft, Cb = 1.01: Lp = 69.9 in., Lr = 203 in., Mn = 4,060 kip-in., φbMn = 304 kip-ft ≥ Mu = 266 kip-ft |
| `S3-F13B` | F.1-3B | F1-1 (Cb given), F2-3, F2-4 | W18×50, Lb = 17.5 ft, Cb = 1.30: Fcr = 43.2 ksi, Mn = 3,840 kip-in., φbMn = 288 kip-ft ≥ 266 kip-ft |
| `S3-F3B` | F.3B | B4.1b Case 10, F2-1, F3-1 | W21×48, bf/2tf = 9.47: λpf = 9.15, λrf = 24.1, Mn = 5,310 kip-in., φbMn = 398 kip-ft ≥ 396 kip-ft |

## Implemented rules

- Flexure is the least of yielding (F2-1) or, for noncompact flanges,
  compression flange local buckling (F3-1), and — when Lb > 0 — lateral-torsional
  buckling (F2-2 inelastic, F2-3/F2-4 elastic), capped at Mp. F3.1 applies the
  same LTB provisions to noncompact-flange shapes.
- c = 1 (doubly symmetric I). ho = d − tf, and rts² = √(Iy Cw)/Sx with
  Cw = Iy ho²/4 (Spec F2-7 and its user note for doubly symmetric I-shapes with
  rectangular flanges), so rts² = Iy ho/(2 Sx). Derived from the catalogue's
  Table 1-1 d, tf, Iy and Sx, this reproduces the published W18×50 values
  rts = 1.98 in. and ho = 17.4 in.
- Cb is a user input (≥ 1), or derived from the member's own strong-axis
  moment diagram by F1-1 when the member is the unbraced segment (Lb equal to
  its length); a member with an unbraced free end (cantilever, overhang) takes
  Cb = 1.0 per Section F1. Modelling Example F.1-2B's third-point bracing as
  three members reproduces the published Cb = 1.01 (centre) and 1.46 (ends).

## Unsupported (fail-closed)

Slender flanges (F3-2), noncompact or slender webs (F4, F5), missing
classification (bf/2tf, h/tw) and, for Lb > 0, missing Iy, J, ry, d or tf are
UNSUPPORTED, never a pass. HSS, channels, tees, weak-axis flexure (F6),
torsion and non-prismatic members stay outside the profile.

## Independent recomputation

Tolerance as the S2 manifest: 0.5 % relative or 1 kip-ft (12 kip-in.)
absolute, matching the Examples' three-significant-figure presentation.
