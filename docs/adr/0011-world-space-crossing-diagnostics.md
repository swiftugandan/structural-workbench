# ADR 0011 — World-space disconnected crossing diagnostics

2026-09-26. Accepted correction requested by the user.

The old view query labelled projected line crossings as disconnected joints even
when their world-space depths differed. In a spatial frame this produces false
warnings merely by rotating the camera. Projection overlap is not connectivity.

Rust now uses the projected index only for candidate selection. A 3D finite-line
intersection test rejects stations outside the member lengths and gaps above the
existing project merge tolerance. The broad phase expands by that same tolerance
in screen units. No tolerance is relaxed. Shared node IDs remain connected;
parallel/collinear overlap diagnosis remains outside this query's scope.

The record includes the actual centreline separation and tolerance in metres.
Near contacts within tolerance are candidates for explicit topology repair, not
a claim that physical section surfaces meet. Edge-on camera views still report
real intersections. The query never changes geometry, revision or analysis state.

Independent regression geometry consists of two perpendicular members with known
zero, sub-tolerance, over-tolerance and one-metre separations, checked in three
orthogonal cameras at different scales. The connected residential reference is
also checked. Browser tests exercise imported separated/meeting members, existing
explicit-connect/undo behaviour, and the reference with diagnostics switched on.
Evidence: `evidence/spatial-crossings/`.
