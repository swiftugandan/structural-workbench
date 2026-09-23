# M03 acceptance record

Source hash: `cb448acbd4697e67ae7fd3988cb99a85dc4bcfa63710c4631edc77ab0d33a8d1`
Build hash: `b9ee620f5e475d044fafd789c4c7e43e74d9f5c011785c3818a2a9133a0fd652`
Observed: 2026-09-23T10:38:02.420Z

| ID | Title | Status | Observation |
| --- | --- | --- | --- |
| M03-ORBIT-COPY | Spatial orbit and bay copy | PASS | CopyBay portal journey builds a spatial frame, analyses My/Mz/T and round-trips export. |
| M03-DUAL-WORKERS | Separate model/analysis Workers and cancel | PASS | Cancel restores the model; a superseded solve never becomes Current after edits. |
| M03-ORACLE | Skewed and asymmetric OpenSees pack | PASS | S01 skewed spatial frame and S02 asymmetric portal match the OpenSees pack on this build. |
| M03-CAPACITY | 5,000-node multibay solve and memory guard | PASS | Connected 5k-node frame solves under the median gate; tight MEMORY_LIMIT refuses high-fill. |
| M03-UNIT-ACTION | All-axis unit-action tests | PASS | Tip unit loads recover tip end actions with root lever balance and section@0 = −q_i. |
| M03-ROLL | Member reversal and roll | PASS | Endpoint reversal remains covered by m01 invariance; localY roll swaps My/Mz and halves tip uz. |
| M03-SECTION-AXIS | Section-axis editing | PASS | Property-form localY edit re-analyses with swapped end moments in the forces table. |
| M03-HIERARCHY | Physical-to-analytical mapping UI | PASS | Split children group under physical parent in the model tree with inspector lineage. |

## Limitations

- Parent M03 packages accepted spatial slices A–F; it does not claim commercial PROKON parity or automatic remeshing.
- UI-task ≤100 ms solver attribution and GPU-loss during analysis reuse earlier Worker isolation evidence; full hardware matrix remains M01/M00 platform scope.
