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

Milestones are accepted only by their same-build parent gates (table below).
Release verification still lacks the Windows/Linux real-GPU platform evidence.
The working preview does not equal the complete 24-milestone project.

## Milestone status (2026-09-29)

Accepted parents carry same-build gate evidence under `evidence/<milestone>/full`
and their records in `delivery/state.json`.

| Milestone | Status | Scope delivered | Still outside scope |
| --- | --- | --- | --- |
| M00–M06 | Accepted | Analysis MVP: cantilever and portal journeys, CAD authoring, loads/combinations/envelopes, spatial frames, recovery/offline/migration, sections/variants, elastic stress screen | Windows/Linux real-GPU platform evidence |
| M07 | Accepted (+ M07-E/F/G, M07-LTB, M07-S) | AISC 360-22 LRFD for doubly symmetric W-shapes: S2 checks; flexure with flange local buckling (F3) and lateral-torsional buckling (F2.2) from published examples, with Cb entered or derived by F1-1; model-native catalogue, review and study; user deflection serviceability, reported separately | Segment Cb for interior bracing points, noncompact/slender webs, HSS, torsion, full-code claims |
| M08 | Blocked (resources) | Concrete mechanics previews and a disabled EC2 UK profile | EN 1992-1-1 A1:2014 and UK NA + A2:2014 |
| M09 | Accepted | Elastic flexural buckling and linearised P-Δ-δ second order with My/Mz end releases as hinge DOFs; first- vs second-order comparison; stability-v1 oracle | Torsional/LTB modes, large displacement |
| M14 | Accepted | Modal analysis with declared mass sources (schema 1.4.0), consistent/lumped mass, hinge DOFs for end releases, participation and omitted-mode reporting, vibration report; dynamics-v1 oracle | Damping, response spectra (M15) |
| M22 | Accepted | Declarative JSON-pointer studies from the CLI and the browser on one core: replay identity, cancellation, budgets, located errors, guards | General scripting, multilingual reports |
| M10 | Numerical family gated; parent blocked on M08 | plate-v1 slab panel analysis (MITC4 flat shell, one opening, free/simple/clamped edges, column supports), columns from the frame model and column loads back to it, Wood–Armer design moments, clamped-edge moments, convergence indicator, contour maps, calculation record | Reinforcement, punching and deflection checks (slab code profile); coupled frame–shell analysis |
| M12 | Numerical family gated; parent blocked on M08 | Biaxial RC column section mechanics: exact integration, M_Rd(N, θ) at model key stations, interaction contour, calculation record | Partial factors, slenderness and second-order moments, minimum eccentricity, shear, detailing (column code profile) |
| M15 | Numerical family gated; parent blocked on R-SEISMIC-CODE | Harmonic (steady-state) response with Rayleigh damping by direct complex solve; response-spectrum analysis with user spectra (SRSS/CQC), reactions, member actions, report | Code spectra, behaviour factors, accidental torsion, directional combination, time history |
| M11, M13, M16–M21, M23 | Not started or blocked | — | External standards, benchmarks or exchange corpora (see `resources.required.json`) |

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

Unblocked slices: Cb for members with interior bracing points (needs a
bracing-point input); Windows/Linux real-GPU evidence. Other milestones
need the external resources listed in `resources.required.json`.

Authoritative hashes and task history: `delivery/state.json`; the latest narrative
is at the top of `HANDOFF.md`.
