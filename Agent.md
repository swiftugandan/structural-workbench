# Agent delivery instructions

Version 1.1. Compatibility shim.

Canonical always-on policy: [AGENTS.md](AGENTS.md). Progressive procedures: [skills/](skills/). Full historical Version 1.0 wording: [docs/agent/archive/Agent.md](docs/agent/archive/Agent.md).

This file does not change the numerical contract, grant external permissions or override higher-priority runtime instructions. It exists because older handoff docs and some agents look for `Agent.md` at the repository root.

## Load map

| When | Load |
| --- | --- |
| Every session | `AGENTS.md` |
| Session start / handoff | `skills/prokon-session` |
| Implementing or repairing a task | `skills/prokon-task-loop` |
| Solver / element / design-check work | `skills/prokon-numerical` |
| Tests, milestone acceptance, release | `skills/prokon-evidence` |
| Missing standards, GPU, oracles | `skills/prokon-resources` |
| Multi-agent or role separation | `skills/prokon-collab` |

## Begin now

Reconstruct current repository state per `skills/prokon-session`. If no implementation exists, execute `SPEC_ROOT/agent-tasks/M00.md`. Make the cantilever workflow real, run its objective gates, preserve the evidence and continue. Do not stop at another plan when implementation is authorised.
