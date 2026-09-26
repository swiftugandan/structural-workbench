# Model visibility toolbar alignment — 2026-09-26

CSS-only correction: align action buttons with the Storey/Layer fields, left-align their labels, and use consistent 28 px control heights. Preserve wrapping.

Build: `f9a719668b51d5b90dec5fb7ff0e3bec355edaa86263cf1109be2f63fd5d035e` (`npm run build`, successful). Build metadata and dependency hashes are in `../../release-manifest.json` and `../M00/current/build.json`.

Actual Chrome session `prokon-design`, local app port 4173, UK residential reference opened through its recent-project card. Updated through the application's service-worker reload action. Browser DOM assertions and screenshots:

- 1440 × 900: all six controls have height 28 px and identical top/bottom positions (249.5 / 277.5 px). `wide.png`.
- 900 × 900: all six controls have height 28 px and remain inside the toolbar (top/bottom 290 / 318 px). `narrow.png`.
- 600 × 900: all six controls have height 28 px, remain inside the toolbar, and Show all wraps onto the next row. `wrapped.png`.

Assertions throw on inconsistent heights or horizontal toolbar overflow; the wide check also requires identical bottom edges. Wide and wrapped screenshots visually inspected. This is layout verification only; no numerical or compliance claim.
