# Laboratory Metal unblock evidence

Operator direction: unblock on this macOS host rather than wait for an external
Windows/Linux runner or a restored CUA policy service. Contract change:
`docs/adr/0005-lab-platform-and-live-visual.md`.

## Runner

- Platform: darwin x64 (this laboratory iMac)
- GPU: AMD Radeon R9 M395 (WebGPU vendor `amd`, architecture `gcn-3`) via system Chrome channel
- Pin: `docs/lab-runner.json` (orbit/longest-frame lab thresholds; not reference-class 33 ms)

## Gates cleared here

- `hardware-windows-linux.json` — PASS with real AMD Metal identity and same-build corpus
- `computer-use.json` — PASS via `live-visual-playwright` headed screenshots (ADR 0005)

## Not claimed

- Reference-class 33 ms orbit performance equivalence
- Full parent M00/M01 milestone acceptance (still requires `ux-acceptance` and remaining verifier families as applicable)
- Commercial PROKON parity

Reproduce with `WORKBENCH_EVIDENCE_DIR=evidence/M01/lab-metal`,
`WORKBENCH_TASK_ID=M01-UNBLOCK`, `WORKBENCH_MILESTONE=M01`, then
`npm run build`, native/contracts/security/numerical/wasm/oracle,
`WORKBENCH_REAL_GPU=1 node tools/run-browser.mjs`,
`node tools/run-live-visual.mjs`.
