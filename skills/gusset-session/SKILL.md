---
name: gusset-session
description: >
  Reconstruct delivery state and resume work for Structural Workbench.
  Use at session start, after context handoff, or when choosing the next milestone task.
---

# Session reconstruction

## First entry reading

Read `AGENTS.md`, then `delivery/state.json` (`activeMilestone`, `activeTask`, `nextAction`, `acceptedMilestones`). Load `skills/gusset-task-loop` before execution work. Inspect schema, relevant fixtures, roadmap and resource register only as the active task requires. Later sessions: review changes and sections affected by the current task.

**Do not** start from M00 when `acceptedMilestones` already includes analysis/design parents — trust `nextAction`. The M00 example below is only for an empty `delivery/state.json`.

## Before writing code

1. Inspect repository status and existing application code. Preserve unrelated user changes. Do not initialise a replacement project over existing work or invent a remote.
2. Read `delivery/state.json`, the active task record, recent decisions and evidence for the current source revision. Verify claimed completed work still exists on disk. Prefer root `nextAction` over nested `nextAction` on already-accepted tasks.
3. Identify the earliest dependency-ready unaccepted milestone and its smallest complete task. If a resource blocks it, record the blocker and choose an independent task. Do not advance a dependent milestone by pretending its prerequisite passed.
4. Record the next concrete action and resume. Do not ask the user to restate decisions already in the specification.

When `delivery/state.json` is missing or empty, the bootstrap task is M00 — edit, solve, display, save, reopen and report a cantilever using the actual WASM kernel and WebGPU viewport.

## Durable delivery state

Create `delivery/state.json` if missing. Initial content must describe reality — do not copy example acceptance as completed work:

```json
{
  "stateVersion": 1,
  "specVersion": "1.0",
  "activeMilestone": "M00",
  "activeTask": "M00-A",
  "acceptedMilestones": [],
  "tasks": {},
  "blockers": [],
  "lastVerifiedSourceRevision": null,
  "lastVerifiedBuildHash": null,
  "nextAction": "Inspect the repository and implement the editable cantilever model path"
}
```

Each task record: ID, use case, dependencies, status, owned paths, acceptance IDs, required commands, actual command outcomes, evidence paths, source/build hashes, attempts, next action.

Lifecycle: `READY → CLAIMED → IMPLEMENTING → VERIFYING → ACCEPTED`. Use `FAILED`, `BLOCKED_RESOURCE` or `BLOCKED_CONTRACT` explicitly. Record timestamps only when observed.

Layout:

- Architecture decisions → `docs/adr`
- Formulations → `docs/formulations`
- Code packages → `docs/code-profiles`
- Evidence → `evidence/<milestone>/<run-id>`
- Append-only delivery log for important transitions

Large evidence may live in authorised artifact storage with durable refs/hashes. Do not commit secrets or large generated binaries unnecessarily.

## Before handoff / session end

Save edited files, update the task record, write the exact next command or action. Commit coherent work when an authorised git repo exists. Use a named WIP branch/checkpoint for incomplete work — never label it accepted. If git is unavailable, preserve a recoverable checkpoint and record that limitation. Never rely solely on conversational memory.
