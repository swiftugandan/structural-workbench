# M03-C OpenSees / native oracle pack

VALIDATION.md §5 fixtures required before M03:

| Role | Fixture | Gate |
| --- | --- | --- |
| Skewed spatial frame | `fixtures/models/S01.json` | OpenSees ↔ CLI |
| Asymmetric 3D portal | `fixtures/models/S02.json` | OpenSees ↔ CLI |
| Distributed loading | `fixtures/models/B07.json` | OpenSees ↔ CLI |
| Released beams | `fixtures/models/R01.json` | Native (OpenSees adapter excludes releases) |
| Prescribed support motion | `fixtures/models/B09.json` | Native (OpenSees adapter excludes prescribed motion) |

Run: `node evidence/M03/oracle-pack/validate.mjs` (needs `tools/oracle-env` and `target/release/workbench-cli`).
