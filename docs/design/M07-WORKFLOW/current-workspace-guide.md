# Current steel workspace

1. Select a member in Model Explorer or viewport; use **Steel design** in the right inspector to assign a verified section/material and explicit stability/bracing assumptions.
2. Analyse one actual case/combination.
3. In the Results drawer select **Model steel review**, then **Review all members**. Use status/ratio filters and **Design colours** to locate members. A row opens that same member and its exact check.
4. Choose **Catalogue** to search the five-record verified subset and assign a section. This is an ordinary model edit and makes old analysis stale.
5. Choose **Candidate study** to compare a finite selected set. Each candidate gets full model reanalysis. Inspect exact records, then explicitly **Apply section**. Reanalyse/review the live model; Undo remains available.
6. Download the exact review/study records or export the current calculation report. Reopening a saved project retains assignments/assumptions and clears session review records.

If the drawer was hidden in View settings, use **Results table** in the ribbon to show it.

## Scope

AISC 360-22 LRFD bounded S2 only, current selected case only. NOT CHECKED/missing inputs, UNSUPPORTED applicability and INDETERMINATE actions are retained. Changed inputs/results become STALE. Candidate rankings describe the finite selected set and selected-member mass, not global structural optimality. No serviceability, LTB, second-order/direct analysis or connection acceptance is added.

The British residential reference separately targets Eurocodes with UK National Annexes. Its exact standard resources and independently validated concrete resistance profiles remain outstanding. Preliminary analysis, illustrative geometry and provisional ground inputs are not construction-ready design.
