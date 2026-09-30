# M07-LTB acceptance record

Source hash: `83eb37b6ab55668782eca0c60e69694f51fde7643be8e68da7e5a46c5ba75599`
Build hash: `fb51d59eedce6877434409489a30b59af8f4e8c945f523e12f8fad0f4a35e0ab`
Observed: 2026-09-30T09:37:29.255Z
Status: **PASS**

| ID | Title | Evidence | Status | Observation |
| --- | --- | --- | --- | --- |
| DW-LTB1-F2.2 | Lateral-torsional buckling (F2.2) against published examples | kernel_validation | PASS | F.1-2B (inelastic, Lp 69.9 in., Lr 203 in., φbMn 304 kip-ft) and F.1-3B (elastic, Fcr 43.2 ksi, φbMn 288 kip-ft) within 0.5 %; derived rts and ho reproduce the published 1.98 in. and 17.4 in.; model-native members with Lb > Lp get F2-2 in the browser. |
| DW-LTB1-F3 | Noncompact flange local buckling (F3-1) against the published example | kernel_validation | PASS | F.3B W21×48 λpf 9.15, λrf 24.1, Mn 5,310 kip-in., φbMn 398 kip-ft; the full check routes noncompact flanges (W14×99) through F3-1 and never lifts LTB above Mp. |
| DW-LTB1-UNSUPPORTED | Unsupported cases remain UNSUPPORTED | failure_path | PASS | Slender flanges (F3-2), noncompact webs (F4), missing classification, missing torsional properties for Lb > 0 and Cb < 1 are UNSUPPORTED; the slender-flange seed shows UNSUPPORTED in the browser. |
| DW-LTB1-CB | Cb from the model's moment diagram (F1-1) | kernel_validation | PASS | Example F.1-2B modelled as three members gives the published Cb = 1.01 (centre) and 1.46 (ends); derivation needs Lb equal to the member length; a free cantilever end takes Cb = 1.0 per F1. |
| DW-LTB1-SEGMENTS | Bracing points: Lb and Cb per unbraced segment (ADR 0024) | kernel_validation | PASS | Example F.1-2B as one member braced at its thirds gives segments with Lb = L/3 and Cb 1.46, 1.01, 1.46, and the governing F2-2 resistance and centre Cb equal the three-member model's to 1e-9. Bracing points without the points assumption, an entered Lb, unordered stations and stations at the ends are refused. In the browser, the B04 cantilever braced at mid-length gives Lb = 1.5 m per segment, Cb = 1.25 (F1-1 on the linear diagram) at the fixed end and 1.0 at the free end. |
| DW-LTB1-S2-REGRESSION | S2 fixture regressions still pass | regression_results | PASS | All five S2 published examples still match on the same build; the M07 parent gate is rerun on this build. |

Limitations: Doubly symmetric W-shapes with compact webs; Cb is user input or derived per member segment; slender flanges, noncompact/slender webs, HSS, channels, weak-axis flexure, torsion and non-prismatic members stay unsupported. Not a claim of full AISC 360 coverage or commercial parity.
