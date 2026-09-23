# M02 full acceptance evidence

Status: **PASS** (`gate-M02.json`)

Source hash: `695a419edc4afecccfee2f851c2123b56f9f6fdf9a513f746fa04ce618366396`
Build hash: `9b2ccb5c8ad40ed650df3bbe191a9161b1c6c9a79777fd96edac226c5e9637b0`

Parent M02 packages load-scenario behaviour: B07–B11, releases, interior points, self-weight, prescribed movement, envelopes and INVALID rejection — with same-build native/numerical/WASM and browser regression plus `m02-acceptance` (M02-CASES…M02-INVALID).

Narrative: `ACCEPTANCE.md`.

```bash
export WORKBENCH_EVIDENCE_DIR=evidence/M02/full
export WORKBENCH_TASK_ID=M02-PARENT
export WORKBENCH_MILESTONE=M02
npm run build
node tools/run-check.mjs native cargo test --workspace --locked
node tools/run-check.mjs contracts npm run test:contracts
npm run test:numerical
npm run test:wasm
npm run test:browser
node tools/record-m02-acceptance.mjs
npm run verify:milestone -- M02
```
