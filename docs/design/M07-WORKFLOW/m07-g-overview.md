# Whole-model steel review

The Results drawer includes **Model steel review**. Analyse one case/combination, then choose **Review all members**. Rust reanalyses the exact captured model once and uses that same simultaneous result for each ready member.

Every analytical member remains in the table, including unbound concrete/custom members. These have NOT CHECKED or UNSUPPORTED readiness rows with null utilisation, never fabricated resistance. Filter by status or minimum utilisation, select a row to inspect that exact member, or download the complete review record. The review is independent of viewport visibility filters.

Model/result/dirty changes mark recorded rows STALE. Undo to an identical engineering model/result can restore current status. Selecting another member does not carry over the previous member's check. The standalone analysis report includes all matching current model-native records. Reviews are session records; download retains their provenance, while reimporting a project clears session records and requires a new review.

## Scope and remaining work

- Existing bounded AISC S2 only, selected case only. No aggregate whole-building PASS; no UK profile or full code-compliance claim.
- Catalogue workspace and finite candidate study are locally verified in the same drawer. Whole-model status colouring remains a later M07-G increment.
- Candidate study must reanalyse every proposed stiffness/self-weight change in Rust and retain exact candidate provenance before explicit apply/undo.
- Native regression establishes equality with the selected-member path, complete mixed-readiness membership, nonmutation and rejection of forged result identity/envelope. Browser evidence covers actual WASM review, row selection, filtering, stale/undo and record download.
