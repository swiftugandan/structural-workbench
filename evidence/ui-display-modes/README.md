# Explicit display modes — 2026-09-26

Replaced Physical envelopes with Display: Lines | Solid. Mutually exclusive pressed states expose the active mode. Repeated activation is idempotent. Design inspector navigation preserves the chosen display instead of silently forcing solid rendering. Camera orientation remains separate.

Build `caab9b61fffe1b29698c8f42df0e1ae1db5b7758821bb05e0d88a266d7c06c5b`; `npm run build` succeeded. Build and lock metadata: `../../release-manifest.json` and `../M00/current/build.json`.

`WORKBENCH_EVIDENCE_DIR=evidence/ui-display-modes npx playwright test tests/e2e/stair-outlines.spec.js tests/e2e/application-menu.spec.js`: 4 passed. Tests cover explicit pressed states, repeated mode selection, residential outlines in plan/elevation/3D, unchanged engineering hash, menu destinations, keyboard navigation and actual WASM analysis.

Live Chrome session prokon-design: application update, open residential reference, 3D, Lines, open steel inspector, return to Properties, Solid. Lines remained selected after inspector navigation (26 stair outlines); Solid selected afterward (0 analytical stair outlines). Both recorded engineering hash `ec6d4a34238b`. Screenshots `lines.png` and `solid.png` visually inspected against the actual renderer. No engineering calculations changed.
