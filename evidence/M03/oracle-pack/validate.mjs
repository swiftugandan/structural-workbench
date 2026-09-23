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
    nativeCrosscheck: true,
    note: "OpenSees adapter excludes end releases (ADR 0006); native CLI cross-check vs analytical expectations",
  },
  {
    id: "B09",
    file: "fixtures/models/B09.json",
    role: "prescribed-support-motion",
    oracle: false,
    nativeCrosscheck: true,
    note: "OpenSees adapter excludes prescribed motion (ADR 0006); native CLI cross-check vs analytical expectations",
  },
];

const corpus = JSON.parse(await readFile("fixtures/benchmarks.json", "utf8"));
const results = [];
let comparisons = 0;

function nativeBenchmarkChecks(id, actual) {
  if (id === "R01") {
    const m = actual.members.find((x) => x.id === "m1");
    assert.ok(m, "R01 member m1");
    const my0 = m.keyStations.find((s) => s.station === 0).actions[4];
    const my1 = m.keyStations.find((s) => Math.abs(s.station - 1) < 1e-15)
      .actions[4];
    assert.ok(Math.abs(my0) < 1e-3, `R01 My@0 ${my0}`);
    assert.ok(Math.abs(my1) < 1e-3, `R01 My@1 ${my1}`);
    const mid = m.keyStations.find((s) => s.kind === "extremum");
    assert.ok(mid, "R01 midspan My station");
    assert.ok(
      Math.abs(Math.abs(mid.actions[4]) - 45000) < 1e-2,
      `R01 mid My ${mid.actions[4]}`,
    );
    return 3;
  }
  const b = corpus.benchmarks.find((x) => x.id === id && x.kind === "analysis");
  assert.ok(b, `missing analytical benchmark ${id}`);
  let n = 0;
  for (const c of b.checks) {
    const parts = c.selector.split(".");
    let value;
    if (parts[0] === "node") {
      const i = actual.nodeIds.indexOf(parts[1]);
      const j = ["ux", "uy", "uz", "rx", "ry", "rz"].indexOf(parts[2]);
      value = actual.nodeDisplacements[i * 6 + j];
    } else if (parts[0] === "reaction") {
      const i = actual.reactionSupportIds.indexOf(parts[1]);
      const j = ["fx", "fy", "fz", "mx", "my", "mz"].indexOf(parts[2]);
      value = actual.reactions[i * 6 + j];
    } else if (parts[0] === "member") {
      const m = actual.members.find((x) => x.id === parts[1]);
      const station = Number(
        parts[2].replace("station", "").replace("_", "."),
      );
      const s = m.samples.find((x) => Math.abs(x.station - station) < 1e-12);
      value =
        parts[3] === "uz"
          ? s.displacement[2]
          : s.actions[["n", "vy", "vz", "t", "my", "mz"].indexOf(parts[3])];
      if (parts.at(-1) === "abs") value = Math.abs(value);
    } else throw new Error(`unknown selector ${c.selector}`);
    const atol =
      c.quantity === "translation"
        ? 1e-9
        : c.quantity === "rotation"
          ? 1e-10
          : 1e-3;
    assert.ok(
      Math.abs(value - c.expected) <= atol + 1e-6 * Math.abs(c.expected),
      `${id} ${c.selector}: ${value} vs ${c.expected}`,
    );
    n++;
  }
  return n;
}

for (const item of pack) {
  if (!item.oracle) {
    assert.ok(
      item.nativeCrosscheck,
      `${item.id}: excluded OpenSees cases must declare nativeCrosscheck`,
    );
    const actual = JSON.parse(
      execFileSync("target/release/workbench-cli", [item.file], {
        encoding: "utf8",
      }),
    );
    const n = nativeBenchmarkChecks(item.id, actual);
    comparisons += n;
    results.push({
      id: item.id,
      role: item.role,
      status: "NATIVE_CROSSCHECK",
      comparisons: n,
      note: item.note,
      adr: "docs/adr/0006-opensees-adapter-scope.md",
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

assert.ok(
  results.every((r) => r.status === "PASS" || r.status === "NATIVE_CROSSCHECK"),
  "oracle pack incomplete",
);
assert.ok(
  results.filter((r) => r.status === "PASS").length >= 3,
  "need OpenSees PASS for S01/S02/B07",
);
assert.ok(
  results.some((r) => r.id === "R01" && r.status === "NATIVE_CROSSCHECK"),
  "R01 native cross-check required",
);
assert.ok(
  results.some((r) => r.id === "B09" && r.status === "NATIVE_CROSSCHECK"),
  "B09 native cross-check required",
);

const summary = {
  comparisons,
  results,
  limitations:
    "OpenSees parity claimed only for S01/S02/B07; R01/B09 are native cross-checks per ADR 0006",
};
await writeFile(`${dir}/numerical-results.json`, JSON.stringify(summary, null, 2));
await record("m03-oracle-pack", {
  status: "PASS",
  testCount: comparisons,
  testIds: results.map((r) => r.id),
  summary,
  command: ["node", `${dir}/validate.mjs`],
  artifacts: ["validate.mjs", "numerical-results.json", "README.md"],
});
console.log(JSON.stringify(summary, null, 2));
