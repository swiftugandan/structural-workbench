#!/usr/bin/env node
/**
 * Same-build M22 (declarative studies) parent corpus with fail-closed
 * acceptance.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { evidenceDir, record } from "./evidence.mjs";
import {
  browserRecord,
  buildRecord,
  cargoRecord,
  run,
} from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M22/full";
process.env.WORKBENCH_TASK_ID = "M22-parent";
process.env.WORKBENCH_MILESTONE = "M22";

const dir = evidenceDir("evidence/M22/full");
await mkdir(dir, { recursive: true });

const build = await buildRecord();
await cargoRecord(dir, "study-native", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-assembly",
  "--test",
  "study",
]);
await cargoRecord(dir, "study-cli", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-cli",
]);

// The built native CLI replays the fixture study byte for byte.
const cli = [
  "target/release/workbench-cli",
  "study",
  "fixtures/studies/S22-E.json",
];
const first = run(cli[0], cli.slice(1));
const second = run(cli[0], cli.slice(1));
await writeFile(`${dir}/cli-report.json`, first);
const report = JSON.parse(first);
const replay = [];
if (first === second)
  replay.push("CLI replay reproduces the report byte for byte");
if (report.solverBuildHash === build.sourceHash)
  replay.push("CLI report carries the build's solver source hash");
if (
  /^[0-9a-f]{64}$/.test(report.studyDigest) &&
  /^[0-9a-f]{64}$/.test(report.baseModelHash)
)
  replay.push("CLI report carries the study digest and base model hash");
await record("study-cli-replay", {
  status: replay.length === 3 ? "PASS" : "FAIL",
  testCount: replay.length,
  testIds: replay,
  command: cli,
  artifacts: ["cli-report.json"],
});

await browserRecord(dir, "m22-browser", ["tests/e2e/study.spec.js"], {
  artifacts: [
    "playwright-results.json",
    "manual-equivalence.json",
    "study-ui-browser.json",
  ],
});
run("node", ["tools/record-m22-acceptance.mjs"]);
run("npm", ["run", "verify:milestone", "--", "M22"]);

const gate = JSON.parse(await readFile(`${dir}/gate-M22.json`, "utf8"));
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
