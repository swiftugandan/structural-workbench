# M10 acceptance record

Source hash: `b53cf45b187bb6d0cd21a32600d11636e0103201c323a084eed3921c20e211d7`
Build hash: `c881053200de3a1c8fdb1f96de0829627b8775c25abeabfbecb2810aaa01afe8`
Observed: 2026-10-06T00:23:12.065Z
Status: **PASS**

| ID | Title | Evidence | Status | Observation |
| --- | --- | --- | --- | --- |
| M10-PATCH-RIGID | Membrane and bending patch tests, rigid modes | kernel_validation | PASS | Constant-strain membrane and bending patches are exact; a free element has exactly six zero eigenvalues. |
| M10-BENCHMARKS | Analytical plate and open benchmark references, thin/thick and distortion | kernel_validation | PASS | Navier and Timoshenko analytical plates, OpenSees on identical meshes (clamped, opening, point supports), distorted meshes and equilibrium with mixed edges, all accepted in the plate-v1 family. |
| M10-MESH-DENSITIES | At least three mesh densities; convergence indicator | kernel_validation | PASS | The Navier convergence study uses several mesh densities; the run's indicator re-solves at twice the mesh size, falls with refinement and exposes re-entrant corner singularities. |
| M10-MAP-IS-DESIGN-VALUE | Reinforcement map distinguishes display from design actions | kernel_validation | PASS | The A_s,req map is per element from the unsmoothed element-centre Wood–Armer moments, labelled as the design value and never averaged; utilisation per element never exceeds 1 where a mesh is provided; the browser contour of A_s,req is the same array. |
| M10-EC2-DESIGN | Restricted reinforcement under one code profile | kernel_validation | PASS | Each layer's least-area mesh covers the largest element demand and A_s,min within the spacing limits; span/depth uses the shorter span (two-way) or the longer with K = 1.2 (flat slab); shear uses the weaker face's ρ_l. |
| M10-PUNCHING | Punching at columns against an independent example | kernel_validation | PASS | JRC column B2 punching reconciles (u1, v_Ed, v_Rd,c, v_min, face stress, f_ywd,ef, s_r, A_sw, u_out, a_out) with two documented discrepancies; the plate reaction is the punching force; edge, corner and near-opening columns are unsupported, never estimated. |
| M10-USER-JOURNEY | Draw, mesh, solve, inspect and design in the browser | ui_journey | PASS | The panel solves to the oracle mesh, contours are inspected, code inputs entered and the run designs to PASS with meshes, map, checks, schedule and calculation record; columns from the model carry the slab to the frame. |
| M10-FAILURE-PATHS | Refusals keep the project | failure_path | PASS | Unstable support sets, invalid openings and mesh limits are refused with the reason and leave the project unchanged. |
| M10-PERSISTENCE | Code inputs save and reopen | save_and_reopen | PASS | Slab code inputs (structural system, partitions, column size) are validated per kind and persist in the downloaded project. |
| M10-LEDGER | Capability ledger | capability_ledger | PASS | The ledger lists slab-plate-analysis with its demonstration label, limitations and UNKNOWN comparison. |
| M10-ORACLE-PROVENANCE | Plate oracle is the recorded script; JRC punching fixture pinned | regression_results | PASS | tools/oracles/plate_oracle.py sha256 a7348d268d38aad0cf3936bbaa6c0be8dd5a441d7f093ebdd8e19b059cb04ddc (recorded a7348d268d38aad0cf3936bbaa6c0be8dd5a441d7f093ebdd8e19b059cb04ddc); jrc-punching-b2.published.json sha256 7519e3a48439b64d80b7c4801962c0526808b11408f2da836d8ea39b58ceb38e. |

Limitations: ec2-uk-na slab design is a demonstration of EN 1992-1-1:2004 incl. AC:2008/AC:2010 with the UK NA incl. Amd 1 (2009); A1:2014 and NA+A2:2014 are not held and not reconciled, and no run is a certified design. Flat rectangular plate-v1 panels (one opening, uniform pressure, column supports); uniform meshes per layer; punching at internal columns only; no crack-width calculation, curtailment, trimming bars or frame–slab coupling beyond column loads. Commercial PROKON parity remains UNKNOWN.
