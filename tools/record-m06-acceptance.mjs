#!/usr/bin/env node
/**
 * Record M06 parent acceptance criteria against the current build.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { record, evidenceDir } from "./evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M06/full";
process.env.WORKBENCH_TASK_ID ||= "M06-parent";
process.env.WORKBENCH_MILESTONE ||= "M06";

const dir = evidenceDir("evidence/M06/full");
await mkdir(dir, { recursive: true });
const build = JSON.parse(await readFile("dist/build.json", "utf8"));

const criteria = [
  {
    id: "M06-STRESS-SCREEN",
    title: "Elastic fibre stress screen with non-code disclaimer",
    required: ["b12-native.json", "m06-browser.json"],
    observation:
      "B12 corner extrema match VALUATION range; UI stress tab shows mechanics-v1 disclaimer and numerical values after analyse.",
  },
  {
    id: "M06-CAPABILITY-LEDGER",
    title: "Capability ledger with UNKNOWN commercial parity",
    required: ["capability-ledger-unit.json", "m06-browser.json"],
    observation:
      "capabilities.json and UI/import/report disclosures list SPEC exclusions and keep comparisonStatus UNKNOWN.",
  },
  {
    id: "M06-RELEASE-TOUR",
    title: "End-to-end analysis MVP release tour",
    required: ["m06-browser.json", "m06-release-tour.json"],
    observation:
      "Import, analyse, stress screen, View capabilities, local save, project download and calculation report with excluded capabilities.",
  },
];

const issues = [];
const rows = [];
for (const c of criteria) {
  const missing = [];
  for (const file of c.required) {
    try {
      const e = JSON.parse(await readFile(`${dir}/${file}`, "utf8"));
      if (e.status !== "PASS") missing.push(`${file} status ${e.status}`);
      if (e.sourceHash !== build.sourceHash || e.buildHash !== build.buildHash)
        missing.push(`${file} stale hash`);
    } catch {
      missing.push(`${file} missing`);
    }
  }
  const status = missing.length ? "FAIL" : "PASS";
  if (status === "FAIL") issues.push(`${c.id}: ${missing.join("; ")}`);
  rows.push({ ...c, status, missing });
}

await record("m06-acceptance", {
  status: issues.length ? "FAIL" : "PASS",
  testCount: criteria.length,
  testIds: criteria.map((c) => c.id),
  command: ["node", "tools/record-m06-acceptance.mjs"],
  issues,
  criteria: rows,
  limitations:
    "Parent M06 packages stress screen, capability ledger and release tour on the same build. Commercial numerical parity remains UNKNOWN. Design-code packages stay excluded.",
});

const md = `# M06 acceptance record

Source hash: \`${build.sourceHash}\`
Build hash: \`${build.buildHash}\`
Observed: ${new Date().toISOString()}
Status: **${issues.length ? "FAIL" : "PASS"}**

| ID | Title | Status | Observation |
| --- | --- | --- | --- |
${rows
  .map(
    (r) =>
      `| ${r.id} | ${r.title} | ${r.status} | ${r.observation} |`,
  )
  .join("\n")}

## Limitations

- Commercial numerical parity is UNKNOWN.
- Steel/concrete code packages remain excluded pending standards/benchmarks.
- Optional Windows/Linux real-GPU matrix remains later laboratory work (ADR 0005 lab Metal already accepted for analysis MVP platform lane).
`;

await writeFile(`${dir}/ACCEPTANCE.md`, md);
if (issues.length) {
  console.error(JSON.stringify({ status: "FAIL", issues }, null, 2));
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      { status: "PASS", issues: [], testIds: criteria.map((c) => c.id) },
      null,
      2,
    ),
  );
}
