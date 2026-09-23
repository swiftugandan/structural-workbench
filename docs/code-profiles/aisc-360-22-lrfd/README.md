# Code profile: aisc-360-22-lrfd

| Field | Value |
| --- | --- |
| Profile id | `aisc-360-22-lrfd` |
| Standard | ANSI/AISC 360 |
| Edition | 2022 |
| Method | LRFD |
| M07 breadth | S2 — prismatic doubly-symmetric W: classification, tension, compression, flexure, shear, H1 interaction |
| Resource gates | `R-CODE-STEEL`, `R-STEEL-EXAMPLES` |
| Status | Registered and **enabled** when committed `resources.lock` + S2 fixtures verify (no private PDFs required in CI) |

## Acquisition (do not invent clauses)

AISC pages are Cloudflare-protected; agents cannot download the PDFs automatically.
A human must download them in a normal browser, then run the hasher.

1. Download ANSI/AISC 360-22 PDF from [aisc.org AISC 360](https://www.aisc.org/aisc/publications/current-standards/aisc-360/) (free cart checkout).
2. Download Manual Companion Design Examples v16.0 from [Manual Companion 16th](https://www.aisc.org/aisc/publications/steel-construction-manual/manual-companion-for-16th-edition/).
3. Optionally: errata PDF + Shapes Database v16.
4. Rename into `resources/private/` as:
   - `aisc-360-22.pdf` (from `A360-22W-ewr.pdf`)
   - `aisc-design-examples-v16.pdf` (from `P901-23W.pdf`)
   - `aisc-manual-companion-v160-vol1-errata.pdf` (optional)
   - `aisc-shapes-database-v16.xlsx` (optional)
5. Run `node tools/acquire-steel-resources.mjs` and merge the printed `acquired` entries into `resources.lock.json` (remove `R-CODE-STEEL` / `R-STEEL-EXAMPLES` from `unresolved`).

**Locked 2026-09-23:** `R-CODE-STEEL` + `R-STEEL-EXAMPLES` (+ optional `R-STEEL-SHAPES-V16`) in `resources.lock.json`.

Never commit the PDFs. Never enable `resources_verified` on the profile until a verified S2 fixture dossier cites the locked editions.

## Clause map (M07-C implements against these seeds)

| Check id | Spec clauses | Fixture id | Example |
| --- | --- | --- | --- |
| classification | B4.1a Cases 1 & 5 | `S2-E1C` | E.1C |
| tension | D2, D3, B4.3b | `S2-D1` | D.1 |
| compression | E3 | `S2-E1C` | E.1C |
| flexure | F2-1 (compact, continuous brace) | `S2-F11B` | F.1-1B |
| shear | G2.1 | `S2-G1B` | G.1B |
| interaction-H1 | H1-1a | `S2-H1B` | H.1B |

Dossier: [`dossier-S2.md`](./dossier-S2.md). Fixtures: `fixtures/design/aisc-360-22-lrfd/`.

Do not implement numeric formulas until tests recompute from Spec equations against these published digits.

## Swap surface

Implementations live behind `workbench_design::profile::CodeProfile`. Eurocode or other packages register alongside this id; `evaluateDesign` takes `profileId`.
