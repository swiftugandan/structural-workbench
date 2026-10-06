#!/usr/bin/env node
/**
 * M16 sub-slice gate (M16-RULES): EN 1992-1-1 Section 8 detailing rules —
 * mandrel diameters (Table 8.1N), link extensions (Figure 8.5), anchorage
 * (8.4) and lap lengths (8.7.3, Table 8.3) — reproduce the JRC89037 4.1
 * tables (8 + 8 + 84 + 224 published values) on the current build. This is a
 * numerical sub-slice; the M16 parent (persistent bars, clashes, revision
 * propagation, drawings) is not accepted by it.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceDir, record } from "./evidence.mjs";
import { buildRecord, cargoRecord } from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M16/rules";
process.env.WORKBENCH_TASK_ID = "M16-RULES";
process.env.WORKBENCH_MILESTONE = "M16";

const dir = evidenceDir("evidence/M16/rules");
await mkdir(dir, { recursive: true });
const build = await buildRecord();
await cargoRecord(dir, "detailing-rules", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-design",
  "detailing_tests",
]);
const required = [
  "profile::ec2uk::detailing_tests::anchorage_lengths_reproduce_jrc_tables_4_1_2_to_4_1_4",
  "profile::ec2uk::detailing_tests::lap_lengths_reproduce_jrc_tables_4_1_6_to_4_1_9",
  "profile::ec2uk::detailing_tests::mandrels_and_link_extensions_reproduce_jrc_tables_4_1_1_and_4_1_5",
];
const { readFile } = await import("node:fs/promises");
const log = await readFile(`${dir}/detailing-rules.log`, "utf8");
const missing = required.filter((t) => !log.includes(`test ${t} ... ok`));
await record("m16-rules-acceptance", {
  status: missing.length ? "FAIL" : "PASS",
  testCount: required.length,
  testIds: required,
  command: ["node", "tools/run-m16-rules.mjs"],
  issues: missing.map((t) => `missing PASS: ${t}`),
  limitations:
    "EC2 Section 8 rules only (ec2-uk-na demonstration): straight-bar anchorage and laps with α1 = α3 = α5 = 1; where to lap and curtail is the engineer's. Persistent bar sets, clashes, revision propagation and drawings (the M16 parent) are not part of this sub-slice.",
});
await writeFile(
  `${dir}/ACCEPTANCE.md`,
  `# M16-RULES\n\nSource hash: \`${build.sourceHash}\`\nBuild hash: \`${build.buildHash}\`\nStatus: **${missing.length ? "FAIL" : "PASS"}**\n\n- JRC89037 Table 4.1.1 mandrels (8), Table 4.1.5 link extensions (8), Tables 4.1.2–4.1.4 anchorage (84) and Tables 4.1.6–4.1.9 laps (224) reproduced within 1 mm.\n`,
);
console.log(
  JSON.stringify(
    { status: missing.length ? "FAIL" : "PASS", missing },
    null,
    2,
  ),
);
if (missing.length) process.exitCode = 1;
