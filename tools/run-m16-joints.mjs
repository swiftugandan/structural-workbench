#!/usr/bin/env node
/**
 * M16 sub-slice gate (M16-JOINTS, ADR 0032): bar clashes at RC beam–column
 * joints — kernel geometry against hand values, the `detailJoints` protocol
 * journey on J01 and the browser Joints pane — on one build. The M16 parent
 * (persistent bars, revision propagation, drawings) is not accepted by it.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceDir, record } from "./evidence.mjs";
import {
  acceptanceMarkdown,
  browserRecord,
  buildRecord,
  cargoRecord,
  evaluateCriteria,
} from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M16/joints";
process.env.WORKBENCH_TASK_ID = "M16-JOINTS";
process.env.WORKBENCH_MILESTONE = "M16";

const dir = evidenceDir("evidence/M16/joints");
await mkdir(dir, { recursive: true });
const build = await buildRecord();
await cargoRecord(dir, "joints-kernel", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-design",
  "joints::",
]);
await cargoRecord(dir, "joints-protocol", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-wasm-api",
  "--test",
  "joints",
]);
await browserRecord(dir, "joints-browser", ["tests/e2e/rc-joints.spec.js"], {
  artifacts: ["playwright-results.json", "rc-joints-browser.json"],
});
const criteria = [
  {
    id: "M16-JOINTS-GEOMETRY",
    title: "Skew-line distances and bar row offsets",
    evidence: "joints-kernel",
    observation: "Hand values: 300 mm between orthogonal lines; ±100 mm rows",
    tests: { "joints-kernel": ["joints::tests::skew_line_distance_by_hand"] },
  },
  {
    id: "M16-JOINTS-CLEAR",
    title: "8.2(2) clear distance between beam and column bars",
    evidence: "joints-kernel",
    observation:
      "Exactly at the 47.5 mm limit passes; a 350 mm beam clashes by 25 mm; no aggregate is indeterminate",
    tests: {
      "joints-kernel": [
        "joints::tests::beam_bars_against_column_bars_need_the_clear_distance",
      ],
    },
  },
  {
    id: "M16-JOINTS-CROSSING",
    title: "Crossing beam rows may touch, not intersect",
    evidence: "joints-kernel",
    observation: "Equal beams intersect; one Ø20 lower they touch",
    tests: {
      "joints-kernel": [
        "joints::tests::crossing_beams_of_equal_depth_clash_and_a_lowered_layer_clears",
      ],
    },
  },
  {
    id: "M16-JOINTS-PROTOCOL",
    title: "detailJoints on J01 through clash, fix and clear",
    evidence: "joints-protocol",
    observation:
      "Deeper beam, corner-only column and aggregate size give clear",
    tests: {
      "joints-protocol": ["equal_beams_into_a_column_clash_until_detailed"],
    },
  },
  {
    id: "M16-JOINTS-BROWSER",
    title: "Joints pane reports the clashes and follows an edit",
    evidence: "joints-browser",
    observation: "Two crossing clashes before, none after a 640 mm beam",
    tests: {
      "joints-browser": [
        "RC joints: clashes are reported, a deeper beam clears the crossing",
      ],
    },
  },
];
const { rows, issues } = await evaluateCriteria(dir, build, criteria);
const limitations =
  "Centreline model: sections centred on the member axes, straight bars through the joint, collinear beams not compared. Eccentric beams, haunches, layer order inside the joint, laps and anchorage at the joint are the engineer's. Hand-geometry verification; no published joint example is held.";
await record("m16-joints-acceptance", {
  status: issues.length ? "FAIL" : "PASS",
  testCount: rows.length,
  testIds: rows.map((r) => r.id),
  command: ["node", "tools/run-m16-joints.mjs"],
  issues,
  limitations,
});
await writeFile(
  `${dir}/ACCEPTANCE.md`,
  acceptanceMarkdown("M16-JOINTS", build, rows, issues, limitations),
);
console.log(
  JSON.stringify({ status: issues.length ? "FAIL" : "PASS", issues }, null, 2),
);
if (issues.length) process.exitCode = 1;
