# M01-UX canvas-first handoff

Work in /Users/p.munaawa/Documents/projects/labs/prokon on main (trunk based development). The ChatGPT project mirror's sources remain read-only. Do not spawn agents unless newly authorized.

The user's latest direction is a canvas-first modelling application. Support and Load were examples, not the complete scope. See docs/design/M01-UX/CANVAS_INTERACTIONS.md for the broad interaction audit and docs/design/M01-UX/IMPLEMENTATION.md for implemented behavior. The old interactive workspace design is illustrative, not the current production interaction model.

## Current candidate

The working app now has two-click member creation; snapped node placement; click-to-place support presets; click/drag point forces and member uniform loads; point-to-point Move/Copy; picked Split; two-node Measure; inline dependency Delete; direct node/support/load properties; and nonblocking precision/topology/entity panels. Context actions finish active placement tools. Routine modelling leaves the canvas available. Existing project-level creation/import/help flows may still use dialogs.

The ribbon, keyboard context menu, selection/draft protection, responsive panels and results drawer remain in place. Rust still validates engineering state, units, topology and undo. No new solver domain or compliance scope is claimed.

Read delivery/state.json and evidence/M01/canvas-first/README.md for the exact source/build identity and final checks. evidence/M01/ux describes the earlier toolbar-oriented candidate; evidence/M01/full describes the original M01 candidate. Never use earlier-build evidence to accept the current source.

## Remaining acceptance

Live computer use is blocked because the browser service cannot verify its admin-enforced policy. The user already authorized browser use; do not ask again or bypass the control. Once available, perform the actual canvas-first journey, visual review and UX-01–UX-08 acceptance. Fix any observed usability problems and refresh same-build evidence before accepting M01-UX.

The required Windows/Linux real-GPU platform evidence also remains outstanding for parent M00/M01. Follow docs/M01_HARDWARE_RUNNER.md for that gate. Do not advance M02 by treating software-GPU tests as real hardware acceptance.

Use WORKBENCH_EVIDENCE_DIR=evidence/M01/canvas-first, WORKBENCH_TASK_ID=M01-UX and WORKBENCH_MILESTONE=M01 for the current candidate. Build before tests; never replace dist during a run. npm run verify:milestone -- M01-UX intentionally remains blocked until live review and its acceptance record exist.

Preview: http://127.0.0.1:4173 (npm run preview if needed). No push or remote configuration was requested.

Latest user direction: hidden unique internal IDs with short visible labels; no migrations during active development. Implemented `metadata.entityLabels` in Rust canonicalisation and shared `web/entity-labels.js` presentation lookup. Label persistence/copy/deletion/undo/reopen covered by native and browser regressions. No migration layer.

Latest refinement: constraint-aware, camera-aligned fixed/pinned/roller support glyphs and explicit custom/end-on markers. Current evidence is evidence/M01/support-symbols (35 browser, 4 glyph tests, 33 numerical comparisons, 3 contracts pass). Live CUA retry was blocked by unavailable policy verification. Truss joint/hinge symbols are not implemented; the kernel rejects member-end releases.

Latest change: canvas dimensions enabled by default with View ribbon toggle, true Rust lengths, edit/undo refresh, extension lines and arrowheads. Current focused evidence: evidence/M01/dimensions (14 browser + 2 layout checks). Prior full-suite evidence is build-specific; refresh complete required evidence before accepting M01-UX.

Latest refinement: canvas Shear Vy/Vz with signed annotations, unit-aware common scale, explicit zero values and stale-result suppression. Selection persists on reanalysis. Evidence: evidence/M01/shear-diagrams (15 targeted browser + 3 diagram tests). No solver/schema change; live review and full milestone acceptance remain pending.

Latest refinement: camera-aligned XYZ compass with green Y, balanced isometric default and bounded XY reference grid at model minimum Z. Evidence: evidence/M01/orientation (14 targeted browser + 2 orientation checks pass). Camera movement preserves the engineering hash. Live visual review and full milestone acceptance remain pending.

Diagram-plane correction: My and Vz now plot in each member's local XZ plane, Vy in local XY, using current Rust geometry frames before camera projection. Positive values point along positive local z/y; plots foreshorten and collapse edge-on naturally. Source commit b745910; focused evidence is evidence/M01/diagram-planes. Concurrent guided-input work is present in the tested content-addressed snapshot; use its build/source hashes, not the source commit alone, to identify the test build. Live visual and full milestone acceptance remain pending.
