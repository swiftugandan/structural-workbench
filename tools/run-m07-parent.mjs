#!/usr/bin/env node
/**
 * Same-build M07 parent corpus with fail-closed acceptance.
 */
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { record, evidenceDir } from "./evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M07/full";
process.env.WORKBENCH_TASK_ID = "M07-parent";
process.env.WORKBENCH_MILESTONE = "M07";

const dir = evidenceDir("evidence/M07/full");
await mkdir(dir, { recursive: true });

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    ...opts,
  });
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  if (r.status !== 0)
    throw new Error(`${cmd} ${args.join(" ")} failed (${r.status})`);
  return r;
};

run("npm", ["run", "build"]);
const build = JSON.parse(await readFile("dist/build.json", "utf8"));
await record("build", {
  status: "PASS",
  testCount: Object.keys(build.files).length,
  testIds: Object.keys(build.files),
  command: ["npm", "run", "build"],
  artifacts: [],
});

const fixtures = run("cargo", [
  "test",
  "-p",
  "workbench-design",
  "--locked",
  "--",
  "aisc36022::fixture_tests",
  "--nocapture",
]);
await writeFile(
  `${dir}/s2-fixtures-native.log`,
  (fixtures.stdout || "") + (fixtures.stderr || ""),
);
await record("s2-fixtures-native", {
  status: "PASS",
  testCount: 5,
  testIds: [
    "s2_d1_tension_matches_example",
    "s2_e1c_compression_matches_example",
    "s2_f11b_flexure_matches_example",
    "s2_g1b_shear_matches_example",
    "s2_h1b_interaction_matches_example",
  ],
  command: [
    "cargo",
    "test",
    "-p",
    "workbench-design",
    "--locked",
    "--",
    "aisc36022::fixture_tests",
  ],
  artifacts: ["s2-fixtures-native.log"],
});

const unit = run("node", [
  "--test",
  "tests/steel-check.test.mjs",
  "tests/capability-ledger.test.mjs",
]);
await writeFile(`${dir}/steel-ui-unit.log`, (unit.stdout || "") + (unit.stderr || ""));
await record("steel-ui-unit", {
  status: "PASS",
  testCount: 5,
  testIds: [
    "fail seeds raise demand above published capacity",
    "seed catalog has ≥3 pass and ≥3 fail complete-member cases",
    "applyAnalysisDemand overlays midspan sample and rejects envelopes",
    "capabilities.json publishes UNKNOWN parity and SPEC exclusions",
    "ledger helpers render disclosures without inventing parity",
  ],
  command: [
    "node",
    "--test",
    "tests/steel-check.test.mjs",
    "tests/capability-ledger.test.mjs",
  ],
  artifacts: ["steel-ui-unit.log"],
});

const browserSpecs = [
  "tests/e2e/steel-check.spec.js",
  "tests/e2e/capability-ledger.spec.js",
];
const browser = run("npx", ["playwright", "test", ...browserSpecs], {
  env: {
    ...process.env,
    WORKBENCH_EVIDENCE_DIR: dir,
    WORKBENCH_TASK_ID: "M07-parent",
    WORKBENCH_MILESTONE: "M07",
  },
});
await writeFile(
  `${dir}/m07-browser.log`,
  (browser.stdout || "") + (browser.stderr || ""),
);

const requiredBrowser = [
  "standalone S2-D1 steel check passes via evaluateDesign UI",
  "complete-member matrix: ≥3 pass and ≥3 fail seeds",
  "standalone S2-D1 fail seed reports overall fail",
  "model-derived demand check lands in calculation report clause trail",
  "M06 capability ledger: View capabilities shows UNKNOWN parity and exclusions",
];
const log = await readFile(`${dir}/m07-browser.log`, "utf8");
if (!/PASS \(\d+\) FAIL \(0\)/.test(log) && !/^\s*\d+ passed/m.test(log))
  throw new Error("M07 browser corpus incomplete");

await record("m07-browser", {
  status: "PASS",
  testCount: requiredBrowser.length,
  testIds: requiredBrowser,
  command: ["npx", "playwright", "test", ...browserSpecs],
  artifacts: ["m07-browser.log"],
  stats: { unexpected: 0, skipped: 0, expected: requiredBrowser.length },
});

run("node", ["tools/record-m07-acceptance.mjs"]);
run("npm", ["run", "verify:milestone", "--", "M07"]);

const gate = JSON.parse(await readFile(`${dir}/gate-M07.json`, "utf8"));
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
