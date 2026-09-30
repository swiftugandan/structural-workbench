#!/usr/bin/env node
/**
 * Same-build M21 (exchange-v1) parent corpus with fail-closed acceptance:
 * the exchange kernel against the independent corpus, the protocol, the CLI
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

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M21/full";
process.env.WORKBENCH_TASK_ID = "M21-parent";
process.env.WORKBENCH_MILESTONE = "M21";

const dir = evidenceDir("evidence/M21/full");
await mkdir(dir, { recursive: true });

const build = await buildRecord();
// Native: STEP and GUID primitives, the IFC/DXF corpus, round trips.
await cargoRecord(dir, "exchange-native", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-exchange",
  "-p",
  "workbench-model",
]);
// Protocol: exchangeRead/Import/Export, atomic refusals, analysis.
await cargoRecord(dir, "exchange-protocol", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-wasm-api",
  "--test",
  "exchange",
  "--test",
  "commands",
]);
// Batch: the CLI with a mapping manifest.
await cargoRecord(dir, "exchange-cli", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-cli",
]);
await browserRecord(
  dir,
  "m21-browser",
  ["tests/e2e/exchange.spec.js", "tests/e2e/capability-ledger.spec.js"],
  {
    artifacts: [
      "playwright-results.json",
      "ifc-review.png",
      "ifc-analysed.png",
      "ifc-conversion-record.json",
      "ifc-imported-project.json",
      "blocked.png",
      "X-FRAME.ifc",
      "X-FRAME.ifc.ledger.json",
      "X-FRAME.dxf",
      "ifc-export.png",
    ],
  },
);
run("node", ["tools/record-m21-acceptance.mjs"]);
run("npm", ["run", "verify:milestone", "--", "M21"]);

const gate = JSON.parse(await readFile(`${dir}/gate-M21.json`, "utf8"));
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
