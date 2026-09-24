# M07-LTB — Expanded W-shape strength checks (deferred)

Status: PLANNED (deferred). Depends on: [M07-E](M07-E.md), locked AISC resources, **new** fixture/dossier evidence beyond accepted S2.  
Maps to steel design pack **§31 Phase 6**. Binding: ADR 0008.

## Outcome

Evidence-backed expansion of `aisc-360-22-lrfd` beyond accepted S2 continuous-brace flexure — only with new fixtures/dossier entries. Capability metadata and UNSUPPORTED behaviour stay fail-closed.

## Acceptance

- **DW-LTB1:** Each newly claimed clause family has dossier + fixtures; unsupported cases remain UNSUPPORTED (no silent PASS). Parent M07 S2 gates still pass.

## Non-goals

Not a UI shell milestone. Does not claim full AISC 360. HSS/torsion/non-prismatic remain separate scopes. Does not unblock M07-F/G.
