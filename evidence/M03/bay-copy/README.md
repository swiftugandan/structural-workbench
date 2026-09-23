# M03-A bay copy slice

Bounded local journey: create planar portal → Copy bay (+Y, 6 m) → spatial mode with fixed bases and longitudinal roof ties → analyse → inspect My / Mz / torsion → export and reimport.

## Evidence

| Check | Result |
| --- | --- |
| Native `copy_bay_builds_spatial_frame_with_supports_and_ties` | PASS |
| Browser `tests/e2e/bay-copy.spec.js` | PASS |
| Contracts | PASS (3) |

Artifacts: `bay-copy-browser.json`, `bay-copy-project.json` (8 nodes, 8 members, 4 supports, spatial).

## Acceptance meaning

Does **not** claim parent M03: no separate model/analysis Workers, no 5,000-node generator, no full skewed OpenSees M03 pack, no edit-during-solve. Those remain later M03 tasks.
