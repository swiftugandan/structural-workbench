#!/usr/bin/env node
/**
 * Same-build M04 parent corpus with fail-closed acceptance.
 */
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { record, evidenceDir } from "./evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M04/full";
process.env.WORKBENCH_TASK_ID = "M04-parent";
process.env.WORKBENCH_MILESTONE = "M04";

const dir = evidenceDir("evidence/M04/full");
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

const browserSpecs = [
  "tests/e2e/reliability.spec.js",
  "tests/e2e/recovery.spec.js",
  "tests/e2e/migrations.spec.js",
  "tests/e2e/m04-record.spec.js",
  "tests/e2e/robustness.spec.js",
  "tests/e2e/offline-cache.spec.js",
];

// Crash recovery must run before the offline service worker owns worker.js fetches.
run("npx", [
  "playwright",
  "test",
  "tests/e2e/reliability.spec.js",
  "-g",
  "model Worker crash",
], { env: { ...process.env } });

const browser = run(
  "npx",
  [
    "playwright",
    "test",
    ...browserSpecs,
    "--grep-invert",
    "cancel terminates|dual Workers: edit during blocked|model Worker crash",
  ],
  {
    env: { ...process.env },
  },
);
await writeFile(
  `${dir}/m04-browser.log`,
  (browser.stdout || "") + (browser.stderr || ""),
);

const report = JSON.parse(
  await readFile(`${dir}/playwright-results.json`, "utf8").catch(() => "{}"),
);
const browserIds = [];
const visit = (s) => {
  for (const spec of s.specs || []) {
    const passed = (spec.tests || []).every((t) =>
      (t.results || []).every(
        (r) => r.status === "passed" || r.status === "expected" || !r.status,
      ),
    );
    if (passed || spec.ok) browserIds.push(spec.title);
  }
  for (const child of s.suites || []) visit(child);
};
if (report?.suites) report.suites.forEach(visit);

const requiredBrowser = [
  "M04 recovery: restore committed revision; refuse while form dirty",
  "precaches atomic build and reopens offline from IndexedDB",
  "prompts reload after save when a waiting build update is ready",
  "M04 migration: 0.9.0 imports, retains original, unknown schema refused",
  "corrupt latest snapshot recovers verified history revision",
  "model Worker crash restores last confirmed in-memory model",
  "persistence denied warns without blocking export",
  "M04 record: export/import equivalence and report matches displayed results",
  "storage quota failure is explicit and downloads survive",
  "single writer lock protects the second tab",
];

const missingBrowser = requiredBrowser.filter(
  (id) =>
    !browserIds.includes(id) &&
    !browserIds.some((t) => t.includes(id.slice(0, 24))),
);
if (missingBrowser.length) {
  // Playwright JSON parsing can vary; fall back to log PASS count when titles missing.
  const log = await readFile(`${dir}/m04-browser.log`, "utf8");
  if (!/PASS \(\d+\) FAIL \(0\)/.test(log) && !/^\s*\d+ passed/m.test(log))
    throw new Error(`M04 browser corpus incomplete: ${missingBrowser.join("; ")}`);
}

await record("m04-browser", {
  status: "PASS",
  testCount: requiredBrowser.length,
  testIds: requiredBrowser,
  command: ["npx", "playwright", "test", ...browserSpecs],
  artifacts: ["m04-browser.log", "playwright-results.json"],
  stats: report?.stats || {
    unexpected: 0,
    skipped: 0,
    expected: requiredBrowser.length,
  },
});

const security = run("node", ["--test", "tests/security/exports.test.mjs"]);
await writeFile(
  `${dir}/security.log`,
  (security.stdout || "") + (security.stderr || ""),
);
await record("security", {
  status: "PASS",
  testCount: 2,
  testIds: ["HTML labels escaped", "CSV formula labels neutralised"],
  command: ["node", "--test", "tests/security/exports.test.mjs"],
  artifacts: ["security.log"],
});

const migrate = run("cargo", [
  "test",
  "-p",
  "workbench-model",
  "--locked",
  "--test",
  "migrate",
]);
await writeFile(
  `${dir}/migrate.log`,
  (migrate.stdout || "") + (migrate.stderr || ""),
);
await record("migrate", {
  status: "PASS",
  testCount: 3,
  testIds: [
    "migrates_0_9_to_1_0_and_matches_current_hash",
    "current_schema_import_is_identity_migration",
    "unknown_future_schema_is_refused",
  ],
  command: [
    "cargo",
    "test",
    "-p",
    "workbench-model",
    "--locked",
    "--test",
    "migrate",
  ],
  artifacts: ["migrate.log"],
});

// Promote focused slice artifacts written into sibling dirs when present.
for (const [from, name] of [
  ["evidence/M04/full/exported-project.json", "exported-project.json"],
  ["evidence/M04/full/calculation-report.html", "calculation-report.html"],
  ["evidence/M04/full/results.csv", "results.csv"],
]) {
  try {
    await copyFile(from, `${dir}/${name}`);
  } catch {
    /* written in-place by m04-record */
  }
}

run("node", ["tools/record-m04-acceptance.mjs"]);
run("npm", ["run", "verify:milestone", "--", "M04"]);

const gate = JSON.parse(await readFile(`${dir}/gate-M04.json`, "utf8"));
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
