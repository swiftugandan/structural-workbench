# M07 acceptance record

Source hash: `87355d586145a0b5cc95e38a1a44e485d0317d10129b351a3fcb044b8e8c624b`
Build hash: `4a4152c285e90912c6629b09748e6ed9988db193c06c8410f72a2c724126dea7`
Observed: 2026-09-23T17:04:21.735Z
Status: **PASS**

| ID | Title | Status | Observation |
| --- | --- | --- | --- |
| M07-S2-FIXTURES | AISC S2 fixture regressions (D/E/F/G/H) | PASS | Published Design Examples digits match clause modules for tension, compression, continuously braced flexure and shear. H1 is formula-checked against published φ capacities only (not section-derived LTB). |
| M07-UI-MATRIX | Screen 04 standalone pass/fail complete-member matrix | PASS | UI seed selector runs ≥3 pass and ≥3 fail complete-member cases through evaluateDesign with overall status. |
| M07-MODEL-REPORT | Model-derived demand and calculation-report clause trail | PASS | Analysis midspan actions overlay a W seed; exported report includes clause trail and intermediates (not envelope maxima). |

Limitations: M07 packages AISC 360-22 LRFD S2 only. LTB (Lb>0), HSS/torsion/non-prismatic remain unsupported. Commercial PROKON parity remains UNKNOWN.
