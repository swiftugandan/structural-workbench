# M03 gap-closure gates

Same-build evidence for previously under-specified SPEC/VALIDATION items:

| Check | Spec / VALIDATION | Artifact |
| --- | --- | --- |
| Cancel ≤250 ms / editing ≤1 s | VALIDATION §performance | `cancel-timing.json` |
| Analyse UI gap ≤100 ms | SPEC M03 UI attribution | `ui-responsiveness.json` |
| GPU loss during blocked analyse | SPEC M03 GPU during analysis | `gpu-during-analysis.json` |

Recorded by `tests/e2e/m03-gates.spec.js` into the active `WORKBENCH_EVIDENCE_DIR` (parent runner uses `evidence/M03/full`).
