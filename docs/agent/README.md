# Agent instruction layout

Always-on policy is root `AGENTS.md` (token-budgeted). Procedural detail is progressive disclosure under `skills/gusset-*`. Root `Agent.md` and `AGENT_RUNBOOK.md` are compatibility shims for older handoff pointers.

| Path | Role |
| --- | --- |
| `AGENTS.md` | Always loaded: mission, source priority, hard invariants, evidence bar, escalation |
| `skills/gusset-session` | Reconstruct state, `delivery/state.json`, handoff |
| `skills/gusset-task-loop` | Task sequence, decision table, failure recovery |
| `skills/gusset-numerical` | Formulation dossiers, oracles, forbidden shortcuts |
| `skills/gusset-evidence` | Tests, acceptance evidence, release, M00 shape |
| `skills/gusset-resources` | Resource lock, capability ledger, blocker scope |
| `skills/gusset-collab` | Roles, ownership, integration |
| `archive/` | Unmodified Version 1.0 `Agent.md`, `AGENT_RUNBOOK.md`, loader `AGENTS.md` |

Contract files (`SPECIFICATION.md`, `VALIDATION.md`, fixtures, schemas) are unchanged by this split. Do not edit archive copies as living policy. Do not load `archive/` for next-work priority — use root `delivery/state.json` and ADR 0008 for the integrated design workspace.
