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
| M03 | 3D orbit, cancel, spatial oracle, CopyBay, dual Workers, OpenSees pack (S01/S02/B07; R01/B09 native per ADR 0006), 5k-node capacity + WASM MEMORY_LIMIT, unit-action/roll, section-axis edit, hierarchy UI, cancel≤250ms / UI≤100ms / GPU-during-analysis — **parent accepted** (`evidence/M03/full`) | — |
| M04 | IndexedDB snapshots, single-writer lock, exports, escaped reports, stale controls, historical revision recovery UI (M04-A) | Offline cache/update lifecycle, schema migrations and full crash/recovery matrix |
| M05 | Editable synthetic sections and examples | Parametric templates, section calculator, project variants and side-by-side comparison |
| M06 | Unexposed elastic stress helper | Verified mechanics UI, accumulated regression, performance and clean release gates |
| M07 | Bounded AISC 360-22 LRFD S2 member check (parent + UX accepted); Screen-04 harness | Model-native workflow M07-E→F→G (ADR 0008); M07-S/LTB deferred |
| M08–M23 | Not started as product modules (M08 blocked on concrete resources) | Material-code packages, advanced analysis/design/exchange/automation and finite parity inventory |

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

Execute the integrated design workspace program ([agent-tasks/DESIGN-WORKFLOW.md](agent-tasks/DESIGN-WORKFLOW.md), ADR 0008): **M07-E** (phases 1–3) next, then thin **M07-F** (mockups 01–02), then **M07-G** (03–05). M07-S / M07-LTB deferred. M08 remains blocked on concrete resources; SHELL slices wait on engineering parents. Mockups are layout-only.

Authoritative hashes and task history: `delivery/state.json`. Historical M01 canvas/UX evidence lives under `evidence/M01/` — accepted context, not current priority. Remaining parent platform/CUA gaps (real-GPU runner, live visual) do not block M07-E.

