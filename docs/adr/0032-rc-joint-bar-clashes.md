# ADR 0032 — Bar clashes at RC beam–column joints (M16)

## Status

Accepted as an M16 sub-slice (2026-10-06). The M16 parent stays open: persistent bar sets, revision propagation and drawings are not part of this ADR.

## Context

M16 asks for detailing that detects "clashes at joints" between the reinforcement of members that frame together. The drafts already describe each member's bars: rcBeam has top and bottom rows (diameter and count), rcColumn has perimeter bars along the width and the depth (`column_bars`, the M12 layout). Nothing checked them against each other.

EN 1992-1-1 8.2(2) gives the clear distance between bars, max(k1 φ, d_g + k2, 20 mm), with the UK NA k1 = 1 and k2 = 5 mm. No held source gives a worked joint example, so the check is verified by hand geometry, not by a published result.

## Decision

- `workbench_design::joints` places every bound rcBeam and rcColumn draft on its analytical member: the section centred on the axis, the beam's width along its local y, its top along local z. Bars are straight lines through the joint; distances are line-to-line (skew lines; parallel lines are skipped).
- A beam bar and a column bar must be at least (φb + φc)/2 + the 8.2(2) clear distance apart. Without an aggregate size on either draft the clear distance uses max(φ, 20 mm), and a joint with no clash is **indeterminate**, not clear.
- Crossing (non-collinear) beams at the same face may touch but not intersect: their closest bars must be at least (φ1 + φ2)/2 apart. One clash is reported per beam pair and face, at the closest crossing, with the shortfall as the amount to move one layer.
- Collinear beams are continuous or lapped bars, not crossings, and are not compared.
- The protocol operation `detailJoints` (no payload) returns every node where at least one beam draft meets another bound RC draft, with status `clash`, `indeterminate` or `clear`, the pairs checked, each clash and the assumptions. The Joints pane of an RC draft shows the joints that draft belongs to.

## Consequences

- Joints are derived from the drafts and the model on each request; nothing is stored, so they cannot go stale.
- The centreline model ignores eccentric beams, haunches, cranked bars and the bar arrangement inside the joint (which layer goes over which). Where the bars stop, the laps and the anchorage inside the joint stay the engineer's (8.4, 8.7 are reported per beam by M16-RULES).
- Verification: three kernel tests against hand geometry (skew-line distance, row offsets, the exact 8.2(2) limit of a 300 mm beam into a 400 mm column with Ø25 corners, crossing rows touching at one Ø20) and the J01 protocol and browser journeys.
