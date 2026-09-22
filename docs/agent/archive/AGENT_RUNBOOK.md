# Autonomous implementation runbook

This is the execution policy for AI agents building the specified product. It authorises no external purchase, publication or account access. Use the permissions already provided in the actual implementation environment. The user intends minimal routine human involvement, so make reversible engineering choices within the contract and continue independent work when a resource is blocked.

## 1 Start and finish conditions

Begin with M00 and agent-tasks/M00.md. Create the implementation repository in the authorised workspace, read any applicable repository instructions, and import this package under docs/spec. Do not mistake tools/check_package.py for an application test suite. Do not invent a git remote or deployment credential.

M00 must produce a runnable cantilever app, not merely scaffolding. At every milestone, preserve all earlier user journeys. Maintain a machine-readable capability ledger; shipped, experimental, blocked and excluded are distinct states. An experimental module cannot satisfy a shipped mandatory capability.

## 2 Roles and bounded work

Use roles whether one agent or multiple agents execute them: coordinator, implementer, numerical verifier, browser/UX verifier and release integrator. A numerical verifier must derive or obtain expected outputs independently of the implementation. If separate agents are available and authorised, give them isolated branches/worktrees and non-overlapping file ownership; otherwise execute the roles sequentially with independent tools/formulations. Role labels alone do not remove correlated errors.

A task should normally represent 0.5–2 engineering days of coherent work and produce one measurable acceptance increment. Split a long task at a user-visible state or a contract boundary. Never split an element formulation between agents without a shared signed convention document. No agent edits shared schemas, migrations or golden expected outputs concurrently without integrator ownership.

## 3 Task lifecycle

States are READY → CLAIMED → IMPLEMENTING → VERIFYING → ACCEPTED. A task may enter BLOCKED_RESOURCE, BLOCKED_CONTRACT or FAILED. Record owner, branch, dependency versions and evidence paths. Acceptance is decided by the verifier's required commands, not the implementer's prose summary.

For each task: inspect contracts and current code; state assumptions in its task record; add independent fixture(s) or reuse an existing relevant one; implement the smallest complete path; run targeted checks; integrate browser behaviour; run milestone regression; produce evidence; integrate only when every required gate passes. An implementation ticket is not allowed to edit its own benchmark expected outputs to match observed output.

Use at most three materially different repair attempts for the same unexplained failure. Preserve each diagnostic bundle. Then mark the task blocked with reproduction steps, root-cause hypotheses and the smallest missing fact. Continue DAG-ready tasks that do not depend on it. Repeating the same failing command indefinitely is not progress.

## 4 Deterministic decision rules

| Situation | Agent action |
| --- | --- |
| UI detail not specified | Use native accessible control, match stated layout, add a focused interaction assertion |
| Dependency latest version uncertain | Resolve once from official package sources, pin version/hash and licence, test target build |
| Sparse crate fails WASM | Test the documented alternative behind solver trait; preserve full final capability targets |
| Browser test lacks a real GPU | Complete software-GPU correctness; leave hardware gate BLOCKED and prepare runner requirements |
| Standard text/example unavailable | Mark code package BLOCKED_RESOURCE; ship independent mechanics workflow if its gates pass |
| Oracle disagrees | Check assumptions/units/signs first, then reduce fixture; never average the outputs |
| Suspected numerical defect | Block affected release and create a minimal failing model; preserve user data |
| Required contract is ambiguous | Prefer documented conservative rejection for unsupported input; create contract ADR and exact regression |
| External publishing lacks authority | Prepare complete static release and evidence; leave publishing pending under actual environment policy |
| Agent context nearing limit | Commit/checkpoint task state, failed checks and next exact action before handing off |

## 5 Resource acquisition contract

resources.lock.json must record each needed standard, worked example, section catalogue, oracle binary/container and reference dataset with official URL, version/edition, retrieval date, content hash, licence/use status and local evidence path. Available, unavailable and prohibited-to-redistribute are separate states. Do not place copyrighted source material in a public repository unless rights permit; tests can reference private CI-mounted resources by hash. No project secrets belong in this lock file.

Do not treat search snippets or product marketing as design formulas. Read authoritative sources and record a formulation dossier. Use official language/library documentation for platform constraints. If a source changes, update the research lock through a deliberate task; ongoing builds use the pinned resource version.

## 6 Formulation dossier template

For each numerical family record: mathematical assumptions; supported domain; exact DOFs/axes/units/signs; equations and derivation; load integration; restraints/releases; recovery; conditioning and failure diagnostics; analytical references; independent oracle setup; property tests; target tolerances; limitations and report text. The dossier and its tests land before or with the element implementation, never as an afterthought.

For a code rule add exact standard/edition/clause; applicability predicate; coefficients and their provenance; branch table; all intermediate quantities; mandatory companion checks; examples; unsupported conditions and code-profile version. A package with incomplete mandatory companion checks cannot produce overall pass.

## 7 Integration and release policy

Protect numerical fixture baselines through a verification gate. Keep contracts backwards compatible inside a major schema version. An intentional break requires migration fixtures and original-file preservation. Rebase/merge conflicts must be resolved by the owning agent and reverified, not by discarding the other branch.

The release integrator checks dist hashes against tested artifacts, confirms no dirty source tree, reproduces the clean build, runs accumulated milestone gates and emits release-manifest.json plus capabilities.json. Keep the previous working release available. An automatically staged preview can be replaced only after the candidate passes its gates and the environment permits deployment.

A summary says exactly what was implemented, what was tested, which platforms ran and what remains blocked. Do not say full PROKON clone, certified, production engineering approved or numerically equivalent unless the corresponding evidence actually exists.

## 8 Milestone closure template

Record milestone ID and user journey; actual demo/run command; result report and project files; input/model/build hashes; test summary with all mandatory outcomes; screenshots/traces; browser/GPU identity; performance samples; limitations; resource blockers; source revision; capability changes; recovery/rollback procedure; next DAG-ready task. Human approval is not a routine closure field. Resource/authority blockers are exceptions with concrete missing inputs.

## 9 Initial implementation task breakdown

M00-A delivers editable cantilever form → Rust model → JSON export, with schema and unit fixtures. M00-B delivers the same form → sparse Rust/WASM solve → result table, with B01–B04 and failure diagnostics. M00-C delivers the same model → WebGPU viewport → selected result probe, with adapter-loss handling. M00-D delivers reopen → solve → standalone report and clean reproducible build with evidence. These increments form one complete M00 product; none is counted as a separate completed MVP.

Subsequent tasks must follow this shape: one use case, precise touched modules, fixture IDs, dependencies, failure cases, commands and output artifacts. Consult roadmap.json for milestone-level readiness and the specification for the required user-visible scope. Create detailed tickets for M01/M02 after M00 reveals real module boundaries; do not generate thousands of speculative microtasks for advanced formulations.
