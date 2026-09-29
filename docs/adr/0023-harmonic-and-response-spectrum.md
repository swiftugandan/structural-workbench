# ADR 0023 — Harmonic and response-spectrum analysis before a seismic code profile (M15, response-v1)

## Status

Accepted for M15-A (2026-09-29). Formulation: `docs/formulations/response.md`.

## Context

M15 asks for seismic and harmonic response. The seismic part is normally
driven by a code spectrum and its combination rules (EN 1998-1 with the UK
NA). Those are not held (R-SEISMIC-CODE). The dynamic mechanics underneath
are code-agnostic: steady-state response to a harmonic load, and modal
response to a spectrum the engineer supplies. dynamics-v1 (M14) already
gives the mesh, the declared mass and the modes.

## Decision

1. **Mechanics first, gated on its own.** response-v1 implements harmonic
   response and response-spectrum analysis. It is validated against closed
   forms and OpenSees, and gated separately. The M15 parent stays blocked on
   R-SEISMIC-CODE: code spectra, behaviour factors, accidental torsion and
   directional combination rules are not provided.
2. **Harmonic response is a direct complex solve, not modal truncation.**
   With Rayleigh damping and a₁ > 0, Z = (1 + iΩa₁)K − (Ω² − iΩa₀)M has a
   positive-definite imaginary part. An unpivoted complex LDLᵀ therefore
   exists at every frequency, resonance included, and the answer is exact
   for the discretised model. The kernel gets its own sparse complex LDLᵀ
   (the existing factor is real-only). It uses the elimination tree and
   up-looking numeric factorisation behind an RCM ordering, and has a
   residual check. Mass-proportional-only damping (a₁ = 0) is refused
   because M may be singular on rotational DOFs.
3. **Spectra are project data (schema 1.6.0).** `responseSpectra[]` holds a
   point table (T, Sa), a damping ratio and a reference. The table starts at
   T = 0, and is linear between points with no extrapolation beyond the
   last. It is edited by commands, persisted and migrated. It is always the
   user's input, never a code value.
4. **One direction per spectrum run, SRSS or CQC.** The modal responses of
   every quantity are combined; results are non-negative peak magnitudes and
   are labelled as such. No missing-mass correction is applied. The
   cumulative participation and the omitted mass are reported against the
   target.
5. **Harmonic results are displacements and reactions.** Complex nodal
   displacements and support reactions are reported at each frequency.
   Member actions under harmonic load are a later slice.

## Consequences

- Engineers can study resonance, frequency-response functions and peak
  modal response to their own spectrum. No code seismic check is claimed.
- When R-SEISMIC-CODE is held, a code profile generates the spectrum from
  code parameters into the same `responseSpectra` table, and adds
  directional combination and accidental eccentricity. The mechanics do not
  change.
