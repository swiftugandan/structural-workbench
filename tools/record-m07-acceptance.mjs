#!/usr/bin/env node
/**
 * Record M07 parent acceptance criteria against the current build.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { record, evidenceDir } from "./evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M07/full";
process.env.WORKBENCH_TASK_ID ||= "M07-parent";
process.env.WORKBENCH_MILESTONE ||= "M07";

const dir = evidenceDir("evidence/M07/full");
await mkdir(dir, { recursive: true });
const build = JSON.parse(await readFile("dist/build.json", "utf8"));

const criteria = [
  {
    id: "M07-S2-FIXTURES",
    title: "AISC S2 fixture regressions (D/E/F/G/H)",
    required: ["s2-fixtures-native.json"],
    observation:
      "Published Design Examples digits match clause modules for tension, compression, continuously braced flexure, shear and H1.",
  },
  {
    id: "M07-UI-MATRIX",
    title: "Screen 04 standalone pass/fail complete-member matrix",
    required: ["m07-browser.json", "steel-ui-unit.json"],
    observation:
      "UI seed selector runs ≥3 pass and ≥3 fail complete-member cases through evaluateDesign with overall status.",
  },
  {
    id: "M07-MODEL-REPORT",
    title: "Model-derived demand and calculation-report clause trail",
    required: ["m07-browser.json"],
    observation:
      "Analysis midspan actions overlay a W seed; exported report includes clause trail and intermediates (not envelope maxima).",
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

await record("m07-acceptance", {
  status: issues.length ? "FAIL" : "PASS",
  testCount: criteria.length,
  testIds: criteria.map((c) => c.id),
  command: ["node", "tools/record-m07-acceptance.mjs"],
  issues,
  criteria: rows,
  limitations:
    "M07 packages AISC 360-22 LRFD S2 only. LTB (Lb>0), HSS/torsion/non-prismatic remain unsupported. Commercial PROKON parity remains UNKNOWN.",
});

const md = `# M07 acceptance record

Source hash: \`${build.sourceHash}\`
Build hash: \`${build.buildHash}\`
Observed: ${new Date().toISOString()}
Status: **${issues.length ? "FAIL" : "PASS"}**

| ID | Title | Status | Observation |
| --- | --- | --- | --- |
${rows
  .map(
    (r) =>
      `| ${r.id} | ${r.title} | ${r.status} | ${r.observation}${r.missing?.length ? ` Missing: ${r.missing.join("; ")}` : ""} |`,
  )
  .join("\n")}

Limitations: M07 packages AISC 360-22 LRFD S2 only. LTB (Lb>0), HSS/torsion/non-prismatic remain unsupported. Commercial PROKON parity remains UNKNOWN.
`;
await writeFile(`${dir}/ACCEPTANCE.md`, md);
console.log(md);
if (issues.length) process.exitCode = 1;
