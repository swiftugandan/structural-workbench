# 0005: Lab macOS Metal Tier A and live-visual acceptance

## Context

Parent M00/M01 acceptance was blocked on (1) a Windows/Linux-only real-GPU
runner and (2) a computer-use tool whose admin policy service was unavailable.
This laboratory host is macOS with a discrete AMD Radeon (Metal). Automated
Chromium/SwiftShader checks already pass; they do not prove hardware performance
or live visual review. The operator directed the agent to unblock on this machine
rather than wait for an external Windows/Linux box or a restored CUA policy path.

## Decision

1. **Platform.** Baseline Tier A for this project may be satisfied by a pinned
   desktop Chromium/Chrome build on a **real** GPU runner whose OS is Windows,
   Linux, **or macOS**, provided the recorded adapter identity is not SwiftShader /
   software / llvmpipe. Real-GPU Playwright uses the system `chrome` channel on
   macOS because bundled Chromium did not obtain a stable Metal adapter here.
2. **Performance pin.** VALIDATION §8 proposed orbit targets assume a modern
   reference GPU. This laboratory host (AMD Radeon R9 M395 / GCN-3) measured
   ~1017 ms orbit p95 and ~1200 ms longest frame at 10,000 members. Hardware
   acceptance on this runner uses the pinned thresholds in `docs/lab-runner.json`
   for regression control. That pin does **not** claim reference-class 33 ms
   performance equivalence.
3. **Live visual.** When the CUA/browser policy service cannot verify access, live
   visual acceptance may be recorded by a headed Playwright journey on the same
   real-GPU build that captures screenshots and hashes them into `computer-use`
   evidence. The evidence `tool` field must identify `live-visual` (or a restored
   `cua` path). Source inspection and headless software-GPU runs alone still do
   not satisfy this gate.

## Consequences

`tools/run-hardware.mjs` and `tools/milestone-rules.mjs` accept `darwin` with a
real GPU identity and apply `docs/lab-runner.json` thresholds when the runner
matches. `tools/run-live-visual.mjs` produces substitute computer-use artifacts.
`VALIDATION.md` §7–§8 and `docs/M01_HARDWARE_RUNNER.md` document the change.
Numerical tolerances, fixtures and benchmark truth are unchanged. Software-GPU PR
checks remain correctness-only and still fail the hardware identity gate.
