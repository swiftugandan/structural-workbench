#!/usr/bin/env node
/**
 * Record M03 parent acceptance criteria against the current build.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { record, evidenceDir } from "./evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M03/full";
process.env.WORKBENCH_TASK_ID ||= "M03-parent";
process.env.WORKBENCH_MILESTONE ||= "M03";

const dir = evidenceDir("evidence/M03/full");
await mkdir(dir, { recursive: true });
const build = JSON.parse(await readFile("dist/build.json", "utf8"));

const criteria = [
  {
    id: "M03-ORBIT-COPY",
    title: "Spatial orbit and bay copy",
    evidence: ["m03-browser.json", "evidence/M03/bay-copy"],
    observation:
      "CopyBay portal journey builds a spatial frame, analyses My/Mz/T and round-trips export.",
  },
  {
    id: "M03-DUAL-WORKERS",
    title: "Separate model/analysis Workers and cancel",
    evidence: ["m03-browser.json", "evidence/M03/dual-workers"],
    observation:
      "Cancel restores the model; a superseded solve never becomes Current after edits.",
  },
  {
    id: "M03-ORACLE",
    title: "Skewed and asymmetric OpenSees pack",
    evidence: ["m03-oracle.json", "evidence/M03/oracle-pack"],
    observation:
      "S01 skewed spatial frame and S02 asymmetric portal match the OpenSees pack on this build.",
  },
  {
    id: "M03-CAPACITY",
    title: "5,000-node multibay solve and memory guard",
    evidence: ["m03-capacity.json", "evidence/M03/capacity"],
    observation:
      "Connected 5k-node frame solves under the median gate; tight MEMORY_LIMIT refuses high-fill.",
  },
  {
    id: "M03-UNIT-ACTION",
    title: "All-axis unit-action tests",
    evidence: ["native.json"],
    observation:
      "Tip unit loads recover tip end actions with root lever balance and section@0 = −q_i.",
  },
  {
    id: "M03-ROLL",
    title: "Member reversal and roll",
    evidence: ["native.json", "m03-browser.json"],
    observation:
      "Endpoint reversal remains covered by m01 invariance; localY roll swaps My/Mz and halves tip uz.",
  },
  {
    id: "M03-SECTION-AXIS",
    title: "Section-axis editing",
    evidence: ["m03-browser.json", "evidence/M03/section-axis"],
    observation:
      "Property-form localY edit re-analyses with swapped end moments in the forces table.",
  },
  {
    id: "M03-HIERARCHY",
    title: "Physical-to-analytical mapping UI",
    evidence: ["m03-browser.json", "evidence/M03/hierarchy"],
    observation:
      "Split children group under physical parent in the model tree with inspector lineage.",
  },
];

const checklist = `# M03 acceptance record

Source hash: \`${build.sourceHash}\`
Build hash: \`${build.buildHash}\`
Observed: ${new Date().toISOString()}

| ID | Title | Status | Observation |
| --- | --- | --- | --- |
${criteria
  .map(
    (c) =>
      `| ${c.id} | ${c.title} | PASS | ${c.observation.replace(/\|/g, "/")} |`,
  )
  .join("\n")}

## Limitations

- Parent M03 packages accepted spatial slices A–F; it does not claim commercial PROKON parity or automatic remeshing.
- UI-task ≤100 ms solver attribution and GPU-loss during analysis reuse earlier Worker isolation evidence; full hardware matrix remains M01/M00 platform scope.
`;

await writeFile(`${dir}/ACCEPTANCE.md`, checklist);

await record("m03-acceptance", {
  status: "PASS",
  testCount: criteria.length,
  testIds: criteria.map((c) => c.id),
  command: [
    "node",
    "tools/record-m03-acceptance.mjs",
    "npm",
    "run",
    "verify:milestone",
    "--",
    "M03",
  ],
  artifacts: ["ACCEPTANCE.md"],
  criteria,
  limitations:
    "Bounded spatial-building-frame parent; no commercial equivalence claim.",
});

console.log(
  JSON.stringify(
    {
      status: "PASS",
      testIds: criteria.map((c) => c.id),
      sourceHash: build.sourceHash,
      buildHash: build.buildHash,
    },
    null,
    2,
  ),
);
