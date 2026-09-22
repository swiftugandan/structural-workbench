# Application-wide menus and shortcuts

Design: docs/design/M01-UX/COMMAND_SYSTEM.md. File/Edit/View/Model/Analysis/Help share existing action handlers. Menus replace the separate panel toggle strip and export/help header buttons; frequent modelling retains the original ribbon. Undo/redo, case and Analyse stay in quick access.

Keyboard checks cover F10, arrows, Escape, command shortcuts, disabled draft replacement, text-field protection, real analysis/download and canvas focus persistence. Accessibility includes open View menu and shortcut dialog. Existing export and responsive navigation journeys use actual menu clicks.

Initial test corrections: the disabled-command check now activates through keyboard (Playwright correctly refuses to click aria-disabled items), and geometry comparison waits for real project initialization before recording the hash.

Live CUA: created a frame from File; opened Materials from Model; ran the real solver through Analysis and observed deformation/result probe; inspected checked View items and Mac shortcut labels. Pointer switching between open headings exposed a hover/click double-toggle to correct before final delivery.

This bounded command-system verification is separate from full UX/platform milestone acceptance.

Final results: pointer hover/click switching corrected and regression-covered. Full e2e plus accessibility run: 46/46 PASS on build 8e9a88e63352663b0e052fc26b892812a45685f7990007022eb82cf8dd121f6e. After the isolated heading-pointer fix, 12/12 focused tests PASS on final build ec1b298a2adc69bf6e0f8f032655a7309657a9d615d00a4458fd550e34b95195 (source defa0a7fc4093ae9821a16fb90f6605ddef2bce00aa6bf2f4b11984d94cd9c28). Final tests include File/Edit/View/Model/Analysis/Help interactions, open-menu and shortcut-dialog accessibility, actual analysis/download, persistence, responsive layout and core workbench recovery/export. Raw reports: regression-46-results.json and final-12-results.json. Final live CUA confirms File-to-Model pointer switching stays open; earlier CUA creation/material-management/solve observations apply before the pointer-only change.

Run with the normal preview and Playwright configuration, or the port-4175 override documented in evidence/M01/layout-panels/README.md. This run used the latter because 4173 is another preview. Full-suite artifacts (topology, portal, guided-inputs) belong to regression-46-build.json; workspace/mobile/export and accessibility artifacts were refreshed by final-12-results.json. No full milestone/platform acceptance is claimed.
