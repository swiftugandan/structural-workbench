# M07 acceptance record

Source hash: `0cfe0921e73028645b33e191441438eab1dc76cfe7260e25e39aee13c91375e8`
Build hash: `24dd5702f2c585b9b24dd068446b349859582e407f7f189a9b590f0e70ebc077`
Observed: 2026-09-30T13:08:51.940Z
Status: **PASS**

| ID | Title | Status | Observation |
| --- | --- | --- | --- |
| M07-S2-FIXTURES | AISC S2 fixture regressions (D/E/F/G/H) | PASS | Published Design Examples digits match clause modules for tension, compression, continuously braced flexure and shear. H1 is formula-checked against published φ capacities only (not section-derived LTB). |
| M07-UI-MATRIX | Screen 04 standalone pass/fail complete-member matrix | PASS | UI seed selector runs ≥3 pass and ≥3 fail complete-member cases through evaluateDesign with overall status. |
| M07-MODEL-REPORT | Model-derived demand and calculation-report clause trail | PASS | Analysis midspan actions overlay a W seed; exported report includes clause trail and intermediates (not envelope maxima). |

Limitations: M07 packages AISC 360-22 LRFD S2 only. LTB (Lb>0), HSS/torsion/non-prismatic remain unsupported. Commercial-solver parity remains UNKNOWN.
