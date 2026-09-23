# Steel check UI refinement — 2026-09-23

Source hash: `87355d586145a0b5cc95e38a1a44e485d0317d10129b351a3fcb044b8e8c624b`
Build hash: `4a4152c285e90912c6629b09748e6ed9988db193c06c8410f72a2c724126dea7`

The steel check is visible in the workspace ribbon. Its dialog follows section/example → demand source → run/review. Input cards identify the example W section, the actual demand source, simultaneous actions and assumptions. Check rows show the correct force, moment or dimensionless units, status, utilisation and expandable clause details. Model actions are disabled for missing, stale or envelope results. The model's section is never implied to replace the example section.

The large parity/exclusion text no longer occupies the normal workspace message area. The full capability ledger is available through **Analysis & design scope**; steel limitations are in an expandable section. Storage, model and analysis failures still use the workspace status message.

Evidence:

- `npm run verify:m07`: PASS, `evidence/M07/full/gate-M07.json` on the source/build above. Six browser tests passed, including a 390 px viewport journey.
- `tests/e2e/m06-release-tour.spec.js`: PASS on the preceding code change; its scope test is also included in the final M07 browser corpus through `capability-ledger.spec.js`.
- Live Chrome interaction: opened a new frame, clicked the visible Steel check button, loaded S2-D1, ran the WASM check and inspected the pass result. Repeated the browser journey on the final build and confirmed expanded clause text wraps. [Desktop screenshot](steel-check-desktop.png), SHA-256 `b93329dd66d4eabe6763f67fd1813bc2480967e4c08b79c0427a30d0c6d6fb3b`.
- Axe WCAG 2 A/AA and 2.1 AA scan of the open steel dialog: zero violations, zero incomplete checks in headless Chromium. This automated scan does not establish full accessibility acceptance.

Preview from this workspace: `PORT=4182 npm run preview`, then `http://127.0.0.1:4182/app.html`. Service workers may keep another port on an older cached build; use a fresh origin or the app's reload update path when reviewing changes.

Scope remains the accepted M07 AISC S2 profile. The current model-derived path overlays one real analysis demand on published example W-section properties; it does not select a model-owned catalogue section. M08 concrete design remains resource blocked.
