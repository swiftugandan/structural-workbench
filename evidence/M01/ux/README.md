# M01-UX candidate evidence

Source commit: 06ac4825bbfc6e620746f7ff8ff4b2fd679df644
Source hash: cb7767bbd3a6e3986224e094b83a5f2af4b6a4febbd4cd809e1e0401646a1f36
Build hash: 5da51b214b5c84f67646dc1eeea50de187a9964c9245e7c42993e01246b8410f

Implemented grouped SVG icon ribbon, Rust-picked context actions, keyboard menu navigation/focus restoration, empty/multiple selection properties, draft cancellation/protection, responsive panel navigation and collapsible results. See docs/design/M01-UX/IMPLEMENTATION.md.

Final checks: 29 browser tests (including accessibility, graphics, recovery, CAD capacity, keyboard and new UX paths); 33 signed native/WASM numerical comparisons; 3 contract tests; 4 milestone-verifier tests. All pass. Browser automation uses Chromium/SwiftShader and does not establish hardware performance or replace actual computer-use acceptance. Viewport coverage in the UX tests includes 390×844, 768×1024, 1280×720 and 1440×900.

The first browser run had four failures: three from an ARIA attribute on the panel container and one from an incorrect Copy operation name. Both defects were fixed; this directory contains the final build's rerun evidence.

The M01-UX verifier intentionally reports BLOCKED: the browser service cannot verify its admin-enforced policy, so live visual/computer-use review and the final UX-01–UX-08 acceptance record are pending. Do not infer acceptance from automated regression results. Existing parent Windows/Linux real-GPU acceptance also remains pending.

Reproduce using WORKBENCH_EVIDENCE_DIR=evidence/M01/ux, WORKBENCH_TASK_ID=M01-UX and WORKBENCH_MILESTONE=M01. Build first, then run npm run test:browser, npm run test:wasm, npm run test:contracts and node --test tests/milestone-gates.test.mjs. npm run verify:milestone -- M01-UX must remain blocked until the required live evidence exists. Never replace dist during tests.
