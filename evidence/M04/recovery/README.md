# M04-A historical revision recovery

Bounded local slice: File → Recover revision lists committed IndexedDB history and restores a prior snapshot. Unapplied property edits block recovery and are never claimed as saved.

| Check | Result |
| --- | --- |
| Browser `tests/e2e/recovery.spec.js` | PASS |

Does **not** claim offline service-worker cache, schema migrations or full crash matrix.
