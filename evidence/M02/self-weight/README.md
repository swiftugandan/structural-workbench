# M02-SELF-WEIGHT

Bounded local slice: explicit self-weight loading, no double self-weight, and
fail-closed case deletion when a load case is still required.

## User outcome

Open B10, analyse, read support reactions matching ρ·A·g·L and −ρ·A·g·L²/2,
reject a second self-weight on the same member/case (`DUPLICATE_SELF_WEIGHT`),
add a combination referencing LC1, and confirm deleting LC1 does not mutate the
project.

## Checks

- Native assembly/model: `analytical_b01_to_b11`, `negative_seed_diagnostics` (N10)
- WASM numerical: B01–B11 including B10 (33 signed comparisons)
- Browser: `tests/e2e/self-weight.spec.js`

## Limits

Parent M02 acceptance is not claimed. Prescribed-movement UI journey and full
dead/live/wind scenario envelope remain separate. Lab Metal platform gates are
recorded under `evidence/M01/lab-metal`.
