#!/usr/bin/env node
/**
 * Same-build M17 (composite beam, aisc-360-22-lrfd demonstration)
 * parent corpus with fail-closed acceptance: the composite kernel against the
 * held Design Examples I.1/I.2 and the independent oracle, the schema, the
 * protocol (stage separation) and the browser journeys.
 */
import { readFile, mkdir } from "node:fs/promises";
import { evidenceDir } from "./evidence.mjs";
import {
  browserRecord,
  buildRecord,
  cargoRecord,
  run,
} from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M17/full";
process.env.WORKBENCH_TASK_ID = "M17-parent";
process.env.WORKBENCH_MILESTONE = "M17";

const dir = evidenceDir("evidence/M17/full");
await mkdir(dir, { recursive: true });

const build = await buildRecord();
// The kernel: the held examples I.1/I.2 and the independent oracle.
await cargoRecord(dir, "composite-native", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-design",
]);
// Schema 1.10.0: the draft, its stage references and migration.
await cargoRecord(dir, "composite-model", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-model",
]);
// Protocol: stage separation, statuses, refusals and persistence.
await cargoRecord(dir, "composite-protocol", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-wasm-api",
  "--test",
  "composite_beam",
]);
await browserRecord(
  dir,
  "m17-browser",
  ["tests/e2e/composite-beam.spec.js", "tests/e2e/capability-ledger.spec.js"],
  {
    artifacts: [
      "playwright-results.json",
      "composite-checks.png",
      "composite-section.png",
      "composite-section.svg",
      "composite-run.json",
      "calculation-record.html",
      "composite-indeterminate.png",
    ],
  },
);
run("node", ["tools/record-m17-acceptance.mjs"]);
run("npm", ["run", "verify:milestone", "--", "M17"]);

const gate = JSON.parse(await readFile(`${dir}/gate-M17.json`, "utf8"));
console.log(
  JSON.stringify(
    {
      status: gate.status,
      dir,
      sourceHash: build.sourceHash,
      buildHash: build.buildHash,
      issues: gate.issues,
    },
    null,
    2,
  ),
);
if (gate.status !== "PASS") process.exitCode = 1;
