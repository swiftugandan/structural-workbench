# 0004: Rust-authoritative topology preview and local axes

M01-B exposes selected-member local axes and explicit split, connect and merge
commands. Both preview and commit run the same Rust operation and full Project
validation against a disposable candidate. UI drafts never establish engineering
truth. Commit preserves the preview command ID and rejects a changed revision;
input edits discard the preview. The preview lists every changed node, member,
support and load; closing it changes nothing. The existing snapshot history and
IndexedDB path provide one undo step and autosave.

Uniform member load density, coordinate axes, section and material survive each
split. New child IDs are deterministic from command ID and ordinal. Children carry
the root physical member ID and composed station interval, including repeated
splits. Explicit self-weight memberships expand to children without duplicating
weight. The added optional schema fields preserve old-file reading; an old strict
reader cannot open newly exported files containing those fields. This is an
explicit additive reader extension, not a change to benchmark truth.

Connect operates on 2–200 selected XZ members, handles nonparallel interior
crossings and endpoint T junctions, groups coincident joints, and reuses participating
endpoints. Collinear overlaps are excluded and stated in the UI. Split alone makes
a new node; neither an ordinary crossing nor a split at an existing unrelated node
silently joins it. Merge requires the specified 1e-6 m distance, rejects multiple
supports and repeated nodal-load cases from distinct nodes, and relies on complete
model validation to reject collapsed members without mutation. No loads or
restraints are silently combined. Zero-length and invalid-axis checks remain the
same for all commit paths.

The axis query uses the existing f64 Rust frame transform. WebGPU projects that
answer for the selected member; the overlay is presentation only and keeps current
results valid. Normal-to-view axes are labelled explicitly.

This task does not accept parent M01. Broader working planes, full selection/camera
semantics, disconnected-crossing visual distinction, large-model topology indexing
and platform/performance gates remain separate work. No solver formulation,
fixture expected value, platform requirement or tolerance has been relaxed.
