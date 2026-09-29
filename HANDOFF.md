## Latest: end releases in buckling and modal analysis

Elastic buckling and modal analysis now accept My/Mz member end releases. Each released end rotation is an independent hinge DOF, not a condensation, so both eigenproblems stay linear. A fixed strut with released ends reproduces the pinned strut to 1e-9. A portal with a pinned beam buckles as two flagpoles (π²EI/4h²) and sways at √(6EI/h³ / 2m). Released fixed bars reproduce the simply supported frequencies. Second-order analysis still refuses releases. The M09 and M14 gates were rerun and pass on this build, and the full browser batch is 114/114 on the build just before.

## Latest: steel serviceability (M07-S)

A member's steel design can carry a deflection criterion: a service load case or non-strength combination, a limit L/n, and a basis (relative to the chord for spans, or absolute for cantilevers). The kernel re-solves that service case and reports the deflection separately from strength: a PASS/FAIL panel beside the strength result, a Serviceability column in the model review, and a field in the design record. It never changes the strength verdict. Strength combinations and missing references are refused. Gate: `node tools/run-m07-s.mjs` → evidence/M07/serviceability. ADR 0020.

## Latest: AISC flexure breadth S3 (M07-LTB)

Steel flexure now covers lateral-torsional buckling (F2.2, inelastic and elastic, with your Lb and Cb) and compression flange local buckling of noncompact flanges (F3-1). It reproduces Design Examples F.1-2B, F.1-3B and F.3B within 0.5 %. rts and ho are derived by the Spec's definitions from the catalogue; the derivation reproduces the published W18×50 values. This closed a latent unconservative gap: the standalone check credited noncompact-flange shapes such as W14×99 with Mp. Slender flanges, noncompact webs, missing data and Cb < 1 are UNSUPPORTED. Gates: `node tools/run-m07-ltb.mjs` (evidence/M07/ltb) and `npm run verify:m07` on the same build. ADR 0019, dossier-S3.

Unrelated vitest processes from another project held this machine at load ~12, so browser gates ran with `WORKBENCH_TEST_TIMEOUT_MS=300000`. This is a new, optional per-test budget; assertions are unchanged.

## Latest: M22 declarative studies accepted

M22 passed its parent gate: `node tools/run-m22-parent.mjs` → `evidence/M22/full`. Studies (Analysis › Run study…, or `workbench-cli study`) are strict JSON-pointer sweeps applied to the validated open project, exactly like manual edits. They are budgeted (50 variants, 100 steps per variant, 1000 per study, sharing the analysis time limit) and cancellable from the toolbar. Every failure names its variant, step, path and stage. The new Study results tab shows observed values, ratios and full hashes. The HTML report embeds the study document with its replay identity (study digest, base model hash, solver build). The CLI replays byte for byte.

GPU-readiness flakes (TEST-GPU-INIT-FLAKE-03): viewport assertions in model-visibility and native-steel-design now wait for `#gpu-status` to report WEBGPU.

## Latest: M14 modal analysis accepted

M14 (dynamics-v1) passed its parent gate: `node tools/run-m14-parent.mjs` → `evidence/M14/full/gate-M14.json` and `ACCEPTANCE.md`. Projects (schema 1.4.0; 1.3.0 migrates by version) declare mass sources — self mass, a load case's gravity loads ÷ g, or nodal masses — under Model → Mass sources…, the explorer, or the Modal tab. Nothing is implied and self mass is never counted twice. The Modal tab runs consistent or lumped mass with a chosen mesh and mode count and lists frequencies, periods and effective-mass ratios with cumulative totals. It states per direction whether the participation target is met and how much mass sits in omitted modes, draws any mode (violet, shape only), and exports a vibration report (HTML, exact SI, mode-shape elevations) and the run JSON. The solver is the stability-v1 subspace iteration with a Sturm check on K + λ(−M).

Validated against `fixtures/dynamics/modal-oracle.json`: closed-form SDOF, cantilever, simply supported, axial and torsional bars and a two-storey shear frame, plus OpenSeesPy 3.4.0 for a spatial frame (lumped) and a planar portal (consistent) at 1e-6. The oracle's axial gate moved from 16 to 32 elements, tolerance unchanged, because (kh)²/24 made the original unattainable. This is recorded in the formulation. Mechanisms, releases, no mass and negative mass are refused. A frequency is never a floor-vibration or serviceability verdict. Response spectra and harmonic response are M15.

## Latest: M09 stability accepted

M09 (stability-v1) passed its parent gate: `node tools/run-m09-parent.mjs` → `evidence/M09/full/gate-M09.json` and `ACCEPTANCE.md`. The Stability results tab runs elastic buckling or second-order P-Δ-δ analysis on one case or combination, draws buckling modes (violet, normalised) or the second-order shape (teal, at the deformation scale, overlaying the first-order shape), compares first- and second-order sway, and puts the run in the calculation record. Over-critical loads fail with no numbers. A critical factor is never a member resistance or code verdict. Torsional/lateral-torsional modes, large displacement and member end releases stay excluded.

The two batch flakes of TEST-BATCH-FLAKE-02 were test races, now fixed: `#workspace[aria-busy]` announces running commands (and gives tests a completion signal), and the spatial-crossing loop waits for each import's own hash. Full batch: 108/109. `model-visibility.spec.js:6` failed once with WebGPU still initialising under load and passed alone (TEST-GPU-INIT-FLAKE-03, open).

Next: M14 modal analysis. Formulation `docs/formulations/modal.md`, ADR 0018.

## Latest: refreshed validation and Preview 10

Current source `90067de` passed 112 real AMD GPU browser tests and the complete native/WASM/oracle corpus. Default release evidence is fresh; the only release-verifier issue is the unimplemented remaining milestone gates. See `evidence/revalidation/README.md` and `evidence/revalidation/release-current/`. Preserve engineering STALE semantics. UK Eurocode/NA concrete resources and physical detailing remain blocked.

## Latest: stair widths in analytical line view

UKR01-v2 already contains both returning flights per storey. The user screenshot revealed that a single centreline per wide flight looked like a missing side. The analytical view now draws Rust-generated thin outlines of both stair sides and landing strips, with a legend separating physical width from analytical beams. Model geometry, loads and numerical results are unchanged. Evidence: `evidence/stair-outlines/`.

## Latest: member and support label visibility

Viewport controls now include **Support labels** (show/hide) and **Member labels: Auto / Show all / Hide**. Auto preserves the existing large-model selection rule; Show all deliberately overrides the member label budget. Hiding labels leaves support/member geometry and analysis unchanged. Preferences apply during the session across camera changes. Focused regression and visible-browser evidence: `evidence/support-labels/`.

## Latest: spatial crossing diagnostic correction

Rust now flags only nonparallel finite centreline contacts within the existing model merge tolerance. Members that merely overlap in a camera projection do not warn. True intersections remain visible in edge-on views. Shared endpoint IDs are already connected. This is diagnostic only; no automatic topology or analysis mutation. ADR 0011 records the explicit correction to the former projection-only contract. Evidence and reproduction: `evidence/spatial-crossings/`.

Verified: 87 native tests, 3 contracts, 4 browser journeys and visible Chrome/AMD checks in XZ, XY and 3D with crossing display ON. Final gate: `evidence/spatial-crossings/crossing-gate.json`. Build `c44002e98713992462db5bb59ae655efc809e57e5ebf9f5846e1829e15fff0e3`.

## Latest: stair landing correction (UKR01-v2)

V1 lacked a proper floor landing at the start of each storey. Corrected to returning flights with 4 x 1.5 m floor and intermediate platforms. `docs/design/stair-landing-audit.md` records the actual defect, new connected geometry, changed quantities and remaining finished-level/offset/headroom/detailing limitations. New worked examples produce v2; saved v1 projects are preserved. Latest downloadable model/report/plan and gate: `evidence/stair-landings/`. Build `c0012b5fc75712da60552daf122cad362bce2f0e00606179b925115d9d24caef`.

V2: 447 nodes, 642 analytical members, 212 physical objects; 86 native tests, 3 contracts, one full browser journey, eight independent native/WASM/OpenSees comparisons (105,696 assertions), visible Chrome/AMD 3D inspection. This verifies nominal circulation and the preliminary strip/frame load path only. Physical beam offsets, finished levels, headroom and guarding are explicitly still unverified; do not claim complete stair/code acceptance.

## Latest user reference: UKR01 (2026-09-26)

User requested a four-storey concrete residential 3D frame with slabs, stairs, flat roof, pad footings and firm ground; specified British. Open Worked examples → **UK residential · four storeys**. Rust generator and eight actual load cases/combination analyses are locally verified. Trial dimensions/loads/ground inputs are synthetic; concrete resistance remains UNSUPPORTED and contact INDETERMINATE. This is a usable preliminary reference, **not completed construction design**. See `docs/design/uk-residential-reference.md`, downloadable `evidence/residential-reference/UKR01-generated.json`, `residential-review.html` and exact demand JSON. Final gate `evidence/residential-reference/reference-gate.json` records tests/hashes.

Next numerical design work needs the agreed British code edition and UK NA resource package, validated concrete examples, site wind/snow and ground investigation. Do not reclassify this model's linear solver convergence as design acceptance. Ground floor is suspended; floors are connected one-way strips, not shells or rigid diaphragms. Gross centreline self weight includes junction/slab-beam overlap, and all construction checks are still listed in the review. Viewer toggles for solid geometry, load glyphs and projected crossings are reversible; opening UKR01 starts with clear solid geometry and SLS selected.

# Structural Workbench handoff

Read `AGENTS.md`, the repository skills, and root `delivery/state.json` for current priority.

## Authoritative structure synchronization (2026-09-26)

Commit `616ccba`: schema 1.1 replaces coordinate-derived hierarchy with saved Rust-owned storeys, physical members/roles, grids, layers/groups, joints, support details and concrete object bindings. Refer to ADR 0010. Imports of 0.9/1.0 migrate with original-byte backup and explicit unassigned roles. The inspector edits real graph records; topology commands synchronize ownership and membership atomically. Connection hardware and concrete previews remain explicitly unverified/not designed.

Verification: 83 native tests, 3 contracts, 33 native and 33 WASM signed analytical checks, 17 browser journeys, plus visible Chrome/macOS AMD computer use passed. Hash-bound evidence: `evidence/structure-model/structure-gate.json`. Build `f8d2dfe1e71515de140c89bfddf09fd4307b57ef07a5066635893354dba06671`. Earlier Explorer screenshots below describe the superseded derived hierarchy. Organization-only changes preserve current analysis; snapshots and steel runs include exact structure provenance.

## 3D joint/support correction (2026-09-26)

Commit `e997900` improves fixed/pinned/roller support bodies, beam-to-column envelope fitting and camera-depth occlusion. Actual analytical endpoints, lengths and restraint masks are unchanged. Evidence: `evidence/connections-3d/connections-gate.json`; 10 geometry/symbol tests and 10 browser journeys passed, with visible Chrome/macOS AMD inspection. These are illustrative support/connection views, not verified hardware or foundation designs. Build `c0acbed940ccc40c2263b1d928f708e546d45de48958e9e2eb29f7ff4caf8481`.

## Explorer correction and open mockup gaps (2026-09-26)

Commit `c5f22d9` adds searchable, collapsible model hierarchy with elevation/orientation groups, physical lineage, concrete draft categories and definition editors. It also synchronizes the steel heading with readable member labels. All 12 browser journeys passed; visible Chrome/macOS AMD evidence is in `evidence/explorer-fidelity/explorer-gate.json`. Build `0dd9dc2bf59fe7501edfdd21ef8ea8243922e56b90ad87444238a2d2b868c3d1`.

The earlier layout-match claim was too broad. Read `docs/design/mockup-gap-audit.md` before continuing. Authored storeys/layers, full design toolbar, whole-model overview, full catalogue drawer, studies and richer concrete detailing are still incomplete. Derived hierarchy is navigation only. Do not claim full mockup acceptance.

## Visual correction (2026-09-26)

User feedback identified a substantial mockup mismatch in the initial workflow UI. Commit `2989fb7` corrects the shell density, grouped inspectors, WebGPU design geometry and structured results/detail/reinforcement panes. See `docs/design/design-fidelity-correction.md` and `evidence/design-fidelity/fidelity-gate.json`. All 12 affected browser journeys, 3 contracts and 2 member-end display checks passed; visible Chrome/macOS AMD screens were compared and recorded. Source `fb4c81474d6160572535919e921a793a1ce23c95ec2b922f0c7f10c270b94445`; build `4f0a7afefc990c3ef47ddb5e4db6d3b55b77649a1bfbf6520ebfad187e39efff`. This supersedes earlier screenshots for visual presentation only. Numerical scope, unsupported concrete checks and queued M07-G features remain unchanged.

## Prior workflow state (2026-09-26)

M00–M07 remain accepted at their existing bounded scope. M07-E and M07-F now deliver model-native steel catalogue/material binding, source-labelled assumptions/readiness, direct Rust/WASM checks of real model stations, richer immutable provenance, and the current Selection Inspector / Results drawer workflow.

Verification: `npm run verify:design-workspace`. Evidence: `evidence/M07/native-inputs/`. The same-build automated gate passed; visible Chrome showed PASS at governing station 0/F2-1 on macOS AMD WebGPU. See ADR 0009 for exact bounded scope. No LTB, serviceability, second-order or general full-code compliance expansion.

RC beam, slab and pad footing workflow previews are implemented and locally verified in `b6e0bc1`. Persisted Rust-owned drafts, field-level synthetic/user provenance, exact model-action capture for beam/footing, slab synthetic actions, illustrative geometry, stale/cancel/undo, JSON/RC preference CSV exports and project reopen work in the existing shell. Every concrete check remains UNSUPPORTED; footing contact remains INDETERMINATE. No concrete code profile or verified construction details are emitted.

Final preview gate: `evidence/design-previews/preview-gate.json`; reproduction: `docs/design/concrete-preview-validation.md`. 79 native tests, 6 JS checks, 33 native and 33 WASM analytical checks, 11 browser journeys, plus visible Chrome/macOS AMD WebGPU screenshots for all three previews. Build `2e477a37d918aa52701cb33c07fdba6b93651d0aa6cbd2c6cd156c24863b77c3`; source `a72948aea25f23b645497ef93d848ce0675870214d3e5db567cc28c3d0a4f212`.

Next: M07-G whole-model overview/catalogue-study remains queued. M08/M10/M11 numerical parents remain blocked as applicable; obtain locked concrete resources and validate resistance/plate/contact families before enabling real design. The user authorized mock workflow previews before those numerical gates; ADR 0009 records the distinction. No Windows/Linux real-GPU acceptance is claimed.

Work directly on main in small coherent commits. Preview: `npm run preview` after a complete build. Do not edit sources while building or validating an evidence snapshot.
