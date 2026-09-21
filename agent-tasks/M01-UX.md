# M01-UX — Improve the modelling workspace UI and UX

Status: IMPLEMENTING (design artifact created; production implementation pending). Parent: M01. Priority: next, before the final M01 acceptance run and M02 feature work. Requested by the user on 21 September 2026.

## Outcome

A user can open or create a portal, understand the active modelling mode, select and edit its structure, analyse it, inspect results, and save/reopen/export without hunting through competing controls. Improve the existing application end to end, using DESIGN_SCREENS.md as direction and real supported capabilities as the boundary.

This is a sub-milestone within the existing M01 candidate, so work may start while parent hardware acceptance is blocked. It does not waive M00/M01 acceptance or unlock M02.

## Sequence and scope

1. **Audit and design.** Inspect the running projects, modelling and results journeys. Record observed friction and distinguish source-derived concerns from live observations. Produce a viewable design for the workspace, contextual inspector, results drawer and narrow layout, including empty, selected, editing, solving, stale and error states. Save the design and a prioritized issue list under docs/design/M01-UX/ before implementation.
2. **Workspace hierarchy.** Give the structural canvas priority. Group project actions, modelling tools and analysis actions consistently; keep active tool, working plane, units, selection and save/analysis state easy to find. Use contextual panels and progressive disclosure for less frequent options. Keep the model tree, viewport and inspector synchronized.
3. **Modelling flow.** Clarify selection versus drawing, snap feedback, numeric entry, commit/cancel, and move/copy/delete/topology previews. Preserve keyboard/table alternatives. Show validation beside the relevant field with a useful correction; preserve drafts on failure and make undo/redo discoverable.
4. **Results and recovery.** Give users a clear route from analysis to diagram/table inspection and export. Keep units, load case/combination and result freshness visible. Clearly distinguish no result, solving, current, stale and failed states; explain unavailable actions. Preserve model recovery and export when graphics or storage fail.
5. **Visual system and responsive access.** Apply consistent typography, spacing, control sizes, panel geometry, focus and status treatment across existing screens. Use tabular numerals and display formatting without rounding stored values. Desktop CAD targets 1280×720 and larger; below that, use mutually exclusive tree/inspector overlays and retain forms, tables, save and export.
6. **Verify and hand back to M01.** Exercise actual controls with the real WASM kernel, capture screenshots and saved project/report artifacts, and refresh affected evidence for the changed build before final parent acceptance.

## Required interaction components

The user explicitly requested icons, context menus, a toolbar ribbon and a properties panel. These are required design and implementation scope:

- **Toolbar ribbon:** Group supported commands into clear task tabs such as Model, Modify, View and Results. Use labelled icon buttons, visible active states and contextual groups for the selected object/tool. Keep frequent actions easy to reach; collapse groups sensibly on narrow screens without hiding the active mode or primary action.
- **Icons:** Use a consistent SVG icon family with clear meaning and consistent size/stroke. Pair unfamiliar actions with visible labels; provide accessible names and tooltips including available shortcuts. Do not use emoji as command icons or rely on icon/colour alone for important states.
- **Context menus:** Right-click a node, member or empty canvas to show relevant supported actions. Explicitly define whether the target replaces or preserves selection; destructive actions must act on the visibly indicated target set and retain dependency previews. Support keyboard invocation with the Context Menu key or Shift+F10, arrow-key navigation, Escape dismissal and focus restoration. Keep every command available through the ribbon or another accessible control; provide a touch-accessible actions menu.
- **Properties panel:** Provide a contextual right-hand inspector for the selected node/member or selection set, grouped into geometry, section/material, supports and loads where applicable. Show units and mixed values accurately; expose only supported bulk edits. Make draft/apply/cancel behaviour and field errors clear, retain selection across updates, and show a useful empty-selection state. On narrow screens use the existing mutually exclusive overlay approach.
- **Supporting controls:** Coordinate the model tree, viewport navigation controls, status bar and results drawer with the ribbon and properties panel so selection, active tool, snapping and analysis state agree everywhere.

Add the ribbon, open context menu and properties-panel states to the viewable design. Verify pointer, keyboard and narrow-screen alternatives in the implemented application.

## Acceptance criteria

- **UX-01 Design:** Viewable designs and a prioritized audit cover projects, workspace, results and the listed interaction/error states. Findings say whether they were observed live.
- **UX-02 Hierarchy:** Required icons, grouped ribbon, context menus and contextual properties panel are implemented and synchronized. Context menus operate on the visible target set, support keyboard dismissal/navigation and have accessible alternatives.  At 1280×720 and 1440×900, primary actions and active mode remain visible; panels do not overlap or clip controls, and the canvas stays usable with inspector/results open.
- **UX-03 Authoring:** Create a portal, draw numerically, select/edit members and supports/loads, preview and cancel an edit, commit it, and undo/redo through visible controls. Repeat core authoring with keyboard/table controls; no trapped focus or lost selection/drafts.
- **UX-04 Results:** Analyse, inspect linked tables/graphics, change an input, observe stale state, reanalyse, save/reopen and export an accurate project/report. No stale result is presented as current.
- **UX-05 Accessibility:** Label controls; provide visible focus, logical focus order, dialog focus restoration and non-colour status cues. Automated accessibility checks pass and manual keyboard verification is recorded. Desktop control text is at least 14 CSS px.
- **UX-06 Responsive:** Verify 390×844, 768×1024 and both desktop sizes. No page-level horizontal overflow or inaccessible primary actions; dense tables may scroll inside labelled containers. Narrow layouts preserve numeric editing, state, save and export; full phone CAD parity is not claimed.
- **UX-07 Recovery:** Invalid input, analysis failure and unavailable graphics/storage produce actionable messages while preserving the project and recovery/export paths. Clearly label injected failure tests.
- **UX-08 Regression:** Existing M00/M01 authoring, topology, units, atomic edits, undo/redo, persistence and numerical behaviour remain intact. Record source/build identity and actual test outcomes. Computer-use evidence is required; if its service is unavailable, retain a named blocker rather than claim a pass.

## Verification and evidence

Use evidence/M01/ux/ for screenshots, journey notes, exported project/report, accessibility results and same-build regression evidence. Build before running browser tests; never replace dist during a run.

Required commands: npm run build; npm run test:contracts; npm run test:e2e; npm run test:a11y; npm run test:graphics; npm run test:wasm. Run native/numerical/oracle and performance checks where changed code affects their behaviour, and refresh the complete required M01 evidence before parent acceptance. Add focused browser checks for the acceptance criteria instead of tests that merely mirror markup.

Before accepting this sub-milestone, register UX-01–UX-08 with the evidence verifier and test missing/stale/failed evidence rejection. The current M01 verifier alone does not establish these new UX criteria. The final M01 verification must require accepted M01-UX evidence as well as all existing gates.

## Boundaries and completion

Keep plain HTML/JavaScript/CSS, WebGPU and Rust/WASM authority. Do not add M02 engineering features, future-module placeholder workflows or framework migrations. Preserve numerical precision and existing files. Existing real-GPU and computer-use blockers remain recorded; they do not prevent design and implementation work.

Deliver the implemented UI, design artifacts, acceptance evidence and explicit remaining limitations. Then resume the required real-GPU/platform and computer-use acceptance on the new build. Creating this task is planning completion only; its implementation and acceptance remain pending.
