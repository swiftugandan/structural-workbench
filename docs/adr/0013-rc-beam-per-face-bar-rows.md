# ADR 0013 — RC beam drafts record top and bottom bar rows separately (schema 1.2.0)

## Status

Accepted for M08-A3 (2026-09-28).

## Context

Schema 1.1.0 rcBeam drafts store one bar preference (`barDiameter`, `barCount`) and apply it to both faces. With section mechanics (ADR 0012), that forces the sagging and hogging states to be identical. Real beams usually have different top and bottom reinforcement. The single preference cannot express that, and treating the old keys as "bottom" would silently change their meaning.

## Decision

1. Project schema becomes **1.2.0**. rcBeam inputs replace `barDiameter`/`barCount` with `topBarDiameter`, `topBarCount`, `bottomBarDiameter` and `bottomBarCount`. Each count is an integer from 1 to 20.
2. Import migration **1.1.0 → 1.2.0** copies the single preference into equal top and bottom rows, with values and per-field provenance unchanged. Engineering meaning is preserved exactly. A 1.1.0 rcBeam draft missing either old key is refused, not guessed. The 0.9.0 and 1.0.0 chains continue through 1.1.0. The original bytes are retained as before (M04).
3. `contracts/project-v1.1.schema.json` archives the 1.1.0 contract, and `project.schema.json` pins 1.2.0.
4. Section mechanics evaluates **sagging** (top face in compression) and **hogging** (bottom face in compression) from the two rows, with a fit check per row. The illustrative schedule lists one row per face.
5. The mechanics classification uses the extreme (deepest) tension layer. The previous rule, "every tension layer yields", mislabelled a hogging case whose near-face row sat just below the neutral axis (M08-A1 formulation amended, oracle and kernel changed together).

## Consequences

- Tests that pinned the current schema string (M04 migration and record, structure model, M06 tour) now expect 1.2.0. Their migration-chain expectations are otherwise unchanged.
- Files written by this build cannot be opened by builds that only know 1.1.0.
