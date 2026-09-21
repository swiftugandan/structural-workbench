# Required M01 release runner

The missing platform is a real Windows or Linux GPU, as required by VALIDATION §7.
The current macOS host and Chromium SwiftShader do not satisfy that gate. No cloud
account or paid runner is configured or assumed.

Use the exact source commit and locked toolchain, Node dependencies and fixture
hashes. Preserve the build artifact and dist/build.json. Run the native, contract,
security, analytical, native/WASM and OpenSees commands against that build. The
oracle runtime must be acquired and pinned for the runner platform; the repository's
current oracle environment is macOS and must not be copied as if portable.

Set WORKBENCH_EVIDENCE_DIR=evidence/M01/full, WORKBENCH_TASK_ID=M01-FULL and
WORKBENCH_MILESTONE=M01. `node tools/run-hardware.mjs` then runs the browser corpus
without the software-GPU override and verifies actual adapter identity, required OS,
full same-build records, 60-second orbit samples and the declared timings. It fails
closed on this macOS host. The runner must provide a functioning graphical session
and hardware browser acceleration. Save driver identity separately where available.

Computer-use verification is a separate requested gate. It requires the actual
computer-use tool to open the delivered build, create/edit/solve a portal, exercise
selection/drawing/topology, and save observed screenshots/accessibility state. A
browser tool whose access-policy check fails is not a passing computer-use run.

A Linux shell run after dependency/oracle setup is:

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
npm run verify:milestone -- M01
```

The last command continues to fail until current computer-use observations have
also been recorded. Do not copy a blocked record and change its status. Preserve
same-build records and all referenced logs/screenshots/projects/reports; the
verifier checks their hashes. A failed or skipped mandatory browser case blocks
acceptance even if an individual family summary reports PASS.
