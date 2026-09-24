# M07 integrated steel design workspace — design pack

Source conversation: [ChatGPT share — Steel Design Workflow](https://chatgpt.com/share/6ab4c946-7764-83eb-b1c1-ada00c4d4642)  
Retrieved into the repo on 2026-09-24. Manifest: [`artifacts-manifest.json`](artifacts-manifest.json).

## Authoritative proposal

- [`structural-workbench-steel-design-spec.md`](structural-workbench-steel-design-spec.md) — full product specification from the share, including **§36 Approved UI screen concepts** after the user LGTM’d the corrected shell mockups.

## Approved screen mockups (corrected shell)

These match the current Structural Workbench regions (Model Explorer / viewport / Selection Inspector / Results drawer). They are layout/interaction references, not pixel acceptance.

| # | Screen | File |
| --- | --- | --- |
| 1 | Selected member steel design | [`screens/approved/01-member-design.png`](screens/approved/01-member-design.png) |
| 2 | Calculation details | [`screens/approved/02-calculation-details.png`](screens/approved/02-calculation-details.png) |
| 3 | Whole-model overview | [`screens/approved/03-overview.png`](screens/approved/03-overview.png) |
| 4 | Section catalogue | [`screens/approved/04-section-catalogue.png`](screens/approved/04-section-catalogue.png) |
| 5 | Section study | [`screens/approved/05-section-study.png`](screens/approved/05-section-study.png) |

## Superseded mockups

Removed 2026-09-24 (parallel design chrome). Do not resurrect; only `screens/approved/` is layout reference.

## Related packs

- Concrete beam: [`../M08-WORKFLOW/`](../M08-WORKFLOW/)
- Slab: [`../M10-WORKFLOW/`](../M10-WORKFLOW/) (captions; PNGs not recoverable from the public share UI)
- Foundation: [`../M11-WORKFLOW/`](../M11-WORKFLOW/)

## Delivery slices (exclusive ownership — ADR 0008)

| Pack §31 | Slice | Mockups |
| --- | --- | --- |
| Phases 1–3 | [M07-E](../../agent-tasks/M07-E.md) | — |
| Phases 4–5 | [M07-F](../../agent-tasks/M07-F.md) | 01–02 |
| Phases 7 + 9 | [M07-G](../../agent-tasks/M07-G.md) | 03–05 |
| Phase 8 | [M07-S](../../agent-tasks/M07-S.md) (deferred) | — |
| Phase 6 | [M07-LTB](../../agent-tasks/M07-LTB.md) (deferred) | — |
| Phase 10 | M09 | — |

Index: [`../../agent-tasks/DESIGN-WORKFLOW.md`](../../agent-tasks/DESIGN-WORKFLOW.md). Ledger: `PARITY_ROADMAP.md` §3.1.
