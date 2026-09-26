# Concrete workflow previews

This is the user-authorized workflow slice following ADR 0009. It does not accept M08, M10 or M11, and does not create a concrete code profile.

## Shared contract

Drafts are persisted as `Project.designPreviews`, validated and unit-normalised in Rust. Creation/edit/deletion are atomic revision-aware commands with undo/redo. Draft changes affect the engineering model hash conservatively, so prior analysis and design records become stale. Empty draft lists are omitted for compatibility with existing projects. Structural geometry, materials and stiffness are not changed by a preview draft.

The existing left Explorer lists drafts. The right Selection Inspector edits geometry, material strength inputs, reinforcement preferences and model bindings. The central viewport displays labelled illustrative geometry. The bottom Results drawer displays unavailable checks and exact provenance. JSON export records the immutable run plus its current/stale presentation state. RC CSV exports the same illustrative preference row, never fabricated cut lengths or verified quantities.

Each numerical input retains its individual `syntheticFixture` or `user` source. Editing one value does not relabel untouched synthetic defaults; the draft summary may be `mixed`. Soil bearing provenance follows the bearing field itself.

Every run has `overall: unsupported`, `mock: true`, `codeProfile: null`, null check utilisations, an input hash, model hash/revision and deterministic run identity. A real upstream action source has its own `mock: false`; that does not turn the workflow into a verified concrete design. Editing a form immediately marks its run STALE; cancel/undo can restore current identity. Saved drafts survive export/import; run records are session history and may be downloaded separately.

## RC beam

Rectangular draft dimensions, cover, concrete/rebar strength inputs, preferred longitudinal bars and links. Explicit synthetic fixture or actual current model member key stations. Actual actions are re-solved in Rust and must match the requested result ID. No action envelopes or caller-supplied capacities. The section and bar picture is illustrative; bar fit, strength, spacing, anchorage, serviceability and cut lengths are unverified. No reinforcement design or construction schedule is issued.

## Slab

Rectangular boundary, one centred opening, thickness, cover, material inputs and target mesh size. Four direction views: Top X/Y and Bottom X/Y. The displayed lines indicate direction only, not a finite-element mesh or designed spacing. Raw synthetic Mx/My/Mxy are kept separate from unavailable design transformations. Frame results cannot be passed as plate actions. Mesh convergence, plate solution, reinforcement and punching remain unavailable.

## Pad footing

Footing/column dimensions, cover, embedment, strength inputs, soil unit weight and externally supplied bearing pressure/reference. A current support reaction is captured as one simultaneous six-component global vector, including exact solver/case/model identity. Foundation actions reverse the support-on-structure reaction sign; no local footing orientation mapping is inferred. The synthetic source is explicitly a fixture. Contact is INDETERMINATE; no pressure field, effective contact area, soil resistance, punching capacity or coupling is fabricated. Bearing input is labelled user/synthetic and `computedByWorkbench: false`.

## Deferred engineering

Pinned validated code/example resources, concrete resistance/detailing engines, plate/shell analysis, design action transforms, mesh convergence, compression-only contact, uplift/eccentricity/sliding checks and construction documents remain separate numerical work. These previews cannot support compliance or construction decisions.
