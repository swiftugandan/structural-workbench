---
name: prokon-resources
description: >
  External resources, capability ledger and blocker handling for Structural Workbench.
  Use when a standard, GPU runner, oracle or licensed comparison is missing or when updating capabilities.json.
---

# Resources and capability states

## Resource acquisition

Use `resources.required.json` for external dependencies. Create `resources.lock.json` only from actual acquisitions, recording: authoritative origin, exact edition/version, content hash, rights status, validation use, retrieval date and local evidence path.

States: available, unavailable, prohibited-to-redistribute — keep them separate. Do not invent values for inaccessible sources. Do not place copyrighted source material in a public repository unless rights permit; tests may reference private CI-mounted resources by hash. No project secrets in the lock file.

Do not treat search snippets or product marketing as design formulas. Read authoritative sources and record a formulation dossier (`skills/prokon-numerical`). Use official language/library docs for platform constraints. If a source changes, update the research lock through a deliberate task; ongoing builds use the pinned version.

## Blocker scope

- Missing standards or independent examples → block the relevant code package, not unrelated analysis work
- Missing real-GPU runner → block that hardware gate; software-GPU correctness ≠ hardware performance evidence
- Missing licensed PROKON outputs → commercial numerical equivalence stays `UNKNOWN`

## Capability ledger

Maintain `capabilities.json` with separate implementation and evidence dimensions:

- capability ID, scope key
- implementation status, verification status, comparison status
- resource blockers, limitations, evidence references

Scope keys include formulation, material/section domain, code edition/amendment/annex, platform and exchange format. Do not collapse into an unqualified "supported" flag.

Select enabled features from this ledger. Unsupported or incomplete engineering domains must fail predictably; a feature flag may not conceal that a mandatory MVP requirement remains unfinished. When code resources are available, implement and validate actual clause-level rules rather than continuing indefinitely with a mechanics approximation.

Shipped, experimental, blocked and excluded are distinct. An experimental module cannot satisfy a shipped mandatory capability.
