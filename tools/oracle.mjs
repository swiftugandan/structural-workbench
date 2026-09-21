import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { record } from "./evidence.mjs";
await mkdir("fixtures/oracle", { recursive: true });
const base = JSON.parse(await readFile("fixtures/models/B02.json"));
const cases = [];
for (let i = 0; i < 20; i++) {
  const p = structuredClone(base);
  p.id = `O${String(i + 1).padStart(2, "0")}`;
  p.name = `Independent spatial frame ${i + 1}`;
  p.nodes = [
    { id: "n1", position: [0, 0, 0] },
    { id: "n2", position: [0, 0, 3] },
    { id: "n3", position: [4, 0, 3] },
    { id: "n4", position: [4, 0, 0] },
  ];
  if (i > 0) {
    p.nodes[1].position[1] = i * 0.025;
    p.nodes[2].position[1] = 0.3 + i * 0.04;
    p.nodes[2].position[0] += i * 0.03;
  }
  p.members = [
    ["m1", "n1", "n2"],
    ["m2", "n2", "n3"],
    ["m3", "n4", "n3"],
  ].map(([id, start, end]) => ({ ...p.members[0], id, start, end }));
  p.supports.push({ ...p.supports[0], id: "s2", node: "n4" });
  p.loads = [
    {
      id: "l1",
      case: "LC1",
      type: "nodal",
      node: "n2",
      values: [12000 + i * 321, i * 123, -i * 700, 0, 0, i * 23],
    },
  ];
  if (i >= 5)
    p.loads.push({
      id: "l2",
      case: "LC1",
      type: "uniform",
      member: "m2",
      axes: i % 2 ? "global" : "local",
      forcePerLength: [i * 7, -i * 11, -1000 - i * 100],
    });
  p.sections[0].Iy *= 1 + i * 0.07;
  p.sections[0].Iz *= 1 + i * 0.03;
  const file = `fixtures/oracle/${p.id}.json`;
  await writeFile(file, JSON.stringify(p, null, 2));
  cases.push({ p, file });
}
let count = 0;
const results = [];
try {
  for (const { p, file } of cases) {
    const oracle = JSON.parse(
      execFileSync("tools/oracle-env/bin/python", ["tools/oracle.py", file], {
        encoding: "utf8",
      }),
    );
    const actual = JSON.parse(
      execFileSync("target/release/workbench-cli", [file], {
        encoding: "utf8",
      }),
    );
    for (const [ids, values, reference] of [
      [actual.nodeIds, actual.nodeDisplacements, oracle.nodes],
      [actual.reactionSupportIds, actual.reactions, oracle.reactions],
    ])
      for (let i = 0; i < ids.length; i++)
        for (let j = 0; j < 6; j++) {
          const expected = reference[ids[i]][j];
          const atol =
            reference === oracle.nodes ? (j < 3 ? 1e-9 : 1e-10) : 1e-3;
          assert.ok(
            Math.abs(values[i * 6 + j] - expected) <=
              atol + 1e-4 * Math.abs(expected),
            `${p.id}/${ids[i]}/${j}`,
          );
          count++;
        }
    for (const m of actual.members)
      for (let j = 0; j < 12; j++) {
        const expected = oracle.endActions[m.id][j];
        assert.ok(
          Math.abs(m.endActions[j] - expected) <=
            1e-3 + 1e-4 * Math.abs(expected),
          `${p.id}/${m.id}/${j}`,
        );
        count++;
      }
    results.push({ id: p.id, oracle, actual });
    console.log(p.id + " PASS");
  }
  await record("oracle", {
    status: "PASS",
    testCount: count,
    testIds: cases.map((x) => x.p.id),
    command: ["npm", "run", "test:oracle"],
    results,
  });
} catch (e) {
  await record("oracle", {
    status: "FAIL",
    testCount: count,
    command: ["npm", "run", "test:oracle"],
    error: e.message,
  });
  throw e;
}
