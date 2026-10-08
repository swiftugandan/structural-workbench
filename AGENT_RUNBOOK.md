# Autonomous implementation runbook

Version 1.1. Compatibility shim.

Execution policy now lives in:

- Always-on: [AGENTS.md](AGENTS.md)
- Session / state: [skills/gusset-session](skills/gusset-session/SKILL.md)
- Task loop + decision table: [skills/gusset-task-loop](skills/gusset-task-loop/SKILL.md)
- Resources / capabilities: [skills/gusset-resources](skills/gusset-resources/SKILL.md)
- Evidence / release: [skills/gusset-evidence](skills/gusset-evidence/SKILL.md)
- Roles / integration: [skills/gusset-collab](skills/gusset-collab/SKILL.md)

Full historical Version 1.0 wording: [docs/agent/archive/AGENT_RUNBOOK.md](docs/agent/archive/AGENT_RUNBOOK.md).

## Begin now

Reconstruct current repository state per [skills/gusset-session](skills/gusset-session/SKILL.md) and `delivery/state.json`. Execute the active task. Do not restart from M00 when parents are already accepted.
