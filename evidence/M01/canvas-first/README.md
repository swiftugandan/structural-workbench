# Canvas-first and readable-label candidate

Source commit: b2eee20415c7ad9167d6218d50c5e0870cef7431
Source hash: 5c86e8f331a3da2ff2722419bca3fa739e0739afcac99e61e92bb554ce4fa202
Build hash: 75aae0b6359a589b9e1720a751302ca0a492db66f4136a47d79f571d18c8b36d

Implemented direct member/node/support/load creation; move/copy/split/measure/dependency delete; contextual assignment properties and nonmodal precision panels. Hidden internal IDs have persisted short labels in canvas, inspector, model tables, reference fields, results and reports. Copies and splits get fresh labels; delete, undo/redo and save/reopen preserve identity. No migrations.

Final checks: 34 browser tests; 30 native tests; 33 signed native/WASM numerical comparisons; 3 contract tests; 4 milestone-verifier tests. All pass on this source snapshot. Automated Chromium/SwiftShader checks do not establish real hardware performance or live visual acceptance.

During iteration, browser tests caught a model-list naming conflict and load badges intercepting geometry gestures. Both were corrected and the complete browser suite rerun. No fixture expected values changed.

Live computer use remains BLOCKED_RESOURCE because the browser service could not verify its admin-enforced policy. No live review of this build occurred. UX-01 through UX-08 acceptance and parent Windows/Linux real-GPU evidence remain outstanding; no milestone acceptance is claimed.

Reproduce with WORKBENCH_EVIDENCE_DIR=evidence/M01/canvas-first, WORKBENCH_TASK_ID=M01-UX, WORKBENCH_MILESTONE=M01. Build before testing; run cargo test --workspace, npm run test:browser, npm run test:wasm, npm run test:contracts and node --test tests/milestone-gates.test.mjs. Never replace dist during tests. npm run verify:milestone -- M01-UX remains blocked until live evidence is available.
