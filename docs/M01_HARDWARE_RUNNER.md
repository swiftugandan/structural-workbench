# Required M01 release runner

The platform gate requires a **real** GPU Chromium lane (VALIDATION §7, ADR 0005).
Allowed hosts: Windows, Linux, or macOS. Chromium SwiftShader / software adapters
do not satisfy the gate. No cloud account or paid runner is assumed.

Use the exact source commit and locked toolchain, Node dependencies and fixture
hashes. Preserve the build artifact and dist/build.json. Run the native, contract,
security, analytical, native/WASM and OpenSees commands against that build. Pin the
oracle runtime for the runner platform; do not copy another OS's oracle environment
as if portable.

Set WORKBENCH_EVIDENCE_DIR=evidence/M01/full, WORKBENCH_TASK_ID=M01-FULL and
WORKBENCH_MILESTONE=M01. `node tools/run-hardware.mjs` then runs the browser corpus
with WORKBENCH_REAL_GPU=1 (system Chrome channel on macOS for Metal WebGPU),
verifies adapter identity (rejects software GPUs), checks full same-build records,
60-second orbit samples and the declared timings (lab-pinned via
`docs/lab-runner.json` when the host matches). It fails closed when the adapter is
software or required families are missing.

Live visual / computer-use is a separate gate. Prefer CUA when its policy service
works. If CUA is unavailable, run `node tools/run-live-visual.mjs` on the same
real-GPU build and record hashed screenshots. Repository headless Playwright with
SwiftShader is development evidence only and does not substitute for live visual.

A laboratory macOS (or Linux/Windows) shell run after dependency/oracle setup is:

```sh
export WORKBENCH_EVIDENCE_DIR=evidence/M01/full
export WORKBENCH_TASK_ID=M01-FULL
export WORKBENCH_MILESTONE=M01
npm run build
node tools/run-check.mjs native cargo test --workspace --locked
node tools/run-check.mjs contracts npm run test:contracts
node tools/run-check.mjs security npm run test:security
node tools/run-check.mjs milestone-gates node --test tests/milestone-gates.test.mjs
npm run test:numerical
npm run test:wasm
npm run test:oracle
node tools/run-hardware.mjs
node tools/run-live-visual.mjs
npm run verify:milestone -- M01
```

Do not copy a blocked record and change its status. Preserve same-build records
and all referenced logs/screenshots/projects/reports; the verifier checks their
hashes. A failed or skipped mandatory browser case blocks acceptance even if an
individual family summary reports PASS.
