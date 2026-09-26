# Spatial crossing diagnostic correction

Rust now distinguishes world-space member centreline contact (within the existing
merge tolerance) from overlapping projections. The view query does not connect
members or change model state. ADR 0011 defines the corrected contract.

Reproduce:

```
cargo test --workspace --locked
npm run test:contracts
npm run build
WORKBENCH_EVIDENCE_DIR=evidence/spatial-crossings WORKBENCH_TASK_ID=SPATIAL-CROSSINGS npx playwright test tests/e2e/cad.spec.js tests/e2e/spatial-crossings.spec.js
```

Native coverage: exact contact, half-tolerance gap, twice-tolerance gap, one-metre
gap, three orthogonal cameras including edge-on members, differing camera scales,
model hash preservation, depth-aware selection and the actual UKR01 reference.
Browser coverage: real Rust/WASM imports of separated and intersecting members,
three camera presets, the residential model with crossing display ON, and existing
draw/connect/undo/multi-selection/camera journeys.

The first added browser-test run incorrectly required an empty status span to
have visible dimensions. The actual application correctly leaves this span empty
when there are no crossings. The assertion now checks warning text and the
explicitly enabled crossing toggle. A second harness correction returned to Projects home before opening Worked
examples. The corrected journey passed a pre-build harness check; only the final
same-source build run is acceptance evidence. No application workaround was made.

Scope: finite nonparallel analytical centrelines. Parallel/collinear overlaps,
physical section collision detection and construction compliance are not verified
by this diagnostic. Visible computer-use evidence is macOS Chrome / AMD WebGPU;
automated browser evidence uses the configured SwiftShader environment.
