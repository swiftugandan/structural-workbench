#!/usr/bin/env node
/**
 * Same-build M13 (single-plate steel connection, aisc-360-22-lrfd
 * demonstration) parent corpus with fail-closed acceptance: the connection
 * kernel against the held Design Examples and the independent oracle, the
 * schema, the protocol and the browser journeys.
 */
import { readFile, mkdir } from "node:fs/promises";
import { evidenceDir } from "./evidence.mjs";
import {
  browserRecord,
  buildRecord,
  cargoRecord,
  run,
} from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M13/full";
process.env.WORKBENCH_TASK_ID = "M13-parent";
process.env.WORKBENCH_MILESTONE = "M13";

const dir = evidenceDir("evidence/M13/full");
await mkdir(dir, { recursive: true });

const build = await buildRecord();
// The kernel: ICR, the held examples and the independent oracle.
await cargoRecord(dir, "connection-native", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-design",
]);
// Schema 1.9.0: the draft, its topology check and migration.
await cargoRecord(dir, "connection-model", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-model",
]);
// Protocol: end actions, statuses, refusals and persistence.
await cargoRecord(dir, "connection-protocol", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-wasm-api",
  "--test",
  "single_plate",
]);
await browserRecord(
  dir,
  "m13-browser",
  ["tests/e2e/steel-connection.spec.js", "tests/e2e/capability-ledger.spec.js"],
  {
    artifacts: [
      "playwright-results.json",
      "connection-checks.png",
      "connection-drawing.png",
      "connection-drawing.svg",
      "connection-run.json",
      "calculation-record.html",
      "moment-transfer.png",
    ],
  },
);
run("node", ["tools/record-m13-acceptance.mjs"]);
run("npm", ["run", "verify:milestone", "--", "M13"]);

const gate = JSON.parse(await readFile(`${dir}/gate-M13.json`, "utf8"));
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
