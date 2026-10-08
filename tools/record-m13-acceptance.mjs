#!/usr/bin/env node
/**
 * Record M13 parent acceptance against the current build. Each criterion of
 * SPECIFICATION.md M13 names the executed tests that prove it; a criterion
 * passes only when every named test is in a same-build PASS record.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { record, evidenceDir } from "./evidence.mjs";
import { acceptanceMarkdown, evaluateCriteria } from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M13/full";
process.env.WORKBENCH_TASK_ID ||= "M13-parent";
process.env.WORKBENCH_MILESTONE ||= "M13";

const dir = evidenceDir("evidence/M13/full");
await mkdir(dir, { recursive: true });
const build = JSON.parse(await readFile("dist/build.json", "utf8"));

const JOURNEY =
  "Steel connection: bind the beam end, check, draw, bill, report and persist";
const UNSUPPORTED_JOURNEY =
  "Steel connection: moment transfer and missing inputs are never a pass";
const LEDGER_JOURNEY =
  "M06 capability ledger: View capabilities shows UNKNOWN parity and exclusions";
const k = (t) => `profile::aisc36022::connection::tests::${t}`;

const criteria = [
  {
    id: "M13-EQUILIBRIUM",
    title: "Force equilibrium of the connection",
    evidence: "kernel_validation",
    tests: {
      "connection-native": [k("icr_is_in_equilibrium")],
      "connection-protocol": [
        "a_pinned_beam_end_is_designed_from_its_exact_reaction",
      ],
    },
    observation:
      "Every instantaneous-centre solution balances the load along and across it and in moment to 1e-9 of C (single and double lines, 0–89°); the free body carries the beam's exact end reaction to the support face as V, N and V·e, with the support reaction opposite.",
  },
  {
    id: "M13-FAILURE-MODES",
    title: "Every applicable failure mode of the single plate",
    evidence: "kernel_validation",
    tests: {
      "connection-native": [
        k("ii_a_17b_limit_states"),
        k("ii_a_19a_limit_states"),
        k("matches_the_independent_oracle"),
        k("uplift_reverses_the_tearout_edges"),
        k("net_plastic_modulus_from_geometry"),
        k("bolt_tables"),
      ],
    },
    observation:
      "Bolt shear, bearing and tearout per bolt with the eccentric bolt group; plate shear yield and rupture, block shear, flexure with LTB, flexural rupture, interactions and ductility; tension yield, rupture and block shear of plate and beam; weld size and strength; support rupture and thickness; beam shear; spacing, edges and fit.",
  },
  {
    id: "M13-UNSUPPORTED",
    title: "Unsupported moment transfer and other conditions are stated",
    evidence: "failure_path",
    tests: {
      "connection-native": [k("unsupported_conditions_are_never_passed")],
      "connection-protocol": ["moment_transfer_is_unsupported_never_passed"],
      "m13-browser": [UNSUPPORTED_JOURNEY],
    },
    observation:
      "A moment through the end, compression, minor-axis actions and torsion are UNSUPPORTED and the run is never a pass; an unconfirmed rotation restraint is INDETERMINATE; a beam that does not clear the column flange tips fails the fit.",
  },
  {
    id: "M13-WORKED-EXAMPLES",
    title: "Independent worked examples",
    evidence: "kernel_validation",
    tests: {
      "connection-native": [
        k("icr_reproduces_the_published_c_values"),
        k("ii_a_17a_limit_states"),
        k("ii_a_17b_limit_states"),
        k("ii_a_19a_limit_states"),
      ],
    },
    observation:
      "Six published C values and C′ reproduced on the table grid; Design Examples II.A-17A, II.A-17B and II.A-19A reconcile limit state by limit state within each rounding chain, with the general-method differences documented (17A bolt group at e = a, 17B ductility).",
  },
  {
    id: "M13-MODEL-LINK",
    title: "Member forces, connection geometry and material stay linked",
    evidence: "kernel_validation",
    tests: {
      "connection-protocol": [
        "a_pinned_beam_end_is_designed_from_its_exact_reaction",
        "an_unconfigured_connection_says_what_is_missing",
      ],
      "connection-model": [
        "the_support_must_meet_the_connected_end",
        "a_connection_at_the_beam_end_round_trips",
      ],
      "connection-native": [k("model_bolt_list_matches_the_tables")],
    },
    observation:
      "The demand is the bound beam's exact end action for the case (wL/2 = 135 kN at both ends of C01); sections and material come from the members' catalogue assignments; the support must meet the beam at the connected end; a missing support or section is named, never assumed.",
  },
  {
    id: "M13-DRAWING-BOM",
    title: "Exact drawing and report dimensions, bill of materials",
    evidence: "ui_journey",
    tests: { "m13-browser": [JOURNEY] },
    observation:
      "The dimensioned elevation draws the run's Rust geometry (the plate length on the drawing equals the record's), the bill lists the plate, four bolts and the welds, and the calculation record carries the drawing, every limit state and the bill.",
  },
  {
    id: "M13-USER-JOURNEY",
    title: "Transfer actions, check, revise and export in the browser",
    evidence: "ui_journey",
    tests: { "m13-browser": [JOURNEY] },
    observation:
      "A connection draft is bound to the beam end and its support, saved with a user weld size, run on the analysed case to PASS, inspected (actions, checks, drawing, bill), exported as record, CSV and report, and saved.",
  },
  {
    id: "M13-FAILURE-PATHS",
    title: "Refusals keep the project",
    evidence: "failure_path",
    tests: {
      "connection-protocol": [
        "invalid_connection_inputs_are_refused_atomically",
      ],
      "connection-model": ["connection_inputs_are_validated"],
    },
    observation:
      "Unknown bolts, out-of-range rows or lines, a support away from the connected end, connection inputs on another kind and unknown fields are refused, and the model hash is unchanged.",
  },
  {
    id: "M13-PERSISTENCE",
    title: "Schema 1.9.0 save, reopen and migrate",
    evidence: "save_and_reopen",
    tests: {
      "connection-protocol": [
        "connection_inputs_persist_through_save_and_reopen",
      ],
      "connection-model": ["a_1_8_file_migrates_and_cannot_carry_a_connection"],
      "m13-browser": [JOURNEY],
    },
    observation:
      "Connection inputs and their provenance persist in the downloaded project and reopen; 1.8.0 files migrate by version and cannot carry a connection draft.",
  },
  {
    id: "M13-LEDGER",
    title: "Capability ledger",
    evidence: "capability_ledger",
    tests: { "m13-browser": [LEDGER_JOURNEY] },
    observation:
      "The ledger lists steel-connection-single-plate with its demonstration label, limitations and UNKNOWN comparison; other connection families stay excluded.",
  },
];

const { rows, issues } = await evaluateCriteria(dir, build, criteria);

const sha = async (f) =>
  createHash("sha256")
    .update(await readFile(f))
    .digest("hex");
const oracle = JSON.parse(
  await readFile(
    "fixtures/design/aisc-360-22-lrfd/connection-oracle.json",
    "utf8",
  ),
);
const lock = JSON.parse(await readFile("resources.lock.json", "utf8"));
const shapes = lock.acquired.find((r) => r.id === "R-STEEL-SHAPES-V16");
const subset = JSON.parse(
  await readFile("crates/design/data/aisc-v16-subset.json", "utf8"),
);
const actual = await sha(oracle.oracle);
const ok =
  actual === oracle.oracleSha256 &&
  subset.sourceSha256 === shapes?.contentHashSha256;
rows.push({
  id: "M13-ORACLE-PROVENANCE",
  title: "Oracle is the recorded script; catalogue from the locked database",
  evidence: "regression_results",
  observation: `${oracle.oracle} sha256 ${actual} (recorded ${oracle.oracleSha256}); W subset source ${subset.sourceSha256} (lock R-STEEL-SHAPES-V16 ${shapes?.contentHashSha256}); published fixture sha256 ${await sha("fixtures/design/aisc-360-22-lrfd/connection-single-plate.published.json")}.`,
  status: ok ? "PASS" : "FAIL",
  missing: ok ? [] : ["oracle or catalogue provenance"],
});
if (!ok) issues.push("M13-ORACLE-PROVENANCE: oracle or catalogue hash");

const limitations =
  "aisc-360-22-lrfd single-plate connections are a demonstration of ANSI/AISC 360-22 with the Manual equations reproduced in the held Design Examples v16; not a certified design. Uncoped W beams to a column flange, column web or girder web; one or two bolt lines in standard holes, bearing-type, snug-tight; LRFD. The general (extended-configuration) method is applied to every geometry because Manual Table 10-9 is not held, so some conventional connections fail here. Moment through the end, compression, minor-axis actions, torsion, coped beams, slotted holes, slip-critical bolts and other connection families are unsupported. Commercial-solver parity remains UNKNOWN.";

await record("m13-acceptance", {
  status: issues.length ? "FAIL" : "PASS",
  testCount: rows.length,
  testIds: rows.map((c) => c.id),
  command: ["node", "tools/record-m13-acceptance.mjs"],
  issues,
  criteria: rows,
  limitations,
});
const md = acceptanceMarkdown("M13", build, rows, issues, limitations);
await writeFile(`${dir}/ACCEPTANCE.md`, md);
console.log(md);
if (issues.length) process.exitCode = 1;
