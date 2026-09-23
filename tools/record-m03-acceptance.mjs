#!/usr/bin/env node
/**
 * Record M03 parent acceptance criteria against the current build.
 * Fail closed: every criterion must cite sibling evidence that PASS on this build.
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
    title: "Spatial orbit and bay copy with spatial loads",
    required: ["m03-browser.json"],
    requireTestIds: [
      "M03 copy portal into bays, analyse and inspect My Mz torsion",
      "3D exposes Y direction and reference grid; orbit updates compass without model changes",
    ],
    observation:
      "CopyBay plus spatial roof loads produce non-trivial My/Mz/T; orbit compass updates without model hash change.",
  },
  {
    id: "M03-DUAL-WORKERS",
    title: "Separate model/analysis Workers and cancel",
    required: ["m03-browser.json", "cancel-timing.json"],
    requireTestIds: [
      "M03 dual Workers: cancel leaves model intact; superseded solve stays stale",
    ],
    observation:
      "Cancel restores the model within timing gates; a superseded solve never becomes Current after edits.",
  },
  {
    id: "M03-ORACLE",
    title: "Skewed/asymmetric OpenSees pack + native R01/B09",
    required: ["m03-oracle.json"],
    observation:
      "S01/S02/B07 match OpenSees; R01/B09 are native analytical cross-checks (ADR 0006).",
  },
  {
    id: "M03-CAPACITY",
    title: "5,000-node multibay solve and memory guard",
    required: ["m03-capacity.json", "m03-wasm-memory.json"],
    observation:
      "Connected 5k-node frame solves under the median gate; WASM refuses over-budget models with MEMORY_LIMIT.",
  },
  {
    id: "M03-UNIT-ACTION",
    title: "All-axis unit-action tests",
    required: ["native.json"],
    requireNative: ["m03_all_axis_unit_nodal_actions"],
    observation:
      "Tip unit loads recover tip end actions with root lever balance and section@0 = −q_i.",
  },
  {
    id: "M03-ROLL",
    title: "Member reversal and roll",
    required: ["native.json", "m03-browser.json"],
    requireNative: [
      "m01_global_rotation_relabelling_reordering_and_endpoint_reversal",
      "m03_local_y_roll_swaps_bending_axes",
    ],
    observation:
      "Endpoint reversal and localY roll swap My/Mz with tip uz scaling by Iy/Iz.",
  },
  {
    id: "M03-SECTION-AXIS",
    title: "Section-axis editing",
    required: ["m03-browser.json"],
    requireTestIds: [
      "M03 section-axis: edit localY roll swaps My/Mz end actions",
    ],
    observation:
      "Property-form localY edit re-analyses with swapped end moments in the forces table.",
  },
  {
    id: "M03-HIERARCHY",
    title: "Physical-to-analytical mapping UI",
    required: ["m03-browser.json"],
    requireTestIds: [
      "M03 hierarchy: split shows physical parent and analytical children",
    ],
    observation:
      "Split children group under physical parent in the model tree with inspector lineage.",
  },
  {
    id: "M03-GPU-DURING-ANALYSIS",
    title: "GPU loss during analysis preserves model",
    required: ["gpu-during-analysis.json"],
    observation:
      "Recreating the viewport while analysis is blocked keeps the model hash and entity counts.",
  },
  {
    id: "M03-UI-RESPONSIVENESS",
    title: "Analyse does not block UI >100 ms",
    required: ["ui-responsiveness.json"],
    observation:
      "Event-loop gaps stay ≤100 ms after Analyse while the Worker is busy.",
  },
];

const issues = [];
const evaluated = [];
for (const c of criteria) {
  const notes = [];
  let ok = true;
  for (const file of c.required) {
    let e;
    try {
      e = JSON.parse(await readFile(`${dir}/${file}`, "utf8"));
    } catch (error) {
      ok = false;
      notes.push(`missing ${file} (${error.code || error.message})`);
      continue;
    }
    if (e.status !== "PASS") {
      ok = false;
      notes.push(`${file} status ${e.status || "missing"}`);
    }
    if (e.sourceHash !== build.sourceHash || e.buildHash !== build.buildHash) {
      ok = false;
      notes.push(`${file} stale vs dist/build.json`);
    }
    if (c.requireTestIds && file === "m03-browser.json") {
      for (const id of c.requireTestIds) {
        if (!e.testIds?.includes(id) && e.test !== id)
          notes.push(`${file} missing test id ${id}`), (ok = false);
      }
    }
    if (c.requireNative && file === "native.json") {
      for (const id of c.requireNative) {
        if (!e.testIds?.includes(id))
          notes.push(`native missing ${id}`), (ok = false);
      }
    }
  }
  evaluated.push({
    ...c,
    status: ok ? "PASS" : "FAIL",
    notes,
  });
  if (!ok) issues.push(`${c.id}: ${notes.join("; ")}`);
}

const status = issues.length ? "FAIL" : "PASS";
const checklist = `# M03 acceptance record

Source hash: \`${build.sourceHash}\`
Build hash: \`${build.buildHash}\`
Observed: ${new Date().toISOString()}
Status: **${status}**

| ID | Title | Status | Observation |
| --- | --- | --- | --- |
${evaluated
  .map(
    (c) =>
      `| ${c.id} | ${c.title} | ${c.status} | ${c.observation.replace(/\|/g, "/")}${c.notes?.length ? ` · ${c.notes.join("; ").replace(/\|/g, "/")}` : ""} |`,
  )
  .join("\n")}

## Limitations

- OpenSees numerical parity is claimed only for S01/S02/B07 (ADR 0006). R01/B09 use native analytical cross-checks.
- 5k-node median solve evidence remains native CLI; WASM evidence covers MEMORY_LIMIT refusal, not the full 5k factorisation in-browser.
- Commercial PROKON parity is not claimed.
`;

await writeFile(`${dir}/ACCEPTANCE.md`, checklist);

await record("m03-acceptance", {
  status,
  testCount: evaluated.filter((c) => c.status === "PASS").length,
  testIds: evaluated.map((c) => c.id),
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
  criteria: evaluated,
  issues,
  limitations:
    "Fail-closed parent recorder; OpenSees scope per ADR 0006; WASM memory smoke separate from 5k CLI capacity.",
});

console.log(JSON.stringify({ status, issues, testIds: evaluated.map((c) => c.id) }, null, 2));
if (issues.length) process.exitCode = 1;
