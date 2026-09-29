# M10-PLATE acceptance record

Source hash: `85f7d63ffa3288620adeca5f6381448672cf572c48e47960c019f6ca1257420c`
Build hash: `e073e097a44111d2bd0424182da2a18bf37c46cfb089a685231100e4ea30f409`
Observed: 2026-09-29T17:04:03.338Z
Status: **PASS**

| ID | Title | Evidence | Status | Observation |
| --- | --- | --- | --- | --- |
| M10-P1-ELEMENT | Element: patch tests and rigid-body modes | kernel_validation | PASS | MacNeal–Harder distorted patch reproduces constant membrane strain and constant curvature (zero transverse shear) to 1e-10; rectangular and distorted single elements have exactly six zero eigenvalues and no negative ones. |
| M10-P2-NAVIER | Hard simply supported plates against Mindlin Navier series | kernel_validation | PASS | Thin, thick and rectangular panels: 32 × 32 centre w ≤ 3.5e-4 and element-centre mx, my ≤ 7.3e-4 (gates 2e-3, 5e-3), falling 8 → 16 → 32 at O(h²); no shear locking at a/t = 300 (16 × 16 w 1.3e-3, gate 2e-2). |
| M10-P3-CLAMPED | Clamped square against Timoshenko & Woinowsky-Krieger Table 35 | kernel_validation | PASS | 32 × 32: w 0.001271 (0.00126), centre mx 0.02286 (0.0231), edge-mid line moment from reactions −0.05122 (−0.0513), all within 2 %; the four clamped edges agree by symmetry to 1e-9. |
| M10-P4-OPENSEES | OpenSees ShellMITC4 on identical meshes | kernel_validation | PASS | Clamped 16 × 16 and the 6 × 5 m panel with a 1 × 1 m opening (464 elements): nodal w and element-centre mx, my, mxy within 1e-6. Checkerboard-distorted meshes (no parallelogram cells): Navier w error 2.1e-2 → 6.6e-3 → 1.8e-3 (gate 1e-2 at 32) and the difference from OpenSees falls 9.7e-4 → 6.6e-4 → 5.4e-4 (gate 1e-3). The two use different published MITC4 shear transformations off parallelograms (ADR 0021). |
| M10-P5-EQUILIBRIUM | Equilibrium, refusals and the convergence indicator | failure_path | PASS | Reactions balance the pressure resultant to 1e-9 with mixed edges and an opening. Only-free edges or a single simple edge are UNSTABLE_MODEL, meshes over 40 000 cells are MEMORY_LIMIT, and invalid material or load is INVALID_SETTINGS or INVALID_SCHEMA, each leaving the project unchanged. The convergence indicator falls on smooth panels and stays above 5 % at re-entrant opening corners. Wood–Armer handles its corrected branches. |
| M10-P6-PROTOCOL | Slab drafts solve their panel through the protocol | kernel_validation | PASS | The kernel's evaluateDesignPreview with sourceMode plate reproduces P-OPEN-OS to 1e-6 and is deterministic. Wood–Armer governing values equal the field maxima. Every slab code check stays UNSUPPORTED and overall stays unsupported. |
| M10-P7-SCHEMA | Schema 1.5.0 and migration | save_and_reopen | PASS | Plate inputs round-trip with per-field provenance, invalid or out-of-panel values are INVALID_SCHEMA, and 1.4.0 projects migrate by version only with unconfigured slabs. A 1.4.0 file carrying plate inputs is refused. |
| M10-P8-BROWSER | Browser journey on the same build | ui_journey | PASS | In the browser build, the P-OPEN-OS panel reproduces the oracle to 1e-6 from the downloaded run record. The browser test switches the contours through mx, my, Top X, Bottom Y and w. Edits make the run STALE, and clamped edges show line moments. The project downloads and reopens with its plate inputs. A mechanism and an invalid Poisson's ratio are refused with their reasons shown. |

Limitations: plate-v1 mechanics only: flat rectangular panels with one rectangular opening, uniform pressure, linear elastic isotropic material, free/simple/clamped edges, no frame–slab coupling, column supports, cracking or long-term effects. Reinforcement areas, punching, detailing and deflection limits need the slab code profile (M08 resources) and stay UNSUPPORTED; the M10 parent is not accepted.
