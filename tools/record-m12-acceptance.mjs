#!/usr/bin/env node
/**
 * Record M12 parent acceptance against the current build. Each criterion of
 * SPECIFICATION.md M12 names the executed tests that prove it; a criterion
 * passes only when every named test is in a same-build PASS record.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { record, evidenceDir } from "./evidence.mjs";
import { acceptanceMarkdown, evaluateCriteria } from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M12/full";
process.env.WORKBENCH_TASK_ID ||= "M12-parent";
process.env.WORKBENCH_MILESTONE ||= "M12";

const dir = evidenceDir("evidence/M12/full");
await mkdir(dir, { recursive: true });
const build = JSON.parse(await readFile("dist/build.json", "utf8"));

const EC2_JOURNEY =
  "RC column EC2 checks: code inputs, slenderness, proposal, report and persistence";
const MECHANICS_JOURNEY =
  "RC column mechanics match the oracle at model station actions, go stale and persist";
const REFUSALS_JOURNEY =
  "RC column refusals: bar count and axial force beyond the section";
const LEDGER_JOURNEY =
  "M06 capability ledger: View capabilities shows UNKNOWN parity and exclusions";
const col = (t) => `profile::ec2uk::column_tests::${t}`;

const criteria = [
  {
    id: "M12-ENDPOINTS-SYMMETRY",
    title: "Axial and pure bending endpoints, symmetry",
    evidence: "kernel_validation",
    tests: {
      "column-native": [
        "closed_form_endpoints",
        "resistance_vanishes_at_the_axial_limits",
        "square_symmetry",
        "pivot_a_range_is_attained",
      ],
    },
    observation:
      "Squash and tension resistances equal their closed forms, the moment resistance vanishes at both axial limits, a square section is symmetric under 90° rotation and reflection, and the steel-strain pivot range is attained.",
  },
  {
    id: "M12-INTEGRATION-CONVERGENCE",
    title: "Integration exact and convergent",
    evidence: "kernel_validation",
    tests: {
      "column-native": [
        "resultants_match_reference_integration",
        "resultants_within_fibre_error_bound",
      ],
    },
    observation:
      "Exact concrete integration matches a reference integration to round-off, and an 800² fibre model converges to it within its measured refinement error.",
  },
  {
    id: "M12-INDEPENDENT-BIAXIAL",
    title: "Independent biaxial examples",
    evidence: "kernel_validation",
    tests: {
      "column-native": [
        "capacities_match_oracle",
        "uniaxial_agrees_with_rc_section",
        "oracle_self_checks_passed",
      ],
      "column-protocol": [
        "synthetic_run_reproduces_the_oracle_section",
        "model_station_actions_reach_the_kernel_with_the_documented_signs",
      ],
      "m12-browser": [MECHANICS_JOURNEY],
    },
    observation:
      "48 biaxial capacities of the independent column oracle within 1e-9; the uniaxial case agrees with the rc_section kernel; model station actions reach the kernel with the documented signs and the browser reproduces the oracle at a model station.",
  },
  {
    id: "M12-NO-OVERSTATED-SURFACE",
    title: "No interpolation overstates the verified surface",
    evidence: "kernel_validation",
    tests: {
      "column-native": [
        "check_utilisation",
        "contour_points_are_capacities",
        col("design_moments_match_the_independent_oracle"),
      ],
    },
    observation:
      "Both EC2 design moment vectors (imperfection about y, about z) are checked against the exact M_Rd(N, θ) along their own direction; the (5.39) interpolation is never used, and every drawn contour point is a computed capacity.",
  },
  {
    id: "M12-SLENDERNESS-BOUNDARY",
    title: "Slenderness boundary and second order effects",
    evidence: "kernel_validation",
    tests: {
      "column-native": [
        col("second_order_starts_at_lambda_lim"),
        col("design_moments_match_the_independent_oracle"),
        col("jrc_column_b2_figures_that_reconcile"),
      ],
    },
    observation:
      "Second order moments start exactly at λ = λ_lim; effective length, λ, λ_lim, e_i, e2 and design moments match the independent oracle within 1e-9 for braced, unbraced, double-curvature, transversely loaded and one-axis-slender columns; JRC Column B2 l0, n, λ_lim and K_r reconcile, with four publication discrepancies documented and confirmed to disagree.",
  },
  {
    id: "M12-MINIMUM-ECCENTRICITY",
    title: "Minimum eccentricity boundary",
    evidence: "kernel_validation",
    tests: {
      "column-native": [col("minimum_eccentricity_governs_small_moments")],
    },
    observation:
      "M_Ed = N e0 with e0 = max(h/30, 20 mm) when first-order moments are small, applied with the imperfection in one direction at a time.",
  },
  {
    id: "M12-SHEAR-DETAILING",
    title: "Shear with axial force and column detailing",
    evidence: "kernel_validation",
    tests: {
      "column-native": [
        col("column_shear_with_axial_compression_by_hand"),
        col("column_detailing_by_hand"),
      ],
    },
    observation:
      "V_Rd,c with σ_cp matches the hand value; A_s,min/max, φ_min 12 mm (UK NA), link diameter and s_cl,tmax, and the 150 mm restraint rule match hand values, including a failing 600 mm face.",
  },
  {
    id: "M12-INPUTS-NEVER-ASSUMED",
    title: "Missing engineer inputs are named, never assumed",
    evidence: "failure_path",
    tests: {
      "column-native": [col("missing_inputs_are_named_not_assumed")],
      "column-protocol": [
        "ec2_column_checks_run_on_model_actions_and_propose_reinforcement",
        "column_inputs_are_validated_and_refusals_are_atomic",
        "axial_force_beyond_the_squash_load_is_reported_not_rated",
      ],
      "m12-browser": [REFUSALS_JOURNEY],
    },
    observation:
      "Without braced/restraint inputs the bending checks are INDETERMINATE and name them; a slender column without φ_ef stays INDETERMINATE; column inputs on beams and invalid k are refused atomically; N beyond the squash load is reported, not rated.",
  },
  {
    id: "M12-MODEL-REVISE-REPORT",
    title: "Check from the model, revise reinforcement, traceable report",
    evidence: "ui_journey",
    tests: {
      "column-protocol": [
        "ec2_column_checks_run_on_model_actions_and_propose_reinforcement",
      ],
      "m12-browser": [EC2_JOURNEY],
    },
    observation:
      "On model actions the column runs the EC2 checks; the least-steel proposal passes every check while the next smaller bar fails; in the browser the proposal is applied as one undoable command, re-analysed and rerun to PASS, and the calculation record carries the demonstration banner, every check and the slenderness table.",
  },
  {
    id: "M12-PERSISTENCE",
    title: "Schema 1.8.0 save, reopen and migrate",
    evidence: "save_and_reopen",
    tests: {
      "column-model": [
        "a_1_7_column_gains_a_synthetic_link_spacing",
        "code_inputs_are_validated_for_the_draft_kind",
      ],
      "m12-browser": [EC2_JOURNEY, MECHANICS_JOURNEY],
    },
    observation:
      "1.7.0 column drafts gain a synthetic 200 mm link spacing and cannot already carry 1.8.0 content; code inputs are validated per kind; the downloaded project keeps the column code inputs and reopens.",
  },
  {
    id: "M12-LEDGER",
    title: "Capability ledger",
    evidence: "capability_ledger",
    tests: { "m12-browser": [LEDGER_JOURNEY] },
    observation:
      "The capability ledger lists the EC2 column checks with their demonstration label and UNKNOWN comparison.",
  },
];

const { rows, issues } = await evaluateCriteria(dir, build, criteria);

const sha = async (f) =>
  createHash("sha256")
    .update(await readFile(f))
    .digest("hex");
const rec = JSON.parse(
  await readFile(
    "fixtures/design/ec2-uk-na/column.reconciliation.json",
    "utf8",
  ),
);
const oracleSha = await sha(rec.oracle);
const ok = oracleSha === rec.oracleSha256 && rec.failures.length === 0;
const provenance = {
  id: "M12-ORACLE-PROVENANCE",
  title: "Independent column oracle is the recorded script",
  evidence: "regression_results",
  observation: `${rec.oracle} sha256 ${oracleSha} (recorded ${rec.oracleSha256}); ${rec.cases.length} cases; ${rec.failures.length} failures; ${rec.discrepancies.length} JRC discrepancies confirmed.`,
  status: ok ? "PASS" : "FAIL",
  missing: ok ? [] : ["oracle changed or failures"],
};
if (!ok) issues.push(`${provenance.id}: oracle hash or failures`);
rows.push(provenance);

const limitations =
  "ec2-uk-na column checks are a demonstration of EN 1992-1-1:2004 incl. AC:2008/AC:2010 with the UK NA incl. Amd 1 (2009); A1:2014 and NA+A2:2014 are not held and not reconciled, and no run is a certified design. Rectangular columns of constant section and axial force; nominal curvature (5.8.8) with the engineer's end restraints and creep ratio; the node-to-node length as the clear height; one perimeter link. Circular sections, the nominal stiffness method, global second order (5.8.3.3), walls, laps and fck > 50 MPa are unsupported. Commercial PROKON parity remains UNKNOWN.";

await record("m12-acceptance", {
  status: issues.length ? "FAIL" : "PASS",
  testCount: rows.length,
  testIds: rows.map((c) => c.id),
  command: ["node", "tools/record-m12-acceptance.mjs"],
  issues,
  criteria: rows,
  limitations,
});
const md = acceptanceMarkdown("M12", build, rows, issues, limitations);
await writeFile(`${dir}/ACCEPTANCE.md`, md);
console.log(md);
if (issues.length) process.exitCode = 1;
