# M08-SHELL — Concrete beam design screens in the approved shell

Status: PLANNED. Depends on: **M08 engineering acceptance** + [M07-F](M07-F.md).  
Layout refs: [`docs/design/M08-WORKFLOW/`](../docs/design/M08-WORKFLOW/README.md). Binding: **ADR 0008**.

## Outcome

Rectangular RC beam design uses the same shell regions as M07-F (inspector + drawer + schedule export). Centre of gravity is **reinforcement inside a fixed concrete member**.

## Code pin

Executable profile is whatever M08 locks (proposed **ACI 318-19** per `SOURCES.md`). Mockup “EN 1992” labels are **not** the contract.

## Screens

Use M08-WORKFLOW PNGs 01–05 as layout references only (setup, reinforcement, detailing, schedule, calc details).

## Acceptance (DW-C1–DW-C4)

- **DW-C1** Approved shell regions only.  
- **DW-C2** Cover/bar options and fit checks visible before complete-design PASS.  
- **DW-C3** Schedule export matches on-screen schedule.  
- **DW-C4** M08 numerical gates unchanged; this slice adds UI/workflow only.

## Non-goals

No RC column solver (M12). No Eurocode profile unless separately resourced and accepted.
