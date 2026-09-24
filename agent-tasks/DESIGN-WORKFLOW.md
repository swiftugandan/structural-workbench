# Integrated design workspace — program index

Scheduling: `roadmap.json` (`designExperienceProgram`, `subMilestones`), `PARITY_ROADMAP.md` §3.1, **ADR 0008**.

**Source conversation:** https://chatgpt.com/share/6ab4c946-7764-83eb-b1c1-ada00c4d4642  
**Steel pack:** [`docs/design/M07-WORKFLOW/`](../docs/design/M07-WORKFLOW/README.md) (spec §31–§32 + mockups)

## Coherent steel slice map

| Slice | Pack §31 | Owns | Mockups |
| --- | --- | --- | --- |
| [M07-E](M07-E.md) | Phases 1–3 | Catalogue identity, design inputs/provenance, readiness, model-native demand | — |
| [M07-F](M07-F.md) | Phases 4–5 | Selected-member inspector + calc drawer | 01–02 |
| [M07-G](M07-G.md) | Phases 7 + 9 | Whole-model, bulk/groups, catalogue UI, section study | 03–05 |
| [M07-S](M07-S.md) | Phase 8 | Serviceability (deferred) | — |
| [M07-LTB](M07-LTB.md) | Phase 6 | Evidence-backed strength expansion (deferred) | — |
| M09 | Phase 10 | Second-order / stability | — |

**Earliest ready work:** M07-E (M08 resources still blocked).

## Later shell reuse (after engineering parents)

| Slice | Pack | Note |
| --- | --- | --- |
| [M08-SHELL](M08-SHELL.md) | [`M08-WORKFLOW`](../docs/design/M08-WORKFLOW/README.md) | Layout only; code pin = SPEC (ACI proposed), not Eurocode in mockups |
| [M10-SHELL](M10-SHELL.md) | [`M10-WORKFLOW`](../docs/design/M10-WORKFLOW/README.md) | Needs M10 FE + benchmarks; captions until PNGs re-exported |
| [M11-SHELL](M11-SHELL.md) | [`M11-WORKFLOW`](../docs/design/M11-WORKFLOW/README.md) | After M11 engineering |

Shell invariant: existing Model Explorer / viewport / Selection Inspector / Results drawer. Mockups do not authorize new top-level product chrome.
