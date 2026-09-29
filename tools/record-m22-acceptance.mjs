#!/usr/bin/env node
/**
 * Record M22 parent acceptance against the current build. Each criterion of
 * SPECIFICATION.md M22 names the executed tests that prove it.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { record, evidenceDir } from "./evidence.mjs";
import { acceptanceMarkdown, evaluateCriteria } from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M22/full";
process.env.WORKBENCH_TASK_ID ||= "M22-parent";
process.env.WORKBENCH_MILESTONE ||= "M22";

const dir = evidenceDir("evidence/M22/full");
await mkdir(dir, { recursive: true });
const build = JSON.parse(await readFile("dist/build.json", "utf8"));

const B = "M22-B: load study JSON, compare variants, download report";
const MANUAL = "M22-C: a study variant matches the same edit made by hand";
const LOCATED =
  "M22-C: study failures name the variant and step; guards are not bypassed";
const CANCEL =
  "M22-C: a running study can be cancelled and the Worker recovers";

const criteria = [
  {
    id: "M22-INTERFACE",
    title: "Documented command JSON interface and native CLI on the same core",
    evidence: "ui_journey",
    tests: {
      "study-cli": ["tests::s22_e_sweep_changes_hash_and_tip"],
      "study-cli-replay": ["CLI report carries the build's solver source hash"],
      "m22-browser": [B],
    },
    observation:
      "The same execute_study_document runs from workbench-cli and from Analysis › Run study on the analysis Worker (contracts/PROTOCOL.md §1.1); the browser loads a declarative document, compares variants and downloads the report.",
  },
  {
    id: "M22-REPLAY",
    title: "Deterministic replay",
    evidence: "regression_results",
    tests: {
      "study-native": [
        "replaying_a_study_reproduces_every_hash_and_value_exactly",
      ],
      "study-cli-replay": [
        "CLI replay reproduces the report byte for byte",
        "CLI report carries the study digest and base model hash",
      ],
    },
    observation:
      "Replaying a study reproduces every model/result/settings hash and observed value exactly; reports carry the study digest, base model hash and solver build that define the replay identity.",
  },
  {
    id: "M22-CANCELLATION",
    title: "Cancellation",
    evidence: "failure_path",
    tests: { "m22-browser": [CANCEL] },
    observation:
      "A 50-variant study on the 447-node UKR01 model is cancelled from the toolbar; no partial report is kept, the open model is unchanged and the respawned Worker runs the next study.",
  },
  {
    id: "M22-BUDGETS",
    title: "Resource budgets",
    evidence: "failure_path",
    tests: {
      "study-native": ["studies_stay_within_their_budgets_before_any_analysis"],
    },
    observation:
      "At most 50 variants, 100 steps per variant and 1000 steps per study, checked before any analysis (STUDY_BUDGET); the whole run shares the project's analysis time limit and memory budget.",
  },
  {
    id: "M22-LOCATED-ERRORS",
    title: "Errors tied to input steps",
    evidence: "failure_path",
    tests: {
      "study-native": ["errors_name_the_variant_step_path_and_stage"],
      "m22-browser": [LOCATED],
    },
    observation:
      "Every failure names the variant, step, JSON pointer and stage (set, validate, analyse, observe) in its message and in details.studyLocation; the UI shows the location and no partial results.",
  },
  {
    id: "M22-MANUAL-MATCH",
    title: "Results match manual workflows",
    evidence: "kernel_validation",
    tests: {
      "study-native": [
        "each_variant_matches_the_manual_edit_then_analyse_workflow",
      ],
      "m22-browser": [MANUAL],
    },
    observation:
      "A variant has the model hash, result id and bit-identical displacement of the same edit made by hand; in the browser the materials editor reaches the variant's hash and the analysed tip displacement matches.",
  },
  {
    id: "M22-GUARDS",
    title: "No script bypasses validation or unsupported-capability guards",
    evidence: "failure_path",
    tests: {
      "study-native": ["a_study_cannot_bypass_validation_or_capability_guards"],
      "m22-browser": [LOCATED],
    },
    observation:
      "Solver overrides, schema/identity/metadata targets, unsupported analysis settings and releases, dangling references, unknown study fields and no-op variants are refused through the same validation as manual edits.",
  },
  {
    id: "M22-EXPORT",
    title: "Comparative report with every model/result hash",
    evidence: "exported_outcome",
    tests: { "m22-browser": [B] },
    observation:
      "The downloaded HTML report lists each variant's steps, observed value, ratio, model, result and settings hashes, and embeds the study document verbatim with its replay identity.",
  },
];

const { rows, issues } = await evaluateCriteria(dir, build, criteria);
const limitations =
  "Studies are restricted declarative JSON-pointer sweeps of linear static analysis on one case or combination; no general scripting language or Python runtime. Multilingual reports are deferred. Commercial PROKON parity remains UNKNOWN.";
await record("m22-acceptance", {
  status: issues.length ? "FAIL" : "PASS",
  testCount: rows.length,
  testIds: rows.map((c) => c.id),
  command: ["node", "tools/record-m22-acceptance.mjs"],
  issues,
  criteria: rows,
  limitations,
});
const md = acceptanceMarkdown("M22", build, rows, issues, limitations);
await writeFile(`${dir}/ACCEPTANCE.md`, md);
console.log(md);
if (issues.length) process.exitCode = 1;
