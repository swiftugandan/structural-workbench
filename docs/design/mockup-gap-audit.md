# Mockup comparison and gap register — 2026-09-26

The previous “main layout matches” statement was too broad. Matching panel positions and adding 3D objects did not establish screen or interaction parity. This register compares the actual reference content with the implementation, rather than treating screenshots or functional tests as proof of overall fidelity.

References directly inspected: M07 approved member design, overview, catalogue and section study; M08 reinforcement proposal; M11 footing setup. M10 has captions locally, not recovered PNGs.

| Area visible in references | Previous implementation | Current correction / remaining gap |
| --- | --- | --- |
| Left search field | Missing | Search actual entities and definitions; retain parent paths; explicit no-match state. |
| Expandable Structure → Levels → level → Columns/Beams → element | Flat category buttons and member list | Schema 1.1 now drives this hierarchy from saved storeys, physical members and authored roles. Legacy imports start unassigned; coordinates do not determine roles. |
| Named authored storeys, grids, groups/layers | Not in persisted model contract | Implemented in the schema 1.1 structure graph and Rust revisioned commands: authored names, elevations, roles, typed membership and reference lines. Browser verification is tracked in evidence/structure-model; visibility/locking toolbar remains separate. |
| Slabs/foundations/RC objects in tree | Mixed flat mock-object list | Separate nested RC beams, slabs and foundations, with explicit mock provenance and links to the actual draft inspector. |
| Material and section definitions under expandable headings | Category buttons only | Actual definition leaves open existing editors; model entity leaves select real objects. Existing category editors remain accessible. |
| Physical member → analytical segments | Existing lineage implementation | Preserved within the hierarchy, without duplicating or renaming segments. |
| Compact CAD header, viewport, grouped inspector, bottom tabs | Corrected in 2989fb7 | Retained; not a pixel-identical copy of every variant of the concept shell. |
| Multi-storey model context and selection | Current project only; earlier evidence used one beam | Hierarchy review uses an explicitly synthetic multi-level model. The application does not insert a fake office building into user projects. |
| Inspector previous/next member, storey selector, hide/show, wireframe/shaded/transparent | Incomplete | Still missing as a coherent design-toolbar workflow. Current orbit/fit/view buttons and concrete display modes are functional. |
| Steel overview with per-member status colours, filters, batch design | Not implemented | M07-G remains open; mockup not fulfilled by the single-member screen. |
| Full lower-drawer catalogue search/filter/detail/assignment | Only compact inspector catalogue | Partial; dedicated catalogue workspace remains open. |
| Section-study candidate reanalysis and comparison | Not implemented | M07-G remains open. No illustrative candidate utilisation is presented as computed. |
| RC span/support zones, dimensioned bar bends, links, verified schedule | Basic illustrative cage/drawings/preferences | Partial; numerical/detailing resources and richer drawing UI remain open. |
| Slab contours, design regions, mesh convergence and reinforcement maps | Synthetic action table and display grid | Numerical prerequisites unavailable; no contour/mesh accuracy claim. |
| Foundation contact contours, design/study/overview and construction detailing | Contact unavailable, illustrative grid, setup/results scaffold | Partial; contact is INDETERMINATE and resistance UNSUPPORTED. |

This correction verifies the Explorer increment. It does not close this register or constitute full mockup acceptance. Follow-up work must attach evidence to each row before changing its status.

## Explorer validation

Reproduce with:

```
WORKBENCH_EVIDENCE_DIR=evidence/explorer-fidelity npm run build
WORKBENCH_EVIDENCE_DIR=evidence/explorer-fidelity npx playwright test tests/e2e/model-explorer.spec.js tests/e2e/hierarchy.spec.js tests/e2e/canvas-first.spec.js tests/e2e/workspace-ux.spec.js tests/e2e/design-previews.spec.js
```

The Explorer journey imports a synthetic two-elevation frame through the actual application importer, checks beam/column branches, selection synchronization, collapse-state preservation, search by raw ID as well as displayed text, empty search, expand/collapse, material editor, unchanged model hash and the steel heading's readable label. Existing journeys exercise physical/analytical lineage, authoring, undo, responsive navigation and concrete draft persistence/staleness. Visible Chrome review uses the same imported model and real tree controls; see `evidence/explorer-fidelity/visible-explorer.png` and the build-bound gate record.

## Structure-model follow-up

ADR 0010 replaces derived organization with saved entities. Storeys and grids are reference organization, not implicit analytical constraints. Joints and support details bind exact analytical nodes/restraints and explicitly declare hardware not designed. Concrete object bindings retain their saved drafts and unverified status. This does not close the unrelated design-toolbar, batch-design, catalogue or numerical-resource gaps above.
