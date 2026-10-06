#!/usr/bin/env node
/**
 * Record M17 parent acceptance against the current build. Each criterion of
 * SPECIFICATION.md M17 names the executed tests that prove it; a criterion
 * passes only when every named test is in a same-build PASS record.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { record, evidenceDir } from "./evidence.mjs";
import { acceptanceMarkdown, evaluateCriteria } from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M17/full";
process.env.WORKBENCH_TASK_ID ||= "M17-parent";
process.env.WORKBENCH_MILESTONE ||= "M17";

const dir = evidenceDir("evidence/M17/full");
await mkdir(dir, { recursive: true });
const build = JSON.parse(await readFile("dist/build.json", "utf8"));

const JOURNEY =
  "Composite beam: stages, checks, section, deflections, report and persistence";
const NEVER_PASS =
  "Composite beam: missing stages and judgements are never a pass";
const LEDGER_JOURNEY =
  "M06 capability ledger: View capabilities shows UNKNOWN parity and exclusions";
const k = (t) => `profile::aisc36022::composite::tests::${t}`;

const criteria = [
  {
    id: "M17-STAGE-HISTORY",
    title: "Stage load-history fixtures",
    evidence: "kernel_validation",
    tests: {
      "composite-protocol": ["example_i_1_through_its_stages"],
      "m17-browser": [JOURNEY],
    },
    observation:
      "CB01 (Design Example I.1 as a model: WET, CONST, SDL, LIVE, C-CON, C-COMP) gives the example's 344 kip-ft construction and 678 kip-ft composite moments, 2.59 in. wet deflection and the stud layout through the protocol and the browser.",
  },
  {
    id: "M17-STAGE-SEPARATION",
    title: "Pre-composite and composite actions separated",
    evidence: "kernel_validation",
    tests: {
      "composite-protocol": ["stage_cases_are_kept_separate"],
    },
    observation:
      "The wet-concrete deflection uses I_s and only the wet case; the live deflection uses I_LB and only the live case (swapping cases scales by I_s/I_LB exactly); the construction stage sees only its combination.",
  },
  {
    id: "M17-MEMBER-CHECKS",
    title: "Independent member checks",
    evidence: "kernel_validation",
    tests: {
      "composite-native": [
        k("example_i_2_direct_calculation"),
        k("example_i_1_against_the_manual_tables"),
        k("stud_force_limits_the_strength_near_the_supports"),
      ],
    },
    observation:
      "Construction flexure (F2 with L_b = 10 ft, φM_n = 677 kip-ft), composite plastic flexure (M_n at 50 % composite), shear on the steel and concentrated-load sections developed by the studs between them and the nearer support (I8.2c).",
  },
  {
    id: "M17-CONNECTORS",
    title: "Independent connector checks",
    evidence: "kernel_validation",
    tests: {
      "composite-native": [
        k("example_i_2_direct_calculation"),
        k("example_i_1_against_the_manual_tables"),
        k("matches_the_independent_oracle"),
      ],
    },
    observation:
      "Q_n by I8-1 with R_g and R_p for parallel deck (21.5 kips) and perpendicular deck with one and two studs per rib (17.2 and 14.6 kips); slip-capacity conditions; stud detailing.",
  },
  {
    id: "M17-WORKED-EXAMPLES",
    title: "Published examples and the independent oracle",
    evidence: "kernel_validation",
    tests: {
      "composite-native": [
        k("example_i_2_with_its_rounded_inputs"),
        k("matches_the_independent_oracle"),
        k("deflection_integration_matches_closed_forms"),
      ],
    },
    observation:
      "With the example's own rounded inputs the formulas reproduce I.2's I_LB, Y_ENA, I_tr, I_equiv and M_n; the independent oracle (fibre force balance, bisected transformed section, two-area I_LB) agrees to 1e-8 on five cases.",
  },
  {
    id: "M17-SERVICE",
    title: "Stage-dependent stiffness and deflections",
    evidence: "kernel_validation",
    tests: {
      "composite-native": [k("example_i_2_direct_calculation")],
      "composite-protocol": ["example_i_1_through_its_stages"],
    },
    observation:
      "Wet concrete on I_s net of camber, live load on the lower-bound I_LB, long-term sustained plus the Commentary's shrinkage model with the engineer's ε_sh.",
  },
  {
    id: "M17-TIME-DEPENDENT",
    title: "Unsupported time-dependent assumptions block a complete result",
    evidence: "failure_path",
    tests: {
      "composite-native": [
        k("time_dependent_and_unsupported_conditions_block_a_pass"),
      ],
      "composite-protocol": [
        "missing_inputs_and_unsupported_conditions_are_never_passed",
      ],
      "m17-browser": [NEVER_PASS],
    },
    observation:
      "Creep not judged is INDETERMINATE and 'must be calculated' UNSUPPORTED; a missing shrinkage strain, limit or stage case is INDETERMINATE; the run is never a pass until each is the engineer's.",
  },
  {
    id: "M17-USER-JOURNEY",
    title: "Compare stages and issue the design record in the browser",
    evidence: "ui_journey",
    tests: { "m17-browser": [JOURNEY] },
    observation:
      "Bind the beam, assign the stage cases, enter limits, shrinkage and the creep judgement, run to PASS, inspect stages, checks, section and deflections, download the record, the bill and the calculation report.",
  },
  {
    id: "M17-FAILURE-PATHS",
    title: "Refusals keep the project",
    evidence: "failure_path",
    tests: {
      "composite-model": ["stage_cases_must_exist_and_inputs_are_validated"],
      "composite-protocol": [
        "missing_inputs_and_unsupported_conditions_are_never_passed",
      ],
    },
    observation:
      "A stage case that does not exist, unknown deck or side kinds, limits or strains out of range, ribs or studs outside the slab and unknown fields are refused with the model unchanged.",
  },
  {
    id: "M17-PERSISTENCE",
    title: "Schema 1.10.0 save, reopen and migrate",
    evidence: "save_and_reopen",
    tests: {
      "composite-protocol": ["composite_inputs_persist"],
      "composite-model": [
        "a_composite_draft_round_trips",
        "a_1_9_file_cannot_carry_a_composite_beam",
      ],
      "m17-browser": [JOURNEY],
    },
    observation:
      "Composite inputs persist in the downloaded project and reopen; 1.9.0 files migrate by version and cannot carry a composite beam draft.",
  },
  {
    id: "M17-LEDGER",
    title: "Capability ledger",
    evidence: "capability_ledger",
    tests: { "m17-browser": [LEDGER_JOURNEY] },
    observation:
      "The ledger lists composite-beam with its demonstration label, limitations and UNKNOWN comparison.",
  },
];

const { rows, issues } = await evaluateCriteria(dir, build, criteria);
const sha = async (f) =>
  createHash("sha256")
    .update(await readFile(f))
    .digest("hex");
const oracle = JSON.parse(
  await readFile(
    "fixtures/design/aisc-360-22-lrfd/composite-oracle.json",
    "utf8",
  ),
);
const actual = await sha(oracle.oracle);
const ok = actual === oracle.oracleSha256;
rows.push({
  id: "M17-ORACLE-PROVENANCE",
  title: "Oracle is the recorded script; examples fixture pinned",
  evidence: "regression_results",
  observation: `${oracle.oracle} sha256 ${actual} (recorded ${oracle.oracleSha256}); composite-beam.published.json sha256 ${await sha("fixtures/design/aisc-360-22-lrfd/composite-beam.published.json")}; CB01 sha256 ${await sha("fixtures/models/CB01.json")}.`,
  status: ok ? "PASS" : "FAIL",
  missing: ok ? [] : ["composite oracle changed"],
});
if (!ok) issues.push("M17-ORACLE-PROVENANCE: oracle hash");

const limitations =
  "aisc-360-22-lrfd composite beams are a demonstration of ANSI/AISC 360-22 Chapter I with the Commentary's deflection and shrinkage models; not a certified design. Unshored simply supported W beams with headed studs under a solid slab or formed deck; positive flexure. Creep is the engineer's recorded judgement. Continuous beams, shored construction, slender webs, channel anchors, analytical slip capacity, vibration and composite columns are unsupported. Commercial PROKON parity remains UNKNOWN.";

await record("m17-acceptance", {
  status: issues.length ? "FAIL" : "PASS",
  testCount: rows.length,
  testIds: rows.map((c) => c.id),
  command: ["node", "tools/record-m17-acceptance.mjs"],
  issues,
  criteria: rows,
  limitations,
});
const md = acceptanceMarkdown("M17", build, rows, issues, limitations);
await writeFile(`${dir}/ACCEPTANCE.md`, md);
console.log(md);
if (issues.length) process.exitCode = 1;
