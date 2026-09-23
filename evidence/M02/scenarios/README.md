# M02-SCENARIOS

Bounded local slice: dead/live/wind load cases, explicit strength combinations,
B11 factored tip response, and envelope provenance that cites a real combination
(not mixed extrema).

Also repairs an envelope UI crash: member tip probes used `samples.at` without
optional chaining, which threw on envelope results without sample graphs.

## Checks

- Native: B01–B11, V01 envelope provenance
- WASM numerical: 33 signed comparisons
- Browser: `tests/e2e/scenarios.spec.js` (2 tests)

## Limits

Parent M02 acceptance is not claimed. M01 ux-acceptance remains separate.
