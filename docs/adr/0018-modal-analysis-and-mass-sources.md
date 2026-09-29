# ADR 0018 — Modal analysis and declared mass sources (M14, dynamics-v1)

## Status

Accepted for M14-A (2026-09-29). Formulation: `docs/formulations/modal.md`.

## Context

M14 asks for mass sources on a frame, a documented mass matrix, mass-source
deduplication, a generalised eigen solve, rigid-mode treatment, mode
extraction controls, and modal frequencies, shapes and participation factors
in an exportable vibration report. Response spectra are M15. The kernel
already has a verified block subspace iteration with a Sturm check for
(K + λK_G)φ = 0 (stability-v1), the M02-P point-load expansion and the
stability mesh. Mass must survive save and reopen, so it is project data.

## Decision

1. **A separate `modal` analysis type** on the `analyse` job. It takes no load
   case or combination (`INVALID_LOAD` otherwise) and a strict `modal` settings
   object: `modes` 1–50 (default 12), `massMatrix` `consistent` (default) or
   `lumped`, `subdivisions` 1–32 (default 8), `participationTarget` (0, 1]
   (default 0.9). Settings enter the settings hash.
2. **Mass is declared, never implied.** Project schema 1.4.0 adds optional
   `massSources`: `selfMass`, `loadCase` (gravity component of a case's loads
   ÷ g) and `nodalMass`. Absent means empty, so 1.3.0 projects migrate by
   version only and keep their engineering content. A model with no mass is
   `NO_MASS`. Editing mass sources is an ordinary revision-aware command
   (`SetMassSource`, `DeleteEntities`) with undo, and changes the model hash,
   so modal results go stale like any other result.
3. **Deduplication rules are fixed:** one `selfMass` source at most; with it,
   self-weight loads inside load-case sources are skipped and reported; one
   source per load case; one nodal mass per node. Negative mass (loads opposing
   gravity) is refused; horizontal components and moments carry no mass and
   are reported.
4. **Consistent mass by default, lumped as an option.** Consistent matches the
   stiffness interpolation and converges from above; lumped is offered because
   commercial frame programs commonly use it; its frequencies are not bounds and
   are compared only on the same mesh. Rotary
   bending inertia is neglected (Euler–Bernoulli); polar mass is included in
   the consistent matrix.
5. **One eigen-solver.** K φ = ω²Mφ is solved as (K + λ(−M))φ = 0 by the
   stability-v1 subspace iteration and Sturm check. No second eigen-solver is
   introduced; massless DOFs of the lumped matrix are the solver's null
   directions and are never reported.
6. **Rigid modes are refused, not computed.** K must be positive definite on
   the free DOFs; mechanisms are `UNSTABLE_MODEL`, as in linear analysis.
7. **Participation targets never extend the extraction silently.** The result
   states, per global translation, the cumulative effective-mass ratio,
   whether the target is met, and the mass in omitted modes.
8. **Releases are rejected** (`MODAL_RELEASES_UNSUPPORTED`) until hinge DOFs
   exist, for the same reason as stability-v1.
9. **An independent oracle is fixed before any kernel result:** closed-form
   SDOF, cantilever, simply supported, axial and torsional bars, a two-storey
   shear frame, and an OpenSees cross-check of a spatial frame
   (`fixtures/dynamics/modal-oracle.json`).

## Consequences

- Schema 1.4.0 and a 1.3.0 → 1.4.0 migration step; older imports report it.
- A modal frequency or participation ratio is not a serviceability or
  code vibration verdict (no floor-vibration acceptance criteria, no response
  factor). The UI, report and ledger say so.
- Frames with pinned member ends cannot run modal analysis until the shared
  hinge-DOF slice lands.

## Amendment (2026-09-29): hinge DOFs

Decision 8 is superseded: modal analysis uses the stability-v1 hinge DOFs for
My/Mz end releases. A fixed bar with released ends reproduces the simply
supported (nπ)² frequencies (D-SS) and a portal with a pinned beam sways at
√(2·3EI/h³ / 2m) within 1e-5.
