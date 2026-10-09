# ADR 0035 — Slab panels in the model views

## Status

Accepted (2026-10-09). Display, selection and one inspector control. No
engineering behaviour, tolerance or acceptance meaning changes. The project
schema is unchanged: `plate.placement` exists since schema 1.6.0 (ADR 0021
§11). The model hash is unchanged by anything here except saving a placement,
which was already a saved input. Revised the same day after review: the
solid view draws the slab bearing on its supports (§2), and the plate pressure
is shown with the loads (§8).

## Context

A slab design object is a plate-v1 panel (ADR 0021). It records where it sits
in the model (`plate.placement`, the panel corner, with panel axes along
global X and Y), but nothing draws it there:

1. The model views (plan, elevation, side, 3D; lines and solid) draw only the
   frame. The one design object drawn in place is a pad footing bound to a
   support.
2. The Design objects tab draws the slab alone, in focus. "Show model context"
   switches to the frame and the slab disappears, because the slab descriptor
   is solid only in focus.
3. The focus drawing puts the opening in the middle of the panel. The plate
   solve puts it at the corner the user entered (`openingX`, `openingY`), or
   leaves it out (`includeOpening = false`). Picture and results disagree.
4. A placement can only be written by "Take columns from the model", which
   refuses when no column meets the panel. A slab on beams or walls can never
   be placed.
5. With "Show model context", the object heading overlaps the canvas caption.

## Decision

### 1. Rust owns the panel geometry

`DesignPreview::slab_panel()` (model crate) is the one rule for a slab's
outline:

- `length`, `width`, `thickness` from the draft;
- `opening` as `[x0, x1, y0, y1]` in panel coordinates. With plate inputs it
  is the analysed opening: at `openingX`, `openingY` when `includeOpening`,
  otherwise none (`basis: "analysed"`). Without plate inputs it is the draft's
  centred preview opening (`basis: "illustrative"`);
- `placement` from `plate.placement`, or none.

The plate solve (`slab_model`) takes its panel outline and opening from the
same function, so the drawing and the analysis cannot disagree.

The `queryGeometry` `axes` response, which already carries the Rust display
geometry of the current revision (member frames, stair treads), gains
`slabs`: one entry per slab with the fields above and, when placed, the
world-space `corners` and `openingCorners` at the support level
(counter-clockwise from the panel corner), the drawn `soffit` and the
`bearingMemberIds` it rests on (§2), the `columnNodeIds` of its model columns
and its plate `pressure`. The browser extrudes and shades these; it computes
no slab geometry of its own.

### 2. Support level and bearing

The placement z is the slab's **support level**: the level of the nodes it is
supported at. `DeriveSlabColumns` finds column tops there, and the analytical
(Lines) view draws the slab there, as line members sit on their nodes.

The solid view draws the slab **physically**, resting on what supports it.
The horizontal members whose two ends lie at the support level inside the
panel (the tolerance `DeriveSlabColumns` uses) bear the slab. Its soffit is
at the highest top of their drawn surfaces, half-height |y·Z| c_y + |z·Z| c_z,
which is the envelope the solid view draws. Catalogue sections carry
c_y = d/2 and c_z = b_f/2, so steel shapes obey the same rule. With no such
member, as for a flat slab on columns, the soffit is the support level. Rust
computes the soffit (`slab_view::bearing`).

A first draft put the mid-surface at the placement level. That drew the slab
cutting through the beams it rests on, which reads wrongly to an engineer.
The plate solve does not depend on any of this: plate-v1 analyses the panel on
its own (ADR 0021 §6, §11).

### 3. Rendering

- **Solid** (model solids or solid design): the slab from its soffit up by its
  thickness, with its opening, in the concrete tone at 0.55 opacity, so the
  frame under it stays readable.
- **Lines**: the support-level surface as a 0.14-opacity fill with a 1 px
  outline round the panel and the opening, the usual analytical-surface
  convention.
- **Active slab** (the design object open in the inspector): accent tint and a
  2 px accent outline, as a selected member.
- Faces go through a second, translucent pipeline drawn after the opaque pass:
  same shader and vertex layout, `depthWriteEnabled: false`, and `writeMask: 0`
  on the entity-id target. Members and result overlays stay crisp, opaque
  geometry in front of a slab still hides it, and the slab never overwrites
  the entity id of a member under it. Outlines stay in the opaque pass.
- Placed, visible slabs count towards fit-to-view.
- In Design objects focus the slab is drawn from the same Rust panel, so the
  opening appears where it is analysed. With model context the slab is drawn
  in place by the model pass (as the active slab); unplaced, the scene shows
  "Not placed in the model".

Results stay in the results pane (plate contours are SVG). Contours on the 3D
slab are a later slice.

### 4. Selection

`screenPick` takes an opt-in `surfaces: "analytical" | "physical"`, matching
the view the canvas shows. Analytical tests the support plane. Physical tests
the drawn soffit and top faces. A click that misses every node and member and
falls inside a visible slab's projected outline, outside its opening, returns
`{entityId: <draft id>, kind: "designObject"}`. Nodes, then members, then
slabs: a slab never steals a click from the frame. Only canvas selection opts
in. The context menu, drawing tools and snapping keep their current results,
and any other `surfaces` value is refused. A slab hit opens the slab in the
Design objects tab, as the explorer entry does. Box selection and "Hide
selection" do not apply to slabs, because a design object is not a model
entity.

### 5. Visibility

- *Overlays* gains **Slabs** (pressed by default), which hides every slab in the
  model views.
- Storey, layer and isolation scope: a slab follows the columns it sits on. It
  is visible when any of its model columns' nodes is visible. A slab with no
  model columns is visible only when no scope is active. Hiding a selection is
  not a scope, so it never hides a slab by itself.
- Hidden slabs are excluded from picking and from fit.

### 6. Placement is an input of its own

The plate inputs gain a **Placement** block: "Place in the model" plus
corner X, Y and support level Z. It is saved with the draft through
`SetDesignPreview` (`plate.placement`, an existing field), so it is atomic,
undoable and revision-aware. "Take columns from the model" uses the saved
placement and no longer carries its own corner fields. A slab on beams or walls
can be placed without columns.

### 7. Heading overlap

While a design object heading is shown, the canvas caption is hidden in both
focus and model-context modes. With model context, the scene caption gives the
support level and the drawn soffit, or says the slab is not placed.

### 8. The plate pressure is shown with the loads

With *Overlays → Loads* on, a placed slab shows its plate pressure as arrows
on its loaded face: the top face in the solid view, the support plane in the
analytical view. The arrows sit on an even grid clear of the opening, and the
label reads "7.5 kPa · slab plate pressure, not a frame load". The pressure is
the plate analysis's input. The frame carries it only through the loads
"Apply column loads to the frame" writes (ADR 0021 §11), so the label says so.

## Consequences

- A placed slab is visible, selectable and fitted in every model view, and its
  opening is drawn where it is analysed.
- `PROTOCOL.md` §6 documents `slabs` on the axes response, and
  `surfaces` with `kind: "designObject"` on `screenPick`.
- The bearing soffit uses the section's c_y and c_z. A section whose drawn
  envelope differs from them would show the slab off its supports by the
  difference. Catalogue sections agree (c_y = d/2, c_z = b_f/2).
- Edge reactions of a slab on beams do not reach the frame: plate-v1 has no
  interior line supports and the link is through column loads only.
- Later: plate contours on the 3D slab, non-rectangular panels, rotated panel
  axes, and frame–slab coupling (ADR 0021).
