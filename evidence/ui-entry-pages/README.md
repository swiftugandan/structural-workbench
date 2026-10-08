# Marketing and start pages — 2026-09-26

Updated both pages against the current capability review: model-native bounded AISC steel checks, all-member review, five-record catalogue candidate reanalysis, storeys/layers and Lines/Solid display. Concrete and UK National Annex checks remain labelled preview/not enabled. Replaced the marketing illustration and invented result labels with an actual residential workspace screenshot. Added a 20 px gap above New planar portal.

Build `ad35fc6c7ed41cd64e65120a0feea1f6c61ed5f955d62548918a683f3e3cdaff`; `npm run build` successful. Dependency/build metadata: `../../release-manifest.json`, `../M00/current/build.json`.

- `WORKBENCH_EVIDENCE_DIR=evidence/ui-entry-pages npx playwright test tests/marketing.spec.js`: 1 passed. Covers current claims, real image loading, phone overflow, marketing-to-app navigation and opening the residential example with the Design menu.
- `npm run test:contracts`: 3 passed.
- `npm run test:security`: 2 passed.
- Live Chrome gusset-design: desktop 1440 × 900 and phone 390 × 844. Actual marketing CTA opens app. Neither phone page overflows horizontally. Portal button gap measures 20 px on both widths. Screenshots retained; marketing desktop and start phone visually inspected.
- `npm run verify:release`: BLOCKED; exact output and gate retained here. Historical evidence is stale and the full release verifier has incomplete milestone gates. Delivery is a preview, not full-product acceptance.

The product screenshot was captured from build `caab9b61fffe1b29698c8f42df0e1ae1db5b7758821bb05e0d88a266d7c06c5b`; this increment changes entry pages, not the pictured workspace.
