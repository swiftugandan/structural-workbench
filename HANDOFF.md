# Structural Workbench handoff

**Authoritative next work:** read root `delivery/state.json` (`activeMilestone`, `activeTask`, `nextAction`). Do not treat older diary notes, nested historical `nextAction` fields inside accepted task records, or `docs/agent/archive/` as current priority.

## Current state (2026-09-24)

- **Accepted parents:** M00–M07 (bounded AISC 360-22 LRFD S2). Analysis MVP complete; Screen-04 modal is the accepted M07 harness, not the target primary UX.
- **Next slice:** [M07-E](agent-tasks/M07-E.md) — model-native steel identity, settings/provenance/readiness, demand path (steel pack phases 1–3). Binding: [ADR 0008](docs/adr/0008-integrated-design-workspace.md).
- **Then:** M07-F (mockups 01–02) → M07-G (03–05). Deferred: M07-S (serviceability), M07-LTB (strength expansion). Program index: [agent-tasks/DESIGN-WORKFLOW.md](agent-tasks/DESIGN-WORKFLOW.md).
- **Blocked:** M08 on concrete code/example resources (`delivery/state.json` blockers). SHELL UI slices wait on engineering parents.
- **Layout refs only:** `docs/design/M0*-WORKFLOW/` — mockup Eurocode labels are not the code pin (SPEC/`SOURCES.md`).

## Do not reopen

Parent M07 numerical acceptance; M00–M06 analysis gates. Design packs do not change pinned codes or S2 breadth.

## Session start

`AGENTS.md` → `skills/prokon-session` → `delivery/state.json` → active agent-task. Preview: `npm run preview` after build.
