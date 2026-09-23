# M04-D reliability matrix

Bounded local slice covering VALIDATION §9 recovery gaps that were still open after M04-A–C:

| Journey | Result |
| --- | --- |
| Corrupt latest IndexedDB pointer → restore verified history | PASS |
| Model Worker crash → restore last confirmed in-memory model | PASS |
| Persistence denied → warn; export remains available | PASS |

Existing quota, cross-tab lease and GPU-loss coverage remains in `tests/e2e/robustness.spec.js`.

Does **not** claim parent M04, full memory soak, or report-plot packaging.
