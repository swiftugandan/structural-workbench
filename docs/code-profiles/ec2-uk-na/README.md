# Code profile: ec2-uk-na (candidate)

| Field | Value |
| --- | --- |
| Profile id | `ec2-uk-na` (candidate; not registered) |
| Standard | EN 1992-1-1 with the UK National Annex |
| Edition held | EN 1992-1-1:2004 incl. AC:2008/AC:2010; NA to BS EN 1992-1-1:2004 incl. NA Amendment No. 1 (2009) |
| Edition required for a current-UK profile | adds A1:2014 and NA+A2:2014 (not held) |
| Scope of this dossier | Rectangular RC beams: flexure (6.1), shear (6.2.2/6.2.3, vertical links), longitudinal and shear reinforcement limits (9.2.1.1, 9.2.2) |
| Resource gates | `R-EC2-EN-1992-1-1-2004`, `R-EC2-UK-NA-2009`, `R-EC2-JRC-EXAMPLES` (locked); A1:2014 and NA+A2:2014 (missing) |
| Status | **Disabled.** Dossier and example reconciliation only (M08-B1); enablement is M08-B |

- [dossier-beam.md](dossier-beam.md): clauses, NDPs (EU recommended vs UK), kernel mapping, companion checks, open questions.
- `fixtures/design/ec2-uk-na/`: published JRC example values and the oracle reconciliation.
- `python3 tools/oracles/ec2_beam_oracle.py` recomputes and fails on any disagreement.
- `cargo test -p workbench-design --test ec2_jrc_kernel` checks that the mechanics kernel reproduces the JRC design moments.

Source PDFs live only in the gitignored `resources/private/` vault and are locked by SHA-256 in `resources.lock.json`. No clause text is reproduced here. Do not implement a clause from memory: read it from the locked PDF and cite it.
