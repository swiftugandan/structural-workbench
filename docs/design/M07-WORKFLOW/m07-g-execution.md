# M07-G execution contract

Extends approved screens 03–05 inside the existing Results drawer. Numerical profile breadth remains AISC S2; no UK steel or concrete acceptance is implied.

## Whole-model review

- Capture one exact current case/combination, model hash and result ID.
- Reanalyse once in the disposable worker, reject identity mismatch, then evaluate each ready member against that same simultaneous result.
- Keep every analytical member in the review. Missing catalogue/settings means NOT CHECKED with readiness reasons; unavailable applicability means UNSUPPORTED. Missing result evidence never means PASS.
- Preserve per-member exact DesignRun records, selected scope, model/settings/build provenance and row-level selection.
- UI filters: all, failing, unsupported, indeterminate, stale, not checked and utilisation threshold. Null utilisation stays null.
- Model edits or upstream result changes mark records stale. Switching rows must never show another member's record as the selected member's check.

## Catalogue and candidate study

- Catalogue is the existing five verified W records, explicitly described as a subset, with source/version/hash and support limitations. Do not invent database records.
- Candidate study applies each permitted catalogue section to a disposable cloned project in Rust, preserves explicit assumptions, reanalyses stiffness and self weight, and evaluates exact simultaneous actions.
- Candidate report includes baseline hash, candidate model hash, result ID, DesignRun, whether reanalysis occurred, objective and finite search completeness.
- Candidate selection is a proposal. Explicit Apply is an ordinary atomic catalogue command with undo/redo, only while the study baseline matches the current model and no unsaved inputs exist.
- Both FAIL and UNSUPPORTED candidates remain visible. No result is called globally optimal; the finite selected catalogue subset is the stated search scope.

## Gates

Native and WASM comparisons against selected-member evaluation; stale and invalid IDs; cloned-study nonmutation; changed stiffness/self-weight action recovery; explicit apply/undo; source/build-bound actual browser overview → row → catalogue → study → apply → stale → reanalyse → export journey. Real browser inspection of each screen and current-shell fit.
