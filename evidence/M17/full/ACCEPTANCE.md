# M17 acceptance record

Source hash: `d3c1ea09b14c16675dd4cba9d706745d6ae98f5a8b0b48090101bd14616bbef0`
Build hash: `037e01d2896dff212c5a1aefef80919b627561f52e269d0bac82935eb48cafe9`
Observed: 2026-10-06T02:46:55.793Z
Status: **PASS**

| ID | Title | Evidence | Status | Observation |
| --- | --- | --- | --- | --- |
| M17-STAGE-HISTORY | Stage load-history fixtures | kernel_validation | PASS | CB01 (Design Example I.1 as a model: WET, CONST, SDL, LIVE, C-CON, C-COMP) gives the example's 344 kip-ft construction and 678 kip-ft composite moments, 2.59 in. wet deflection and the stud layout through the protocol and the browser. |
| M17-STAGE-SEPARATION | Pre-composite and composite actions separated | kernel_validation | PASS | The wet-concrete deflection uses I_s and only the wet case; the live deflection uses I_LB and only the live case (swapping cases scales by I_s/I_LB exactly); the construction stage sees only its combination. |
| M17-MEMBER-CHECKS | Independent member checks | kernel_validation | PASS | Construction flexure (F2 with L_b = 10 ft, φM_n = 677 kip-ft), composite plastic flexure (M_n at 50 % composite), shear on the steel and concentrated-load sections developed by the studs between them and the nearer support (I8.2c). |
| M17-CONNECTORS | Independent connector checks | kernel_validation | PASS | Q_n by I8-1 with R_g and R_p for parallel deck (21.5 kips) and perpendicular deck with one and two studs per rib (17.2 and 14.6 kips); slip-capacity conditions; stud detailing. |
| M17-WORKED-EXAMPLES | Published examples and the independent oracle | kernel_validation | PASS | With the example's own rounded inputs the formulas reproduce I.2's I_LB, Y_ENA, I_tr, I_equiv and M_n; the independent oracle (fibre force balance, bisected transformed section, two-area I_LB) agrees to 1e-8 on five cases. |
| M17-SERVICE | Stage-dependent stiffness and deflections | kernel_validation | PASS | Wet concrete on I_s net of camber, live load on the lower-bound I_LB, long-term sustained plus the Commentary's shrinkage model with the engineer's ε_sh. |
| M17-TIME-DEPENDENT | Unsupported time-dependent assumptions block a complete result | failure_path | PASS | Creep not judged is INDETERMINATE and 'must be calculated' UNSUPPORTED; a missing shrinkage strain, limit or stage case is INDETERMINATE; the run is never a pass until each is the engineer's. |
| M17-USER-JOURNEY | Compare stages and issue the design record in the browser | ui_journey | PASS | Bind the beam, assign the stage cases, enter limits, shrinkage and the creep judgement, run to PASS, inspect stages, checks, section and deflections, download the record, the bill and the calculation report. |
| M17-FAILURE-PATHS | Refusals keep the project | failure_path | PASS | A stage case that does not exist, unknown deck or side kinds, limits or strains out of range, ribs or studs outside the slab and unknown fields are refused with the model unchanged. |
| M17-PERSISTENCE | Schema 1.10.0 save, reopen and migrate | save_and_reopen | PASS | Composite inputs persist in the downloaded project and reopen; 1.9.0 files migrate by version and cannot carry a composite beam draft. |
| M17-LEDGER | Capability ledger | capability_ledger | PASS | The ledger lists composite-beam with its demonstration label, limitations and UNKNOWN comparison. |
| M17-ORACLE-PROVENANCE | Oracle is the recorded script; examples fixture pinned | regression_results | PASS | tools/oracles/composite_oracle.py sha256 6ef8888332ae1fc773c913f7a1ec6db241a8ebf61d6c1e9a2e0937dfad437d52 (recorded 6ef8888332ae1fc773c913f7a1ec6db241a8ebf61d6c1e9a2e0937dfad437d52); composite-beam.published.json sha256 a1781006a970bf471810f27d4fb3637e1c8d341946864783355bd8909dd90f7c; CB01 sha256 2fb836f987f10ffba4fce1715b97f090fb57677da27e4c38ff1a65b24d892785. |

Limitations: aisc-360-22-lrfd composite beams are a demonstration of ANSI/AISC 360-22 Chapter I with the Commentary's deflection and shrinkage models; not a certified design. Unshored simply supported W beams with headed studs under a solid slab or formed deck; positive flexure. Creep is the engineer's recorded judgement. Continuous beams, shored construction, slender webs, channel anchors, analytical slip capacity, vibration and composite columns are unsupported. Commercial-solver parity remains UNKNOWN.
