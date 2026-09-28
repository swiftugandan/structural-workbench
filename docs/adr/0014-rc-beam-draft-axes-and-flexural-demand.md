# ADR 0014 — RC beam draft axes and model flexural demand

## Status

Accepted for M08-A4 (2026-09-28).

## Context

M08-A4 shows the bound member's design moments beside the section-mechanics capacities (ADR 0012, ADR 0013). To say which model moment is "sagging" and which is "hogging", the draft's faces must be fixed relative to the member's local axes. No document did that, and two conventions were already in use:

- `computeSection` for a `solidRectangle` puts the width along local y and the depth along local z. Strong-axis bending is therefore My. The residential reference `beam` section follows this (Iy = b h³/12 with h = 0.6 m).
- The steel catalogue (ADR 0009) puts the depth along local y, so major bending is Mz.

`web/render/design-scene.js` drew the rcBeam draft with its depth along local y. Every draft bound to a rectangular model beam was therefore shown rotated 90° about the member axis.

Member local axes come from `localY` (x = start→end, z = x × y), so local +z is not always "up". In the residential reference, beams with `localY = (1, 0, 0)` have local +z pointing downwards.

## Decision

1. An rcBeam draft's **width runs along member local y and its depth along local z**. This matches `computeSection` and rectangular analysis sections. The draft's **top face is the local +z face** and its bottom face is the local −z face.
2. Section actions use σ = N/A + My z/Iy (SPECIFICATION §193, §264). **My < 0 compresses the top face**, which is the draft's sagging state (ADR 0013). **My > 0 compresses the bottom face**, which is its hogging state.
3. In `model` source mode, the preview run carries `flexuralDemand`. It gives the governing sagging and hogging stations from the bound member's key stations for the **one** bound case or combination. Each entry holds the magnitude that compresses its face, the station, kind and side, and the full simultaneous action vector. A state is `null` when no key station has My of that sign. Key stations contain the exact ends, extrema and one-sided discontinuities, so they hold the true extremes of the piecewise quadratic My.
4. Orientation is reported, never inferred. The run records the global direction of local +z and classifies it as `up`, `down` or `horizontal` by the sign of its global Z component. When it is not `up`, the UI says the draft's top face is not physically uppermost. The draft is not flipped automatically.
5. There is **no utilisation ratio, no status and no envelope across combinations**. Choosing which combinations are ultimate limit states belongs to the code profile (M08-B). N, shears, T and Mz at the governing stations are shown as simultaneous actions that the pure-flexure mechanics does not consider.
6. Synthetic source mode reports `flexuralDemand.status = unavailable`. The illustrative action vector has no member axes.

## Consequences

- `design-scene.js` now draws depth along local z and top bars at +z. Drafts bound to rectangular model beams line up with the analysis section.
- A draft bound to a member whose local +z points down shows swapped physical faces. The UI warns about this. Correcting it is a model change (`localY`), not a draft change.
- M08-B can build its flexure check on this demand record by adding combination selection and a code resistance. The face convention does not change.
