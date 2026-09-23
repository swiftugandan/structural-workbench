# M05 acceptance record

Source hash: `9fc9760080593bc56f59134729e665e20d8d972e896be181979d2e4416e00a63`
Build hash: `8faef8eb55634fe740794f9f4f09459c548dd6d6b1ed08b01059836b095d5574`
Observed: 2026-09-23T12:50:22.242Z
Status: **PASS**

| ID | Title | Status | Observation |
| --- | --- | --- | --- |
| M05-SECTION-CALCULATOR | Rectangular section properties with optional custom J | PASS | Kernel computes A/Iy/Iz/J/cy/cz for solid rectangles; custom J overrides Saint-Venant; UI fills section form and stiffness change clears stale results. |
| M05-VARIANTS | Duplicate as variant and compare independent solves | PASS | Duplicate captures a baseline; restiffened clone compares tip uz and model hashes from two actual solves; both reports download. |
| M05-PORTAL-TEMPLATES | Parametric portal template save and reuse | PASS | Portal dimensions save to IndexedDB and refill the create-portal form for a new project. |

## Limitations

- Parent M05 packages section calculator, variants and portal templates.
- Catalogue templates remain the existing guided-input Blue Book / Orange Book presets.
- Full 100-cycle memory soak and M06 release gates remain later milestones.
