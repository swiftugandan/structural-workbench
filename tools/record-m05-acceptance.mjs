#!/usr/bin/env node
/**
 * Record M05 parent acceptance criteria against the current build.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { record, evidenceDir } from "./evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M05/full";
process.env.WORKBENCH_TASK_ID ||= "M05-parent";
process.env.WORKBENCH_MILESTONE ||= "M05";

const dir = evidenceDir("evidence/M05/full");
await mkdir(dir, { recursive: true });
const build = JSON.parse(await readFile("dist/build.json", "utf8"));

const criteria = [
  {
    id: "M05-SECTION-CALCULATOR",
    title: "Rectangular section properties with optional custom J",
    required: ["section-props.json", "compute-section.json", "m05-browser.json"],
    observation:
      "Kernel computes A/Iy/Iz/J/cy/cz for solid rectangles; custom J overrides Saint-Venant; UI fills section form and stiffness change clears stale results.",
  },
  {
    id: "M05-VARIANTS",
    title: "Duplicate as variant and compare independent solves",
    required: ["variants-unit.json", "m05-browser.json"],
    observation:
      "Duplicate captures a baseline; restiffened clone compares tip uz and model hashes from two actual solves; both reports download.",
  },
  {
    id: "M05-PORTAL-TEMPLATES",
    title: "Parametric portal template save and reuse",
    required: ["m05-browser.json"],
    observation:
      "Portal dimensions save to IndexedDB and refill the create-portal form for a new project.",
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

await record("m05-acceptance", {
  status: issues.length ? "FAIL" : "PASS",
  testCount: criteria.length,
  testIds: criteria.map((c) => c.id),
  command: ["node", "tools/record-m05-acceptance.mjs"],
  issues,
  criteria: rows,
  limitations:
    "Parent M05 packages section calculator, variants and portal templates; catalogue axis mapping continues via existing guided-input templates. Does not claim M06 stress screening or commercial report parity.",
});

const md = `# M05 acceptance record

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

- Parent M05 packages section calculator, variants and portal templates.
- Catalogue templates remain the existing guided-input Blue Book / Orange Book presets.
- Full 100-cycle memory soak and M06 release gates remain later milestones.
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
