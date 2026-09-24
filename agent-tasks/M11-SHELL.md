# M11-SHELL — Pad footing design screens in the approved shell

Status: PLANNED. Depends on: **M11 engineering acceptance** + [M07-F](M07-F.md).  
Layout refs: [`docs/design/M11-WORKFLOW/`](../docs/design/M11-WORKFLOW/README.md). Binding: **ADR 0008**.

## Outcome

UI for **reaction → soil/contact → geometry → structural → detailing** in the approved shell.

## Screens

PNGs 01–06 under `docs/design/M11-WORKFLOW/screens/` are layout references only.

## Acceptance (DW-P1–DW-P5)

- **DW-P1** Approved shell only.  
- **DW-P2** Reaction + soil input provenance visible.  
- **DW-P3** Partial contact / uplift cannot show as full-contact PASS.  
- **DW-P4** Bearing/flexure/shear/punching with Why navigation.  
- **DW-P5** Sizing study states whether frame reanalysis is coupled.

## Non-goals

Soil capacity remains an input unless M20 validates otherwise. Combined/strap/raft/pile caps are later slices.
