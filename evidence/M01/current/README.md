# M01-A portal authoring evidence

`portal-authoring.json` records the bounded slice and observed manual browser
journey. `portal-unbraced.json` is downloaded from the actual browser-created
model. `portal-opensees.json` is independently calculated before comparing the
24 displayed displacement/rotation values with the actual browser WASM solve.
`portal-project.json` and `portal-report.html` preserve the braced model/output.

The same final build ran the complete 16-test browser suite, 16 native test
functions, 33 analytical native/WASM checks and 1,440 independent OpenSees values.
Regression JSON retains the original M00 task labels emitted by the existing
harness; all source/build hashes here identify the M01-A build. Historical M00
baseline evidence is preserved separately. No original fixtures were altered.

The portal traces and screenshots include edits, atomic zero-length rejection,
undo/redo, save/reopen, instability/repair, accessibility and 390px layout.
`gate-M01.json` intentionally remains BLOCKED. This is not full M01 acceptance,
Windows/Linux hardware validation, or commercial/code-design parity.
