# M03 acceptance record

Source hash: `e5e7582efadace516105fbabe73137901ff15516762e91db7bced365ffeeb0f9`
Build hash: `e112692f8a1443629b1474de97ae08f837781c6d95af243ad7c147e4464cc1f0`
Observed: 2026-09-23T11:16:51.289Z
Status: **PASS**

| ID | Title | Status | Observation |
| --- | --- | --- | --- |
| M03-ORBIT-COPY | Spatial orbit and bay copy with spatial loads | PASS | CopyBay plus spatial roof loads produce non-trivial My/Mz/T; orbit compass updates without model hash change. |
| M03-DUAL-WORKERS | Separate model/analysis Workers and cancel | PASS | Cancel restores the model within timing gates; a superseded solve never becomes Current after edits. |
| M03-ORACLE | Skewed/asymmetric OpenSees pack + native R01/B09 | PASS | S01/S02/B07 match OpenSees; R01/B09 are native analytical cross-checks (ADR 0006). |
| M03-CAPACITY | 5,000-node multibay solve and memory guard | PASS | Connected 5k-node frame solves under the median gate; WASM refuses over-budget models with MEMORY_LIMIT. |
| M03-UNIT-ACTION | All-axis unit-action tests | PASS | Tip unit loads recover tip end actions with root lever balance and section@0 = −q_i. |
| M03-ROLL | Member reversal and roll | PASS | Endpoint reversal and localY roll swap My/Mz with tip uz scaling by Iy/Iz. |
| M03-SECTION-AXIS | Section-axis editing | PASS | Property-form localY edit re-analyses with swapped end moments in the forces table. |
| M03-HIERARCHY | Physical-to-analytical mapping UI | PASS | Split children group under physical parent in the model tree with inspector lineage. |
| M03-GPU-DURING-ANALYSIS | GPU loss during analysis preserves model | PASS | Recreating the viewport while analysis is blocked keeps the model hash and entity counts. |
| M03-UI-RESPONSIVENESS | Analyse does not block UI >100 ms | PASS | Event-loop gaps stay ≤100 ms after Analyse while the Worker is busy. |

## Limitations

- OpenSees numerical parity is claimed only for S01/S02/B07 (ADR 0006). R01/B09 use native analytical cross-checks.
- 5k-node median solve evidence remains native CLI; WASM evidence covers MEMORY_LIMIT refusal, not the full 5k factorisation in-browser.
- Commercial PROKON parity is not claimed.
