# M07 acceptance record

Source hash: `657deef23600df5428fe185e311e5d913aec83f0ba0d3e4eddf41f9d9f28bac8`
Build hash: `57d135fbe116c35c1b96f40ff1dd503b1e71dfce2da178df522617fba46c97c6`
Observed: 2026-09-29T10:50:32.296Z
Status: **PASS**

| ID | Title | Status | Observation |
| --- | --- | --- | --- |
| M07-S2-FIXTURES | AISC S2 fixture regressions (D/E/F/G/H) | PASS | Published Design Examples digits match clause modules for tension, compression, continuously braced flexure and shear. H1 is formula-checked against published φ capacities only (not section-derived LTB). |
| M07-UI-MATRIX | Screen 04 standalone pass/fail complete-member matrix | PASS | UI seed selector runs ≥3 pass and ≥3 fail complete-member cases through evaluateDesign with overall status. |
| M07-MODEL-REPORT | Model-derived demand and calculation-report clause trail | PASS | Analysis midspan actions overlay a W seed; exported report includes clause trail and intermediates (not envelope maxima). |

Limitations: M07 packages AISC 360-22 LRFD S2 only. LTB (Lb>0), HSS/torsion/non-prismatic remain unsupported. Commercial PROKON parity remains UNKNOWN.
