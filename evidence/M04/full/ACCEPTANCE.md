# M04 acceptance record

Source hash: `60180f4e9fce34f1eb77ca984c64f681f46687df08da8ff288f3514bc542c383`
Build hash: `c3def15019f7a7505de6f160e910d84c28a9e5f34e4a58836223de8badd93634`
Observed: 2026-09-23T12:27:27.177Z
Status: **PASS**

| ID | Title | Status | Observation |
| --- | --- | --- | --- |
| M04-RECOVERY | Historical revision recovery without claiming unsaved edits | PASS | File → Recover revision restores a committed snapshot; dirty forms refuse recovery. |
| M04-OFFLINE | Atomic build-ID offline cache | PASS | Service worker caches one build set; offline reopen works; update prompts after save. |
| M04-MIGRATION | Schema migration with original retention | PASS | 0.9.0→1.0.0 migrates with hash parity; originals retained; unknown majors refused. |
| M04-RELIABILITY | Corrupt snapshot, Worker crash, persistence denied | PASS | Corrupt projects pointer falls back to verified history; Worker crash restores memory model; persistence denial warns. |
| M04-QUOTA-LEASE | Quota failure and single-writer lease | PASS | STORAGE_QUOTA keeps export available; second tab opens read-only under the lease. |
| M04-SECURITY-EXPORTS | Escaped reports and CSV formula neutralization | PASS | HTML labels escape; CSV formula cells are neutralized before download. |
| M04-RECORD | Calculation record and export/import equivalence | PASS | Project/report/CSV export round-trip preserves hash and displayed tip results. |

## Limitations

- Parent M04 packages recovery, offline cache, migration, reliability and calculation-record slices; it does not claim M05 catalogue/templates or commercial report parity.
- Full 100-cycle memory soak remains a later release gate.
- Platform hardware evidence continues to follow ADR 0005 lab Metal path from earlier milestones.
