# 0003: Planar authoring as an independent M01 task

M00's required Windows/Linux hardware lane is still blocked. M01-A adds a bounded
portal authoring journey without accepting the parent M01 milestone or changing
its prerequisite gates.

A new portal uses one strict project import: four nodes, three members, explicitly
chosen fixed/pinned in-plane supports and a lateral nodal force. Its synthetic
section assumptions are visible before creation. Input dimensions and force are
explicitly SI; the Rust model validates the complete snapshot atomically.

Member drawing has inactive, first-point, second-point and commit states. Pointer
coordinates are view projections only. Rust returns f64 snap positions. Only an
existing node snap reuses a node ID. Intersection, midpoint and grid snaps provide
locations without splitting or connecting existing members. The aperture is eight
CSS pixels transformed by the orthographic XZ scale. Keyboard coordinates accept
unit suffixes through the same Rust parser. A nonnested Batch adds both endpoints
and the member in one revision; failed topology validation leaves no orphan nodes.
Escape discards the preview. Undo/redo and acknowledged-snapshot autosave reuse the
existing transaction path. Coordinate, restraint and nodal-action editors expose
individual fields instead of JSON arrays.

This is not the whole M01 CAD system. Local-axis overlays, explicit connect/split/
merge tools, broader working planes, rubber-band cursor feedback, full camera/
selection semantics and capacity/performance validation remain open. Intersection
search is currently quadratic in member count and is not advertised as validated
at the specification's maximum size. The background viewport grid remains a visual
reference; drawing uses a 0.5 m snap grid. No expected fixture values were changed.

Evidence includes native atomic/crossing tests, a browser portal journey compared
with independently executed OpenSees displacements, instability and recovery,
save/reopen/report, narrow layout and accessibility checks, plus manual browser
interaction with the actual local AMD WebGPU adapter.
