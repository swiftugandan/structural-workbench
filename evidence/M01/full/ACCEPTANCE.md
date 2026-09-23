# M01-UX acceptance record

Source hash: `05ed4b9bea0c3bf78ebcdb8be305508c5f1b55188f9d543c0dbd3a57a232c29a`
Build hash: `5c6f34d49aeb228c1ef12a0721d8b8728fc29137ae752fb07e54a3fa83d68728`
Observed: 2026-09-23T07:59:34.515Z
Live path: headed Playwright live-visual (ADR 0005); CUA policy service not required for this record.

| ID | Title | Status | Observation |
| --- | --- | --- | --- |
| UX-01 | Design | PASS | Design package and audit present. Live visual screenshots refresh the observed-live column for workspace/results states. |
| UX-02 | Hierarchy | PASS | Ribbon/menus/context actions and properties panel exercised in browser suite; live-visual confirms canvas-first landing and portal workspace. |
| UX-03 | Authoring | PASS | Portal create/draw/edit/undo and keyboard authoring pass automated e2e; live-visual creates and analyses a portal. |
| UX-04 | Results | PASS | Analyse → current results, stale after edit, and export paths covered by e2e; live-visual captures analysed results screen. |
| UX-05 | Accessibility | PASS | Automated axe WCAG 2A/2AA/2.1AA scans on landing and solved workspace pass on this build. |
| UX-06 | Responsive | PASS | 390/768/desktop widths covered by existing responsive e2e (guided inputs, portal compact, workspace overlays). |
| UX-07 | Recovery | PASS | Storage quota, GPU loss, invalid import, cancel, and unknown-field rejection preserve the project in automated robustness journeys. |
| UX-08 | Regression | PASS | Full browser suite, contracts, and WASM numerical comparisons pass on this source/build. Live-visual substitutes for CUA per ADR 0005. |

## Evidence map

### UX-01 — Design

Design package and audit present. Live visual screenshots refresh the observed-live column for workspace/results states.

- `docs/design/M01-UX/AUDIT.md`
- `docs/design/M01-UX/workspace.html`
- `docs/design/M01-UX/CANVAS_INTERACTIONS.md`
- `docs/design/M01-UX/IMPLEMENTATION.md`

### UX-02 — Hierarchy

Ribbon/menus/context actions and properties panel exercised in browser suite; live-visual confirms canvas-first landing and portal workspace.

- `tests/e2e/application-menu.spec.js`
- `tests/e2e/workspace-ux.spec.js`
- `tests/e2e/canvas-first.spec.js`
- `tests/e2e/layout-panels.spec.js`

### UX-03 — Authoring

Portal create/draw/edit/undo and keyboard authoring pass automated e2e; live-visual creates and analyses a portal.

- `tests/e2e/portal.spec.js`
- `tests/e2e/canvas-first.spec.js`
- `tests/e2e/keyboard.spec.js`
- `tests/e2e/cad.spec.js`

### UX-04 — Results

Analyse → current results, stale after edit, and export paths covered by e2e; live-visual captures analysed results screen.

- `tests/e2e/result-picker.spec.js`
- `tests/e2e/workbench.spec.js`
- `tests/e2e/shear-diagrams.spec.js`
- `live-visual-results.png`

### UX-05 — Accessibility

Automated axe WCAG 2A/2AA/2.1AA scans on landing and solved workspace pass on this build.

- `accessibility.json`
- `tests/accessibility/a11y.spec.js`

### UX-06 — Responsive

390/768/desktop widths covered by existing responsive e2e (guided inputs, portal compact, workspace overlays).

- `tests/e2e/workspace-ux.spec.js`
- `tests/e2e/guided-inputs.spec.js`
- `tests/e2e/portal.spec.js`

### UX-07 — Recovery

Storage quota, GPU loss, invalid import, cancel, and unknown-field rejection preserve the project in automated robustness journeys.

- `tests/e2e/robustness.spec.js`
- `tests/e2e/workbench.spec.js`

### UX-08 — Regression

Full browser suite, contracts, and WASM numerical comparisons pass on this source/build. Live-visual substitutes for CUA per ADR 0005.

- `browser-suite.json`
- `wasm.json`
- `contracts.json`
- `computer-use.json`


## Limitations

- Parent M00/M01 release acceptance still depends on the full M01 verifier families beyond M01-UX.
- Lab Metal orbit thresholds remain lab-pinned (`docs/lab-runner.json`); not reference-class 33 ms equivalence.
- AUDIT.md historical note about blocked CUA is superseded for this acceptance by live-visual evidence in this directory.
