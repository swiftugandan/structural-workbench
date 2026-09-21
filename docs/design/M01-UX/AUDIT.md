# M01-UX design and implementation handoff

## Evidence boundary

This audit is based on web/index.html, web/app.js, web/cad.js and DESIGN_SCREENS.md. Live browser inspection was attempted in this session but the browser service denied access because its admin-enforced policy could not be verified. No live usability, screenshot or responsive pass is claimed. Do not bypass that control.

Open workspace.html for the interactive design prototype. It is a design artifact with illustrative geometry/properties, not the application or numerical evidence. Its state picker covers projects, selected/empty, editing, solving, stale and error. Model/Modify/View/Results tabs, a context-menu preview and mobile panel navigation demonstrate the proposed hierarchy. Unimplemented prototype buttons are presentation-only. Full context-menu keyboard semantics remain implementation work.

## Prioritized findings and decisions

| Priority | Source evidence | Proposed change | Acceptance |
| --- | --- | --- | --- |
| P1 | web/index.html viewport-toolbar places view changes, authoring, selection, pan/orbit, assignments, topology, GPU recovery and result display in one row | Group supported commands in a labelled icon ribbon; keep current tool/plane in the status bar. Move GPU recovery into its failure notice. | UX-02 |
| P1 | web/app.js selectEntities falls back to the first member when selection becomes empty | Make empty selection explicit in the inspector; preserve correct command targets and prevent a misleading selected-member panel. | UX-02, UX-03 |
| P1 | Existing node inspector exposes coordinate editing through another dialog, while the member inspector mixes geometry/material/section and some loads | Contextual property groups, explicit drafts/apply/cancel and inline validation; retain existing validated command paths. Document shared section/material effects before applying edits. | UX-03 |
| P1 | web/cad.js opens a modal with comma-separated selected IDs and operation choices | Add discoverable selection-aware context actions that open existing previews, with visible affected IDs and dependency review. Never silently delete on right-click. | UX-02, UX-03 |
| P1 | Results occupy a permanent work-grid section, and controls are distributed between projectbar, viewport toolbar and results tabs | Use a coordinated results drawer, retain case/combination and freshness in view, and provide clear analysis-to-results navigation. | UX-04 |
| P2 | Multiple command labels use Unicode glyphs, while the brand uses SVG | Introduce a local consistent SVG icon vocabulary, labelled buttons and shortcut tooltips. | UX-02, UX-05 |
| P2 | Full toolbar density must be assessed at the required narrow widths | Use mutually exclusive model/properties overlays; allow table scrolling within containers; preserve save/export and numeric editing. Verify 390×844, 768×1024, 1280×720 and 1440×900. | UX-06 |

These are source-derived findings and design proposals, not observed live failures.

## Interaction contract

- Right-click an unselected entity selects it alone; right-click within the selected set preserves that set. Blank-canvas context actions are view/create actions and do not offer selection deletion. Keyboard context menus target the focused selected entity/set. Dismiss restores focus. Arrow/Home/End navigation and Escape are required in implementation.
- Ribbon controls call existing application command handlers; they must not maintain a second selection or engineering state. Switching tabs does not commit/cancel a modelling draft. Active tool remains visible even on another tab.
- Properties derive from stable selected IDs. Empty state offers selection guidance; multiple selection exposes counts and supported operations, with mixed values explicit. Do not offer unsupported bulk property changes.
- Numeric properties retain full values internally. Units stay next to fields. Validation preserves drafts. Changing selection with dirty fields must provide apply/discard/keep-editing choices without implicit data loss.
- Draw-mode inputs remain accessible and commit/cancel explicitly. Pending previews are visually distinct from committed geometry.
- Results derive from actual result buffers. No-result/solving/current/stale/error have separate copy and available actions. No illustrative values from this prototype enter the application.
- Narrow layouts switch between canvas, tree and properties without losing selection/drafts. A labelled actions button provides context actions without right-click. Project import remains available after local-storage failure.

## Next implementation sequence

1. Add an icon helper and ribbon/navigation module while preserving existing control IDs/handlers and modelling semantics.
2. Add context menu command routing and keyboard support; correct empty/multiple-selection inspector states; introduce safe draft handling.
3. Refine results drawer, responsive panels, field feedback and status presentation.
4. Add behaviour-focused browser checks, register UX acceptance in the verifier and refresh affected build evidence. Perform live computer-use verification when the access-policy service works; preserve that blocker otherwise.

Design created, but visual/browser verification and all production UI implementation remain pending. This artifact does not satisfy UX-02–UX-08 or parent M01 acceptance.
