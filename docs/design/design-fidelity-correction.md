# Design screen fidelity correction — 2026-09-26

The first workflow delivery established provenance and fail-closed behaviour but did not reproduce the approved screen composition. Functional browser journeys were insufficient evidence of visual fidelity. This correction treats the reference screens as UI acceptance inputs.

## Reference mapping

| Reference | Correction |
| --- | --- |
| M07 approved member design | Compact navy header and ribbon; full-height Explorer; grouped section/material card, design assumptions, readiness and profile; actual model section surfaces in Rust local axes. |
| M07 calculation details | Selectable check tree with actual clause, station, combination, demand, resistance and intermediate values; separate immutable provenance tab. |
| M07 section catalogue | Five verified catalogue entries available in the inspector; selection and assignment remain distinct. Full catalogue browser and section studies remain M07-G scope. |
| M08 setup / reinforcement proposal | Numbered inline inspector fields, small section sketch, WebGPU concrete envelope and illustrative cage; longitudinal/cross-section drawings and separate schedule tab. |
| M10 captions (image pack unavailable locally) | Slab with opening, four layer selectors, illustrative grid, synthetic action table, calculation/detail/reinforcement tabs. No validated FE mesh or transformed design moments are claimed. |
| M11 setup / soil contact | Translucent footing, column and illustrative grid; geometry/material/soil groups; external bearing origin and reference; contact panel explicitly INDETERMINATE. |

All screens retain the current Model Explorer / central viewport / Selection Inspector / bottom Results drawer. View mode controls preserve engineering hashes. Focused illustrative scenes block structural picking/authoring; model context restores structural interactions. Leaving concrete mode restores the previous camera. Rust midpoint frames are converted correctly to member-end geometry for solid steel rendering.

The reference building is not painted into unrelated projects. The viewport depicts the opened model or the explicitly labelled design draft. Reinforcement is illustrative and unverified, not a construction schedule. Concrete resistance, code profiles, mesh convergence, soil pressure and detailing verification remain unavailable. No new engineering calculation runs in JavaScript.

## Reproduction

```
WORKBENCH_EVIDENCE_DIR=evidence/design-fidelity npm run build
node --test tests/design-scene.test.mjs
npm run test:contracts
WORKBENCH_EVIDENCE_DIR=evidence/design-fidelity npx playwright test tests/e2e/design-fidelity.spec.js tests/e2e/design-previews.spec.js tests/e2e/native-steel-design.spec.js tests/e2e/orientation.spec.js tests/e2e/workspace-ux.spec.js
```

Use the ordinary app import/recent-project controls, then Steel design or Concrete previews in the inspector. The fidelity tests exercise real WASM, create drafts through controls, verify drawing changes, all result panes, preserved model hashes and camera restoration. Existing journeys cover stale/undo/reopen/export, native steel PASS/FAIL and LTB UNSUPPORTED. Geometry tests check both horizontal and vertical Rust midpoint frames.

Evidence and exact build identifiers: `evidence/design-fidelity/fidelity-gate.json`. Visible Chrome screenshots were inspected separately from automated tests; macOS AMD WebGPU only. The test runner uses Chromium SwiftShader. This is local UI verification, not expanded numerical or cross-platform milestone acceptance.
