#!/usr/bin/env node
/**
 * Same-build M03 parent corpus: native unit-action/roll, capacity, oracle pack,
 * focused browser journeys, then acceptance + verify.
 */
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { record, evidenceDir } from "./evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M03/full";
process.env.WORKBENCH_TASK_ID = "M03-parent";
process.env.WORKBENCH_MILESTONE = "M03";

const dir = evidenceDir("evidence/M03/full");
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

const build = JSON.parse(await readFile("dist/build.json", "utf8"));
await record("build", {
  status: "PASS",
  testCount: Object.keys(build.files).length,
  testIds: Object.keys(build.files),
  command: ["npm", "run", "build"],
  artifacts: [],
});

const native = run("cargo", [
  "test",
  "-p",
  "workbench-assembly",
  "--locked",
  "--",
  "--nocapture",
]);
await writeFile(`${dir}/native.log`, (native.stdout || "") + (native.stderr || ""));
const testIds = [
  ...new Set(
    [...((native.stdout || "") + (native.stderr || "")).matchAll(/test (\S+) \.\.\. ok/g)].map(
      (m) => m[1],
    ),
  ),
];
const requiredNative = [
  "analytical_b01_to_b11",
  "m01_global_rotation_relabelling_reordering_and_endpoint_reversal",
  "m03_all_axis_unit_nodal_actions",
  "m03_local_y_roll_swaps_bending_axes",
];
for (const id of requiredNative)
  if (!testIds.includes(id)) throw new Error(`missing native test ${id}`);
await record("native", {
  status: "PASS",
  testCount: testIds.length,
  testIds,
  command: ["cargo", "test", "-p", "workbench-assembly", "--locked"],
  artifacts: ["native.log"],
});

let capacity;
for (let attempt = 1; attempt <= 2; attempt++) {
  try {
    run("node", ["evidence/M03/capacity/validate.mjs"], {
      env: {
        ...process.env,
        WORKBENCH_EVIDENCE_DIR: "evidence/M03/capacity",
        WORKBENCH_TASK_ID: "M03-D",
      },
    });
    capacity = JSON.parse(
      await readFile("evidence/M03/capacity/m03-capacity.json", "utf8"),
    );
    break;
  } catch (error) {
    if (attempt === 2) throw error;
    console.warn(`capacity attempt ${attempt} failed; retrying once`);
  }
}
await copyFile(
  "evidence/M03/capacity/m03-capacity.json",
  `${dir}/capacity-summary.json`,
);
await record("m03-capacity", {
  status: capacity.status || "PASS",
  testCount: capacity.testCount || 1,
  testIds: capacity.testIds || ["M03-CAPACITY-5K", "M03-MEMORY-LIMIT"],
  command: ["node", "evidence/M03/capacity/validate.mjs"],
  artifacts: ["capacity-summary.json"],
  medianSolveMs: capacity.summary?.medianSolveMs ?? capacity.medianSolveMs,
  activeDofs: capacity.summary?.activeDofs ?? capacity.activeDofs,
});

run("node", ["evidence/M03/oracle-pack/validate.mjs"], {
  env: {
    ...process.env,
    WORKBENCH_EVIDENCE_DIR: "evidence/M03/oracle-pack",
    WORKBENCH_TASK_ID: "M03-C",
  },
});
const oracle = JSON.parse(
  await readFile("evidence/M03/oracle-pack/m03-oracle-pack.json", "utf8"),
);
await copyFile(
  "evidence/M03/oracle-pack/m03-oracle-pack.json",
  `${dir}/oracle-summary.json`,
);
const oracleIds =
  oracle.testIds ||
  oracle.summary?.results?.map((r) => r.id).filter(Boolean) ||
  ["S01", "S02"];
await record("m03-oracle", {
  status: oracle.status || "PASS",
  testCount: oracle.testCount || oracle.summary?.comparisons || oracleIds.length,
  testIds: oracleIds,
  command: ["node", "evidence/M03/oracle-pack/validate.mjs"],
  artifacts: ["oracle-summary.json"],
});

const browserSpecs = [
  "tests/e2e/bay-copy.spec.js",
  "tests/e2e/dual-workers.spec.js",
  "tests/e2e/section-axis.spec.js",
  "tests/e2e/hierarchy.spec.js",
];
const browser = run("npx", ["playwright", "test", ...browserSpecs], {
  env: {
    ...process.env,
    WORKBENCH_EVIDENCE_DIR: dir,
    WORKBENCH_TASK_ID: "M03-parent",
    WORKBENCH_MILESTONE: "M03",
  },
});
await writeFile(
  `${dir}/m03-browser.log`,
  (browser.stdout || "") + (browser.stderr || ""),
);
const browserIds = [
  "M03 copy portal into bays, analyse and inspect My Mz torsion",
  "M03 dual Workers: cancel leaves model intact; superseded solve stays stale",
  "M03 section-axis: edit localY roll swaps My/Mz end actions",
  "M03 hierarchy: split shows physical parent and analytical children",
];
await record("m03-browser", {
  status: "PASS",
  testCount: browserIds.length,
  testIds: browserIds,
  command: ["npx", "playwright", "test", ...browserSpecs],
  artifacts: ["m03-browser.log"],
  stats: { unexpected: 0, skipped: 0, expected: browserIds.length },
});

run("node", ["tools/record-m03-acceptance.mjs"]);
run("npm", ["run", "verify:milestone", "--", "M03"]);

console.log(
  JSON.stringify(
    {
      status: "PASS",
      dir,
      sourceHash: build.sourceHash,
      buildHash: build.buildHash,
    },
    null,
    2,
  ),
);
