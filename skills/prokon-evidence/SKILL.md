---
name: prokon-evidence
description: >
  Tests, milestone acceptance evidence and release verification for Structural Workbench.
  Use when writing tests, collecting evidence, accepting a milestone or preparing a release.
---

# Tests and acceptance evidence

## Tests must establish the claimed outcome

`tools/check_package.py` checks the specification package and analytical arithmetic only. Its success is never evidence that application implementation, structural analysis or PROKON parity has passed.

Create the application commands required by `VALIDATION.md`. Missing scripts, zero collected tests, skipped mandatory cases, fixture parse failures, absent oracle runtimes or inaccessible required hardware fail or block the affected gate. A shell command that prints PASS is not a verifier. Report test counts and IDs so empty execution is detectable.

Browser acceptance must exercise real controls and actual WASM computations. Do not inject precomputed results, mock the numerical kernel or display fixture answers as solver output in an acceptance journey. Controlled mocks are appropriate for difficult failure injection (e.g. quota denial); label those tests and still exercise genuine storage, GPU and Worker behaviour where required.

Keep assertions linked to acceptance IDs. For the cantilever: change load, length or stiffness to a non-default value and show the calculated response changes correctly. Cross-check report/table/viewport values against typed result buffers. Verify stale-state behaviour after engineering edits and unchanged validity after presentation-only changes.

Use a general Draft 2020-12 JSON schema validator in implementation CI for contracts, in addition to semantic checks. The handoff's portable schema-subset checker is not the production import validator.

Broaden testing when a concrete affected risk or milestone gate requires it. Once verification is sufficient, proceed — do not burn budget on unrelated tests. Required release and numerical gates remain mandatory.

## Acceptance evidence cannot be self-declared

Implement `npm run verify:milestone -- <ID>` and `npm run verify:release` as verifiers that inspect required evidence and return nonzero when missing or failed. They must not mark milestones complete merely because a status file says `ACCEPTED`.

Each evidence record must identify: task/milestone, command arguments, outcome, test IDs/counts, source revision or content hash, dependency locks, build hashes, input fixture hashes, runner/browser/adapter and output artifacts. Reject records from a different build, changed fixture or incompatible environment. Save raw numerical results and failure traces, not only summary screenshots.

A milestone is accepted only when its specification-defined user journey, negative paths, numerical checks, persistence/export, regression gates and required platform/performance evidence are complete. Individual task acceptance ≠ milestone acceptance. Analysis acknowledgement ≠ analysis completion. Passing report-generation ≠ verified design rule.

Source changes invalidate affected evidence. Changing shared element, unit, model, protocol or solver code requires regression of earlier dependent slices. Reuse unchanged evidence only when its dependency/hash relationship is established. Do not alter golden files, required commands or gate logic solely to accept a failing implementation.

## Delivery and release

Keep every milestone runnable and demonstrable. Preserve previous working builds until the next candidate passes.

Before release: build from a clean source checkout or content-addressed snapshot; verify locked dependencies; run accumulated gates; confirm tested and delivered artifact hashes match; emit `release-manifest.json`, `capabilities.json`, known limitations and reproducible run instructions.

Prevent artifact/hash recursion: compute the application source/build digest excluding generated evidence and mutable delivery state; record those exclusions. A final evidence-only commit may follow the tested source commit but must show no application, test-input, dependency or build-script changes. The delivered source snapshot must reproduce the tested application bytes or document bounded nondeterministic build fields separately.

Retain original project files during schema migration. Test service-worker updates against mismatched JS/WASM versions. Provide rollback/recovery for application releases; do not claim an application rollback reverses an incompatible project migration without its saved original.

Continue after an accepted milestone to the next dependency-ready authorised milestone. If all remaining work is blocked, deliver the last working product, all evidence, the exact blocker register and the next resumption action. Do not manufacture a fully green roadmap. Report implemented, verified, compared and blocked scope separately.

## Milestone completion report

State:

- What a user can now do and how to run the actual product
- Delivered source/build identifiers and project/report artifacts
- Required checks executed, outcomes and platform limits
- Numerical and code scope that is verified, unsupported or still blocked
- Capability ledger changes and next ready task

Lead with usable outcomes. Keep routine implementation detail in the evidence bundle. A successful status message must never conceal missing mandatory evidence.

## M00 task shape (reference)

- M00-A: editable cantilever form → Rust model → JSON export (schema + unit fixtures)
- M00-B: form → sparse Rust/WASM solve → result table (B01–B04 + failure diagnostics)
- M00-C: model → WebGPU viewport → selected result probe (adapter-loss handling)
- M00-D: reopen → solve → standalone report + clean reproducible build with evidence

These form one complete M00 product; none is a separate completed MVP. Later tasks: one use case, precise modules, fixture IDs, dependencies, failure cases, commands, output artifacts. Consult `roadmap.json` and the specification. Create detailed M01/M02 tickets after M00 reveals real module boundaries — do not generate thousands of speculative microtasks.
