# ADR 0034 — Project name and a neutral reference suite

## Status

Accepted (2026-10-08). Naming and wording only. No engineering behaviour,
protocol semantics, tolerance or acceptance meaning changes.

## Context

The repository carried a commercial vendor's product name in three roles:

1. Project identity: the agent skill prefix (`skills/<name>-*`), a design
   mockup's title and brand, and absolute checkout paths captured in evidence.
2. The comparison target: "parity with <vendor>", the licensed-corpus
   resource ID, the vendor's product-page URLs and its module names in the
   spec, roadmap and sources.
3. Disclaimers shipped in the capability ledger, acceptance records and UI
   ("Commercial <vendor> parity remains UNKNOWN", "DWG/native <vendor>
   formats").

The project should not carry another company's mark.

## Decision

- The project is named **Gusset**. Skills are `skills/gusset-*`.
- The comparison target is the **reference suite**: one versioned commercial
  structural suite, identified in the specification only as S01–S04 in
  `SOURCES.md`. Vendor URLs and product-module names are not reproduced.
- Disclaimers name commercial solvers generically: "Commercial-solver parity
  remains UNKNOWN", "DWG/proprietary commercial formats". The resource ID is
  `R-COMMERCIAL-LICENSED-CORPUS`.

Every parity rule keeps its meaning. Numerical equivalence stays UNKNOWN
without a licensed, versioned comparison corpus. A disclaimer that names no
vendor covers every commercial solver, which is at least as strong as before.

## Consequences

- Evidence recorded before this ADR was rewritten in place. Only checkout
  paths and the product-name strings above changed, with no numerical content.
  Its `artifactHashes` were **not** recomputed: they still bind the bytes the
  gate actually produced. For pre-rename artifacts that contain those strings,
  the recorded hash no longer matches the file until the owning gate runs
  again. No tool re-verifies `artifactHashes` today. A future verifier must
  treat a mismatch on a pre-0034 record as stale binding, not as a numerical
  regression.
- The S01–S04 citations lost their URLs. Re-establishing the inventory
  baseline (M23, `R-FULL-INVENTORY`) needs fresh primary-source retrieval
  anyway.
- Git history before this ADR still contains the old name.
