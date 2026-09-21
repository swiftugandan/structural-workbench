# Agent delivery instructions

Version 1.0. This file extends the Browser Structural Engineering Workbench specification and AGENT_RUNBOOK.md with repository execution rules. It governs implementation work toward the defined product. It does not change the numerical contract, grant external permissions or override higher-priority instructions in the agent's runtime.

## Mission and success condition

Deliver the specified browser application through working vertical slices. The required stack is a Rust engineering kernel compiled to WebAssembly, a WebGPU CAD viewport, and plain HTML, JavaScript ES modules and CSS. The user expects little routine human involvement. Make reversible implementation decisions, resolve ordinary failures, preserve progress and continue through dependency-ready milestones without requesting approval at each step.

The deliverable is functioning software with reproducible evidence. Plans, scaffolds, isolated libraries, screenshots, generated code volume and passing package-integrity checks do not constitute milestone completion. Each accepted milestone must provide its actual user journey, numerical behaviour, negative paths, saved project and exported outcome.

M00–M06 define the analysis MVP. M07 adds separately verified steel-code design; M08 adds the concrete-beam workflow. M09–M22 expand the product, and M23 closes a finite, verified parity inventory through additional vertical slices. Do not treat M06 as full PROKON parity or an instruction to abandon later authorised work. Do not promise standards compliance, commercial equivalence or professional approval without the corresponding evidence.

## Installation and instruction discovery

Keep this file at the implementation repository root as Agent.md. The handoff includes AGENTS.md, a short loader that tells compatible agents to read this file. Agent.md alone is not guaranteed to be automatically discovered. If the repository already has AGENTS.md, preserve its instructions and add a reference to this file; do not overwrite existing policy.

Keep the specification package under docs/spec. During initial work directly inside the extracted handoff, its files may instead sit beside this file. Resolve SPEC_ROOT as docs/spec when docs/spec/SPECIFICATION.md exists, otherwise the directory containing the handoff's SPECIFICATION.md. If neither exists, report the exact missing package and continue only work that does not depend on guessing its contents. Resolve paths in this file relative to the implementation repository unless explicitly prefixed by SPEC_ROOT.

Preserve a baseline copy or source-control commit of the received specification, fixtures and manifest. Do not edit the handoff's expected numerical values as part of ordinary feature work. Import this project instruction into the repository; it is not an instruction to modify the agent platform's global configuration.

## Source of truth and conflict handling

Follow applicable runtime instructions, the user's current requirements and existing repository rules. Within this project, SPECIFICATION.md, VALIDATION.md and the data/protocol contracts define required behaviour; this file and AGENT_RUNBOOK.md define execution. PARITY_ROADMAP.md defines the scope ledger; roadmap.json defines milestone dependencies. SOURCES.md and resources.required.json identify research and missing resources. Fixtures contain acceptance seeds, not executed results.

If documents or schema disagree, reproduce the conflict, record it and keep the affected gate blocked. Resolve ordinary implementation choices yourself. A behaviour-preserving clarification can be recorded in an architecture decision with tests. A change to required scope, tolerances, supported limits, benchmark truth or acceptance meaning must not be silently adopted as if it were the original contract. Submit a concrete amendment with independent evidence; continue unaffected work while the disputed requirement remains open.

## Start every session with reconstruction

1. Read applicable repository instructions and this file. On first entry, read SPEC_ROOT/README.md, SPECIFICATION.md, AGENT_RUNBOOK.md, VALIDATION.md, contracts/PROTOCOL.md and agent-tasks/M00.md. Inspect the schema, relevant fixtures, roadmap and resource register. Later sessions must review changes and the sections affected by their task.
2. Inspect repository status and existing application code before writing. Preserve unrelated user changes. Do not initialise a replacement project over existing work or manufacture a remote repository.
3. Read delivery/state.json, the active task record, recent decisions and evidence for the current source revision. Verify claimed completed work still exists. A previous narrative summary is not sufficient proof that tests passed.
4. Identify the earliest dependency-ready unaccepted milestone and its smallest complete task. If a resource blocks it, record the blocker and choose an independent task. Do not advance a dependent milestone by pretending its prerequisite passed.
5. Record the next concrete action and resume. Do not ask the user to restate decisions already captured in the specification.

The initial implementation task is M00: edit, solve, display, save, reopen and report a cantilever using the actual WASM kernel and WebGPU viewport.

## Durable delivery state

Create delivery/state.json in the implementation repository. Its initial content must describe reality; do not copy example acceptance states as completed work. Use this minimum shape:

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

Each task record must contain ID, use case, dependencies, status, owned paths, acceptance IDs, required commands, actual command outcomes, evidence paths, relevant source/build hashes, attempts and next action. Use the lifecycle READY → CLAIMED → IMPLEMENTING → VERIFYING → ACCEPTED. Record FAILED, BLOCKED_RESOURCE or BLOCKED_CONTRACT explicitly when applicable. Record timestamps only when observed.

Keep architecture decisions under docs/adr, mathematical formulations under docs/formulations, code packages under docs/code-profiles, and evidence under evidence/<milestone>/<run-id>. Keep an append-only delivery log for important state transitions. Large evidence may live in authorised artifact storage with durable references and hashes; do not commit secrets or large generated binaries unnecessarily.

Before a context handoff, interruption or session end, save edited files, update the task record and write the exact next command or action. Commit coherent work when an authorised git repository exists. Use a named WIP branch/checkpoint for incomplete work; do not label it accepted. If git is unavailable, preserve a recoverable checkpoint and record that limitation. Never rely solely on conversational memory.

## Task execution loop

For every task, follow this sequence:

1. State the user action and observable outcome. Identify the contracts and failure cases it touches.
2. Inspect and reuse existing implementation and fixtures. Create missing independent expected results before using them to judge candidate output.
3. Implement the smallest integrated path through UI, command transport, Rust behaviour, presentation and persistence appropriate to the slice. Intermediate tasks may be smaller; their parent milestone is accepted only after the full journey works.
4. Run relevant native and WASM tests, then the browser path and failure tests. Apply the milestone's required gates from VALIDATION.md; do not replace them with a generic unit-test command.
5. Investigate failures using a saved minimal reproduction. Correct the responsible layer and rerun tests affected by the change.
6. Produce evidence from the actual source/build being proposed for acceptance. Update task and capability records.
7. Integrate passing work and continue to the next ready task without routine confirmation.

Use small coherent changes. Search before duplicating modules. Keep numerical, storage and rendering concerns behind their existing interfaces. Prefer a simple verified dependency over a new custom numerical subsystem unless compatibility or measured requirements justify the custom work.

## Product and architectural invariants

These rules apply to every feature and refactor:

- Rust owns committed geometry, engineering units, model validation, stiffness, load combination, recovery and design calculations. JavaScript may format or preview; it may not become a second engineering authority.
- Use f64 for authoritative geometry and calculations. WebGPU f32 data are display projections with origin rebasing, never the saved engineering truth.
- Keep the runtime static and browser based. Do not substitute a backend solver, WebGL viewport or frontend framework to bypass a failed requirement.
- Pin native and WASM dependencies and build flags. Prove browser-target compatibility; an API page or successful native compile is insufficient.
- Use stable entity IDs, explicit axes/units and revision-aware commands. Never accept stale analysis results as current.
- Treat mutation as atomic. A failed import or command leaves the prior project recoverable. Undo/redo must restore the specified engineering state.
- Preserve capability and unsupported-domain checks in the UI, imports, native CLI and automation paths alike.
- Cancel blocking WASM work using the specified Worker architecture. A queued cancel message cannot interrupt synchronous execution by itself.
- Preserve project data when a GPU, Worker, storage transaction or analysis fails. A blank viewport or zero-valued placeholder result is not acceptable failure handling.
- Downloadable projects and reports must remain useful without browser database state or a network service.

## Numerical truth and review

Before implementing a numerical family, write its formulation dossier: assumptions, domain, DOFs, axes, units, signs, equations, loading, constraints, releases, solve strategy, recovery, diagnostics and independent validation cases. Use the specification's conventions, including its distinction between element nodal actions and internal section actions.

Keep expected-result generation independent of candidate assembly, conversion and design code. Reusing the same implementation in a test harness does not create an independent oracle. Separate agents can review, but role separation does not compensate for shared erroneous formulas.

For each change that can affect numerical output, check relevant analytical fixtures, units, axis transformations, global equilibrium, residuals, conditioning and native/WASM agreement. Add targeted tests for the actual risk. For distributed loads, test consistent loading, release condensation of the load vector and interior displacement recovery. For design checks, test signs and individual points, not only unsigned maxima that could conceal an axis error.

Never add artificial stiffness to conceal a mechanism, use pseudoinversion to pass an unstable model, round before comparing, coerce nonfinite results into zeros, average disagreeing solvers or loosen tolerances after seeing a failure. If independent references disagree, reconcile assumptions and minimise the model; keep the affected capability blocked until the difference is understood.

Every numerical result must reference the source model, settings and solver build. Every design check must identify the governing real action set and its supported code profile. A missing mandatory check prevents an overall pass. An envelope assembled from independent maxima is not a simultaneous force vector.

## Tests must establish the claimed outcome

The included tools/check_package.py checks the specification package and analytical arithmetic only. Its success is never evidence that application implementation, structural analysis or PROKON parity has passed.

Create the application commands required by VALIDATION.md. Missing scripts, zero collected tests, skipped mandatory cases, fixture parse failures, absent oracle runtimes or inaccessible required hardware fail or block the affected gate. A shell command that prints PASS is not a verifier. Report test counts and IDs so accidental empty execution is detectable.

Browser acceptance must exercise real controls and actual WASM computations. Do not inject precomputed results, mock the numerical kernel or display fixture answers as solver output in an acceptance journey. Controlled mocks are appropriate for otherwise difficult failure injection, such as quota denial; label those tests and also exercise genuine storage, GPU and Worker behaviour where required.

Keep assertions linked to acceptance IDs. For the cantilever, change a load, length or stiffness to a non-default value and demonstrate the calculated response changes correctly. Cross-check report/table/viewport values against the typed result buffers. Verify stale-state behaviour after engineering edits and unchanged validity after presentation-only changes.

Use a general Draft 2020-12 validator in implementation CI for the JSON contracts, in addition to semantic checks. The handoff's portable schema-subset checker is not the production import validator.

Broaden testing when a concrete affected risk or milestone gate requires it. Once relevant verification is sufficient, proceed; do not spend the delivery budget rerunning unrelated tests without a reason. Required release and numerical gates remain mandatory.

## Acceptance evidence cannot be self-declared

Implement npm run verify:milestone -- <ID> and npm run verify:release as verifiers that inspect required evidence and return nonzero when it is missing or failed. They must not mark milestones complete merely because a status file says ACCEPTED.

Each evidence record must identify task/milestone, command arguments, outcome, test IDs/counts, source revision or content hash, dependency locks, build hashes, input fixture hashes, runner/browser/adapter and output artifacts. A verifier must reject a record from a different build, changed fixture or incompatible environment. Save raw numerical results and failure traces, not only summary screenshots.

A milestone is accepted only when its specification-defined user journey, negative paths, numerical checks, persistence/export, regression gates and required platform/performance evidence are complete. Individual task acceptance does not imply milestone acceptance. An analysis acknowledgement does not imply analysis completion. A passing report-generation test does not imply a verified design rule.

Source changes invalidate affected evidence. Changing shared element, unit, model, protocol or solver code requires regression of earlier dependent slices. Reuse unchanged evidence only when its dependency/hash relationship is established. Do not alter golden files, required commands or gate logic solely to accept a failing implementation.

## Resources and capability states

Use resources.required.json to determine external dependencies. Create resources.lock.json only from actual acquisitions, recording authoritative origin, exact edition/version, content hash, rights status and validation use. Preserve inaccessible sources as unresolved, rather than filling their fields with invented values.

Missing standards or independent examples block the relevant code package, not unrelated analysis work. Missing a real-GPU runner blocks that hardware gate; software-GPU correctness evidence does not become hardware performance evidence. Missing licensed PROKON outputs leaves commercial numerical equivalence UNKNOWN.

Maintain capabilities.json with separate implementation and evidence dimensions: capability ID, scope key, implementation status, verification status, comparison status, resource blockers, limitations and evidence references. Scope keys include relevant formulation, material/section domain, code edition/amendment/annex, platform and exchange format. Do not collapse these into an unqualified supported flag.

Select enabled features from this ledger. Unsupported or incomplete engineering domains must fail predictably; a feature flag may not conceal that a mandatory MVP requirement remains unfinished. When code resources are available, implement and validate the actual clause-level rules rather than continuing indefinitely with a mechanics approximation.

## Failure recovery and escalation

For a repeated failure, save the input, build, logs, expected/actual comparison and one concrete hypothesis per attempt. After three materially different unsuccessful repair approaches to the same unexplained issue, mark it blocked, stop repeating that approach and continue independent tasks. The attempt limit prevents loops; it does not authorise abandoning the user's project or claiming completion.

A blocker record includes affected requirements, precise reproduction, observed evidence, attempts, smallest missing resource/decision, independent tasks still available and a deterministic condition for resuming. Revisit when new evidence or a dependency changes. Do not repeatedly ask the user the same question.

Request user input only when an unresolved product decision materially changes the result, an external permission is genuinely missing, or a resource cannot be obtained through authorised means. First complete the work that makes the request concrete and reviewable. Use documented defaults for ordinary reversible implementation choices. Never interpret this file as permission to bypass runtime controls, purchase licences, expose private resources, delete unrelated work or publish externally without authority.

## Collaboration and integration

When multiple agents are available and their use is authorised, divide work along complete tasks or stable interfaces. Assign an owner to shared contracts, fixture baselines and integration. Give each agent a bounded objective, input paths, editable paths, acceptance IDs and required evidence. Use separate branches/worktrees when appropriate; do not let agents silently overwrite each other's changes.

Keep numerical verification independent from implementation derivation. The integrator resolves contract changes explicitly, reviews diffs and reruns affected tests after merging. If working alone, perform the same roles sequentially and use an independent reference implementation or analytical derivation. Multi-agent execution is a delivery option, not a prerequisite or evidence of correctness.

## Delivery and release

Keep every milestone runnable and demonstrable. Preserve previous working builds until the next candidate passes. Before release, build from a clean source checkout or content-addressed snapshot, verify locked dependencies, run accumulated gates, confirm tested and delivered artifact hashes match, and emit release-manifest.json, capabilities.json, known limitations and reproducible run instructions.

Prevent artifact/hash recursion: compute the application source/build digest excluding generated evidence and mutable delivery state; record those exclusions explicitly. A final evidence-only commit may follow the tested source commit, but must show no application, test-input, dependency or build-script changes. The delivered source snapshot must reproduce the tested application bytes or document any bounded nondeterministic build fields separately.

Retain original project files during schema migration. Test service-worker updates against mismatched JS/WASM versions. Provide a rollback/recovery path for application releases; do not claim an application rollback can reverse an incompatible project migration without its saved original.

Continue after an accepted milestone to the next dependency-ready authorised milestone. If all remaining work is blocked, deliver the last working product, all evidence, the exact blocker register and the next resumption action. Do not manufacture a fully green roadmap. Report implemented, verified, compared and blocked scope separately.

## Completion report

Each milestone report must state:

- What a user can now do and how to run the actual product.
- The delivered source/build identifiers and project/report artifacts.
- Required checks executed, their outcomes and any platform limits.
- Numerical and code scope that is verified, unsupported or still blocked.
- The capability ledger changes and next ready task.

Lead with usable outcomes. Keep routine implementation detail in the evidence bundle. A successful status message must never conceal missing mandatory evidence.

## Begin now

Reconstruct current repository state. If no implementation exists, execute SPEC_ROOT/agent-tasks/M00.md. Make the cantilever workflow real, run its objective gates, preserve the evidence and continue. Do not stop at another plan when implementation is authorised.
