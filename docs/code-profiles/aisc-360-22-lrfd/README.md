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

1. Download ANSI/AISC 360-22 PDF from [aisc.org AISC 360](https://www.aisc.org/publications/steel-standards/aisc-360) (free).
2. Download Manual Companion Design Examples v16.0 (+ errata) from AISC Manual Companion pages.
3. Optionally acquire Shapes Database v16 for catalogue convenience.
4. Store under a local ignored vault (e.g. `resources/private/` — never commit PDFs).
5. Record SHA-256 and rights notes in `resources.lock.json`.

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
