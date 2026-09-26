# Residential analytical stair display

User screenshot showed single analytical lines for the wide returning stair
flights. All eight flight members and their landing connections are already in
UKR01-v2. The line view now supplements each flight and landing strip with a thin
width outline, generated in Rust from the authored physical role, local axes and
actual section width. The legend distinguishes these edges from analytical beams.
No members, stiffness, loads or engineering model hash are changed. These outlines
are at the analytical reference plane, not a finished stair/detailing model.

Reproduce:
```
cargo test --workspace --locked
npm run test:contracts
npm run build
WORKBENCH_EVIDENCE_DIR=evidence/stair-outlines npx playwright test tests/e2e/stair-outlines.spec.js tests/e2e/spatial-crossings.spec.js
```

The native regression checks both edges of all eight return flights (1.2 m wide),
landing widths, endpoint midpoints, exclusion of unrelated members and unchanged
model hash. Browser tests exercise all camera presets, solid/line transitions,
26 real strip outlines and the existing spatial crossing diagnostic. Visible
Chrome/macOS AMD inspection covers the corrected analytical view.
