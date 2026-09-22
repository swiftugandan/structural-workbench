# Guided input and template verification

The delivered forms provide a compact grouped explorer, structural drawing symbols, coordinate/member/support/load diagrams, named references, explicit units, support presets, load direction/magnitude entry and visual template pickers. There are eight catalogue sections, six example loading patterns and three elastic materials. Catalogue values and material assumptions are documented in [TEMPLATE_SOURCES.md](../../../docs/design/M01-UX/TEMPLATE_SOURCES.md).

Final isolated run: **42 browser/e2e/accessibility/graphics tests passed**, including six guided-input/template tests. **33 signed analytical checks with native/WASM comparisons**, **3 contract checks** and **2 security checks** passed. See verification.json, playwright-results.json and wasm.json. Actual browser screenshots include the explorer, support editors and section/material/load galleries. These screenshots are automated-browser evidence, not CUA observation or physical-device testing.

The shared checkout was being updated and rebuilt by a separate rendering task. One broad run was interrupted after concurrent Playwright cleanup caused trace-file ENOENT errors. The final run copied an immutable static build to /tmp/prokon-guided-inputs-verified, served port 4186 and used /tmp/prokon-guided-inputs-test-results. The exact runner configuration is retained here. The preview normally runs on port 4173.

The captured build is identified in tested-build.json; every static file hash was checked. All seven UI modules owned by this task matched the captured build byte-for-byte (verified-source-files.json). Unrelated rendering changes committed after the snapshot are not claimed as covered by this evidence. Initial-build.json is the earlier build record and is not the final tested snapshot.

Reproduce normal checks from a stable checkout with npm run build, npx playwright test tests/e2e tests/accessibility tests/visual, npm run test:wasm, npm run test:contracts and npm run test:security. Isolate the preview/output directories if other work is running concurrently.

Live computer-use review remains blocked because the browser tool could not verify its admin-enforced policy. The existing Windows/Linux hardware and broader M01/release gates remain unchanged. No standards-compliance or commercial-parity claim is made.
