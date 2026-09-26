# REVIEW-03 model inspection

View filters operate on saved authored membership. No analysis elements are removed by a view change. Rust applies view-only exclusions before pick priority, box selection and snap selection. The renderer omits matching members, endpoints, annotations, loads, diagrams and pad previews. Shared nodes remain visible where other visible members use them.

Acceptance journeys: storey+layer filter finds two return flights and four landing strips on level1; plan/side/3D views, isolate/hide/show/fit, export still 642 analytical members; hidden member cannot be picked, current analysis survives view changes. Existing CAD, labels, crossings, dimensions and topology tests cover interactions with moved display controls.

An intermediate build was intentionally rejected by the source-snapshot check after removal of unrelated formatting changes. No evidence from that output is accepted. Final source/build gate is recorded separately after rebuild.

Native suite: 89 tests passed. No formulation, stiffness, load or design profile changed. The complete model is still solved; view filtering is not a structural subset analysis.

Regression repair: applying the view filter during a model refresh also cancelled an ongoing multi-member drawing tool. Separate user-requested view changes (cancel pending tools) from model refresh (retain tool state); rerun the pointer drawing journey before acceptance.
