# Model steel review evidence

Scope: all analytical members, selected actual case/combination only, existing bounded AISC S2. Rust performs one captured reanalysis and exact per-member checks. This is not a whole-building compliance gate.

Native regression compares the whole-model row with individual DesignRun JSON, keeps an unbound member with null utilisation/run, checks nonmutation, and rejects forged result IDs and envelopes. Existing individual checks retain independently known 30 kN m demand and published rounded AISC flexural capacity.

The first browser run found the review action stayed disabled after successful analysis: the drawer rendered while the analysis flag was still true. The lifecycle update now refreshes review state after that flag changes. Failed-run evidence is not accepted as the final gate.

Final gate records the actual source/build, counts, artifact hashes and visible Chrome observations. Candidate studies, whole-model colour overlays and a dedicated catalogue drawer remain separate work.
