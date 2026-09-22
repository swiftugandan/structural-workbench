# Workspace layout controls

Independent desktop toggles for model tree, properties, results, command ribbon and canvas toolbar. Focus canvas temporarily hides them and restores the previous choices. Preferences persist locally; hidden property drafts remain mounted. Narrow layouts retain exclusive panel navigation.

Validation: build PASS; 4 Playwright checks PASS (layout expansion/persistence/draft/results, workspace keyboard/context/draft journey, responsive panel navigation, axe accessibility). Run with tests/e2e/layout-panels.spec.js, tests/e2e/workspace-ux.spec.js and tests/accessibility. A temporary Playwright configuration uses port 4175 because port 4173 serves another preview. Equivalent reproduction: use the repository preview on 4173 and the normal Playwright configuration.

Live CUA on the final build: reopened cantilever at 1280x720, hid model tree, entered Focus canvas, observed full-width expanded canvas, restored layout and confirmed tree stays hidden while properties/ribbon return. Browser reported WebGPU AMD. This verifies this layout change only, not full UX-01–UX-08 or Windows/Linux GPU acceptance.

An initial build was invalidated by a test file edit during build and discarded. Initial tests reached an unrelated marketing preview on port 4173 and were stopped. Rebuilt complete snapshot before the successful final run. A draft expectation was corrected to preserve the actual Unapplied changes status until cancelling the draft.

Source hash: 20f83cf8315cba0b7a6ac9ed58d03b3338ee91fbba535aa6a291de05ac966bbf
Build hash: 13ffca2513c997b6cfae5a986eff97f826c0c77568a6743f15dbc2c02632b7aa
Preview: http://127.0.0.1:4175/app.html
