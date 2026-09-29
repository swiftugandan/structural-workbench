# M07-S acceptance record

Source hash: `deaa5248905a81bf21ebf46cc0c4eb7ca8129593a7bf34569f9d85074fac3349`
Build hash: `af96ae310eff0fc5bb7f1533c4bd7af4b3b37552929b2274db1b2ac72a4496f5`
Observed: 2026-09-29T12:15:32.696Z
Status: **PASS**

| ID | Title | Evidence | Status | Observation |
| --- | --- | --- | --- | --- |
| DW-SVc1-DEFLECTION | Deflection under a service case against closed forms | kernel_validation | PASS | B04 cantilever W18×50: absolute tip deflection equals PL³/3EI to 1e-9 (kernel) and 1e-6 (browser, independent Ix and E); chord-relative deflection equals max[v(x) − v(L)x/L]. |
| DW-SVc1-SEPARATE | Serviceability status distinct from strength | ui_journey, exported_outcome | PASS | A failing deflection limit leaves the strength verdict PASS; the panel, overview column and design record carry serviceability separately; members without criteria show NOT CHECKED. |
| DW-SVc1-GUARDS | Service inputs are validated | failure_path | PASS | Strength combinations (INVALID_LOAD), missing cases (DANGLING_REFERENCE) and limits below L/1 (INVALID_SCHEMA) are refused atomically; section reassignment keeps the member's criteria. |

Limitations: User deflection criterion L/n under one service case or combination, chord-relative or absolute, sampled at the 41 exact analysis stations of each member. Not an AISC 360 requirement; vibration, drift and ponding are not checked.
