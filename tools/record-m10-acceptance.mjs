#!/usr/bin/env node
/**
 * Record M10 parent acceptance against the current build. Each criterion of
 * SPECIFICATION.md M10 names the executed tests that prove it; a criterion
 * passes only when every named test is in a same-build PASS record.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { record, evidenceDir } from "./evidence.mjs";
import { acceptanceMarkdown, evaluateCriteria } from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M10/full";
process.env.WORKBENCH_TASK_ID ||= "M10-parent";
process.env.WORKBENCH_MILESTONE ||= "M10";

const dir = evidenceDir("evidence/M10/full");
await mkdir(dir, { recursive: true });
const build = JSON.parse(await readFile("dist/build.json", "utf8"));

const DESIGN_JOURNEY =
  "Slab EC2 design: reinforcement map, span/depth, report and persistence";
const ORACLE_JOURNEY =
  "Slab plate analysis reproduces the opening oracle, shows contours and persists";
const REFUSAL_JOURNEY =
  "Slab plate refusals keep the project and explain the reason";
const COLUMNS_JOURNEY =
  "Slab on model columns: derive the columns, solve and apply the column loads to the frame";
const LEDGER_JOURNEY =
  "M06 capability ledger: View capabilities shows UNKNOWN parity and exclusions";
const st = (t) => `profile::ec2uk::slab_tests::${t}`;

const criteria = [
  {
    id: "M10-PATCH-RIGID",
    title: "Membrane and bending patch tests, rigid modes",
    evidence: "kernel_validation",
    tests: {
      "plate-kernel": [
        "p_patch_membrane_and_bending",
        "p_rigid_six_zero_eigenvalues",
      ],
    },
    observation:
      "Constant-strain membrane and bending patches are exact; a free element has exactly six zero eigenvalues.",
  },
  {
    id: "M10-BENCHMARKS",
    title:
      "Analytical plate and open benchmark references, thin/thick and distortion",
    evidence: "kernel_validation",
    tests: {
      "plate-kernel": [
        "p_ss_navier_convergence",
        "p_cl_timoshenko",
        "p_cl_opensees_identical_mesh",
        "p_open_opensees_identical_mesh",
        "p_points_opensees_identical_mesh",
        "p_distort_navier_and_opensees",
        "p_balance_mixed_edges_and_target_mesh",
      ],
    },
    observation:
      "Navier and Timoshenko analytical plates, OpenSees on identical meshes (clamped, opening, point supports), distorted meshes and equilibrium with mixed edges, all accepted in the plate-v1 family.",
  },
  {
    id: "M10-MESH-DENSITIES",
    title: "At least three mesh densities; convergence indicator",
    evidence: "kernel_validation",
    tests: {
      "plate-kernel": [
        "p_ss_navier_convergence",
        "convergence_indicator_falls_with_refinement",
        "convergence_indicator_exposes_reentrant_corners",
      ],
    },
    observation:
      "The Navier convergence study uses several mesh densities; the run's indicator re-solves at twice the mesh size, falls with refinement and exposes re-entrant corner singularities.",
  },
  {
    id: "M10-MAP-IS-DESIGN-VALUE",
    title: "Reinforcement map distinguishes display from design actions",
    evidence: "kernel_validation",
    tests: {
      "plate-kernel": ["wood_armer_cases"],
      "slab-protocol": [
        "plate_source_reproduces_the_opening_oracle",
        "flat_slab_on_columns_is_designed_from_the_plate_result",
      ],
      "m10-browser": [DESIGN_JOURNEY],
    },
    observation:
      "The A_s,req map is per element from the unsmoothed element-centre Wood–Armer moments, labelled as the design value and never averaged; utilisation per element never exceeds 1 where a mesh is provided; the browser contour of A_s,req is the same array.",
  },
  {
    id: "M10-EC2-DESIGN",
    title: "Restricted reinforcement under one code profile",
    evidence: "kernel_validation",
    tests: {
      "slab-native": [
        st("mesh_covers_the_largest_demand_with_the_least_steel"),
        st("span_depth_by_hand"),
        st("shear_uses_the_weaker_face"),
      ],
      "slab-protocol": [
        "flat_slab_on_columns_is_designed_from_the_plate_result",
      ],
    },
    observation:
      "Each layer's least-area mesh covers the largest element demand and A_s,min within the spacing limits; span/depth uses the shorter span (two-way) or the longer with K = 1.2 (flat slab); shear uses the weaker face's ρ_l.",
  },
  {
    id: "M10-PUNCHING",
    title: "Punching at columns against an independent example",
    evidence: "kernel_validation",
    tests: {
      "slab-native": [
        st("jrc_column_b2_punching"),
        st("punching_needs_inputs_and_refuses_unsupported_positions"),
      ],
      "slab-protocol": [
        "flat_slab_on_columns_is_designed_from_the_plate_result",
      ],
    },
    observation:
      "JRC column B2 punching reconciles (u1, v_Ed, v_Rd,c, v_min, face stress, f_ywd,ef, s_r, A_sw, u_out, a_out) with two documented discrepancies; the plate reaction is the punching force; edge, corner and near-opening columns are unsupported, never estimated.",
  },
  {
    id: "M10-USER-JOURNEY",
    title: "Draw, mesh, solve, inspect and design in the browser",
    evidence: "ui_journey",
    tests: { "m10-browser": [ORACLE_JOURNEY, DESIGN_JOURNEY, COLUMNS_JOURNEY] },
    observation:
      "The panel solves to the oracle mesh, contours are inspected, code inputs entered and the run designs to PASS with meshes, map, checks, schedule and calculation record; columns from the model carry the slab to the frame.",
  },
  {
    id: "M10-FAILURE-PATHS",
    title: "Refusals keep the project",
    evidence: "failure_path",
    tests: {
      "plate-kernel": ["refusals", "point_supports_need_a_non_collinear_set"],
      "m10-browser": [REFUSAL_JOURNEY],
    },
    observation:
      "Unstable support sets, invalid openings and mesh limits are refused with the reason and leave the project unchanged.",
  },
  {
    id: "M10-PERSISTENCE",
    title: "Code inputs save and reopen",
    evidence: "save_and_reopen",
    tests: {
      "slab-model": ["code_inputs_are_validated_for_the_draft_kind"],
      "m10-browser": [DESIGN_JOURNEY],
    },
    observation:
      "Slab code inputs (structural system, partitions, column size) are validated per kind and persist in the downloaded project.",
  },
  {
    id: "M10-LEDGER",
    title: "Capability ledger",
    evidence: "capability_ledger",
    tests: { "m10-browser": [LEDGER_JOURNEY] },
    observation:
      "The ledger lists slab-plate-analysis with its demonstration label, limitations and UNKNOWN comparison.",
  },
];

const { rows, issues } = await evaluateCriteria(dir, build, criteria);

const sha = async (f) =>
  createHash("sha256")
    .update(await readFile(f))
    .digest("hex");
const plateOracle = JSON.parse(
  await readFile("fixtures/plate/plate-oracle.json", "utf8"),
);
const punching = await readFile(
  "fixtures/design/ec2-uk-na/jrc-punching-b2.published.json",
);
const generator = plateOracle.generator || plateOracle.oracle;
const recorded = plateOracle.generatorSha256 || plateOracle.oracleSha256;
const actual = generator ? await sha(generator) : null;
const ok = Boolean(generator) && actual === recorded;
const provenance = {
  id: "M10-ORACLE-PROVENANCE",
  title: "Plate oracle is the recorded script; JRC punching fixture pinned",
  evidence: "regression_results",
  observation: `${generator} sha256 ${actual} (recorded ${recorded}); jrc-punching-b2.published.json sha256 ${createHash("sha256").update(punching).digest("hex")}.`,
  status: ok ? "PASS" : "FAIL",
  missing: ok ? [] : ["plate oracle changed"],
};
if (!ok) issues.push(`${provenance.id}: plate oracle hash`);
rows.push(provenance);

const limitations =
  "ec2-uk-na slab design is a demonstration of EN 1992-1-1:2004 incl. AC:2008/AC:2010 with the UK NA incl. Amd 1 (2009); A1:2014 and NA+A2:2014 are not held and not reconciled, and no run is a certified design. Flat rectangular plate-v1 panels (one opening, uniform pressure, column supports); uniform meshes per layer; punching at internal columns only; no crack-width calculation, curtailment, trimming bars or frame–slab coupling beyond column loads. Commercial PROKON parity remains UNKNOWN.";

await record("m10-acceptance", {
  status: issues.length ? "FAIL" : "PASS",
  testCount: rows.length,
  testIds: rows.map((c) => c.id),
  command: ["node", "tools/record-m10-acceptance.mjs"],
  issues,
  criteria: rows,
  limitations,
});
const md = acceptanceMarkdown("M10", build, rows, issues, limitations);
await writeFile(`${dir}/ACCEPTANCE.md`, md);
console.log(md);
if (issues.length) process.exitCode = 1;
