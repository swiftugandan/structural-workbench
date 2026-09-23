# M05 acceptance record

Source hash: `e040f64e27a39466f82a6c5c75ead5d9b7dd8336988f42ca8ebc8668e046037b`
Build hash: `e7e8fc36d41efc5c964fa28ab6cc43f75103263eab72584d7e303c3cf56d04eb`
Observed: 2026-09-23T12:51:48.683Z
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
