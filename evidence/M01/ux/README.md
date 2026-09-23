# M01-UX acceptance evidence

Status: **PASS** (`gate-M01-UX.json`)

Source revision: `337d6128dcf47673ee146d3651208a45ca53e477`
Source hash: `05ed4b9bea0c3bf78ebcdb8be305508c5f1b55188f9d543c0dbd3a57a232c29a`
Build hash: `5c6f34d49aeb228c1ef12a0721d8b8728fc29137ae752fb07e54a3fa83d68728`

## Corpus

| Family | Result |
| --- | --- |
| build | PASS |
| contracts | PASS (3) |
| wasm | PASS (33) |
| browser-suite | PASS (58) |
| accessibility | PASS (2) |
| graphics | PASS (3) |
| computer-use | PASS (`live-visual-playwright`, ADR 0005) |
| ux-acceptance | PASS (UX-01…UX-08) |

Live observation uses headed Chrome + real Metal GPU screenshots (`live-visual-*.png`). CUA policy service was not required for this record.

Acceptance narrative: `ACCEPTANCE.md`.

## Reproduce

```bash
export WORKBENCH_EVIDENCE_DIR=evidence/M01/ux
export WORKBENCH_TASK_ID=M01-UX
export WORKBENCH_MILESTONE=M01
npm run build
node tools/run-check.mjs contracts npm run test:contracts
npm run test:wasm   # requires preview on :4173
npm run test:browser
node tools/run-live-visual.mjs
node tools/record-ux-acceptance.mjs
npm run verify:milestone -- M01-UX
```

Do not replace `dist/` during the run. Parent M00/M01/M02 acceptance is separate.
