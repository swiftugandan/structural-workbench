# Model-native steel — M07-E/F

Verified local integration: catalogue assignment → explicit assumptions/readiness → actual Rust/WASM analysis → direct model-derived station checks → inspector/drawer → governing marker → stale/edit/undo → portable project and calculation report.

Run `npm run verify:design-workspace` with the local preview server available for the WASM analytical corpus. The gate checks the build/source identity and refuses failed, skipped or empty required browser tests. `native-steel-gate.json` binds the automated evidence. `design-run.json` contains actual WASM output; the test's B04 model is an original synthetic structural fixture, with real catalogue properties and actual calculation output. It is not an upstream mocked solver or a professional compliance claim.

The visible Chrome journey used the actual application controls: reopen the B04 workspace, assign W18X50/A992, enter Ky=Kz=Cb=1 and Lb=0, explicitly confirm continuous bracing and first-order basis, analyse, run member design, and show the F2-1 governing point at x/L=0. The final browser displayed build `4c9a6e48ea58`, PASS and `WEBGPU · amd`; the modal was closed. `live-chrome-steel.png` records the current shell. This macOS Chrome observation does not establish Windows/Linux hardware acceptance.

Supported-path acceptance remains the bounded AISC S2 package. Noncompact flexure, weak-axis actions, missing tension details, LTB and missing H1 companion capacities remain UNSUPPORTED. Zero-action runs are INDETERMINATE. Serviceability and second-order stability are not checked. The five-row catalogue is a versioned subset; material and elastic defaults are described in ADR 0009.

Known scope: only the selected real case/combination is checked; complete load-combination coverage is not inferred. Whole-model overview and section studies belong to M07-G. Historical standalone/reference-overlaid checks remain under Reference checks.
