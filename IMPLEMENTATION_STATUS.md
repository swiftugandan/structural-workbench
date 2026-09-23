# Implementation status

## Usable product

The repository now contains a working static frame-analysis preview. Use
`npm run preview` after a build; open http://127.0.0.1:4173.

The cantilever journey runs end to end: editable geometry/material/section/load,
Rust-parsed engineering units, actual sparse Rust/WASM calculation, WebGPU model
and deformation view, linked member selection, displacement/reaction/action tables,
engineering undo/redo, stale-state protection, IndexedDB save/reopen, strict JSON
import/export, CSV, and standalone HTML calculation reports with vector plots.

Additional implemented calculations cover nodal forces/moments, uniform member
loads, self weight, imposed support motion and explicit linear combinations.
Worked examples B01–B11 exercise those calculations. The engineering model is
owned by Rust; UI drafts, camera and display preferences are separate.

The planar portal journey now includes guided span/height/base/load setup, XZ
member drawing with Rust snapping, numeric endpoints with unit suffixes, individual
coordinate/restraint/nodal-load fields, atomic member creation, undo/redo and
save/reopen/report. Crossings do not silently join members.

Local axes can now be inspected for the selected member. Topology provides explicit
Rust-validated split/connect/merge previews with one-step undo, member-load
preservation and parent station lineage. Connect handles nonparallel XZ intersections
among up to 200 selected members; collinear overlaps are excluded.

M01 CAD authoring now includes XZ/XY/YZ working planes and offsets, a world-aligned
snap grid, node/midpoint/intersection feedback, disconnected-crossing diamonds,
near-coincident warnings, click/Shift/box selection, cursor-centred zoom,
pan/orbit/fit, numeric move/copy, dependency-preview deletion and distance measurement.
Commands use Rust validation and exact snapshot undo; geometry copies do not copy
supports or loads. Keyboard and accessible table paths accompany pointer editing.

## Evidence and limits

The final observed command outcomes and exact source/build hashes are recorded in
`evidence/M00/current` (cantilever baseline), `evidence/M01/current` (portal baseline),
`evidence/M01/topology` (axes/topology slice), `evidence/M01/full` (full M01 candidate)
and `delivery/state.json`. Native/WASM agreement, analytical
benchmarks and OpenSees comparisons are separate evidence categories. Historical WebGPU
observations used the local macOS AMD adapter. The current candidate uses automated
Chromium/SwiftShader checks; computer-use access is blocked by an unavailable tool
policy check. Neither historical observations nor software timings establish current
hardware performance.

Formal milestone/release verification is intentionally not green while required
platform evidence is missing. No milestone is self-declared accepted. The current
working preview does not equal the complete 24-milestone project.

## Remaining implementation

| Milestone | Implemented pieces | Still required |
| --- | --- | --- |
| M00 | Cantilever user journey, sparse WASM/native kernel, units, selection, save/reopen/report, instability/no-adapter paths | Complete required platform evidence and release-grade acceptance audit |
| M01 | Portal authoring, three working planes, snapping/feedback, camera/selection gestures, move/copy/delete/measure, numeric fields, local axes, topology previews, invariance and portal oracle, autosave/history, CAD capacity/startup tests, evidence verifier | Current computer-use verification, Windows/Linux real-GPU performance and platform acceptance |
| M02 | Uniform loads, self weight, prescribed motion, cases/combinations, sampled diagrams, My/Mz releases, exact My/Mz extrema key stations, interior point loads with analytical split and force-jump discontinuities, multi-case envelopes with governing provenance, expanded INVALID load/release/combination corpus (N08–N22) | Parent platform/CUA acceptance |
| M03 | 3D orbit, cancel, spatial oracle, CopyBay (M03-A), dual Workers (M03-B), OpenSees pack (M03-C), 5k-node multibay solve + memory guard (M03-D), all-axis unit-action + localY roll/section-axis edit (M03-E) | Physical/analytical hierarchy UI; parent M03 verifier packaging |
| M04 | IndexedDB snapshots, single-writer lock, exports, escaped reports, stale controls | Offline cache/update lifecycle, historical-revision recovery UI, migrations and full crash/recovery matrix |
| M05 | Editable synthetic sections and examples | Parametric templates, section calculator, project variants and side-by-side comparison |
| M06 | Unexposed elastic stress helper | Verified mechanics UI, accumulated regression, performance and clean release gates |
| M07–M23 | No implemented product modules | Material-code packages, advanced analysis/design/exchange/automation and finite parity inventory |

My/Mz end releases use static condensation. Interior point actions expand
deterministically at analyse time (physical model hash preserved). Axial/shear/
torsion releases remain rejected. The sparse fill memory guard estimates factor
storage from matrix nnz (not dense n²); the 5,000-node connected multibay
representative frame solves within the 512 MiB budget, and a tight-budget replay
refuses with MEMORY_LIMIT. Entity-count maxima are still not a general capacity claim.
The report/current-result controls require applied model edits and a successful solve.
Reports exclude any code-compliance or professional-approval claim.

## External resources

`resources.lock.json` records acquired open-source dependencies and the independent
OpenSees environment. `resources.required.json` remains the original source of
truth for unacquired standards, authoritative design examples, advanced benchmarks
and a licensed commercial comparison corpus. Neither standards compliance nor
numerical equivalence to PROKON has been established.

The required Windows/Linux real-GPU runner is not available in this macOS session.
It must run the same pinned build and retain adapter/browser/driver information.
This blocks its platform evidence; it does not turn unfinished application features
into external-resource blockers.

## Next concrete work

First complete [M01-UX](agent-tasks/M01-UX.md), the user-requested UI/UX sub-milestone. Its interactive design and source-based audit are in docs/design/M01-UX/; the canvas-first revision implements direct geometry/assignment placement, point-to-point transforms, splitting, measurement, inline deletion and nonblocking property/precision panels, in addition to the ribbon and responsive workspace. Current candidate evidence is in evidence/M01/canvas-first; live visual/browser acceptance remains pending. Prioritize workspace hierarchy, modelling flow, results readability, responsive access and accessibility. Then refresh the changed-build evidence and resume parent acceptance below.

Run the M01 candidate on the required Windows/Linux real-GPU runner and complete
computer-use verification after the tool policy check becomes available. Use
`docs/M01_HARDWARE_RUNNER.md` and the same-build verifier. Keep both parent
milestones unaccepted until their required gates pass. Retain original fixtures.

Current canvas-first/readable-label candidate: 34 browser tests, 30 native tests, 33 native/WASM numerical comparisons, 3 contract tests and 4 verifier tests pass. Stable short labels are separate from hidden IDs; no migrations. See evidence/M01/canvas-first. Live UX and required parent real-GPU acceptance remain blocked.

Support-symbol refinement: fixed, pinned and roller glyphs follow active restraints and model/view orientation; custom/end-on constraints are explicit. 35 browser and 4 focused symbol checks pass, with 33 numerical comparisons and 3 contracts passing. Evidence: evidence/M01/support-symbols. Truss-joint/end-release symbols and corresponding solver support are not implemented.

Canvas dimensions are implemented and pass 14 targeted browser plus 2 layout checks. True Rust lengths, display-only toggle and edit/undo refresh are verified. Evidence: evidence/M01/dimensions; no new full milestone or live-visual acceptance claimed.

Latest refinement: canvas Shear Vy/Vz with signed annotations, unit-aware common scale, explicit zero values and stale-result suppression. Selection persists on reanalysis. Evidence: evidence/M01/shear-diagrams (15 targeted browser + 3 diagram tests). No solver/schema change; live review and full milestone acceptance remain pending.

Latest refinement: camera-aligned XYZ compass with green Y, balanced isometric default and bounded XY reference grid at model minimum Z. Evidence: evidence/M01/orientation (14 targeted browser + 2 orientation checks pass). Camera movement preserves the engineering hash. Live visual review and full milestone acceptance remain pending.

Diagram-plane correction: local member-plane projection replaces screen-perpendicular diagrams (My/Vz along z, Vy along y). Four analytical rendering checks pass, including rolled axes, foreshortening, zeros and missing frames. Browser regression evidence is recorded in evidence/M01/diagram-planes; live visual acceptance remains pending.

Effect-direction follow-up: removed deformation's constant-depth overlay while retaining full XYZ displacement. Five focused rendering checks cover action planes, rotated axes, pure-Z and coupled deformation, depth and zero scale. Browser results are recorded in evidence/M01/effect-directions.

Warehouse W01 added to Worked examples, opens in 3D. Analysed and independently cross-checked: 468 OpenSees and 468 native/WASM values, six equilibrium components and browser journey pass. Peak nodal displacement 8.80 mm; reactions balance 180 kN downward + 45 kN lateral. Synthetic demonstration inputs, not building design validation. Evidence: evidence/M01/warehouse.

Grouped result picker: Model/deformation, Member forces (N/Vy/Vz), Member moments (My/Mz/T), remembered per-family choice and retained action after analysis. Mz follows local xy; N/T use signed on-member colouring. Evidence/M01/result-picker: 6 unit and 7 browser tests pass. Live visual/full milestone acceptance remain pending.

Selection Forces & moments tab implemented: member component diagrams/station readout/end values and node applied/reaction/member-on-node diagrams with global tables. Units and stale guards verified. Evidence/M01/force-inspector: 4 browser + 1 analytical unit pass. Live visual/full acceptance pending.

User-directed removal: Forces & moments is now member-only; node diagrams/tables and contribution code removed. Member journey and node-empty-state browser check pass. Evidence: evidence/M01/member-only-inspector.

Member results now includes global Ux/Uy/Uz/total displacement diagrams and station/end/extreme readouts in mm or m. Build and cantilever/browser regression pass: evidence/M01/member-deformation.

Canvas toolbar exaggeration controls added: Displacement × and Diagram ×, with independent retained values and visible legend factors. Build, 6 rendering unit tests and 2 browser tests pass. Evidence: evidence/M01/graph-scale.
