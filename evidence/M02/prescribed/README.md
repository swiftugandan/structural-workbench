# M02-PRESCRIBED

Bounded local slice: prescribed support settlement/rotation, reaction recovery
with no free DOFs (B09), editable settlement through the support form, and
rejection of prescription on a free DOF (`INVALID_RESTRAINT`).

## Checks

- Native: B01–B11 including B09; negative N07 prescribed_free
- WASM numerical: 33 signed comparisons
- Browser: `tests/e2e/prescribed.spec.js`

## Limits

Parent M02 acceptance is not claimed. Multi-case dead/live/wind envelope journey
remains separate.
