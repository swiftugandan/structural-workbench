---
name: prokon-numerical
description: >
  Numerical truth, formulation dossiers and independent oracles for Structural Workbench.
  Use before implementing or changing any solver, element, load, recovery or design-check family.
---

# Numerical truth and review

## Formulation dossier (before or with implementation)

Record for each numerical family:

- Assumptions and supported domain
- Exact DOFs, axes, units, signs
- Equations and derivation
- Load integration; restraints/releases
- Recovery; conditioning and failure diagnostics
- Analytical references; independent oracle setup
- Property tests; target tolerances
- Limitations and report text

Use the specification's conventions, including element nodal actions vs internal section actions.

For a code rule also record: exact standard/edition/clause; applicability predicate; coefficients and provenance; branch table; all intermediate quantities; mandatory companion checks; examples; unsupported conditions; code-profile version. Incomplete mandatory companion checks cannot produce overall pass.

## Independence

Keep expected-result generation independent of candidate assembly, conversion and design code. Reusing the same implementation in a test harness is not an independent oracle. Separate review agents help, but role separation does not compensate for shared erroneous formulas.

## Change checklist

For each change that can affect numerical output, check relevant analytical fixtures, units, axis transforms, global equilibrium, residuals, conditioning and native/WASM agreement. Add targeted tests for the actual risk.

- Distributed loads: consistent loading, release condensation of the load vector, interior displacement recovery
- Design checks: signs and individual points — not only unsigned maxima that could hide an axis error

## Forbidden shortcuts

Never:

- Add artificial stiffness to conceal a mechanism
- Use pseudoinversion to pass an unstable model
- Round before comparing
- Coerce nonfinite results into zeros
- Average disagreeing solvers
- Loosen tolerances after seeing a failure

If independent references disagree: reconcile assumptions, minimise the model, keep the affected capability blocked until understood.

Every numerical result must reference source model, settings and solver build. Every design check must identify the governing real action set and supported code profile. A missing mandatory check prevents an overall pass. An envelope from independent maxima is not a simultaneous force vector.
