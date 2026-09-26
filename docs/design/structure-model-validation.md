# Authoritative structure model — local validation

This slice replaces the former elevation/orientation-derived tree with persisted
schema 1.1 structure entities and Rust commands. It preserves the current shell.

## Contract and behaviour

- Authored storeys/elevations, explicit member roles, reference grids, typed layer
  and group membership are saved, editable and reversible.
- Every analytical member has exactly one physical owner. Splits preserve it;
  copies create new owners and preserve authored classification and memberships.
- Every node has an exact joint binding; every support an exact detail binding.
  Copy preserves assignments. Merge rejects loss of authored joint properties.
- RC/slab/foundation objects bind saved preview definitions. Deleted action sources
  become unbound; a split does not arbitrarily select a replacement child result.
- Current-schema imports reject missing/dangling/conflicting structure records.
  Legacy imports migrate deterministically, retain original bytes and start with
  unassigned roles/storeys. No inferred design intent is committed.
- Organization changes preserve the analysis hash; geometry/design changes retain
  stale-state behaviour. Snapshots and model-native steel runs carry structure
  provenance in addition to exact analytical/result provenance.
- Command/undo/redo completion waits for the persistence attempt. Storage failures
  retain their diagnostic and portable export remains available.

## Reproduction

```
cargo test --workspace --locked
npm run build
npm run test:contracts
WORKBENCH_EVIDENCE_DIR=evidence/structure-model npm run test:numerical
WORKBENCH_EVIDENCE_DIR=evidence/structure-model npm run test:wasm
WORKBENCH_EVIDENCE_DIR=evidence/structure-model npx playwright test tests/e2e/structure-model.spec.js tests/e2e/model-explorer.spec.js tests/e2e/hierarchy.spec.js tests/e2e/native-steel-design.spec.js tests/e2e/design-previews.spec.js tests/e2e/canvas-first.spec.js tests/e2e/topology.spec.js tests/e2e/migrations.spec.js tests/e2e/m04-record.spec.js
```

## Evidence and boundaries

83 native tests, 3 contracts, 33 native and 33 WASM analytical checks, and all 17 browser journeys passed. Final build-bound results are recorded in `evidence/structure-model/structure-gate.json`.
Visible computer use uses Chrome on macOS/AMD WebGPU, including migration of the
existing warehouse example, storey authoring, member role/storey assignment, layer
membership, grid authoring, selection through a membership link, rename/undo and
reopening. The existing warehouse is illustrative geometry, not an accepted building
design. Its other members remain explicitly unassigned.

Intermediate regression failures are retained in `initial-failures/`: the new reopen
journey initially navigated before redo completed saving, and the existing topology
accessibility scan exposed low-contrast secondary Explorer text. The final gate reruns
these checks after correction; no assertions or contrast thresholds are removed.

Storeys/grids are reference organization, not geometry constraints. Layers/groups are
membership collections; this slice does not add layer visibility/locking controls.
Connection hardware remains not designed; concrete resistance remains unsupported,
and soil contact remains indeterminate. No shell mesh or code compliance is invented.
Windows/Linux real-GPU acceptance, full mockup parity and deferred numerical profiles
are not established by this local evidence.

A persistence-related steel inspector lock regression was also reproduced and fixed by refreshing inspectors after persistence completes and clearing the busy state. Both steel journeys pass on the final build; the intermediate failure record is retained in `persistence-regression/`.
