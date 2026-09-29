# ADR 0017 — Elastic buckling and second-order analysis as separate analysis types (M09, stability-v1)

## Status

Accepted for M09-A (2026-09-28). Formulation: `docs/formulations/stability.md`.

## Context

M09 asks for geometric stiffness, iterative second-order analysis with a
convergence record, and eigen-buckling, with explicit imperfections and load
sequencing, and no superposition of nonlinear cases. The existing kernel solves
one linear case or combination with a sparse LDLᵗ factor and recovers actions
from mechanics-v1 elements. Several choices shape everything after M09-A and
must be fixed before any kernel result exists.

## Decision

1. **Two new analysis types**, `elasticBuckling` and `secondOrder`, beside
   `linearStatic`. Each takes exactly one load case or explicit combination,
   formed on loads before solving. Envelopes are rejected as inputs. A
   second-order result is never superposed, scaled or combined with another.
2. **Consistent geometric stiffness, flexural only.** Cubic Hermite K_G with
   constant element axial force. Torsional and warping terms are zero, so
   torsional, flexural-torsional and lateral-torsional instability are out of
   scope and every result discloses `FLEXURAL_ONLY`. A Saint Venant-only
   Wagner term would report spurious low torsional modes for open sections.
3. **Mesh refinement is a recorded setting.** `subdivisions` (1–32, default 8)
   splits every analytical member for stability analyses only, maps results
   back onto physical members and enters the settings hash.
4. **Buckling by subspace iteration with a Sturm check.** The eigenproblem
   reuses the existing sparse LDLᵗ of K_ff, needing no dense eigen library over
   the full model. A factor of K + σK_G checks that no positive mode below the
   highest reported one was missed; a mismatch withholds the result.
   Negative factors are never reported as critical factors.
5. **Second-order by Picard iteration on axial forces** with proportional
   loading. A non-positive pivot of K + K_G is reported as
   `TANGENT_NOT_POSITIVE_DEFINITE`, and divergence or the iteration limit as
   `NONCONVERGED`. Failed analyses carry no response buffers.
6. **Imperfections are explicit** (`none` or a stated sway ratio and
   direction, converted to listed equivalent nodal forces). No design code's
   imperfection rules are interpreted.
7. **Member end releases are rejected** in both stability analyses for
   stability-v1 (`STABILITY_RELEASES_UNSUPPORTED`). Condensing K + λK_G makes
   the eigenproblem λ-dependent. Hinges as independent rotational DOFs are a
   later slice, not an approximation now.
8. **References.** Closed-form Euler loads, the beam-column characteristic
   equation for the portal sway mode, and the exact small-rotation beam-column
   solution for the laterally loaded portal. OpenSees `PDelta` with Richardson
   extrapolation independently checks that solution; OpenSees `Corotational`
   is recorded only as a large-rotation cross-check. The tolerances in the
   formulation are fixed before candidate output.

## Consequences

- A critical factor is an elastic load multiplier of the idealised model. The
  UI, report and protocol state that it is not a member resistance or a code
  stability verdict, and M07's declared first-order/effective-length basis is
  unchanged by M09 alone.
- Models with moment releases cannot run stability analyses until hinge DOFs
  exist. That is disclosed, not approximated.
- The near-critical tolerance (1e-2 at 0.99 λ_cr) reflects the r/(1 − r)
  magnification of discretisation error, not a relaxed accuracy target;
  other ratios keep 1e-3, and buckling factors keep 1e-4.

## Amendment (2026-09-29): hinge DOFs for elastic buckling

Decision 7 is superseded for `elasticBuckling`: each released My/Mz member end
rotation is an independent free DOF, and the element's end rotation is the
node's plus that DOF along the released local axis. Verified by a fixed strut
with both ends released reproducing the pinned strut to 1e-9 and a portal with
a pinned beam buckling at π²EI/(4h²) per column within 1e-4. `secondOrder`
keeps rejecting releases until its end-action recovery includes hinge DOFs.

Second amendment (2026-09-29): `secondOrder` also carries hinge DOFs. A
fixed-base portal with a pinned beam at 0.5 of its flagpole load sways within
1e-3 of the exact cantilever beam-column (H/2)(tan kh − kh)/(P k), and the
hinges report no moment about the released axis.
