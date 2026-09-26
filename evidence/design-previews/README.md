# Concrete workflow preview evidence

These artifacts validate local workflow integration only, not concrete design compliance or numerical milestone acceptance.

- `preview-gate.json`: final source/build/lock/artifact digests and automated outcomes.
- `rcBeam-run.json`, `slab-run.json`, `padFooting-run.json`: actual exported records from browser tests. All are mock workflows with UNSUPPORTED overall status and no code profile. Beam/footing upstream actions are actual model results; slab actions are synthetic.
- `rcBeam.png`, `slab.png`, `padFooting.png`: actual automated-browser UI, same final build.
- `live-rcBeam.png`, `live-slab.png`, `live-padFooting.png`, `live-chrome.json`: separate visible Chrome computer-use checks and observed states.
- `playwright-results.json`: three preview journeys plus eight steel/capability regression journeys. Draft stale/cancel/save/undo, model capture, exports and project reopen are exercised.
- `native.log`, `contracts-ui.log`, `analytical-native.log`, `analytical-wasm.log`, `browser.log`, `build.log`: executed checks. Analytical fixtures/goldens and tolerances remain unchanged.

Validation caught and corrected: a test menu-helper invocation, Explorer label spacing, provenance relabelling of untouched synthetic defaults, and missing kPa input conversion in Rust. Signed zero in portable JSON is compared by exact numerical equality for opposing reaction vectors.

Visible evidence is local macOS Chrome/AMD WebGPU. Automated browser uses its configured Chromium/SwiftShader runner. Neither proves Windows/Linux real-GPU acceptance. No validated RC resistance, plate/shell solution, compression-only footing contact, construction reinforcement schedule or full-code compliance is claimed.

Reproduction commands and observation checklist: `docs/design/concrete-preview-validation.md`.
