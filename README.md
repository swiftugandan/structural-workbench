# Structural Workbench

Structural Workbench is an open-source browser application for modelling and
exploring structural frames. It combines a Rust/WebAssembly engineering kernel,
a WebGPU CAD viewport, and plain HTML, JavaScript, and CSS. The independent
product roadmap is inspired by established structural analysis workbenches.

[Open the live preview](https://swiftugandan.github.io/structural-workbench/) ·
[View the source](https://github.com/swiftugandan/structural-workbench)

This repository now includes a working implementation alongside the original
specification and acceptance fixtures. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)
for implemented scope and remaining gates. No commercial PROKON equivalence or
code-design compliance is claimed.

## Run the preview

Use the pinned Node and Rust toolchains, then run `npm ci`, `npm run setup`,
`npm run build` and `npm run preview`. Open http://127.0.0.1:4173 and choose
**New planar portal**. Draw members or type coordinates, edit nodes/supports/loads,
preview topology or selection edits, analyse, undo, save and export.

The full M01 candidate and its regression evidence are described in
[evidence/M01/full/README.md](evidence/M01/full/README.md). Formal M01 acceptance
remains blocked until the required real-GPU platform and computer-use checks pass.
For repeatable verification, set `WORKBENCH_EVIDENCE_DIR=evidence/M01/full`,
`WORKBENCH_TASK_ID=M01-FULL` and `WORKBENCH_MILESTONE=M01` before running the
commands in [the runner guide](docs/M01_HARDWARE_RUNNER.md). The original fixture
values remain unchanged.

## Read in this order

Start with [AGENTS.md](AGENTS.md), the always-on delivery policy. [Agent.md](Agent.md) and [AGENT_RUNBOOK.md](AGENT_RUNBOOK.md) are compatibility shims into that file plus [skills/](skills/). Layout notes: [docs/agent/README.md](docs/agent/README.md). Preserve existing repository instructions when merging the loader into another repo.

1. [SPECIFICATION.md](SPECIFICATION.md) — product decisions, architecture, numerical conventions and 24 vertical-slice milestones.
2. [skills/](skills/) — session, task loop, numerical, evidence, resources and collab procedures (was AGENT_RUNBOOK.md).
3. [VALIDATION.md](VALIDATION.md) — numerical tolerances, benchmark definitions, browser journeys and release gates.
4. [contracts/PROTOCOL.md](contracts/PROTOCOL.md) and contracts/\*.schema.json — model, worker and result contracts.
5. [fixtures/README.md](fixtures/README.md) and [fixtures/benchmarks.json](fixtures/benchmarks.json) — analytical truth and complete input models.
6. [agent-tasks/M00.md](agent-tasks/M00.md) — first implementation assignment.
7. [PARITY_ROADMAP.md](PARITY_ROADMAP.md), [roadmap.json](roadmap.json) and [SOURCES.md](SOURCES.md) — scope matrix, dependencies and resource provenance.
8. [DESIGN_SCREENS.md](DESIGN_SCREENS.md) — high-fidelity projects, modelling, results and steel-design screens.

## First instruction for an implementation agent

Read this package, implement M00 end to end in an authorised repository, run its objective gate and continue DAG-ready milestones. Preserve all earlier workflows. Do not substitute a framework, server solver or fake results. Missing code-standard resources block only their dependent capabilities; they never justify invented compliance claims.

## Package self-check

Run python3 tools/check_package.py from this directory with Python 3. It checks project fixtures against the generated schema keyword subset, analytical arithmetic, reference integrity and milestone dependencies. It does not run or validate a future solver. PACKAGE_VALIDATION.json records the check performed while preparing this package. MANIFEST.sha256 lists delivered file hashes.

## Scope checkpoints

M00–M06: analysis MVP. M07: separately gated steel design MVP. M08: concrete-beam design and schedules. M09–M22: advanced usable products. M23: finite, evidence-backed suite-parity programme. Exact code resources, licensed commercial comparison outputs and additional advanced benchmarks remain explicit external dependencies.

resources.required.json lists every missing external resource gate and its dependent milestones in machine-readable form.

## Open-source license

Structural Workbench is available under the [MIT License](LICENSE). It is an
early mechanics preview for exploration and verification, not certified design
software or a substitute for review by a qualified structural engineer.
