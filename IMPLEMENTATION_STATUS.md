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

## Evidence and limits

The final observed command outcomes and exact source/build hashes are recorded in
`evidence/M00/current` (cantilever baseline), `evidence/M01/current` (portal baseline),
`evidence/M01/topology` (axes/topology slice)
and `delivery/state.json`. Native/WASM agreement, analytical
benchmarks and OpenSees comparisons are separate evidence categories. WebGPU
was observed on the local macOS AMD adapter through browser use; automated tests
use Chromium/SwiftShader and do not represent hardware performance evidence.

Formal milestone/release verification is intentionally not green while required
platform evidence is missing. No milestone is self-declared accepted. The current
working preview does not equal the complete 24-milestone project.

## Remaining implementation

| Milestone | Implemented pieces | Still required |
| --- | --- | --- |
| M00 | Cantilever user journey, sparse WASM/native kernel, units, selection, save/reopen/report, instability/no-adapter paths | Complete required platform evidence and release-grade acceptance audit |
| M01 | Guided portal setup, XZ drawing and Rust snapping, numeric entity fields, planar constraints, portal oracle, transactional commands/history, local axes, explicit connect/split/merge with previews and parent lineage | Broader working planes, complete camera/selection rules, size/performance validation and parent acceptance |
| M02 | Uniform loads, self weight, prescribed motion, cases/combinations, sampled diagrams | Releases, analytical splitting for interior point actions, exact extrema/discontinuities and envelope provenance |
| M03 | 3D orbit, worker termination cancellation, spatial oracle | Separate model/analysis Workers, copy/move/multiselect, physical/analytical hierarchy, full 30,000-DOF capacity/performance |
| M04 | IndexedDB snapshots, single-writer lock, exports, escaped reports, stale controls | Offline cache/update lifecycle, historical-revision recovery UI, migrations and full crash/recovery matrix |
| M05 | Editable synthetic sections and examples | Parametric templates, section calculator, project variants and side-by-side comparison |
| M06 | Unexposed elastic stress helper | Verified mechanics UI, accumulated regression, performance and clean release gates |
| M07–M23 | No implemented product modules | Material-code packages, advanced analysis/design/exchange/automation and finite parity inventory |

End releases and member-interior point actions are rejected instead of approximated.
The conservative factor-memory guard can reject models below the specification's
maximum entity counts; those maximums are not advertised as validated capacity.
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

Complete the required hardware acceptance lane for M00. Continue M01 with disconnected-crossing visual distinction, working-plane/camera/selection
completion and topology indexing/capacity validation. Reuse the original
20-case OpenSees corpus for numerical regression. Retain all original fixture values.
