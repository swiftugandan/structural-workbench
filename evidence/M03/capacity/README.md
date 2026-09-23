# M03-D capacity / memory

Representative fixture: deterministic connected `20×25×10` multibay frame from `tests/helpers/frame.js` (5,000 nodes, 10,000 members, fixed bases — not disconnected cantilevers).

| Gate | Result |
| --- | --- |
| Assembly + factorisation + one RHS | median ≤ 5 s on pinned release CLI |
| Recorded counts | nodes, members, active DOFs, matrix nnz, factor nnz estimate |
| Adversarial high-fill | `highFill()` with 64 MiB budget returns `MEMORY_LIMIT` |

Run: `node evidence/M03/capacity/validate.mjs` (needs `target/release/workbench-cli`). Large generated models stay in a temp directory; only summary JSON is recorded here.
