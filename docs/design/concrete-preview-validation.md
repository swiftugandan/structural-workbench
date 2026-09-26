# Concrete workflow preview validation

Scope: local application workflow validation only. Numerical milestones M08/M10/M11 and cross-platform hardware acceptance are not advanced.

Automated commands (run after a completed build; no source edits during the gate):

```sh
WORKBENCH_EVIDENCE_DIR=evidence/design-previews npm run build
cargo test --workspace --locked
node --test tests/contracts.test.mjs tests/steel-check.test.mjs
WORKBENCH_EVIDENCE_DIR=evidence/design-previews npm run test:numerical
WORKBENCH_EVIDENCE_DIR=evidence/design-previews npm run test:wasm
WORKBENCH_EVIDENCE_DIR=evidence/design-previews npx playwright test tests/e2e/design-previews.spec.js tests/e2e/native-steel-design.spec.js tests/e2e/steel-check.spec.js tests/e2e/capability-ledger.spec.js
```

Required preview observations for each family:

1. Create and inspect the draft in the current Explorer/viewport/inspector/results shell.
2. Run synthetic upstream data; every unavailable check remains UNSUPPORTED, with null utilisation and no code profile.
3. RC beam and footing: bind the model entity, analyse, capture current exact actions; confirm the record stays a mock workflow despite genuine upstream analysis. Slab: model-source option unavailable; Rust rejects it directly.
4. Edit → STALE, cancel → current record; save → STALE, exact undo → original identity. Preview cannot run with unsaved form edits.
5. Export records with provenance; export/reopen the project with its draft inputs intact. RC preference CSV repeats the immutable run's values with no cut lengths. Footing shows INDETERMINATE contact and external soil provenance.
6. Actual visible Chrome interaction and screenshots for all three, separate from automated headless browser evidence.

Corrections found during validation: project-download test helper invocation; Explorer draft label spacing; per-field synthetic provenance retention; missing Rust kPa conversion for bearing-pressure entry. These are recorded as resolved only when the final same-build evidence passes.

Evidence and final outcomes: `evidence/design-previews/README.md` and `preview-gate.json`.
