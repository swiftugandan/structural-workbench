#!/usr/bin/env node
/**
 * Same-build M12 (RC column, ec2-uk-na demonstration) parent corpus with
 * fail-closed acceptance: the biaxial kernel and the EC2 column checks against
 * the oracles, JRC Column B2 and the boundaries; the schema; the protocol
 * (model actions, proposal); and the browser journeys.
 */
import { readFile, mkdir } from "node:fs/promises";
import { evidenceDir } from "./evidence.mjs";
import {
  browserRecord,
  buildRecord,
  cargoRecord,
  run,
} from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M12/full";
process.env.WORKBENCH_TASK_ID = "M12-parent";
process.env.WORKBENCH_MILESTONE = "M12";

const dir = evidenceDir("evidence/M12/full");
await mkdir(dir, { recursive: true });

const build = await buildRecord();
// Kernel and profile: column oracle, EC2 column checks, JRC Column B2.
await cargoRecord(dir, "column-native", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-design",
]);
// Schema 1.8.0 code inputs and migration.
await cargoRecord(dir, "column-model", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-model",
]);
// Protocol: model actions, code inputs and the proposal.
await cargoRecord(dir, "column-protocol", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-wasm-api",
  "--test",
  "rc_column_preview",
]);
await browserRecord(
  dir,
  "m12-browser",
  ["tests/e2e/rc-column.spec.js", "tests/e2e/capability-ledger.spec.js"],
  {
    artifacts: [
      "playwright-results.json",
      "ec2-column.png",
      "ec2-column-proposal.png",
      "ec2-column-run.json",
      "column-mechanics.png",
      "calculation-record.html",
    ],
  },
);
run("node", ["tools/record-m12-acceptance.mjs"]);
run("npm", ["run", "verify:milestone", "--", "M12"]);

const gate = JSON.parse(await readFile(`${dir}/gate-M12.json`, "utf8"));
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
