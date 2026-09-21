# Support symbol validation

Source commit: 41f4096120252017be81d82cb139dae706f49fc3
Source hash: 3edffd11501bfa06387af99e3a28c0b8d6e1c927b0cf0d31b798f83b82fd1d9d
Build hash: d5b1acc64cda8695fdeb41ea5ab891af5d0909e873f5e362a3412f76f38e77c1

Fixed faces, pins and rollers now follow active support restraints and camera projection. Partial constraints are explicitly Custom; end-on rollers have a distinct marker. Symbols and labels update on property changes and undo. Engineering state and numerical behavior are unchanged.

Passed: 35 browser tests (including support property edits, orientation, view changes and undo), 4 focused classification/projection tests, 33 signed native/WASM numerical comparisons, 3 contract tests. Previous canvas-first evidence remains in evidence/M01/canvas-first but is not current-build acceptance.

Live CUA review was attempted and denied because the admin-enforced browser policy could not be verified. Automated Chromium/SwiftShader tests do not establish live visual acceptance or parent Windows/Linux real-GPU performance. UX acceptance remains blocked.

Truss joints/member-end hinge symbols are not implemented. The kernel currently rejects end releases; ordinary node dots do not imply pinned/truss behavior.

Reproduce with WORKBENCH_EVIDENCE_DIR=evidence/M01/support-symbols, WORKBENCH_TASK_ID=M01-UX and WORKBENCH_MILESTONE=M01. Build, npm run test:browser, npm run test:wasm, node --test tests/support-symbols.test.mjs and npm run test:contracts. Do not replace dist during tests.
