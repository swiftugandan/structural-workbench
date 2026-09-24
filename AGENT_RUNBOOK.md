# Autonomous implementation runbook

Version 1.1. Compatibility shim.

Execution policy now lives in:

- Always-on: [AGENTS.md](AGENTS.md)
- Session / state: [skills/prokon-session](skills/prokon-session/SKILL.md)
- Task loop + decision table: [skills/prokon-task-loop](skills/prokon-task-loop/SKILL.md)
- Resources / capabilities: [skills/prokon-resources](skills/prokon-resources/SKILL.md)
- Evidence / release: [skills/prokon-evidence](skills/prokon-evidence/SKILL.md)
- Roles / integration: [skills/prokon-collab](skills/prokon-collab/SKILL.md)

Full historical Version 1.0 wording: [docs/agent/archive/AGENT_RUNBOOK.md](docs/agent/archive/AGENT_RUNBOOK.md).

## Begin now

Reconstruct current repository state per [skills/prokon-session](skills/prokon-session/SKILL.md) and `delivery/state.json`. Execute the active task. Do not restart from M00 when parents are already accepted.
