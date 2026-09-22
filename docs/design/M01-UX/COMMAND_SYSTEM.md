# Application command structure

A compact document header contains Projects home, a standard File/Edit/View/Model/Analysis/Help menu bar, document name and save state, and quick undo/redo, case selection and Analyse controls. The ribbon retains its original icon-over-label buttons for frequent modelling. Export and Help move into menus. Remove the separate layout-toggle strip; View owns visibility and focus mode.

File: new frame/portal, open/import, worked examples, download portable project, report and CSV, return to projects. Autosave stays explicit in the document status; Download is not labelled Save.
Edit: undo/redo, selection, properties, move/copy/delete. Model: geometry, supports/loads, topology, materials/sections and load definitions. Analysis: run/cancel, result tables and member inspection, result families. View: panels, ribbon, toolbar, focus/restore, camera navigation, axes/dimensions, reset layout. Help: capabilities/assumptions and shortcut reference.

Menus reuse existing commands and state. Disabled commands reflect solving, read-only state, missing results, empty selection and unapplied drafts. File replacement cannot silently discard property drafts. Layout changes keep drafts mounted. Project export remains portable, distinct from browser autosave.

Keyboard: roving menu focus; Left/Right between headings, Up/Down and Home/End within menus, Enter/Space activation, Escape restoration, Tab dismissal, outside-click dismissal. F10 enters the menu bar. Shortcuts are platform-labelled, listed beside commands and in Help. Text editing and open dialogs retain their own keys. No shortcuts create an alternate engineering mutation path.

Responsive: header wraps; menus stay within the viewport and scroll vertically. Narrow screens retain exclusive Canvas/Model/Properties/Results navigation through View. Menus remain reachable when ribbon and panels are hidden.
