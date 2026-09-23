import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { record } from "../../../tools/evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M03/oracle-pack";
process.env.WORKBENCH_TASK_ID ||= "M03-C";
process.env.WORKBENCH_MILESTONE ||= "M03";

const dir = "evidence/M03/oracle-pack";
await mkdir(dir, { recursive: true });

const pack = [
  {
    id: "S01",
    file: "fixtures/models/S01.json",
    role: "skewed-spatial-frame",
    oracle: true,
  },
  {
    id: "S02",
    file: "fixtures/models/S02.json",
    role: "asymmetric-3d-portal",
    oracle: true,
  },
  {
    id: "B07",
    file: "fixtures/models/B07.json",
    role: "distributed-loading",
    oracle: true,
  },
  {
    id: "R01",
    file: "fixtures/models/R01.json",
    role: "released-beams",
    oracle: false,
    note: "OpenSees adapter excludes end releases; native analytical gate in evidence/M02/releases",
  },
  {
    id: "B09",
    file: "fixtures/models/B09.json",
    role: "prescribed-support-motion",
    oracle: false,
    note: "OpenSees adapter excludes prescribed motion; native gate in evidence/M02/prescribed",
  },
];

const results = [];
let comparisons = 0;
for (const item of pack) {
  if (!item.oracle) {
    results.push({
      id: item.id,
      role: item.role,
      status: "NATIVE_ONLY",
      note: item.note,
    });
    continue;
  }
  const oracle = JSON.parse(
    execFileSync("tools/oracle-env/bin/python", ["tools/oracle.py", item.file], {
      encoding: "utf8",
    }),
  );
  const actual = JSON.parse(
    execFileSync("target/release/workbench-cli", [item.file], {
      encoding: "utf8",
    }),
  );
  let n = 0;
  for (const [ids, values, reference] of [
    [actual.nodeIds, actual.nodeDisplacements, oracle.nodes],
    [actual.reactionSupportIds, actual.reactions, oracle.reactions],
  ])
    for (let i = 0; i < ids.length; i++)
      for (let j = 0; j < 6; j++) {
        const expected = reference[ids[i]][j];
        const atol = reference === oracle.nodes ? (j < 3 ? 1e-9 : 1e-10) : 1e-3;
        assert.ok(
          Math.abs(values[i * 6 + j] - expected) <=
            atol + 1e-4 * Math.abs(expected),
          `${item.id}/${ids[i]}/${j}`,
        );
        n++;
      }
  for (const m of actual.members)
    for (let j = 0; j < 12; j++) {
      const expected = oracle.endActions[m.id][j];
      assert.ok(
        Math.abs(m.endActions[j] - expected) <=
          1e-3 + 1e-4 * Math.abs(expected),
        `${item.id}/${m.id}/${j}`,
      );
      n++;
    }
  comparisons += n;
  results.push({
    id: item.id,
    role: item.role,
    status: "PASS",
    comparisons: n,
    solver: oracle.solver,
    version: oracle.version,
  });
}

const summary = { comparisons, results };
await writeFile(`${dir}/numerical-results.json`, JSON.stringify(summary, null, 2));
await record("m03-oracle-pack", {
  status: "PASS",
  testCount: comparisons,
  summary,
  command: ["node", `${dir}/validate.mjs`],
  artifacts: ["validate.mjs", "numerical-results.json", "README.md"],
});
console.log(JSON.stringify(summary, null, 2));
