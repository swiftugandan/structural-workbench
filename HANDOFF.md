# Structural Workbench handoff

Read `AGENTS.md`, the repository skills, and root `delivery/state.json` for current priority.

## Visual correction (2026-09-26)

User feedback identified a substantial mockup mismatch in the initial workflow UI. Commit `2989fb7` corrects the shell density, grouped inspectors, WebGPU design geometry and structured results/detail/reinforcement panes. See `docs/design/design-fidelity-correction.md` and `evidence/design-fidelity/fidelity-gate.json`. All 12 affected browser journeys, 3 contracts and 2 member-end display checks passed; visible Chrome/macOS AMD screens were compared and recorded. Source `fb4c81474d6160572535919e921a793a1ce23c95ec2b922f0c7f10c270b94445`; build `4f0a7afefc990c3ef47ddb5e4db6d3b55b77649a1bfbf6520ebfad187e39efff`. This supersedes earlier screenshots for visual presentation only. Numerical scope, unsupported concrete checks and queued M07-G features remain unchanged.

## Prior workflow state (2026-09-26)

M00–M07 remain accepted at their existing bounded scope. M07-E and M07-F now deliver model-native steel catalogue/material binding, source-labelled assumptions/readiness, direct Rust/WASM checks of real model stations, richer immutable provenance, and the current Selection Inspector / Results drawer workflow.

Verification: `npm run verify:design-workspace`. Evidence: `evidence/M07/native-inputs/`. The same-build automated gate passed; visible Chrome showed PASS at governing station 0/F2-1 on macOS AMD WebGPU. See ADR 0009 for exact bounded scope. No LTB, serviceability, second-order or general full-code compliance expansion.

RC beam, slab and pad footing workflow previews are implemented and locally verified in `b6e0bc1`. Persisted Rust-owned drafts, field-level synthetic/user provenance, exact model-action capture for beam/footing, slab synthetic actions, illustrative geometry, stale/cancel/undo, JSON/RC preference CSV exports and project reopen work in the existing shell. Every concrete check remains UNSUPPORTED; footing contact remains INDETERMINATE. No concrete code profile or verified construction details are emitted.

Final preview gate: `evidence/design-previews/preview-gate.json`; reproduction: `docs/design/concrete-preview-validation.md`. 79 native tests, 6 JS checks, 33 native and 33 WASM analytical checks, 11 browser journeys, plus visible Chrome/macOS AMD WebGPU screenshots for all three previews. Build `2e477a37d918aa52701cb33c07fdba6b93651d0aa6cbd2c6cd156c24863b77c3`; source `a72948aea25f23b645497ef93d848ce0675870214d3e5db567cc28c3d0a4f212`.

Next: M07-G whole-model overview/catalogue-study remains queued. M08/M10/M11 numerical parents remain blocked as applicable; obtain locked concrete resources and validate resistance/plate/contact families before enabling real design. The user authorized mock workflow previews before those numerical gates; ADR 0009 records the distinction. No Windows/Linux real-GPU acceptance is claimed.

Work directly on main in small coherent commits. Preview: `npm run preview` after a complete build. Do not edit sources while building or validating an evidence snapshot.
