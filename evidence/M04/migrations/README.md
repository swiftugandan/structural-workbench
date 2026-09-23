# M04-C schema migration fixtures

Bounded local slice: import migrates project schema `0.9.0` → `1.0.0` in Rust (`units`→`displayUnits`, default My/Mz releases), returns a migration report, retains original UTF-8 in IndexedDB `originals`, and refuses unknown future majors with a backup download. Engineering hash matches current B02 after migration.

| Check | Result |
| --- | --- |
| Native `cargo test -p workbench-model --test migrate` | PASS (3) |
| Browser `tests/e2e/migrations.spec.js` | PASS (1) |

Does **not** claim full crash/quota matrix, report-plot packaging, or parent M04.
