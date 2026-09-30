# M22 acceptance record

Source hash: `b50c22294fd2c3366ed0c929d221ec9804fc0491178ce1216ccea6627c885260`
Build hash: `3319e2a0766c582f4d7b19cae5910f11233c40d5beb3d023eb9495b30e06bd7d`
Observed: 2026-09-30T10:21:02.891Z
Status: **PASS**

| ID | Title | Evidence | Status | Observation |
| --- | --- | --- | --- | --- |
| M22-INTERFACE | Documented command JSON interface and native CLI on the same core | ui_journey | PASS | The same execute_study_document runs from workbench-cli and from Analysis › Run study on the analysis Worker (contracts/PROTOCOL.md §1.1); the browser loads a declarative document, compares variants and downloads the report. |
| M22-REPLAY | Deterministic replay | regression_results | PASS | Replaying a study reproduces every model/result/settings hash and observed value exactly; reports carry the study digest, base model hash and solver build that define the replay identity. |
| M22-CANCELLATION | Cancellation | failure_path | PASS | A 50-variant study on the 447-node UKR01 model is cancelled from the toolbar; no partial report is kept, the open model is unchanged and the respawned Worker runs the next study. |
| M22-BUDGETS | Resource budgets | failure_path | PASS | At most 50 variants, 100 steps per variant and 1000 steps per study, checked before any analysis (STUDY_BUDGET); the whole run shares the project's analysis time limit and memory budget. |
| M22-LOCATED-ERRORS | Errors tied to input steps | failure_path | PASS | Every failure names the variant, step, JSON pointer and stage (set, validate, analyse, observe) in its message and in details.studyLocation; the UI shows the location and no partial results. |
| M22-MANUAL-MATCH | Results match manual workflows | kernel_validation | PASS | A variant has the model hash, result id and bit-identical displacement of the same edit made by hand; in the browser the materials editor reaches the variant's hash and the analysed tip displacement matches. |
| M22-GUARDS | No script bypasses validation or unsupported-capability guards | failure_path | PASS | Solver overrides, schema/identity/metadata targets, unsupported analysis settings and releases, dangling references, unknown study fields and no-op variants are refused through the same validation as manual edits. |
| M22-EXPORT | Comparative report with every model/result hash | exported_outcome | PASS | The downloaded HTML report lists each variant's steps, observed value, ratio, model, result and settings hashes, and embeds the study document verbatim with its replay identity. |

Limitations: Studies are restricted declarative JSON-pointer sweeps of linear static analysis on one case or combination; no general scripting language or Python runtime. Multilingual reports are deferred. Commercial PROKON parity remains UNKNOWN.
