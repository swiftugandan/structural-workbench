#!/usr/bin/env node
/**
 * Same-build M12 numerical-family gate (rc-column, ADR 0022): biaxial section
 * kernel against fixtures/column/column-oracle.json, rcColumn protocol
 * integration and the browser journeys. The M12 parent stays blocked on M08
 * (column code profile: slenderness, minimum eccentricity, partial factors);
 * this gate never accepts it.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { evidenceDir, record } from "./evidence.mjs";
import {
  acceptanceMarkdown,
  browserRecord,
  buildRecord,
  cargoRecord,
  evaluateCriteria,
} from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M12/column";
process.env.WORKBENCH_TASK_ID = "M12-COLUMN";
process.env.WORKBENCH_MILESTONE = "M12";

const dir = evidenceDir("evidence/M12/column");
await mkdir(dir, { recursive: true });
const build = await buildRecord();
await cargoRecord(dir, "column-kernel", [
  "cargo",
  "test",
  "--locked",
  "--release",
  "-p",
  "workbench-design",
  "--test",
  "rc_column",
]);
await cargoRecord(dir, "column-unit", [
  "cargo",
  "test",
  "--locked",
  "--release",
  "-p",
  "workbench-design",
  "--lib",
  "--",
  "rc_column",
]);
await cargoRecord(dir, "column-protocol", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-wasm-api",
  "--test",
  "rc_column_preview",
]);
await browserRecord(dir, "column-browser", ["tests/e2e/rc-column.spec.js"], {
  artifacts: ["playwright-results.json"],
});

const criteria = [
  {
    id: "M12-C1-INTEGRATION",
    title: "Exact concrete integration against reference and fibre models",
    evidence: "kernel_validation",
    tests: {
      "column-kernel": [
        "oracle_self_checks_passed",
        "resultants_match_reference_integration",
        "resultants_within_fibre_error_bound",
      ],
      "column-unit": ["rc_column::tests::power_integral_branches_agree"],
    },
    observation:
      "23 strain planes over pivots A, B and C on three sections (square parabola, square block, asymmetric rectangle with a steel limit): resultants within 1e-9 of the section scale of the independent exact reference (measured 7.5e-15). They are within the 800² fibre model's measured refinement error (measured 6.2e-7 of scale). The analytic and Gauss branches of the power integral agree to 1e-12.",
  },
  {
    id: "M12-C2-CAPACITY",
    title: "M_Rd(N, θ) along the demand direction",
    evidence: "kernel_validation",
    tests: {
      "column-kernel": [
        "capacities_match_oracle",
        "closed_form_endpoints",
        "uniaxial_agrees_with_rc_section",
        "square_symmetry",
        "contour_points_are_capacities",
        "resistance_vanishes_at_the_axial_limits",
        "check_utilisation",
        "pivot_a_range_is_attained",
      ],
      "column-unit": [
        "rc_column::tests::eccentric_states_above_uniform_squash_are_out_of_range",
        "rc_column::tests::axial_force_increases_along_the_domain",
      ],
    },
    observation:
      "48 oracle capacities (3 sections × 4 N × 4 θ) within 1e-9 (measured 4.4e-14), with axial residual and direction error ≤ 1e-12 in at most 47 bisection steps each. Squash, tension and the balanced point match their closed forms. At θ = 0° and 90° the capacity equals rc_section::ultimate for all three laws within 1e-9. The square section is symmetric, and contour points are capacities.",
  },
  {
    id: "M12-C3-REFUSALS",
    title: "Refusals and out-of-range axial force",
    evidence: "failure_path",
    tests: {
      "column-kernel": ["refusals"],
      "column-protocol": [
        "axial_force_beyond_the_squash_load_is_reported_not_rated",
        "column_inputs_are_validated_and_refusals_are_atomic",
      ],
      "column-browser": [
        "RC column refusals: bar count and axial force beyond the section",
      ],
    },
    observation:
      "Invalid sections, bars outside the concrete, strain limits out of order, N outside the range, and contours not surrounding the centre are refused with their diagnostics. Stations beyond the squash load are reported, never rated. Invalid bar counts, covers and ε_c > ε_cu leave the project unchanged.",
  },
  {
    id: "M12-C4-PROTOCOL",
    title: "Model station actions reach the kernel with the documented signs",
    evidence: "kernel_validation",
    tests: {
      "column-protocol": [
        "synthetic_run_reproduces_the_oracle_section",
        "model_station_actions_reach_the_kernel_with_the_documented_signs",
        "untouched_integer_inputs_keep_their_provenance",
      ],
    },
    observation:
      "The rcColumn draft reproduces SQ-PARABOLA: squash and tension within 1e-12, and the N = 0 contour meets the oracle's θ = 0 capacity within 1e-9. On a cantilever loaded to N = 1478.4 kN at θ = 37°, the fixed-end station reports N_Ed = −N_frame, the oracle's M_Rd within 1e-9 and utilisation 0.8. The run is deterministic.",
  },
  {
    id: "M12-C5-BROWSER",
    title: "Browser journey, export and persistence on the same build",
    evidence: "ui_journey",
    tests: {
      "column-browser": [
        "RC column mechanics match the oracle at model station actions, go stale and persist",
      ],
    },
    observation:
      "In the browser build, the column bound to the analysed member shows the 72-point contour with the demand and a governing utilisation of 0.8 (within 1e-9 of the oracle). The downloaded run record and the HTML calculation record carry the same values. Edits make the run STALE, and the project reopens as schema 1.5.0 with the law and ε_c.",
  },
];
const { rows, issues } = await evaluateCriteria(dir, build, criteria);
const limitations =
  "rc-column mechanics only: solid rectangular sections, perimeter or listed bars, explicit concrete and steel laws with caller strain limits, and capacity at fixed N_Ed along the demand direction at the member's key stations. Slenderness and second-order moments, minimum eccentricity, partial factors, shear and detailing need the column code profile (M08 resources) and stay UNSUPPORTED; the M12 parent is not accepted.";
await record("m12-column-acceptance", {
  status: issues.length ? "FAIL" : "PASS",
  testCount: rows.length,
  testIds: rows.map((r) => r.id),
  command: ["node", "tools/run-m12-column.mjs"],
  issues,
  criteria: rows,
  limitations,
});
await writeFile(
  `${dir}/ACCEPTANCE.md`,
  acceptanceMarkdown("M12-COLUMN", build, rows, issues, limitations),
);
console.log(
  JSON.stringify(
    {
      status: issues.length ? "FAIL" : "PASS",
      sourceHash: build.sourceHash,
      buildHash: build.buildHash,
      issues,
    },
    null,
    2,
  ),
);
if (issues.length) process.exitCode = 1;
