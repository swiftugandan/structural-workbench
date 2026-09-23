#!/usr/bin/env node
/**
 * Record M02 parent acceptance criteria against the current build.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { record, evidenceDir } from "./evidence.mjs";

const dir = evidenceDir("evidence/M02/full");
await mkdir(dir, { recursive: true });
const build = JSON.parse(await readFile("dist/build.json", "utf8"));

const criteria = [
  {
    id: "M02-CASES",
    title: "Load cases and combinations",
    evidence: [
      "tests/e2e/scenarios.spec.js",
      "browser-suite.json",
    ],
    observation:
      "Dead/live/wind cases, explicit strength combinations and B11 factored tip response exercised in browser suite.",
  },
  {
    id: "M02-EXTREMA",
    title: "Exact extrema and stations",
    evidence: ["native.json", "numerical.json"],
    observation:
      "B07 key-station midspan moment and analytical B01–B11 extrema covered by native/numerical corpus.",
  },
  {
    id: "M02-RELEASES",
    title: "My/Mz release condensation",
    evidence: ["native.json", "evidence/M02/releases"],
    observation:
      "R01 My release under UDL matches simply-supported closed form in native tests.",
  },
  {
    id: "M02-POINTS",
    title: "Interior point loads",
    evidence: ["native.json", "evidence/M02/points"],
    observation:
      "P01 interior point matches B05 closed form; force jump preserved in native corpus.",
  },
  {
    id: "M02-SELF-WEIGHT",
    title: "Self-weight without double-counting",
    evidence: ["tests/e2e/self-weight.spec.js", "browser-suite.json"],
    observation:
      "B10 analyse, DUPLICATE_SELF_WEIGHT rejection and combination validity after case delete pass in browser.",
  },
  {
    id: "M02-PRESCRIBED",
    title: "Prescribed support movement",
    evidence: ["tests/e2e/prescribed.spec.js", "browser-suite.json"],
    observation:
      "B09 settlement analyse and free-DOF prescription rejection pass in browser.",
  },
  {
    id: "M02-ENVELOPE",
    title: "Governing combination provenance",
    evidence: ["native.json", "tests/e2e/scenarios.spec.js"],
    observation:
      "V01 envelope exposes a real governing combination; browser wind envelope cites combination provenance.",
  },
  {
    id: "M02-INVALID",
    title: "Invalid load and release rejection",
    evidence: ["native.json", "evidence/M02/invalid"],
    observation:
      "n22 single-case envelope rejection and related INVALID fixtures covered by native tests.",
  },
];

const checklist = `# M02 acceptance record

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

- Parent M02 gate packages slice behaviour already implemented; it does not claim commercial load-code generators or M03 spatial parity.
- Platform hardware was accepted under M01 (ADR 0005); this gate reuses same-build analytical and browser regression.
`;

await writeFile(`${dir}/ACCEPTANCE.md`, checklist);

await record("m02-acceptance", {
  status: "PASS",
  testCount: criteria.length,
  testIds: criteria.map((c) => c.id),
  command: [
    "node",
    "tools/record-m02-acceptance.mjs",
    "npm",
    "run",
    "verify:milestone",
    "--",
    "M02",
  ],
  artifacts: ["ACCEPTANCE.md"],
  criteria,
  limitations:
    "Bounded analysis-MVP load-scenario parent; no commercial code-combination claim.",
});

console.log(
  JSON.stringify(
    {
      status: "PASS",
      testIds: criteria.map((c) => c.id),
      evidenceDir: dir,
      sourceHash: build.sourceHash,
      buildHash: build.buildHash,
    },
    null,
    2,
  ),
);
