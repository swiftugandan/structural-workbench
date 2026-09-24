# M10-SHELL — Slab design screens in the approved shell

Status: PLANNED. Depends on: **M10 engineering acceptance** + [M07-F](M07-F.md).  
Layout refs: [`docs/design/M10-WORKFLOW/`](../docs/design/M10-WORKFLOW/README.md) (captions; PNGs pending). Binding: **ADR 0008**.

## Outcome

Surface workflow UI: mesh → plate actions → design-action transform → reinforcement maps — in the approved shell.

## Hard gate

M10 numerical family (`R-SHELL-BENCHMARKS`, patch/convergence) must pass before this UI can claim design. Captions alone are not acceptance.

## Screens

Captions 01–05 under `docs/design/M10-WORKFLOW/screens/` define layout intent until binaries are re-exported.

## Acceptance (DW-S1–DW-S4)

- **DW-S1** Approved shell only.  
- **DW-S2** Smoothed display ≠ silent design actions.  
- **DW-S3** Top/Bottom × X/Y maps inspectable.  
- **DW-S4** Openings/regions discourage designing from a single FE peak.

## Non-goals

Does not substitute M10 formulation evidence. Does not start from frame-member solver alone.
