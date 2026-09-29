# ADR 0021 — Slab panel plate analysis before a slab code profile (M10, plate-v1)

## Status

Accepted for M10-A (2026-09-29). Formulation: `docs/formulations/plate.md`.

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

## Consequences

- The slab preview can report real, converged plate actions and design
  moments while every code check remains UNSUPPORTED.
- Frame–slab connection, column point supports and irregular boundaries are
  later slices.
