# ADR 0024 — Lateral-torsional bracing points and segment Cb

## Status

Accepted (2026-09-29). Extends ADR 0019 (flexure: LTB and flange local
buckling, with Cb entered or derived by F1-1).

## Context

Cb could be derived from a member's own moment diagram only when the whole
member was the unbraced segment (Lb = member length). A beam braced at
intermediate points had to be modelled as several members, or given one
entered Lb and Cb, which misses the segment-by-segment nature of Spec F2
with F1-1.

## Decision

1. **Bracing points are design data.** A steel design with bracing
   `points` carries `bracingPoints`: 1–20 increasing stations strictly
   inside (0, 1), at which the compression flange is braced and twist is
   prevented. Lb is then derived: it is `{value: null, source: "derived"}`
   and is allowed only with points. Schema 1.6.0 adds the field; 1.5.0 files
   cannot carry it.
2. **Every segment is checked on its own.** The segments run between the
   member ends and the bracing points. Each takes Lb = its length × member
   length, and Cb either as entered (the same for all segments) or derived.
   A derived Cb comes from F1-1 over that segment:
   - Mmax is taken over the samples, key stations and exact quarter points
     inside the segment.
   - MA, MB, MC are the exact |Mz| at its quarter points. Where a quarter
     point falls on a point load, the larger side is used.
   - A segment ending at an unbraced free end takes Cb = 1.0 (Spec F1).
3. **Exact station actions.** `workbench_assembly::member_actions_at` gives
   the closed-form section actions of a member at any station, from each
   analysis piece's end actions and uniform load, so quarter points need no
   interpolation.
4. **Stations on a bracing point are checked against both segments.** Every
   station check records its segment. The governing check is the worst over
   all segments, and `bracingSegments` lists each segment's Lb, Cb and
   derivation.

## Consequences

- A beam braced at its thirds is designed as one member. Example F.1-2B as
  one member reproduces the three-member model's Cb (1.46, 1.01, 1.46) and
  resistance to 1e-9.
- Bracing that does not prevent twist, and bracing of the tension flange
  only, are the user's responsibility to exclude from the points.
