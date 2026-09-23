# M03-B dual Workers

Separate model and analysis Workers: commands stay on the model Worker; analyse imports an immutable snapshot into a disposable analysis Worker. Cancel/timeout terminates only the analysis Worker. A solve that finishes after the model hash changed is never labelled Current.

## Evidence

| Check | Result |
| --- | --- |
| `tests/e2e/dual-workers.spec.js` | PASS |
| Robustness cancel + dual-worker regressions | PASS |

## Acceptance meaning

Bounded dual-Worker slice only. Parent M03 still needs skewed OpenSees pack, 5k-node generator and remaining capacity gates.
