# Fresh validation — Preview 10

Tested source commit: `90067de`. Source hash: `f5b1eb1be2744d973ec45636316a4298da39cf2099de2c398ed3f68a6a2778b9`. Local build hash: `4e3e8f028f29f63ccabbf1f7ae6d65aea8d684c94261e131c4c00d2e4e41f3a0`.

92 native, 3 contract, 2 security tests; 33 native and 33 WASM numerical benchmarks; 1440 oracle comparisons; 112 browser tests (zero skips, flakes or unexpected failures); 18 unchanged engineering hashes. Hardware corpus PASS on macOS Chrome / AMD WebGPU under unchanged pinned laboratory thresholds. This does not establish reference-class or cross-platform performance.

Visible Chrome: span 3 m → 3.5 m marks results STALE; reanalysis restores Current and changes tip displacement from -45 to -71.458333 mm. Screenshots and hash-bound record: `release-current/computer-use.json`.

Default `evidence/M00/current` contains the freshly executed records, not relabelled historical records. Historical hardcoded browser outputs were preserved under `release-current/legacy-output` before restoring original milestone snapshots. Earlier failed runs remain diagnostic history under this directory.

`node tools/verify.mjs M00`: PASS. `npm run verify:release`: BLOCKED solely because remaining milestone-specific gates are not implemented; zero stale input/build/evidence findings. No verifier or engineering tolerance was relaxed. Concrete/UK NA resources and physical construction/detailing acceptance remain blocked as documented.

Repairs include worker recovery ordering, GPU picking depth, storage warning visibility, indexed model validation and hashing, deferred Explorer branches with complete expansion/search/selection, and actual offline readiness polling in tests. No engineering formula or fixture golden changed.

Artifact collision audit: M04 and later journeys shared two export names. M04 was rerun into `release-current/m04-isolated`; its top-level record now references those exact hashed outputs. All final record attachment hashes were independently checked after relocation.
