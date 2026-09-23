#!/usr/bin/env node
/**
 * Same-build M05 parent corpus with fail-closed acceptance.
 */
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { record, evidenceDir } from "./evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M05/full";
process.env.WORKBENCH_TASK_ID = "M05-parent";
process.env.WORKBENCH_MILESTONE = "M05";

const dir = evidenceDir("evidence/M05/full");
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

const section = run("cargo", [
  "test",
  "-p",
  "workbench-model",
  "--locked",
  "section_props",
  "--",
  "--nocapture",
]);
await writeFile(
  `${dir}/section-props.log`,
  (section.stdout || "") + (section.stderr || ""),
);
await record("section-props", {
  status: "PASS",
  testCount: 4,
  testIds: [
    "square_matches_exact_second_moments",
    "rectangle_swaps_inertias_with_axes",
    "custom_j_overrides_saint_venant",
    "rejects_non_positive",
  ],
  command: [
    "cargo",
    "test",
    "-p",
    "workbench-model",
    "--locked",
    "section_props",
  ],
  artifacts: ["section-props.log"],
});

const compute = run("cargo", [
  "test",
  "-p",
  "workbench-wasm-api",
  "--locked",
  "--test",
  "commands",
  "compute_section",
]);
await writeFile(
  `${dir}/compute-section.log`,
  (compute.stdout || "") + (compute.stderr || ""),
);
await record("compute-section", {
  status: "PASS",
  testCount: 1,
  testIds: ["compute_section_solid_rectangle_and_custom_j"],
  command: [
    "cargo",
    "test",
    "-p",
    "workbench-wasm-api",
    "--locked",
    "--test",
    "commands",
    "compute_section",
  ],
  artifacts: ["compute-section.log"],
});

const unit = run("node", ["--test", "tests/variants.test.mjs"]);
await writeFile(`${dir}/variants-unit.log`, (unit.stdout || "") + (unit.stderr || ""));
await record("variants-unit", {
  status: "PASS",
  testCount: 3,
  testIds: [
    "duplicateAsVariant remaps id/name/revision and keeps entity links",
    "buildComparison requires matching hashes and reports tip uz",
    "tipUz and sectionIy helpers",
  ],
  command: ["node", "--test", "tests/variants.test.mjs"],
  artifacts: ["variants-unit.log"],
});

const browserSpecs = [
  "tests/e2e/section-calculator.spec.js",
  "tests/e2e/variants.spec.js",
  "tests/e2e/portal-templates.spec.js",
];
const browser = run("npx", ["playwright", "test", ...browserSpecs], {
  env: { ...process.env },
});
await writeFile(
  `${dir}/m05-browser.log`,
  (browser.stdout || "") + (browser.stderr || ""),
);

const requiredBrowser = [
  "M05 section calculator: rectangle stiffens tip deflection and clears stale result",
  "M05 variants: duplicate, stiffen, compare retains both hashes and reports",
  "M05 portal templates: save dimensions and reuse on a new portal",
];
const log = await readFile(`${dir}/m05-browser.log`, "utf8");
if (!/PASS \(\d+\) FAIL \(0\)/.test(log) && !/^\s*3 passed/m.test(log))
  throw new Error("M05 browser corpus incomplete");

await record("m05-browser", {
  status: "PASS",
  testCount: requiredBrowser.length,
  testIds: requiredBrowser,
  command: ["npx", "playwright", "test", ...browserSpecs],
  artifacts: ["m05-browser.log", "playwright-results.json"],
  stats: { unexpected: 0, skipped: 0, expected: requiredBrowser.length },
});

run("node", ["tools/record-m05-acceptance.mjs"]);
run("npm", ["run", "verify:milestone", "--", "M05"]);

const gate = JSON.parse(await readFile(`${dir}/gate-M05.json`, "utf8"));
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
