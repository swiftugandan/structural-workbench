# ADR 0012 — Split M08 into concrete mechanics and a code profile

## Status

Accepted for M08-A (2026-09-28).

## Context

The user confirmed Eurocodes with UK National Annexes as the concrete basis (UKR01). On 2026-09-28 only the UK National Annex at AMD 1:2009 could be locked (R-EC2-UK-NA-2009). The EN 1992-1-1 clause text, A1:2014 and NA+A2:2014 have no lawful source yet. R-CODE-CONCRETE, R-CONCRETE-EXAMPLES and R-DETAILING therefore remain unresolved.

Most of an RC beam journey needs only mechanics and geometry, not clause text. That includes section equilibrium, strain compatibility, cracked/uncracked elastic properties, bar-layer geometry and fit, action transfer, persistence and reporting. The task-loop rule "standard text/example unavailable → ship independent mechanics if its gates pass" applies.

## Decision

1. **M08-A — concrete mechanics (unblocked).** Code-agnostic Rust mechanics lives in `workbench-design::rc_section`. Every material parameter is an explicit input: stress-block shape, intensity, ultimate strain, steel yield/modulus and concrete modulus/tensile strength. The kernel contains **no code coefficients**, so no partial factors, no λ/η/εcu defaults and no minimum spacing rules. Results are labelled *mechanics*, never PASS/FAIL. Expected values come from an independent Python oracle (`tools/oracles/rc_section_oracle.py`) that integrates the stress field numerically and never imports the Rust formulation.
2. **M08-B — code profile (BLOCKED_RESOURCE).** A future `CodeProfile` module supplies code parameters and clause checks to the M08-A kernel, following ADR 0007. The candidate pin is BS EN 1992-1-1:2004+A1:2014 with NA+A2:2014; `SOURCES.md` still names ACI 318-19 as the default proposal, and UKR01 records the user's Eurocode choice. It covers design strengths, minimum/maximum reinforcement, shear, anchorage, spacing rules and serviceability limits. It stays disabled until the clause text, amendments and independent examples lock.
3. **M08 acceptance is unchanged.** M08 is accepted only when M08-B passes with the full journey in `SPECIFICATION.md#m08`. An M08-A result must never let the UI or a report show complete-design PASS. The existing rcBeam preview keeps its code checks `unsupported`.

## Consequences

- Most of the M08 kernel, fixtures and UI plumbing can proceed now. When the resources arrive, only M08-B's clause layer and example reconciliation remain.
- Adding the profile means mapping code parameters into the kernel inputs, with no change to the mechanics.
- Risk: users may read mechanics outputs as a design capacity. Mitigations are mandatory labelling, a disabled overall status and the absence of any code defaults.
