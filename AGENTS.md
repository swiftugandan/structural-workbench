# Structural Workbench — agent instructions

Harness-agnostic always-on policy. Full historical wording: `docs/agent/archive/`. Load the matching skill under `skills/` when the trigger applies. Do not change numerical contracts, fixtures or tolerances as ordinary feature work.

## Mission

Deliver the specified browser app through working vertical slices: Rust→WASM engineering kernel, WebGPU CAD viewport, plain HTML/JS ES modules/CSS. Success is functioning software with reproducible evidence — not plans, scaffolds, code volume or package-integrity checks alone.

M00–M06 = analysis MVP. M07 steel design. M08 concrete beam. M09–M22 expand. M23 finite verified parity inventory. Do not treat M06 as full PROKON parity. Do not claim standards compliance or commercial equivalence without evidence.

## Sources of truth (priority)

1. Applicable runtime / user / existing repo instructions (highest)
2. Spec package: `SPECIFICATION.md`, `VALIDATION.md`, data/protocol contracts — required behaviour
3. This file + skills — execution
4. `PARITY_ROADMAP.md` / `roadmap.json` — scope ledger and dependencies
5. `SOURCES.md` / `resources.required.json` — research and blockers
6. Fixtures — acceptance seeds, not executed results

Resolve `SPEC_ROOT` as `docs/spec` when `docs/spec/SPECIFICATION.md` exists, otherwise the directory containing the handoff `SPECIFICATION.md`. If neither exists, report the exact miss; do not guess contents.

Document conflicts: reproduce, record, keep the affected gate blocked. Ordinary reversible choices: decide yourself. Behaviour-preserving clarifications → ADR + tests. Scope/tolerance/acceptance meaning changes → concrete amendment with independent evidence; never silent rewrite of the contract.

## Hard invariants (every change)

- Rust owns committed geometry, units, validation, stiffness, combinations, recovery and design. JS may format/preview only.
- Authoritative calc: `f64`. WebGPU `f32` is display (with origin rebasing), never saved engineering truth.
- Browser-static runtime only. No backend solver, WebGL substitute or frontend framework to bypass a failed requirement.
- Pin native/WASM deps and flags; prove browser-target compatibility.
- Stable entity IDs; revision-aware commands; never accept stale analysis as current.
- Atomic mutation; failed import/command leaves prior project recoverable; undo restores specified engineering state.
- Cancel blocking WASM via the specified Worker architecture.
- Preserve project data on GPU/Worker/storage/analysis failure. Blank viewport or zero placeholders are not failure handling.
- Downloadable projects/reports must work without IndexedDB or a network service.

## Evidence bar

Narrative summaries are not proof. Milestone acceptance requires the specified user journey, negative paths, numerical checks, persistence/export and platform gates — with hash-bound evidence from the actual source/build under test. `tools/check_package.py` never proves application or solver correctness. Do not mock the numerical kernel in acceptance journeys. Do not loosen tolerances, coerce nonfinites to zero, average disagreeing solvers or edit goldens solely to pass.

## Autonomy and escalation

Make reversible implementation decisions and continue without routine approval. After three materially different failed repairs on the same unexplained issue: block it, preserve diagnostics, continue independent DAG-ready work. Ask the user only for unresolved product decisions, missing external permission or unobtainable resources — and only after the request is concrete.

## Session start

1. Read this file. Load `skills/prokon-session` and reconstruct from `delivery/state.json`.
2. Pick the earliest dependency-ready unaccepted milestone and its smallest complete task.
3. Load task/numerical/evidence/resource skills as the work requires.
4. If no implementation exists, execute `SPEC_ROOT/agent-tasks/M00.md`.

Compatibility: `Agent.md` and `AGENT_RUNBOOK.md` are shims into this layout. Prefer this file + skills.
