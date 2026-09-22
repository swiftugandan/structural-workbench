# Member shear table

Member forces now lists every Rust-recovered section sample with position (%), axial N, shear Vy/Vz, torsion T and moments My/Mz. These use the diagram cut convention; the existing raw End actions table remains separate. CSV exports all section samples in SI.

Build passed. Four Playwright tests passed on Chromium/software WebGPU with actual WASM, including B07's signed -30/+30 kN shear, zero unused component, SI conversion, station endpoints, CSV, and existing diagram/component regressions. Screenshot reviewed. No numerical solver changes. No new live CUA or hardware acceptance claim. build.json retains the build tool's default M00 metadata; this evidence belongs to bounded task M01-SHEAR-TABLE in delivery/state.json.

Preview: http://127.0.0.1:4173. Refresh, analyse, then choose Member forces in the results table.
