# Residential reference representation audit

## Current model meaning (UKR01 v2)

The stair is a monolithic concrete return stair represented by two inclined **waist slab strips** per storey. A strip centreline is not an edge/stringer beam. The two thin edges introduced by STAIR-OUTLINES are section-width guides, not two additional structural members.

| Component | Actual analytical representation | Connection |
|---|---|---|
| Lower flight | Centreline at x=1, y=1.5→3.9, z=floor→floor+1.5 | Shared node IDs with floor and intermediate landing strips |
| Upper returning flight | Centreline at x=3, y=3.9→1.5, z=floor+1.5→next floor | Shared node IDs with intermediate and next floor landing strips |
| Floor landing | Two 2 m wide strips at x=1 and x=3, y=0→1.5 | Cantilever idealisation from floor beam at y=0 |
| Intermediate landing | Two 2 m wide strips at x=1 and x=3, y=3.9→5.4 | Cantilever idealisation from beam at y=5.4 |
| Intermediate landing beam | x=0→4 at y=5.4 | Side beams connect to split column nodes at the half-storey |

This arrangement exists at all four 3 m storey rises. There are eight inclined strips; no explicit side stringers. The end connectivity is tested natively in `return_stairs_have_connected_floor_and_turning_landings` and the v2 numerical corpus already compares the actual model to OpenSees.

## What the screenshot did and did not establish

The user's projection showed one slope on each return leg. Other stair edges are section envelopes, not necessarily extra beams. This explains the rendering but does not establish that the chosen monolithic/cantilever arrangement matches the intended structural scheme. A dedicated stair view needs to show plan, side and 3D alongside ownership and these assumptions before resolving that concern.

No beam is added merely to symmetrise a projected image. Introducing stringers would change stiffness, self-weight and load transfer and would require an intentional model revision plus numerical revalidation.

## Unresolved physical design

Finished floor/landing levels, waist offsets and junctions, beam intrusion, headroom, guarding and reinforcement remain unverified. Analytical centreline continuity is not a physical clearance or code check. User-selected basis: Eurocodes with UK National Annexes; exact resource editions remain pending.

## Execution

REVIEW-03 will supply storey/layer filtering, isolate and fit tools to inspect the saved entities in the actual viewport. Screens and observed object IDs will be added after those controls pass browser checks. This document alone does not close the staircase structural-intent concern.
