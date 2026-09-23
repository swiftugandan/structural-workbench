# GitHub Pages preview deployment — 2026-09-23

Source commit: `bb6e0d839f1b626dbd54447667a88792d5dc4431`<br>
Source hash: `87355d586145a0b5cc95e38a1a44e485d0317d10129b351a3fcb044b8e8c624b`<br>
Workflow: [Build and deploy GitHub Pages](https://github.com/swiftugandan/structural-workbench/actions/runs/35895984719) — **success**<br>
Public app: https://swiftugandan.github.io/structural-workbench/app.html

The hosted workflow passed locked workspace tests, security tests, static build, built-contract tests and GitHub Pages deploy. Public HTTP returned 200. Browser inspection confirmed the visible **Steel check** command. The public app loaded the Rust/WASM kernel and completed the S2-D1 example journey with overall `pass`.

The source hash on Pages matches the locally verified source. The build hashes differ:

- Local tested build: `4a4152c285e90912c6629b09748e6ed9988db193c06c8410f72a2c724126dea7`
- Hosted build: `b00711de634c1c535b2188c6042c37459197f57a96bd17455b7df6d1eb67d502`
- Only differing manifest file: `pkg/workbench_wasm_api_bg.wasm`
- Local WASM SHA-256: `a3824a3837c678f902359615b9a3eb95aa5acb6177c960c03b963e9b8b12c65b`
- Hosted WASM SHA-256: `d5f496984444c1075466245e5f7bcfc258f62163f254b6d9331da9ef8097f95a`

Cause of the WASM byte difference is not established. The hosted app passed the observed S2-D1 check, but byte-for-byte equivalence to the locally verified artifact is **unverified**.

`npm run verify:release` remains **BLOCKED** in `evidence/M00/current/gate-release.json`: existing release evidence is stale for the current source/Cargo lock inputs and remaining milestone-specific gates are incomplete. Deployment is the repository's working preview, not an accepted full product release. `release-manifest.json` continues to say `working-preview-not-accepted`.
