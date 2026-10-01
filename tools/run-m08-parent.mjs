#!/usr/bin/env node
/**
 * Same-build M08 (concrete beam, ec2-uk-na demonstration) parent corpus with
 * fail-closed acceptance: the section kernel and EC2 profile against the JRC
 * examples, oracles and closed forms; the model schema; the protocol
 * (checks at model stations, proposal, schedule); and the browser journeys.
 */
import { readFile, mkdir } from "node:fs/promises";
import { evidenceDir } from "./evidence.mjs";
import {
  browserRecord,
  buildRecord,
  cargoRecord,
  run,
} from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M08/full";
process.env.WORKBENCH_TASK_ID = "M08-parent";
process.env.WORKBENCH_MILESTONE = "M08";

const dir = evidenceDir("evidence/M08/full");
await mkdir(dir, { recursive: true });

const build = await buildRecord();
// Kernel and profile: rc_section oracle, JRC examples, detailing tables.
await cargoRecord(dir, "concrete-native", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-design",
]);
// Schema 1.7.0 code inputs and migration.
await cargoRecord(dir, "concrete-model", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-model",
]);
// Protocol: model stations, code inputs, proposal and schedule.
await cargoRecord(dir, "concrete-protocol", [
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
  "m08-browser",
  ["tests/e2e/design-previews.spec.js", "tests/e2e/capability-ledger.spec.js"],
  {
    artifacts: [
      "playwright-results.json",
      "ec2-checks.png",
      "ec2-proposal.png",
      "ec2-proposal-applied.png",
      "ec2-run.json",
      "rcBeam-run.json",
      "rcBeam.png",
    ],
  },
);
run("node", ["tools/record-m08-acceptance.mjs"]);
run("npm", ["run", "verify:milestone", "--", "M08"]);

const gate = JSON.parse(await readFile(`${dir}/gate-M08.json`, "utf8"));
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
