---
name: prokon-task-loop
description: >
  Execute a Structural Workbench delivery task end to end.
  Use when implementing, repairing or verifying a milestone task.
---

# Task execution loop

Normal task size: ~0.5–2 engineering days, one measurable acceptance increment. Split at a user-visible state or contract boundary. Never split an element formulation across agents without a shared signed convention document.

## Sequence

1. State the user action and observable outcome. Identify contracts and failure cases.
2. Inspect and reuse existing implementation and fixtures. Create missing independent expected results before judging candidate output.
3. Implement the smallest integrated path through UI → command transport → Rust behaviour → presentation → persistence appropriate to the slice. Intermediate tasks may be smaller; the parent milestone is accepted only after the full journey works.
4. Run relevant native and WASM tests, then the browser path and failure tests. Apply the milestone gates from `VALIDATION.md` — do not substitute a generic unit-test command.
5. Investigate failures with a saved minimal reproduction. Fix the responsible layer; rerun tests affected by the change.
6. Produce evidence from the actual source/build proposed for acceptance. Update task and capability records.
7. Integrate passing work and continue to the next ready task without routine confirmation.

Prefer small coherent changes. Search before duplicating modules. Keep numerical, storage and rendering concerns behind existing interfaces. Prefer a simple verified dependency over a new custom numerical subsystem unless compatibility or measured requirements justify it.

## Deterministic decision rules

| Situation | Action |
| --- | --- |
| UI detail not specified | Native accessible control; match stated layout; focused interaction assertion |
| Dependency latest uncertain | Resolve once from official sources; pin version/hash/licence; test target build |
| Sparse crate fails WASM | Test documented alternative behind solver trait; keep full capability targets |
| Browser test lacks real GPU | Software-GPU correctness only; leave hardware gate `BLOCKED`; prepare runner requirements |
| Standard text/example unavailable | Mark code package `BLOCKED_RESOURCE`; ship independent mechanics if its gates pass |
| Oracle disagrees | Check assumptions/units/signs first, then reduce fixture; never average outputs |
| Suspected numerical defect | Block affected release; create minimal failing model; preserve user data |
| Required contract ambiguous | Prefer conservative rejection for unsupported input; ADR + exact regression |
| External publishing lacks authority | Prepare static release + evidence; leave publishing pending |
| Context nearing limit | Checkpoint task state, failed checks and next exact action before handoff |

## Failure recovery

For a repeated failure, save input, build, logs, expected/actual and one concrete hypothesis per attempt. After three materially different unsuccessful repair approaches to the same unexplained issue: mark blocked, stop that approach, continue independent tasks. The attempt limit prevents loops; it does not authorise abandoning the project or claiming completion.

Blocker record: affected requirements, precise reproduction, observed evidence, attempts, smallest missing resource/decision, independent tasks still available, deterministic resume condition. Revisit when evidence or a dependency changes. Do not repeatedly ask the same question.

Request user input only when an unresolved product decision materially changes the result, an external permission is missing, or a resource cannot be obtained through authorised means. Complete work that makes the request concrete first. Use documented defaults for ordinary reversible choices. Never treat project instructions as permission to bypass runtime controls, purchase licences, expose private resources, delete unrelated work or publish externally without authority.
