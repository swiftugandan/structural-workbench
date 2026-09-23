# M04-B atomic build-ID offline cache

Bounded local slice: service worker precaches every `dist` asset under `workbench-build-<buildHash>`, serves that set offline, and prompts reload after a successful save when a newer build is waiting. JS and WASM stay on one build ID.

| Check | Result |
| --- | --- |
| Browser `tests/e2e/offline-cache.spec.js` | PASS (2) |

Does **not** claim schema migrations, cross-tab lease changes, full crash/quota matrix, or parent M04.
