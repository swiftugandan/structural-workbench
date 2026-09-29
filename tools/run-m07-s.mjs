#!/usr/bin/env node
/**
 * Same-build M07-S (steel serviceability) gate: kernel deflection checks
 * against closed forms, reference guards and the browser journey, with
 * DW-SVc1 bound to the executed tests.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { evidenceDir, record } from "./evidence.mjs";
import {
  acceptanceMarkdown,
  browserRecord,
  buildRecord,
  cargoRecord,
  evaluateCriteria,
} from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M07/serviceability";
process.env.WORKBENCH_TASK_ID = "M07-S";
process.env.WORKBENCH_MILESTONE = "M07";

const dir = evidenceDir("evidence/M07/serviceability");
await mkdir(dir, { recursive: true });
const build = await buildRecord();
await cargoRecord(dir, "design-workspace", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-wasm-api",
  "--test",
  "design_workspace",
]);
await browserRecord(
  dir,
  "steel-browser",
  ["tests/e2e/native-steel-design.spec.js", "tests/e2e/steel-overview.spec.js"],
  {
    artifacts: ["playwright-results.json"],
  },
);

const JOURNEY =
  "DW-SVc1: a deflection criterion is a separate serviceability status";
const criteria = [
  {
    id: "DW-SVc1-DEFLECTION",
    title: "Deflection under a service case against closed forms",
    evidence: "kernel_validation",
    tests: {
      "design-workspace": [
        "serviceability_is_a_separate_deflection_status_against_the_closed_form",
      ],
      "steel-browser": [JOURNEY],
    },
    observation:
      "B04 cantilever W18×50: absolute tip deflection equals PL³/3EI to 1e-9 (kernel) and 1e-6 (browser, independent Ix and E); chord-relative deflection equals max[v(x) − v(L)x/L].",
  },
  {
    id: "DW-SVc1-SEPARATE",
    title: "Serviceability status distinct from strength",
    evidence: "ui_journey, exported_outcome",
    tests: {
      "design-workspace": [
        "serviceability_is_a_separate_deflection_status_against_the_closed_form",
      ],
      "steel-browser": [JOURNEY],
    },
    observation:
      "A failing deflection limit leaves the strength verdict PASS; the panel, overview column and design record carry serviceability separately; members without criteria show NOT CHECKED.",
  },
  {
    id: "DW-SVc1-GUARDS",
    title: "Service inputs are validated",
    evidence: "failure_path",
    tests: {
      "design-workspace": [
        "serviceability_refuses_strength_combinations_and_dangling_references",
      ],
    },
    observation:
      "Strength combinations (INVALID_LOAD), missing cases (DANGLING_REFERENCE) and limits below L/1 (INVALID_SCHEMA) are refused atomically; section reassignment keeps the member's criteria.",
  },
];
const { rows, issues } = await evaluateCriteria(dir, build, criteria);
const limitations =
  "User deflection criterion L/n under one service case or combination, chord-relative or absolute, sampled at the 41 exact analysis stations of each member. Not an AISC 360 requirement; vibration, drift and ponding are not checked.";
await record("m07-s-acceptance", {
  status: issues.length ? "FAIL" : "PASS",
  testCount: rows.length,
  testIds: rows.map((r) => r.id),
  command: ["node", "tools/run-m07-s.mjs"],
  issues,
  criteria: rows,
  limitations,
});
await writeFile(
  `${dir}/ACCEPTANCE.md`,
  acceptanceMarkdown("M07-S", build, rows, issues, limitations),
);
console.log(
  JSON.stringify(
    {
      status: issues.length ? "FAIL" : "PASS",
      sourceHash: build.sourceHash,
      buildHash: build.buildHash,
      issues,
    },
    null,
    2,
  ),
);
if (issues.length) process.exitCode = 1;
