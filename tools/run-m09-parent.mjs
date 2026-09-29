#!/usr/bin/env node
/**
 * Same-build M09 (stability-v1) parent corpus with fail-closed acceptance.
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

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M09/full";
process.env.WORKBENCH_TASK_ID = "M09-parent";
process.env.WORKBENCH_MILESTONE = "M09";

const dir = evidenceDir("evidence/M09/full");
await mkdir(dir, { recursive: true });

const build = await buildRecord();
// Native kernel: element K_G, eigen-buckling, second order.
await cargoRecord(dir, "stability-native", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-assembly",
  "-p",
  "workbench-solver",
  "--test",
  "stability",
  "--test",
  "second_order",
  "--test",
  "eigen",
]);
// Protocol on the built WASM kernel and the capability ledger.
await nodeRecord(dir, "stability-protocol", [
  "tests/stability-protocol.test.mjs",
  "tests/capability-ledger.test.mjs",
]);
// Browser: the M09 journey and the capability ledger disclosure.
await browserRecord(
  dir,
  "m09-browser",
  ["tests/e2e/stability.spec.js", "tests/e2e/capability-ledger.spec.js"],
  {
    artifacts: [
      "playwright-results.json",
      "journey.json",
      "record.html",
      "second-order-run.json",
      "project.json",
      "buckling-mode.png",
      "second-order.png",
      "sway-comparison.png",
      "over-critical.png",
    ],
  },
);
run("node", ["tools/record-m09-acceptance.mjs"]);
run("npm", ["run", "verify:milestone", "--", "M09"]);

const gate = JSON.parse(await readFile(`${dir}/gate-M09.json`, "utf8"));
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
