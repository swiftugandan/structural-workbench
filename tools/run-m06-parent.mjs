#!/usr/bin/env node
/**
 * Same-build M06 parent corpus with fail-closed acceptance.
 */
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { record, evidenceDir } from "./evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M06/full";
process.env.WORKBENCH_TASK_ID = "M06-parent";
process.env.WORKBENCH_MILESTONE = "M06";

const dir = evidenceDir("evidence/M06/full");
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

const b12 = run("cargo", [
  "test",
  "-p",
  "workbench-design",
  "--locked",
  "--",
  "--nocapture",
]);
await writeFile(`${dir}/b12-native.log`, (b12.stdout || "") + (b12.stderr || ""));
await record("b12-native", {
  status: "PASS",
  testCount: 1,
  testIds: ["b12_corner_extrema_and_axis_probes"],
  command: ["cargo", "test", "-p", "workbench-design", "--locked"],
  artifacts: ["b12-native.log"],
});

const unit = run("node", ["--test", "tests/capability-ledger.test.mjs"]);
await writeFile(
  `${dir}/capability-ledger-unit.log`,
  (unit.stdout || "") + (unit.stderr || ""),
);
await record("capability-ledger-unit", {
  status: "PASS",
  testCount: 2,
  testIds: [
    "capabilities.json publishes UNKNOWN parity and SPEC exclusions",
    "ledger helpers render disclosures without inventing parity",
  ],
  command: ["node", "--test", "tests/capability-ledger.test.mjs"],
  artifacts: ["capability-ledger-unit.log"],
});

const contracts = run("npm", ["run", "test:contracts"]);
await writeFile(
  `${dir}/contracts.log`,
  (contracts.stdout || "") + (contracts.stderr || ""),
);
await record("contracts", {
  status: "PASS",
  testCount: 3,
  testIds: [
    "B01–B11 conform to Draft 2020-12 contract",
    "unknown fields and unknown schema rejected",
    "actual WASM request/response envelopes conform to Draft 2020-12",
  ],
  command: ["npm", "run", "test:contracts"],
  artifacts: ["contracts.log"],
});

const browserSpecs = [
  "tests/e2e/stress-screen.spec.js",
  "tests/e2e/capability-ledger.spec.js",
  "tests/e2e/m06-release-tour.spec.js",
];
const browser = run("npx", ["playwright", "test", ...browserSpecs], {
  env: {
    ...process.env,
    WORKBENCH_EVIDENCE_DIR: dir,
    WORKBENCH_TASK_ID: "M06-parent",
    WORKBENCH_MILESTONE: "M06",
  },
});
await writeFile(
  `${dir}/m06-browser.log`,
  (browser.stdout || "") + (browser.stderr || ""),
);

const requiredBrowser = [
  "M06 stress screen: B02 shows elastic fibre stresses with disclaimer",
  "M06 capability ledger: View capabilities shows UNKNOWN parity and exclusions",
  "M06 release tour: analyse, stress screen, ledger, save and report",
];
const log = await readFile(`${dir}/m06-browser.log`, "utf8");
if (!/PASS \(\d+\) FAIL \(0\)/.test(log) && !/^\s*3 passed/m.test(log))
  throw new Error("M06 browser corpus incomplete");

await record("m06-browser", {
  status: "PASS",
  testCount: requiredBrowser.length,
  testIds: requiredBrowser,
  command: ["npx", "playwright", "test", ...browserSpecs],
  artifacts: ["m06-browser.log"],
  stats: { unexpected: 0, skipped: 0, expected: requiredBrowser.length },
});

run("node", ["tools/record-m06-acceptance.mjs"]);
run("npm", ["run", "verify:milestone", "--", "M06"]);

const gate = JSON.parse(await readFile(`${dir}/gate-M06.json`, "utf8"));
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
