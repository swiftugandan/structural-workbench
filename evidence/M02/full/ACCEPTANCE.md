# M02 acceptance record

Source hash: `695a419edc4afecccfee2f851c2123b56f9f6fdf9a513f746fa04ce618366396`
Build hash: `9b2ccb5c8ad40ed650df3bbe191a9161b1c6c9a79777fd96edac226c5e9637b0`
Observed: 2026-09-23T08:12:29.962Z

| ID | Title | Status | Observation |
| --- | --- | --- | --- |
| M02-CASES | Load cases and combinations | PASS | Dead/live/wind cases, explicit strength combinations and B11 factored tip response exercised in browser suite. |
| M02-EXTREMA | Exact extrema and stations | PASS | B07 key-station midspan moment and analytical B01–B11 extrema covered by native/numerical corpus. |
| M02-RELEASES | My/Mz release condensation | PASS | R01 My release under UDL matches simply-supported closed form in native tests. |
| M02-POINTS | Interior point loads | PASS | P01 interior point matches B05 closed form; force jump preserved in native corpus. |
| M02-SELF-WEIGHT | Self-weight without double-counting | PASS | B10 analyse, DUPLICATE_SELF_WEIGHT rejection and combination validity after case delete pass in browser. |
| M02-PRESCRIBED | Prescribed support movement | PASS | B09 settlement analyse and free-DOF prescription rejection pass in browser. |
| M02-ENVELOPE | Governing combination provenance | PASS | V01 envelope exposes a real governing combination; browser wind envelope cites combination provenance. |
| M02-INVALID | Invalid load and release rejection | PASS | n22 single-case envelope rejection and related INVALID fixtures covered by native tests. |

## Limitations

- Parent M02 gate packages slice behaviour already implemented; it does not claim commercial load-code generators or M03 spatial parity.
- Platform hardware was accepted under M01 (ADR 0005); this gate reuses same-build analytical and browser regression.
