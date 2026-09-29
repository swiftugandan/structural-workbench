#!/usr/bin/env node
/**
 * Same-build M14 (dynamics-v1) parent corpus with fail-closed acceptance.
 */
import { readFile, mkdir } from "node:fs/promises";
import { evidenceDir } from "./evidence.mjs";
import {
  browserRecord,
  buildRecord,
  cargoRecord,
  nodeRecord,
  run,
} from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M14/full";
process.env.WORKBENCH_TASK_ID = "M14-parent";
process.env.WORKBENCH_MILESTONE = "M14";

const dir = evidenceDir("evidence/M14/full");
await mkdir(dir, { recursive: true });

const build = await buildRecord();
// Native: element mass, eigen-solver, mass sources and the modal kernel.
await cargoRecord(dir, "modal-native", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-frame",
  "-p",
  "workbench-solver",
  "-p",
  "workbench-model",
  "-p",
  "workbench-assembly",
  "--test",
  "mass",
  "--test",
  "eigen",
  "--test",
  "mass_sources",
  "--test",
  "modal",
]);
// Protocol on the built WASM kernel and the capability ledger.
await nodeRecord(dir, "modal-protocol", [
  "tests/modal-protocol.test.mjs",
  "tests/capability-ledger.test.mjs",
]);
// Browser: the M14 journey and the capability ledger disclosure.
await browserRecord(
  dir,
  "m14-browser",
  ["tests/e2e/modal.spec.js", "tests/e2e/capability-ledger.spec.js"],
  {
    artifacts: [
      "playwright-results.json",
      "journey.json",
      "vibration-report.html",
      "modal-run.json",
      "project.json",
      "modal-modes.png",
      "mode-2.png",
      "negative-mass.png",
    ],
  },
);
run("node", ["tools/record-m14-acceptance.mjs"]);
run("npm", ["run", "verify:milestone", "--", "M14"]);

const gate = JSON.parse(await readFile(`${dir}/gate-M14.json`, "utf8"));
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
