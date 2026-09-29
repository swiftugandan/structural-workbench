# M07-LTB acceptance record

Source hash: `657deef23600df5428fe185e311e5d913aec83f0ba0d3e4eddf41f9d9f28bac8`
Build hash: `57d135fbe116c35c1b96f40ff1dd503b1e71dfce2da178df522617fba46c97c6`
Observed: 2026-09-29T10:44:29.061Z
Status: **PASS**

| ID | Title | Evidence | Status | Observation |
| --- | --- | --- | --- | --- |
| DW-LTB1-F2.2 | Lateral-torsional buckling (F2.2) against published examples | kernel_validation | PASS | F.1-2B (inelastic, Lp 69.9 in., Lr 203 in., φbMn 304 kip-ft) and F.1-3B (elastic, Fcr 43.2 ksi, φbMn 288 kip-ft) within 0.5 %; derived rts and ho reproduce the published 1.98 in. and 17.4 in.; model-native members with Lb > Lp get F2-2 in the browser. |
| DW-LTB1-F3 | Noncompact flange local buckling (F3-1) against the published example | kernel_validation | PASS | F.3B W21×48 λpf 9.15, λrf 24.1, Mn 5,310 kip-in., φbMn 398 kip-ft; the full check routes noncompact flanges (W14×99) through F3-1 and never lifts LTB above Mp. |
| DW-LTB1-UNSUPPORTED | Unsupported cases remain UNSUPPORTED | failure_path | PASS | Slender flanges (F3-2), noncompact webs (F4), missing classification, missing torsional properties for Lb > 0 and Cb < 1 are UNSUPPORTED; the slender-flange seed shows UNSUPPORTED in the browser. |
| DW-LTB1-S2-REGRESSION | S2 fixture regressions still pass | regression_results | PASS | All five S2 published examples still match on the same build; the M07 parent gate is rerun on this build. |

Limitations: Doubly symmetric W-shapes with compact webs; Cb is a user input; slender flanges, noncompact/slender webs, HSS, channels, weak-axis flexure, torsion and non-prismatic members stay unsupported. Not a claim of full AISC 360 coverage or commercial parity.
