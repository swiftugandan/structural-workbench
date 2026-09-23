# ADR 0007 — Pluggable design-code profiles

## Status

Accepted for M07-A (2026-09-23).

## Context

M07 requires one pinned steel code profile. The product must stay able to add Eurocode, SANS or other packages later without rewriting action transfer, UI or `evaluateDesign`. SPEC §9 already defines profile metadata and fail-closed mandatory checks. AISC 360-22 LRFD is freely downloadable from aisc.org and is the approved first pin (S2: prismatic W T/C/F/V + H1).

## Decision

1. Introduce a Rust `CodeProfile` trait and `ProfileRegistry` in `workbench-design`.
2. Shared types (`DesignDemand`, `MemberContext`, `CheckOutcome`, `DesignRun`) stay code-agnostic.
3. First package is `aisc-360-22-lrfd`, registered always, **enabled only** after `R-CODE-STEEL` + `R-STEEL-EXAMPLES` verify in `resources.lock.json`.
4. `capabilities.designProfiles[]` lists registered profiles with `enabled: false` until the lock; UI must not offer Pass/Fail checks for disabled profiles.
5. Overall status is UNSUPPORTED if any mandatory check is unsupported — including the resource gate.
6. Do not commit AISC PDFs; hash local acquisitions. Clause math waits for M07-B/C.

## Consequences

- Adding a second code is a new module implementing `CodeProfile`, not a fork of the UI.
- M07 remains blocked for acceptance until resources and clause evidence exist; M07-A only ships the skeleton.
- WASM binary includes the AISC stub metadata; clause code grows behind the same crate/module boundary (or a later feature-flagged crate if binary size demands it).
