# M01-B axes and topology checkpoint

Users can toggle the selected member's Rust-derived local axes and open Topology
for explicit split, connect and merge previews. Closing a preview changes nothing;
commit uses the same command ID and one engineering undo step. Split uniform loads
and self-weight selections are preserved, and children retain root physical member
IDs and composed station ranges. Conflicting merges and collapsed members fail
without mutation.

Source hash: `aca660155a88c2ffe5424b757c3de3e1816b045b8aa739421df70453ff569085`.
Build hash: `a20a6f51cfd129d7823dcd9e27fdc4e5ea3f3756104c787476017e0307927fdc`.
Verified source commit: `246927f14901809a87921393149e0d2f44ed37b8`. A following evidence-only commit links this revision and refreshes retained regression traces.

## Observed outcomes

- 23 native test functions, including seven topology/axis tests.
- Three strict contract tests and two export-security tests.
- 33 signed analytical checks in both native and WASM with cross-runtime comparison.
- 20 independent OpenSees models and 1,440 compared values.
- 18 automated browser tests, including real WASM split/connect/merge, preview
  cancellation/invalidation, exact engineering undo/redo, autosave, portable
  provenance import, report export, accessible preview, phone layout and all prior
  cantilever/portal/storage/GPU/Worker regression journeys.
- Split B07 independently analysed with OpenSees: all 24 displayed nodal DOFs
  matched within the test's display-rounding tolerance. Raw project and oracle
  output, standalone report, screenshots and the two topology traces are retained.

Start with `topology-authoring.json`, `split-project.json`, `split-opensees.json`,
`split-report.html`, `axes.png`, `split-preview.png` and `merge-mobile.png`.
`regression/` contains the final same-build harness records and raw artifacts.
Some regression records keep the harness's historic M00 labels; their source and
build hashes identify this exact build. M00/current and M01/current baselines were
restored unchanged after archiving the new run here.

## Boundaries

Automated browser tests used Chromium with SwiftShader. Manual computer-use access
was attempted but the tool could not verify its admin-enforced access policy; no
manual browser interaction is claimed. The required Windows/Linux real-GPU runner
remains unavailable. `regression/gate-M01.json` reports BLOCKED, as expected.
The generic milestone verifier is not a complete M01-specific acceptance audit.

Connect is currently bounded to 2–200 selected nonparallel XZ members. Collinear
overlaps are excluded. Split creates separate nodes; it does not implicitly join
unrelated geometry. Merge is restricted to the specified 1e-6 m distance and refuses
multiple supports or same-case nodal actions from distinct nodes. Full M01 working
planes, camera/selection, disconnected-crossing visual distinction and capacity
validation remain open. Parent milestones remain unaccepted.
