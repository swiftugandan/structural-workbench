# Structural Workbench handoff

Read `AGENTS.md`, the repository skills, and root `delivery/state.json` for current priority.

## Current state (2026-09-26)

M00–M07 remain accepted at their existing bounded scope. M07-E and M07-F now deliver model-native steel catalogue/material binding, source-labelled assumptions/readiness, direct Rust/WASM checks of real model stations, richer immutable provenance, and the current Selection Inspector / Results drawer workflow.

Verification: `npm run verify:design-workspace`. Evidence: `evidence/M07/native-inputs/`. The same-build automated gate passed; visible Chrome showed PASS at governing station 0/F2-1 on macOS AMD WebGPU. See ADR 0009 for exact bounded scope. No LTB, serviceability, second-order or general full-code compliance expansion.

Next authorized work: RC beam, slab and pad footing workflow previews with conspicuous synthetic provenance, no fabricated code profile or PASS, and persisted Rust-owned draft data. The current user explicitly permits these before engineering resource gates; ADR 0009 records that clarification to ADR 0008. M08/M10/M11 numerical parents remain blocked as applicable. M07-G whole-model/catalogue-study workflows remain a separate queued slice.

Work directly on main in small coherent commits. Preview: `npm run preview` after a complete build. Do not edit sources while building or validating an evidence snapshot.
