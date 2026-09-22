# Agent instruction layout

Always-on policy is root `AGENTS.md` (token-budgeted). Procedural detail is progressive disclosure under `skills/prokon-*`. Root `Agent.md` and `AGENT_RUNBOOK.md` are compatibility shims for older handoff pointers.

| Path | Role |
| --- | --- |
| `AGENTS.md` | Always loaded: mission, source priority, hard invariants, evidence bar, escalation |
| `skills/prokon-session` | Reconstruct state, `delivery/state.json`, handoff |
| `skills/prokon-task-loop` | Task sequence, decision table, failure recovery |
| `skills/prokon-numerical` | Formulation dossiers, oracles, forbidden shortcuts |
| `skills/prokon-evidence` | Tests, acceptance evidence, release, M00 shape |
| `skills/prokon-resources` | Resource lock, capability ledger, blocker scope |
| `skills/prokon-collab` | Roles, ownership, integration |
| `archive/` | Unmodified Version 1.0 `Agent.md`, `AGENT_RUNBOOK.md`, loader `AGENTS.md` |

Contract files (`SPECIFICATION.md`, `VALIDATION.md`, fixtures, schemas) are unchanged by this split. Do not edit archive copies as living policy.
