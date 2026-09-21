# Canvas shear diagram evidence

Source commit: dab0126edc22404906d0f7cc5d54ec2d9c0e2b09
Source hash: 657fefa89bf24bb0cb3cd82bcd4e891941d78f8842909837639bf7a2ae5e752f
Build hash: 9ae9c11c189dbdc241f3ef5afb244d74fdb5a2cefd64bd100199cec07f99b9a5

Vy/Vz selectors plot signed local Rust section actions. One absolute peak scale per component is shared by all members. Signed annotations and a unit-aware legend explain the schematic positive-left-of-start-to-end offset. Small models annotate each member; larger models annotate selected members. End-on projected members omit the curve. Units switch between kN and N (moments kN·m/N·m). Stale diagrams are suppressed and diagram choice persists on reanalysis. Moment My uses the same aligned renderer.

Passed: 15 targeted browser checks, including cantilever Vy/Vz, SI conversion, stale protection/reanalysis, uniform-load sign changes and zero components; 3 component/scale/projection tests. Existing workbench, responsive workspace, graphics and accessibility regressions pass. The initial new Vy expectation was corrected from -6 to +6 kN: the applied +6 kN local-Y force gives -6 kN support reaction and +6 kN internal Vy in the kernel convention. No expected fixture values or solver formulas changed.

This is focused presentation regression, not a full numerical or milestone rerun. Live visual review remains pending because the browser policy verification service was unavailable in the preceding attempt; no new live attempt was made for this build. Prior complete evidence is build-specific.
