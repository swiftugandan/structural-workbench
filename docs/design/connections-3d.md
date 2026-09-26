# 3D joints and restraint presentation

The previous solid view retained flat ground/triangle symbols and let beam envelopes intersect column centre-lines. This display correction introduces shaded fixed seats/plinths, pinned bearings and roller bearings, with the bearing plane aligned to the attached column or cantilever. Rollers follow the actual constrained global translation. Arbitrary restraint masks retain their explicit custom symbol, rather than inventing a physical connection.

Beam display meshes stop at the adjacent column envelope; the top column envelope reaches the top of adjoining beams. These are bounded display cutbacks/extensions only. Rust member endpoints, connectivity, releases, stiffness, design lengths and all stored dimensions are unchanged. Small analytical node markers remain selectable; labels in solid 3D appear on selection/hover instead of covering every junction. Selected member faces use distinct shading.

The support badge preserves the exact model restraint description and identifies geometry as illustrative. The seats, bearings and blocks are visual conventions, not sized connection hardware or foundation design. No weld, bolt, anchor or contact capacity is implied. Plan/elevation retain analytical symbols; unsupported/custom restraints are not recast as ordinary pins.

Validation: `node --test tests/connections.test.mjs tests/design-scene.test.mjs tests/support-symbols.test.mjs`; browser reproduction is recorded in `evidence/connections-3d/connections-gate.json`. A synthetic three-column model demonstrates fixed, pinned and roller supports through the actual importer. Check that changing views preserves the model hash and support properties remain editable. Visible Chrome review complements automated geometry and browser assertions.

A visual review also exposed an existing inverted camera-depth sign. Camera-facing geometry now receives smaller WebGPU depth than rear faces. This fixes solid occlusion for both members and support bodies. Spatial pins use spherical articulation; planar pins retain a hinge convention. The exact restraint mask in the properties panel remains authoritative.
