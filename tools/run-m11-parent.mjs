#!/usr/bin/env node
/**
 * Same-build M11 (pad footing, ec2-uk-na demonstration) parent corpus with
 * fail-closed acceptance: the contact kernel and EC2 footing design against
 * the oracle, JRC footing B-2 and closed forms; the schema; the protocol
 * (support reactions, bearing, schedule); and the browser journeys.
 */
import { readFile, mkdir } from "node:fs/promises";
import { evidenceDir } from "./evidence.mjs";
import {
  browserRecord,
  buildRecord,
  cargoRecord,
  run,
} from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M11/full";
process.env.WORKBENCH_TASK_ID = "M11-parent";
process.env.WORKBENCH_MILESTONE = "M11";

const dir = evidenceDir("evidence/M11/full");
await mkdir(dir, { recursive: true });

const build = await buildRecord();
// Kernel and profile: contact oracle, EC2 footing design, JRC footing B-2.
await cargoRecord(dir, "footing-native", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-design",
]);
// Schema 1.8.0 code inputs and migration.
await cargoRecord(dir, "footing-model", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-model",
]);
// Protocol: support reactions, code inputs, bearing and schedule.
await cargoRecord(dir, "footing-protocol", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-wasm-api",
  "--test",
  "preview_workspace",
]);
await browserRecord(
  dir,
  "m11-browser",
  [
    "tests/e2e/pad-footing.spec.js",
    "tests/e2e/design-previews.spec.js",
    "tests/e2e/design-fidelity.spec.js",
    "tests/e2e/capability-ledger.spec.js",
  ],
  {
    artifacts: [
      "playwright-results.json",
      "footing-ec2.png",
      "footing-contact.png",
      "footing-run.json",
      "calculation-record.html",
    ],
  },
);
run("node", ["tools/record-m11-acceptance.mjs"]);
run("npm", ["run", "verify:milestone", "--", "M11"]);

const gate = JSON.parse(await readFile(`${dir}/gate-M11.json`, "utf8"));
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
