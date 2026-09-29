# ADR 0021 — Slab panel plate analysis before a slab code profile (M10, plate-v1)

## Status

Accepted for M10-A (2026-09-29); M10-B kernel and M10-C integration the
same day. Formulation: `docs/formulations/plate.md`.

## Context

M10 asks for a slab boundary with an opening, a mesh, pressure, converged
plate actions and a restricted reinforcement map under one code profile, with
its own benchmark gate. M10 depends on M08, whose concrete code profile is
blocked until EN 1992-1-1 A1:2014 and the UK NA + A2:2014 are held. The slab
preview draft today shows synthetic plate actions only.

## Decision

1. **The numerical family comes first and is gated on its own.** plate-v1
   (flat shell: bilinear membrane + MITC4 plate) is implemented, validated
   against Navier series, published clamped-plate coefficients and OpenSees
   ShellMITC4 on identical meshes, and exposed through the slab draft.
2. **Structured rectilinear meshing.** Panel and one rectangular opening; grid
   lines through every edge. Distortion is tested at element level (patch
   tests), not produced by the mesher.
3. **Unsmoothed element-centre actions are the design and validation values;**
   smoothed nodal values are display only and labelled so.
4. **Wood–Armer design moments are mechanics,** reported per element for top
   and bottom in X and Y. Reinforcement areas, punching and detailing stay
   UNSUPPORTED until a slab code profile exists; the M10 parent stays blocked.
5. **Schema 1.5.0** gives slab drafts an optional `plate` object (pressure,
   E, ν, edge conditions, opening position) with field provenance; absent
   means the plate analysis is not configured.

6. **The slab draft solves its own panel.** Slabs gain the action source
   `plate` (the default in the UI). The draft's length, width, thickness,
   target mesh size and opening size, plus the `plate` inputs, define the
   panel. The frame model is never a slab action source; frame–slab coupling
   is a later slice.
7. **Analysis stages are results, not checks.** "Plate/shell solution",
   "Mesh convergence" and "Design action transformation" leave the slab check
   list and are reported under `plateAnalysis`. The check list holds only the
   code checks (top and bottom reinforcement, minimum/maximum reinforcement,
   punching, deflection), which stay UNSUPPORTED.
8. **Clamped-edge moments come from reactions.** Element-centre values sit
   h/2 inside a support, where the moment gradient is steep. The support line
   moment is the consistent reaction moment over the tributary edge length,
   which includes the shear term by virtual work. It is gated against
   Timoshenko's edge-mid coefficient (−0.05122 against −0.0513 at 32 × 32).
9. **Mesh-convergence indicator limit 5 %.** This is a display
   classification (`withinLimit`), not an acceptance gate. Free-edged openings
   have singular re-entrant corners, so the indicator stays above the limit
   there by design. That is reported, not suppressed.

## Consequences

- The slab preview can report real, converged plate actions and design
  moments while every code check remains UNSUPPORTED.
- Frame–slab connection, column point supports and irregular boundaries are
  later slices.
