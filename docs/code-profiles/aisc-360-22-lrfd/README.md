# Code profile: aisc-360-22-lrfd

| Field | Value |
| --- | --- |
| Profile id | `aisc-360-22-lrfd` |
| Standard | ANSI/AISC 360 |
| Edition | 2022 |
| Method | LRFD |
| M07 breadth | S2 — prismatic doubly-symmetric W: classification, tension, compression, flexure, shear, H1 interaction |
| Resource gates | `R-CODE-STEEL`, `R-STEEL-EXAMPLES` |
| Status | Registered, **not enabled** (no resources.lock verification yet) |

## Acquisition (do not invent clauses)

AISC pages are Cloudflare-protected; agents cannot download the PDFs automatically.
A human must download them in a normal browser, then run the hasher.

1. Download ANSI/AISC 360-22 PDF from [aisc.org AISC 360](https://www.aisc.org/publications/steel-standards/aisc-360) (free).
2. Download Manual Companion Design Examples v16.0 from [Manual Companion 16th](https://www.aisc.org/aisc/publications/steel-construction-manual/manual-companion-for-16th-edition/).
3. Optionally: errata PDF + Shapes Database v16.
4. Rename into `resources/private/` as:
   - `aisc-360-22.pdf`
   - `aisc-design-examples-v16.pdf`
   - `aisc-manual-companion-v160-vol1-errata.pdf` (optional)
   - `aisc-shapes-database-v16.xlsx` (optional)
5. Run `node tools/acquire-steel-resources.mjs` and merge the printed `acquired` entries into `resources.lock.json` (remove `R-CODE-STEEL` / `R-STEEL-EXAMPLES` from `unresolved`).

Never commit the PDFs. Never enable `resources_verified` on the profile until the lock hashes match the local vault.

## Clause map (to fill in M07-C)

| Check id | Planned AISC clauses | Fixture ids |
| --- | --- | --- |
| classification | B4 | TBD from Design Examples |
| tension | D2 / D3 | TBD |
| compression | E3 (and companions as required) | TBD |
| flexure | F2 / applicable F chapter | TBD |
| shear | G2 | TBD |
| interaction-H1 | H1 | TBD |

Do not implement numeric formulas until the lock and this dossier cite exact clauses with independent recomputation notes.

## Swap surface

Implementations live behind `workbench_design::profile::CodeProfile`. Eurocode or other packages register alongside this id; `evaluateDesign` takes `profileId`.
