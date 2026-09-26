# Remaining capacity regression profile

Profiles captured on build 032731917f71ec476aba083a85671f6ea2e203053311615d64a4ecd93dea5ef0, before the final profiling-led repairs. Real kernel and actual Chrome import; these are diagnostics, not gate evidence.

- Node/WASM 1,000-member edit: roughly 139–144ms; snapshot response roughly 27–30ms. CPU profile shows command JSON parsing, an unused old-model deserialization, reconciliation and engineering-hash serialization.
- Visible-model Chrome import: 5,325ms. Main-thread profile shows Explorer name sorting repeatedly constructing locale comparison machinery, Explorer insertion, and forced layout in viewport draw. The complete 10,000-member tree remains represented.
- Repairs: reuse a numeric-name collator; let Chromium defer offscreen physical-row layout with content-visibility; remove unused old-model deserialization; parse current command documents directly into the validated typed model; omit excluded structure/label data before hash serialization.
- Pre-change engineering hashes for all 18 model fixtures are retained in ../candidate/engineering-hashes.json for byte-compatibility comparison. Do not change those vectors to match the candidate.
