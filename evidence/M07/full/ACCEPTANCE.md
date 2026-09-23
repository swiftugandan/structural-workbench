# M07 acceptance record

Source hash: `59b2d58d67008f7c0c4c4c6b510e81bcb84cf816cf4e0bd985fff9b5c8dd374b`
Build hash: `c5e5ac5eb3b4dd45fdb269d81484ba964f0d2a4fc73cb9e17121aa113be3208b`
Observed: 2026-09-23T16:22:54.292Z
Status: **PASS**

| ID | Title | Status | Observation |
| --- | --- | --- | --- |
| M07-S2-FIXTURES | AISC S2 fixture regressions (D/E/F/G/H) | PASS | Published Design Examples digits match clause modules for tension, compression, continuously braced flexure and shear. H1 is formula-checked against published φ capacities only (not section-derived LTB). |
| M07-UI-MATRIX | Screen 04 standalone pass/fail complete-member matrix | PASS | UI seed selector runs ≥3 pass and ≥3 fail complete-member cases through evaluateDesign with overall status. |
| M07-MODEL-REPORT | Model-derived demand and calculation-report clause trail | PASS | Analysis midspan actions overlay a W seed; exported report includes clause trail and intermediates (not envelope maxima). |

Limitations: M07 packages AISC 360-22 LRFD S2 only. LTB (Lb>0), HSS/torsion/non-prismatic remain unsupported. Commercial PROKON parity remains UNKNOWN.
