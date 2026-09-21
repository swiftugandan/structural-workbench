# Structural Workbench preview

A static browser app implemented in plain JavaScript/CSS, with an authoritative
Rust/WebAssembly model and sparse frame solver. The original specification is
preserved at the repository root and in git baseline `3017786`.

## Run locally

Requirements: Node 22.14.0, npm, and Rust via rustup. No runtime backend or CDN.

```sh
npm ci
npm run setup
npm run build
npm run preview
```

Open http://127.0.0.1:4173. Choose **New frame**, edit the span, material,
section or signed tip load, **Apply changes**, then **Analyse**. The model
explorer exposes all entity tables. Download **Project**, **Report**, or **CSV**.
Recent projects are stored transactionally in IndexedDB with ten snapshots.
A second tab is read-only while the first holds the single-writer lease.
Use a portable project download as your durable backup.

**Worked examples** contains B01–B11, including UDL, prescribed movement,
rotated members and combinations. The analysis case selector selects an explicit
case or combination. Camera and display units do not alter the engineering hash.
The GPU view supports select, pan, zoom, elevation, 3D orbit and fit. The GPU
button recreates the device; it does not erase the model or results.

## Validation

```sh
cargo test --workspace --locked
npm run test:contracts
npm run test:numerical
npm run test:wasm
npm run test:e2e
npm run test:graphics
npm run test:a11y
npm run test:security
npm run test:performance
npm run verify:milestone -- M00
npm run verify:release
```

Install Playwright Chromium with `npx playwright install chromium`.
The standalone numerical/WASM runners require the preview server to be running.
Independent comparison uses a separate Python environment:

```sh
python3 -m venv tools/oracle-env
tools/oracle-env/bin/pip install -r tools/oracle-requirements.txt
npm run test:oracle
```

The pinned OpenSees environment is macOS-specific. Other platforms need a
separately pinned and recorded platform distribution; do not silently substitute
its version. Raw outputs live under `evidence/M00/current`.

## Delivery status

This is a working preview, not completion of the 24-milestone specification.
See `delivery/state.json`, `capabilities.json` and `IMPLEMENTATION_STATUS.md`.
The milestone/release commands deliberately fail when required evidence is absent
or belongs to changed source. Passing one workflow is not full milestone approval.
No commercial comparison, steel/concrete design-code compliance, advanced finite
Element capability, full-scale performance or supported browser matrix is claimed.
