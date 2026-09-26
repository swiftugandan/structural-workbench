# ADR 0010 — authoritative structure model

Status: implemented and locally verified; see `evidence/structure-model/structure-gate.json`. User authorized completing model/tree synchronization, without cosmetic substitutes.

Project schema 1.1 adds a Rust-owned `structure` graph: authored storeys, physical members with explicit roles and analytical membership, grids, groups, layers, node-based joints and support details, and physical design objects linked to their concrete draft definitions. The tree reads these records. It must not invent storeys or roles from coordinates.

Migration from 1.0 preserves original bytes through the existing import-backup workflow and all analytical data. Stable physical records are created from existing member lineage and joints from exact node IDs. Roles remain `unassigned`; storeys, groups, grids and layers start empty. Existing design previews receive stable linked physical design records with explicit unverified/unmeshed status. No resistance, plate mesh, connection hardware or code acceptance is invented.

Storey elevations and grids are authored reference geometry, not constraints which silently move nodes. Physical-member role is user-authored intent, not a change in finite-element formulation. A joint records actual node identity; connected members and their releases remain authoritative analytical references. Support detail records declare not-designed hardware. Numerical parents remain separately gated.

All edits use revision-checked Rust commands and the existing atomic undo/redo transaction. Imports strictly validate graph references, unique ownership, kinds, membership and status. Commands synchronize graph membership only for their explicit analytical changes; imports never repair a malformed 1.1 graph. Splits preserve the physical owner. Copies get new physical identities and inherit explicit classification. Deletes prune references to deleted entities atomically; deleting an authored storey/layer/group/grid with remaining dependants is rejected where applicable. Unknown associations are not guessed.

Graph metadata is distinct from analysis input: the model fingerprint continues to identify analysis inputs; a structure fingerprint identifies the complete authored graph. Physical geometry/action bindings and concrete draft inputs remain in analysis/design provenance. Graph-only changes must not falsely stale an unchanged analysis; numerical edits retain existing stale rules. Snapshots and portable exports contain both graph and analytical state.

Acceptance requires schema validation, migration round trip, malformed-reference rejection, mutation atomicity, topology/copy/delete/undo synchronization, tree-to-inspector-to-viewport selection, persistence/export, real WASM browser journeys and visible computer-use evidence. This ADR is not acceptance evidence.
