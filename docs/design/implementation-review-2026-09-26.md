# Implementation, specification and UX review — 2026-09-26

## Assessment

The implementation is a functioning analysis workbench with bounded model-native
steel design and labelled concrete workflow previews. It has substantial engineering
infrastructure, but does not yet deliver the complete integrated design product in
the approved mockups. Individual slices passing tests is not product acceptance.

Reviewed source: `46b21ff`; live build `7cfbf22225720db293d32b23bc1999d178cdbd088a2664f3abe4113398bec91c`.
This review changes no application behaviour. It is not a new numerical acceptance
run. Earlier gate evidence is identified as historical, not assumed current for
every feature after every subsequent change.

## Review basis

- Root SPECIFICATION §§4, 6–9 and VALIDATION/evidence conventions.
- Steel product specification §§11–24, 30–31, 36.
- All five approved M07 screen images, M08 reinforcement proposal and M11 footing
  setup; M10 brief and setup/mesh caption. M10 PNGs are not available locally.
- ADRs 0008/0009, current delivery state, mockup gap register, concrete preview
  contract and residential stair/engineering limitations.
- Current browser at 1440 × 900: residential model, concrete inspector and an actual
  synthetic footing workflow run. Screens and DOM observations are saved in
  `evidence/product-review/`. Current source inspected for steel catalogue/settings,
  physical hierarchy and rendering; a complete steel verification suite was not
  rerun as part of this reflection.

Mockups are interaction references. Their sample outputs are not engineering
truth: some images show a prominent PASS alongside unsupported checks. Executable
fail-closed rules take precedence. ADR 0008 also gives the existing shell priority
where mockup menu chrome differs; a different header colour alone is not a defect.

## Specification and mockup alignment

| Area | Current state | Assessment |
|---|---|---|
| Rust/WASM authority, precise geometry, atomic commands | Implemented with recorded native/WASM and browser evidence | Strong foundation; preserve it |
| Provenance, readiness, stale and unsupported states | Implemented in bounded steel and preview flows | Substantial alignment; visibility and recovery guidance can improve |
| Selected-member steel design and calculation details | Catalogue/material binding, assumptions, current-result demand, inspector and calculation drawer | Functional bounded slice, partial product-spec coverage |
| Whole-model steel overview | Per-member status table, batch design, filters and status overlay remain M07-G work | Major missing approved workflow |
| Catalogue and section study | Five verified records in an inspector browser; earlier generic study infrastructure exists | Not the approved searchable catalogue / integrated reanalysis-and-apply study |
| Authored hierarchy | Saved storeys, roles, physical/analytical ownership, grids, layers, groups and bindings | Real improvement; visibility/locking/isolation and selection presentation remain incomplete |
| RC beam | Persisted draft, real/synthetic action source, illustrative reinforcement, explicit unavailable checks | Preview, not verified reinforcement design, fit checking or construction schedule |
| Slab | Preview inputs and direction grid; residential slabs are one-way frame strips | Not a plate/shell mesh, convergence workflow, reinforcement map or punching design |
| Pad footing | Bound reaction workflow, source-labelled ground inputs, trial geometry | Contact INDETERMINATE; resistance UNSUPPORTED; no completed footing design |
| British residential reference | Connected preliminary frame/strip model with synthetic loads and assumed ground | Useful demonstration analysis; not a completed British structural design |

The steel implementation also does not yet cover the full envisioned project
default/override/restore and derived-bracing workflows. Manual assumption provenance
is useful but narrower than the complete spec. LTB and serviceability remain
explicitly deferred; they must not be implied by screen completeness.

## Main product and UX findings

### 1. Physical, analytical and design identities remain difficult to follow

The saved structure graph is much better than the original derived hierarchy.
However, the interface still asks users to reconcile physical members, analytical
segments and separately configured design drafts. In the residential reference,
physical slabs exist while the design-object slab branch has no drafts. Concrete
draft dimensions explicitly do not change frame stiffness. These are intentional
preview boundaries, but they prevent a seamless model-to-design workflow.

Live observation: the footing inspector says `base1`, its draft chooser includes
`gbase1`, the Explorer uses readable support labels, and the viewport status says
`No entities selected`. This violates the intended clarity of a single selected
object even if individual underlying references are technically valid.

**Needed:** one selection context with physical identity, analytical children and
design object bindings; readable B/C/SL/F names; explicit navigation between these
representations; edits that clearly identify which shared model property or
independent draft they affect.

### 2. The canvas is not consistently the visual centre of the product

At 1440 × 900, live measurement gives a 785 × 479 canvas panel, of which the
viewport toolbar consumes 105 px. The inspector is 410 px wide and the result
drawer 270 px high. This puts navigation, warnings and controls in competition
with the model. An empty results drawer retains substantial space.

The mockups communicate a selected element within a readable building. Our default
fit often leaves a small model in a much larger canvas; the analytical mode then
adds hundreds of equally weighted nodes and segments. Labels improve access but
Show all intentionally creates a dense overlay. Adding individual toggle buttons
is no longer a sufficient visibility design.

**Needed:** coordinated physical / analytical / design views, fit selection,
storey filtering, isolate/hide/show, transparency, layer visibility and a grouped
annotation menu. Keep current label controls but place them within that system.

### 3. Controls and workflow stages are fragmented

Model creation, editing, topology, inspection, steel design, mock previews and
reference checks share the top ribbon. View controls wrap across rows. Analysis,
selected-member design and preview outputs each have their own state and tabs.
The user must know which command and panel matter next.

**Needed:** context-sensitive command groups inside the existing shell, one clear
primary action for the current readiness state, compact advanced inputs, and
progressive disclosure. Move reference/verification examples out of the primary
production design path. Keep unavailable checks explicit, but consolidate repeated
warnings into an accessible scope summary plus a specific next action.

### 4. Engineering truth is clearer in records than in the user's mental model

The preview UI correctly reports MOCK, UNSUPPORTED and INDETERMINATE. This is better
than reproducing misleading PASS illustrations. However, realistic-looking pads,
reinforcement and solids can still suggest a degree of engineering completion
that has not been achieved. A solid envelope does not establish offsets, joints,
anchorage, headroom or load-transfer details.

**Needed:** concise always-visible analysis idealisation and design scope, meaningful
object names, model-source actions as the natural path for bound objects, and
synthetic examples as an explicit alternative. Preserve field-level provenance and
full records under details; do not make users decode IDs or single-letter source
markers to understand the main decision.

### 5. Recent fixes have been reactive

The hierarchy, crossings and label controls addressed real shortcomings. But we
have been adding controls and representations in response to individual screenshots
without repeatedly evaluating the whole workflow and visual hierarchy.

The last stair response is a specific example: the generator and connectivity
checks established that eight returning flights existed. Adding thin physical-width
outlines makes the line view less ambiguous. It does **not** prove that the user's
intended missing sloping beam is unnecessary or that the intended stair support
arrangement has been met. That concern should remain unresolved at the structural
intent level until a plan/section comparison identifies the expected members.
The existing documented offset, finished-level and headroom limitations also remain.

### 6. Delivery documentation is drifting

Per-task evidence exists, but root `lastVerified*` fields still point to the older
concrete-preview build, and root nextAction still lists authored storeys/layers as
open despite their implementation. British reference intent also coexists with
an ACI-oriented concrete resource plan. These are different scopes, but the plan
needs to express the distinction rather than leaving the user to reconcile it.

**Needed:** a current capability matrix distinguishing implemented, verified on this
build, historically verified, preview, resource-blocked and unresolved design intent.
Keep the British reference basis explicit and separate from the bounded AISC module;
resolve its exact concrete profile/edition/resources before claiming design.

## What should happen next

1. **Resolve model meaning and selection first.** Audit the residential reference in
   plan, section and 3D; confirm stair support intent; unify physical/analytical/design
   selection and names. Acceptance: every selected object has the same identity in
   tree, canvas, inspector and relevant result; navigation explains its load path.
2. **Consolidate the workspace.** Preserve the shell, reduce toolbar clutter, add
   storey/isolation/visibility tools, improve fit and empty-drawer behaviour, and
   format ordinary values without floating-point tails. Acceptance: a four-storey
   model can be inspected without showing all its analysis nodes or losing context.
3. **Complete M07-G end to end.** Whole-model review, useful catalogue filtering and
   candidate studies with exact reanalysis/provenance and explicit apply/undo.
   Existing generic study capabilities should be reused, not mistaken for completion.
4. **Advance concrete engineering separately from its previews.** Agree and lock the
   British project basis/resources; implement and independently verify bounded RC
   beam checks before claiming reinforcement design. Plate/slab and contact/foundation
   mechanics retain their own prerequisites.
5. **Make UX acceptance task-based.** Validate an engineer finding a failing member,
   understanding why, changing it, reanalysing, reviewing impact and exporting the
   record. Test visibility and representation comprehension with realistic models,
   alongside existing failure, stale, undo and numerical tests. Passing selectors and
   screenshots alone do not establish an understandable product.

## Conclusion

Keep the numerical/transactional foundation and the approved four-panel shell.
The next improvement should be a coherent model-to-design experience with clear
representation and selection, followed by completing the missing steel workflows.
More isolated buttons, decorative realism or mock PASS screens will not close the
current product gap.
