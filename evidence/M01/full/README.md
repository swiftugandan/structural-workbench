# M01 full implementation candidate

The M01 CAD authoring implementation is present and the local automated checks
pass. **M01 is not accepted**: current computer-use verification and the required
Windows/Linux real-GPU platform/performance run are blocked by external resources.
`gate-M01.json` is the machine-readable decision; no status label overrides it.

## Delivered behavior

- Guided and keyboard-only portal creation, numeric/table entity editing,
  unit-suffixed geometry/restraints/loads, actual Rust/WASM solving, sway results,
  instability and repair, exact undo/redo, autosave/reopen and portable reports.
- XZ/XY/YZ working planes, offsets, aligned grid, eight-pixel snapping and live
  rubber-band feedback; ordinary crossings remain disconnected and visibly marked.
- Local axes, near-coincident warnings, split/connect/merge previews with preserved
  member loads and lineage; failed commands leave the model unchanged.
- Click/Shift/blank-drag selection, cursor zoom, pan/orbit/fit and scoped shortcuts;
  atomic move/copy/dependency-delete and f64 distance measurement.
- Same-build evidence verifier with required test identities, lock/artifact hashes,
  and explicit rejection of missing, stale, failed or software-GPU hardware evidence.

## Verified source and build

Source content SHA-256: `41b746236180167af15ba4808d3b4f94fc60c25c55c889f7a996f5dcef42b487`.
Build SHA-256: `d2743420b0da59f74e29b83bc3bde6ad4e0e062bad615408a93628a2861d37a0`.
The source commit is recorded in `delivery/state.json`; later delivery-only
commits do not alter the tested source. `reproducibility.json` records the second
build comparison. Historical M00/M01 evidence and original fixtures are retained.

## Executed checks

| Family | Observed result |
| --- | --- |
| Native | 29 test functions passed, including B01–B11, rotation/relabel/reorder/reversal, CAD atomicity and typed-load conversion |
| Contracts / security / verifier | 3 / 2 / 3 tests passed |
| Analytical / native–WASM | 33 / 33 signed checks passed |
| Independent OpenSees | 20 models, 1,440 values passed; portal and split-beam browser comparisons also passed |
| Browser | 27 tests passed; zero failures or skips, including Tab/Enter-only creation/edit/solve |
| Graphics | DPR 1/2, far-origin rebasing, depth picking, camera changes, resizing, GPU loss and table fallback passed on software Chromium |
| CAD size | 5,000-node/10,000-member import 1,466 ms; export 130 ms; 1,000-member edit p95 54.5 ms; pick p95 37.2 ms; snap p95 39.7 ms |
| Startup | Five cached samples 632–946 ms; cold 10 Mbps / 50 ms network 1,453 ms; compressed core 332,222 bytes |
| Real-GPU orbit | Not accepted: SwiftShader orbit p95 283.3 ms, longest frame 783.3 ms; required real-GPU targets remain unverified |
| Computer use | Blocked: tool could not verify admin-enforced policy, including after user authorization |

The browser JSON, logs, raw projects, oracle outputs, HTML reports and screenshots
are retained here. Selected drawing and keyboard traces are in `traces/`. Intermediate
failures and repairs are explained in `implementation-findings.md`; `attempts/`
retains a failed-run report and keyboard trace. They are not current acceptance evidence.

## Resume conditions and limits

Follow `docs/M01_HARDWARE_RUNNER.md` on an authorized real Linux/Windows GPU runner,
then run the computer-use journey when the tool can verify policy for the preview.
Re-run `npm run verify:milestone -- M01` with the documented evidence environment.
Do not waive either gate or repurpose older manual observations as current proof.

Connect supports 2–200 nonparallel XZ members; collinear overlaps and spatial
Connect are excluded. Copies are geometry-only. The current schema requires at
least one node and member. The 30,000-DOF / 50-RHS solve capacity belongs to M03 and
is not established by CAD size testing. Code design and commercial parity remain
unimplemented/unverified later scope. See `capabilities.json` for the scope ledger.
