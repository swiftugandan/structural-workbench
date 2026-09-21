# Next-session handoff

## Resume here

Work in `/Users/p.munaawa/Documents/projects/labs/prokon` on `main` (trunk-based
development). The ChatGPT project mirror is only context; its synced `sources/`
files are read-only. Read `AGENTS.md`, `Agent.md`, `delivery/state.json`, relevant
M01 requirements and `contracts/PROTOCOL.md` before implementation.

The user originally requested end-to-end implementation, with browser validation,
and subsequently asked to continue with the next slice. This handoff pauses at a
clean, tested checkpoint. Continue M01-B without asking for routine confirmation.
Do not spawn agents unless newly authorized by applicable instructions.

First commands:

```sh
cd /Users/p.munaawa/Documents/projects/labs/prokon
git status --short
git log -3 --oneline
cat delivery/state.json
```

Then inspect `crates/geometry/src/lib.rs`, `crates/wasm-api/src/lib.rs`,
`crates/wasm-api/src/snap.rs`, `web/modeling.js`, `web/render/viewport.js` and the
M01 topology requirements. Implement Rust-authoritative local-axis visualization,
then explicit split/connect/merge previews and atomic commits. Keep split loads,
physical-parent provenance, stable IDs and exact undo semantics intact. Failed
merges or zero-length members must preserve the original model.

## Current checkpoint

- Implementation commit: `0beb6dac13e7e60ee8e9f403ed8d7341d86b6708`.
- Evidence-link commit: `0a73a9c`.
- Working tree was clean before writing this handoff.
- Source content hash: `b70fe170e6db0bbb9d4ec2c1e24f3355ac73c69bdbe7a8c997771cd829d74224`.
- Build hash: `1ac52da7735441dd95283fa46a0fb36d89fc6245466fdb547e6e0a98e2a8b2d6`.
- Preview was running at http://127.0.0.1:4173/. Verify availability next session;
  run `npm run preview` if needed. Build first if source changed.
- Browser tab showed a saved, braced Planar portal with current results. Discover
  tabs afresh; do not rely on prior tool bindings or tab IDs.

## Implemented and observed

M00-A is a working cantilever analysis preview: actual sparse Rust/WASM solver,
WebGPU viewport, signed results, applied-edit/stale-result handling, units,
undo/redo, IndexedDB autosave, strict project JSON, CSV and standalone HTML report.
Nodal actions, uniform loads, self weight, prescribed motion and combinations work.
B01–B11 are executable inputs, never precomputed results.

M01-A adds:

- Guided two-column XZ portal creation with span, height, fixed/pinned bases and a
  lateral roof force. Synthetic material/section assumptions are explicit.
- Member drawing by two canvas clicks then Enter/Add member, or numeric endpoint
  fields accepting unit suffixes. Escape discards the draft.
- Rust f64 snaps to nodes, intersections, midpoints and a 0.5 m grid. The pointer
  aperture is eight CSS pixels. Only existing-node snaps reuse topology;
  intersections and midpoints do not automatically split/connect members.
- Atomic Batch creation, zero-length rejection, one-step undo/redo and autosave.
- Individual coordinate, restraint and nodal-action fields instead of JSON arrays.
- Wrapping toolbars and responsive drawing controls at 390px.

Manual browser use on the local AMD WebGPU adapter created and solved a 4m × 3m
portal with +10kN at the roof. Node n3 ux displayed 8.701003 mm. Clicking n1 and n3,
then Enter, added a brace with no duplicate nodes and marked results stale.
Reloading the final build reopened the saved braced model; its solved roof ux was
0.04727 mm. These observations do not constitute the missing platform matrix.

## Verification

Final completed build passed:

- 16 native Rust test functions.
- 3 contract tests and 2 security tests.
- 33 signed analytical checks in native and WASM, including native/WASM comparison.
- 20 independent OpenSees models, 1,440 compared values.
- 16 browser tests, including portal setup, 24 displayed DOFs versus independent
  OpenSees, coordinate edits, brace creation, zero-length rollback, undo/redo,
  save/reopen/report, removing restraints → instability → undo repair, Escape,
  accessibility, phone-width layout and all previous regressions.

Evidence is in `evidence/M01/current/`; start with `README.md` and
`portal-authoring.json`. Raw projects, oracle output, report, screenshots, traces,
build hashes and test records are retained. Historical M00 evidence remains in
`evidence/M00/current/`. Regression records copied into M01 retain the M00 labels
emitted by the existing harness; their source/build hashes identify this build.

Useful verification commands:

```sh
cargo test --workspace --locked
npm run build
npm run test:contracts
npm run test:numerical
npm run test:wasm
npm run test:oracle
npm run test:security
npm run test:browser
git diff --check
```

Wait for a build to finish before browser tests: build replaces `dist`, and running
concurrently caused a transient Worker-load failure. Native/oracle tools and the
browser suite produce real outputs, not mock solver answers. The portal test uses
`tools/oracle-env/bin/python` and the pinned OpenSees adapter.

The evidence harness currently writes to `evidence/M00/current` regardless of the
active milestone. Preserve historical evidence and archive new runs under their
own milestone, or improve the harness deliberately. `tools/verify.mjs` likewise
is not a complete M01-specific acceptance verifier. Do not mark a milestone
accepted based solely on the bounded task's passing tests.

## Open scope and blockers

`delivery/state.json` sets M01-B READY. Accepted parent milestones remain empty.
M01-A acceptance means only the bounded local slice. Full M01 still needs local
axes, explicit connect/split/merge, broader working planes, full camera/selection
semantics and capacity/performance validation. Intersection snapping is currently
quadratic, and the viewport background grid is visual rather than the snap grid.

M00-HW remains blocked by the unavailable required Windows/Linux real-GPU runner.
Local macOS AMD and automated Chromium/SwiftShader results do not replace it.
`gate-M01.json` correctly reports BLOCKED. Continue independent implementation;
do not mislabel unfinished features as external blockers or silently waive gates.

The overall 24-milestone project remains incomplete. See `IMPLEMENTATION_STATUS.md`
and original roadmap for all remaining work. End releases and interior member
point loads are explicitly rejected; full solver capacity is unverified. Separate
analysis/model Workers, advanced CAD, offline/history recovery, steel/concrete
code design and advanced analysis remain future work. No PROKON parity or code
compliance claim is justified.

## Architecture and guardrails

Plain HTML/JS modules/CSS, Rust f64 engineering authority, WASM Worker and WebGPU.
No framework replacement, backend solver or WebGL fallback. JS may preview and
format; authoritative geometry, units, validation and calculations stay in Rust.
Preserve original specs and expected fixture values. Read `docs/adr/0003-planar-authoring.md`
for current scope decisions and the existing formulation/oracle dossiers before
changing numerical behavior.

Rust toolchain is pinned; use the existing workspace and lockfiles. Build tooling
hashes source, tests, tools and fixtures, so changes there invalidate old build
evidence. Delivery/docs/evidence are excluded from that hash. Commit coherent
verified slices on main, with exact evidence and an honest remaining-work ledger.
