#!/usr/bin/env node
/**
 * Same-build M10 (slab panel, plate-v1 + ec2-uk-na demonstration) parent
 * corpus with fail-closed acceptance: the plate family benchmarks, the EC2
 * slab design against JRC punching and hand values, the schema, the protocol
 * and the browser journeys.
 */
import { readFile, mkdir } from "node:fs/promises";
import { evidenceDir } from "./evidence.mjs";
import {
  browserRecord,
  buildRecord,
  cargoRecord,
  run,
} from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M10/full";
process.env.WORKBENCH_TASK_ID = "M10-parent";
process.env.WORKBENCH_MILESTONE = "M10";

const dir = evidenceDir("evidence/M10/full");
await mkdir(dir, { recursive: true });

const build = await buildRecord();
// The plate-v1 family: patch tests, rigid modes, benchmarks, distortion.
await cargoRecord(dir, "plate-kernel", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-plate",
]);
// EC2 slab design: JRC punching and hand values.
await cargoRecord(dir, "slab-native", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-design",
]);
// Schema 1.8.0 code inputs.
await cargoRecord(dir, "slab-model", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-model",
]);
// Protocol: plate source, code inputs, map, punching and schedule.
await cargoRecord(dir, "slab-protocol", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-wasm-api",
  "--test",
  "slab_plate",
]);
await browserRecord(
  dir,
  "m10-browser",
  ["tests/e2e/slab-plate.spec.js", "tests/e2e/capability-ledger.spec.js"],
  {
    artifacts: [
      "playwright-results.json",
      "slab-ec2.png",
      "slab-as-bottom-x.png",
      "slab-ec2-run.json",
      "opening-mx.svg",
    ],
  },
);
run("node", ["tools/record-m10-acceptance.mjs"]);
run("npm", ["run", "verify:milestone", "--", "M10"]);

const gate = JSON.parse(await readFile(`${dir}/gate-M10.json`, "utf8"));
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
