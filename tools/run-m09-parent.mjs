#!/usr/bin/env node
/**
 * Same-build M09 (stability-v1) parent corpus with fail-closed acceptance.
 * Every record lists the tests that actually executed and passed, parsed
 * from the runner's own output, never a hand-written list.
 */
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { record, evidenceDir } from "./evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M09/full";
process.env.WORKBENCH_TASK_ID = "M09-parent";
process.env.WORKBENCH_MILESTONE = "M09";

const dir = evidenceDir("evidence/M09/full");
await mkdir(dir, { recursive: true });

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
  process.stdout.write(r.stdout || "");
  process.stderr.write(r.stderr || "");
  if (r.status !== 0)
    throw new Error(`${cmd} ${args.join(" ")} failed (${r.status})`);
  return (r.stdout || "") + (r.stderr || "");
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

// Native kernel: element K_G, eigen-buckling, second order.
const nativeCommand = [
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
];
const native = run(nativeCommand[0], nativeCommand.slice(1));
await writeFile(`${dir}/stability-native.log`, native);
const nativePassed = [...native.matchAll(/^test (\S+) \.\.\. ok$/gm)].map(
  (m) => m[1],
);
const nativeFailed = [...native.matchAll(/^test (\S+) \.\.\. FAILED$/gm)];
await record("stability-native", {
  status: nativeFailed.length || !nativePassed.length ? "FAIL" : "PASS",
  testCount: nativePassed.length,
  testIds: nativePassed,
  command: nativeCommand,
  artifacts: [],
});

// Protocol on the built WASM kernel and the capability ledger.
const unitCommand = [
  "node",
  "--test",
  "--test-reporter=tap",
  "tests/stability-protocol.test.mjs",
  "tests/capability-ledger.test.mjs",
];
const unit = run(unitCommand[0], unitCommand.slice(1));
await writeFile(`${dir}/stability-protocol.log`, unit);
const unitPassed = [...unit.matchAll(/^\s*ok \d+ - (.+)$/gm)].map((m) =>
  m[1].trim(),
);
const unitFailed = [...unit.matchAll(/^\s*not ok \d+ - (.+)$/gm)];
await record("stability-protocol", {
  status: unitFailed.length || !unitPassed.length ? "FAIL" : "PASS",
  testCount: unitPassed.length,
  testIds: unitPassed,
  command: unitCommand,
  artifacts: [],
});

// Browser: the M09 journey and the capability ledger disclosure.
const browserSpecs = [
  "tests/e2e/stability.spec.js",
  "tests/e2e/capability-ledger.spec.js",
];
const browserLog = run("npx", ["playwright", "test", ...browserSpecs], {
  env: { ...process.env, WORKBENCH_EVIDENCE_DIR: dir },
});
await writeFile(`${dir}/m09-browser.log`, browserLog);
const results = JSON.parse(
  await readFile(`${dir}/playwright-results.json`, "utf8"),
);
const titles = [];
const walk = (suite) => {
  for (const spec of suite.specs || [])
    for (const t of spec.tests || [])
      if (t.results?.at(-1)?.status === "passed") titles.push(spec.title);
  for (const s of suite.suites || []) walk(s);
};
for (const s of results.suites) walk(s);
const journey = JSON.parse(await readFile(`${dir}/journey.json`, "utf8"));
await record("m09-browser", {
  status:
    results.stats.unexpected === 0 &&
    results.stats.skipped === 0 &&
    titles.length === results.stats.expected
      ? "PASS"
      : "FAIL",
  testCount: titles.length,
  testIds: titles,
  command: ["npx", "playwright", "test", ...browserSpecs],
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
  stats: results.stats,
  journey,
});

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
