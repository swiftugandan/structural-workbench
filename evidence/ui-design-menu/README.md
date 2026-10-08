# Header and Design menu — 2026-09-26

Removed the visible save-status line, aligned the editable project name with the menu bar, and added Design between Analysis and Help. Design routes to existing member steel, model review, concrete preview, reference check and report workflows. Local saving continues; failures retain the existing message banner.

Build: `999e90abf22d54b83bbd75a5f49a2e05c3a77eb45f684c196bee2b9a5863ee48`. `npm run build` succeeded. Build and dependency metadata: `../../release-manifest.json`, `../M00/current/build.json`.

`WORKBENCH_EVIDENCE_DIR=evidence/ui-design-menu npx playwright test tests/e2e/application-menu.spec.js`: 3 passed. Covers header centre alignment, hidden save status, all four design destinations, keyboard navigation, command guards, focus mode, real WASM analysis and download.

Live Chrome session `gusset-design`: updated through the application reload action, opened the existing residential reference, opened Design and selected Model steel review. Review visible; save status hidden; project-name and Design control centre both y=25 px at 2560 px viewport width. Menu also inspected at 900 × 900; popup remained inside viewport (x=317.508, right=587.508). Screenshots `design-menu.png` and `narrow-menu.png` visually inspected. No numerical or code-profile changes.
