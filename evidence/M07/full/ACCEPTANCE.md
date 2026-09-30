# M07 acceptance record

Source hash: `83eb37b6ab55668782eca0c60e69694f51fde7643be8e68da7e5a46c5ba75599`
Build hash: `fb51d59eedce6877434409489a30b59af8f4e8c945f523e12f8fad0f4a35e0ab`
Observed: 2026-09-30T09:36:11.715Z
Status: **PASS**

| ID | Title | Status | Observation |
| --- | --- | --- | --- |
| M07-S2-FIXTURES | AISC S2 fixture regressions (D/E/F/G/H) | PASS | Published Design Examples digits match clause modules for tension, compression, continuously braced flexure and shear. H1 is formula-checked against published φ capacities only (not section-derived LTB). |
| M07-UI-MATRIX | Screen 04 standalone pass/fail complete-member matrix | PASS | UI seed selector runs ≥3 pass and ≥3 fail complete-member cases through evaluateDesign with overall status. |
| M07-MODEL-REPORT | Model-derived demand and calculation-report clause trail | PASS | Analysis midspan actions overlay a W seed; exported report includes clause trail and intermediates (not envelope maxima). |

Limitations: M07 packages AISC 360-22 LRFD S2 only. LTB (Lb>0), HSS/torsion/non-prismatic remain unsupported. Commercial PROKON parity remains UNKNOWN.
