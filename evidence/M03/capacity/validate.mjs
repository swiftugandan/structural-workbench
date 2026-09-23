import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { frame } from "../../../tests/helpers/frame.js";
import { record } from "../../../tools/evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M03/capacity";
process.env.WORKBENCH_TASK_ID ||= "M03-D";
process.env.WORKBENCH_MILESTONE ||= "M03";

const dir = "evidence/M03/capacity";
const scratch = join(tmpdir(), "workbench-m03-capacity");
await mkdir(dir, { recursive: true });
await mkdir(scratch, { recursive: true });
const base = JSON.parse(await readFile("fixtures/models/B02.json", "utf8"));

const seed = 1;
const model = frame(base, 10000, {
  seed,
  id: "M03multibay",
  name: "M03 5k-node multibay representative frame",
});
model.analysisSettings = {
  ...base.analysisSettings,
  timeoutMs: 30000,
  memoryLimitMiB: 512,
};
const modelPath = join(scratch, "multibay-5k.json");
await writeFile(modelPath, JSON.stringify(model));

const activeDofs =
  model.nodes.length * 6 -
  model.supports.reduce((n, s) => n + s.fixed.filter(Boolean).length, 0);

const runs = [];
for (let i = 0; i < 6; i++) {
  const t0 = Date.now();
  const out = JSON.parse(
    execFileSync("target/release/workbench-cli", [modelPath], {
      encoding: "utf8",
      maxBuffer: 200e6,
      timeout: 60000,
    }),
  );
  const ms = Date.now() - t0;
  if (i) runs.push({ ms, checks: out.numericalChecks });
}
const measured = runs.map((r) => r.ms);
const median = [...measured].sort((a, b) => a - b)[
  Math.floor(measured.length / 2)
];
assert.ok(
  median <= 5000,
  `median assemble+factor+RHS ${median}ms exceeds 5s gate`,
);

const adversarial = frame(base, 10000, {
  seed,
  id: "M03highFill",
  name: "Adversarial multibay under tight memory budget",
});
adversarial.analysisSettings = {
  ...base.analysisSettings,
  timeoutMs: 30000,
  memoryLimitMiB: 64,
};
const adversarialPath = join(scratch, "high-fill.json");
await writeFile(adversarialPath, JSON.stringify(adversarial));
let refused = false;
try {
  execFileSync("target/release/workbench-cli", [adversarialPath], {
    encoding: "utf8",
    maxBuffer: 50e6,
  });
} catch (e) {
  const text = `${e.stdout || ""}${e.stderr || ""}${e.message || ""}`;
  refused = /MEMORY_LIMIT/.test(text);
  assert.ok(refused, text.slice(0, 500));
}
assert.ok(refused, "tight-budget multibay must refuse with MEMORY_LIMIT");

const summary = {
  seed,
  grid: "20x25x10",
  nodes: model.nodes.length,
  members: model.members.length,
  supports: model.supports.length,
  activeDofs,
  matrixNnz: runs.at(-1).checks.matrixNnz,
  factorNnzEstimate: runs.at(-1).checks.factorNnzEstimate,
  solveMs: measured,
  medianSolveMs: median,
  gateMs: 5000,
  memoryLimitMiB: 512,
  highFill: {
    description:
      "Same 5k-node multibay with memoryLimitMiB=64 forces the sparse fill guard",
    nodes: adversarial.nodes.length,
    members: adversarial.members.length,
    memoryLimitMiB: adversarial.analysisSettings.memoryLimitMiB,
    refused: true,
    code: "MEMORY_LIMIT",
  },
};
await writeFile(`${dir}/capacity-results.json`, JSON.stringify(summary, null, 2));
await record("m03-capacity", {
  status: "PASS",
  testCount: measured.length + 1,
  summary,
  command: ["node", `${dir}/validate.mjs`],
  artifacts: ["validate.mjs", "capacity-results.json", "README.md"],
});
console.log(JSON.stringify(summary, null, 2));
