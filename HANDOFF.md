# M01 handoff

Work in `/Users/p.munaawa/Documents/projects/labs/prokon`, on `main`. The ChatGPT
project mirror's sources are read-only. Do not spawn agents unless newly authorized.

The user's full M01 implementation request has been implemented. Formal completion
is **BLOCKED_RESOURCE**, not accepted. All local automated gates pass. There are
only two reported M01 gate blockers: the required Windows/Linux real-GPU runner
and the requested computer-use check (CUA cannot verify its admin-enforced policy).
The user already explicitly authorized browser use; asking for permission again
will not fix that service failure. Do not bypass it with another control route.

Read `delivery/state.json`, `evidence/M01/full/README.md`,
`docs/M01_HARDWARE_RUNNER.md` and `evidence/M01/full/gate-M01.json` first.
The implementation source commit is `dd67da6`; full SHA and source/build hashes
are in delivery/state.json. A later evidence-only commit may follow it.

## Implemented and verified locally

Three working planes/offsets, aligned grid and snap feedback, disconnected-crossing
markers and near-node warnings; click/Shift/blank-drag selection; cursor zoom,
pan/orbit/fit; keyboard-only portal creation/numeric drawing/table editing/solve;
atomic move/copy/dependency-delete/measure; existing axes, split/connect/merge,
load preservation, lineage, exact undo/redo and autosave/reopen/report.

The final build passed 29 native tests, 27 browser tests, three contract tests,
two security tests, three verifier tests, 33 native and 33 WASM analytical checks,
and 20 independent OpenSees models / 1,440 values. Portal and loaded-split browser
journeys also compare against independent OpenSees. An identical second build
reproduced every artifact hash. Evidence carries the same source/build identity;
original fixtures and historical evidence remain intact.

CAD size checks passed for 5,000 nodes/10,000 members, including import/export,
picking/snapping and 1,000-member edit latency. Software-GPU orbit measured above
the hardware target and is explicitly not accepted as hardware performance.
Startup and compressed payload limits passed. See raw samples in the evidence.

## Next priority: M01-UX

The user requested UI/UX improvement first. [M01-UX](agent-tasks/M01-UX.md) is now the active READY sub-milestone: audit, create a viewable design, implement, and verify the existing workflows. Complete this work before resuming final M01 acceptance or starting M02. Existing test results describe the earlier candidate; UI changes require refreshed same-build evidence.

## Parent acceptance after M01-UX

Wait for the external resources, then follow `docs/M01_HARDWARE_RUNNER.md` on the
authorized real-GPU runner and perform the actual CUA portal authoring journey.
Finally, with the evidence environment set:

```sh
export WORKBENCH_EVIDENCE_DIR=evidence/M01/full
export WORKBENCH_TASK_ID=M01-FULL
export WORKBENCH_MILESTONE=M01
npm run verify:milestone -- M01
```

The verifier must fail until those checks pass. Do not mark M00/M01 accepted or
advance dependent milestones by treating software-GPU evidence as the missing
hardware gate. A resource question about an authorized runner is already pending.

Preview is http://127.0.0.1:4173; run `npm run preview` if needed. Source changes
require a new build and affected same-build evidence. The full browser run takes
about four minutes including a 60-second orbit measurement. Build must finish
before browser tests; do not replace dist during a test run.

`implementation-findings.md` records fixed async drawing, selection and dialog
races plus load-variant normalization. The test harness now honors
WORKBENCH_EVIDENCE_DIR instead of overwriting M00 evidence. Logs referenced by
artifact hashes are intentionally committed despite the general *.log ignore.
No push or remote configuration was requested or performed.
