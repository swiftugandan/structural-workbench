# M07 acceptance record

Source hash: `c579beb905921b53da630674808a9c15b04ceb0929c128719956bbbb1e81e74f`
Build hash: `8dae72c2aaccceb83aaada4fc9198fc202bbdac9040132db7fd19887154df503`
Observed: 2026-09-23T16:02:18.698Z
Status: **PASS**

| ID | Title | Status | Observation |
| --- | --- | --- | --- |
| M07-S2-FIXTURES | AISC S2 fixture regressions (D/E/F/G/H) | PASS | Published Design Examples digits match clause modules for tension, compression, continuously braced flexure, shear and H1. |
| M07-UI-MATRIX | Screen 04 standalone pass/fail complete-member matrix | PASS | UI seed selector runs ≥3 pass and ≥3 fail complete-member cases through evaluateDesign with overall status. |
| M07-MODEL-REPORT | Model-derived demand and calculation-report clause trail | PASS | Analysis midspan actions overlay a W seed; exported report includes clause trail and intermediates (not envelope maxima). |

Limitations: M07 packages AISC 360-22 LRFD S2 only. LTB (Lb>0), HSS/torsion/non-prismatic remain unsupported. Commercial PROKON parity remains UNKNOWN.
