# M03-E section-axis / unit-action / roll

Bounded local slice covering SPEC M03 numerical acceptance items still open after M03-A–D:

| Check | Result |
| --- | --- |
| `m03_all_axis_unit_nodal_actions` | tip unit loads → tip end actions; root lever balance; section@0 = −q_i |
| `m03_local_y_roll_swaps_bending_axes` | localY `[0,1,0]`→`[0,0,1]` swaps My/Mz and halves tip uz (Iy→Iz) |
| Browser `tests/e2e/section-axis.spec.js` | edit member localY, re-analyse, inspect end actions + tip uz |

Member endpoint reversal remains covered by `m01_global_rotation_relabelling_reordering_and_endpoint_reversal`.

## Acceptance meaning

Does **not** claim parent M03: physical/analytical hierarchy UI and formal parent verifier packaging remain later work.
