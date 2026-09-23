# S2 dossier — aisc-360-22-lrfd

Seed corpus for M07 breadth S2 (prismatic doubly-symmetric W: classification, tension, compression, flexure, shear, H1). Values are reconstituted from Manual Companion Vol. 1 Design Examples v16.0 (`R-STEEL-EXAMPLES`, sha256 `ec25b52e…`) against Spec 360-22 (`R-CODE-STEEL`, sha256 `6b132244…`). This file cites example IDs, clause IDs, and published numeric results only — no copyrighted prose.

Machine fixtures: `fixtures/design/aisc-360-22-lrfd/`.

## Units

Published AISC figures stay in US customary (kip, ksi, in, ft, kip-ft) so digits match the Examples to three significant figures. Each fixture also carries SI companions for the kernel. Do not mix systems inside a single equation path.

## Seed map

| Fixture id | Example | Spec clauses exercised | Published controlling LRFD check |
| --- | --- | --- | --- |
| `S2-D1` | D.1 | D2, D3, B4.3b, D1 | Tension rupture φPn = 211 kip ≥ Pu = 180 kip (yield φPn = 277 kip) |
| `S2-E1C` | E.1C (section from E.1A) | B4.1a Cases 1 & 5, E3 | Compression φcPn = 892 kip ≥ Pu = 840 kip; flanges/web nonslender |
| `S2-F11B` | F.1-1B (loads from F.1-1A) | F2 yielding (compact, Lb → 0) | Flexure φbMn = 379 kip-ft ≥ Mu = 266 kip-ft |
| `S2-G1B` | G.1B (loads from G.1A) | G2.1 | Shear φvVn = 306 kip ≥ Vu = 290 kip |
| `S2-H1B` | H.1B | H1-1a | Interaction ratio 0.929 ≤ 1.0 |

Classification is covered inside `S2-E1C` (compression B4.1a) and `S2-F11B` (User Note F2 compact for flexure). Separate noncompact / slender seeds are deferred past M07-C minimum.

## Independent recomputation policy

For each fixture, an agent/test must:

1. Read inputs from the JSON (geometry, Fy/Fu, demands, Lb/K, connection params).
2. Recompute available strengths from Spec equations cited in the fixture — not from Manual tables alone when a “B” (direct Spec) example exists.
3. Compare to `published.lrfd` digits within the fixture tolerance (default relative 0.5% or absolute 1 kip / 1 kip-ft, whichever is larger, matching Examples’ three-sig-fig presentation).
4. Never paste Spec or Example paragraphs into the repo.

## Enabling the profile

`resources_verified` / `enabled` may flip only after:

- lock hashes still match the local vault PDFs, and
- native tests for these fixtures pass against implemented clause code (M07-C).

Until then the profile stays registered and disabled.
