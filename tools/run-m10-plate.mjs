#!/usr/bin/env node
/**
 * Same-build M10 numerical-family gate (plate-v1, ADR 0021): kernel
 * validation against fixtures/plate/plate-oracle.json, protocol integration,
 * schema 1.5.0 migration and the slab browser journeys. The M10 parent stays
 * blocked on M08 (slab code profile); this gate never accepts it.
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

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M10/plate";
process.env.WORKBENCH_TASK_ID = "M10-PLATE";
process.env.WORKBENCH_MILESTONE = "M10";

const dir = evidenceDir("evidence/M10/plate");
await mkdir(dir, { recursive: true });
const build = await buildRecord();
await cargoRecord(dir, "plate-kernel", [
  "cargo",
  "test",
  "--locked",
  "--release",
  "-p",
  "workbench-plate",
]);
await cargoRecord(dir, "slab-protocol", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-wasm-api",
  "--test",
  "slab_plate",
  "--test",
  "preview_workspace",
]);
await cargoRecord(dir, "schema-1-5", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-model",
  "--test",
  "slab_plate",
  "--test",
  "mass_sources",
]);
await browserRecord(
  dir,
  "slab-browser",
  ["tests/e2e/slab-plate.spec.js", "tests/e2e/design-previews.spec.js"],
  { artifacts: ["playwright-results.json"] },
);

const criteria = [
  {
    id: "M10-P1-ELEMENT",
    title: "Element: patch tests and rigid-body modes",
    evidence: "kernel_validation",
    tests: {
      "plate-kernel": [
        "p_patch_membrane_and_bending",
        "p_rigid_six_zero_eigenvalues",
      ],
    },
    observation:
      "MacNeal–Harder distorted patch reproduces constant membrane strain and constant curvature (zero transverse shear) to 1e-10; rectangular and distorted single elements have exactly six zero eigenvalues and no negative ones.",
  },
  {
    id: "M10-P2-NAVIER",
    title: "Hard simply supported plates against Mindlin Navier series",
    evidence: "kernel_validation",
    tests: { "plate-kernel": ["p_ss_navier_convergence"] },
    observation:
      "Thin, thick and rectangular panels: 32 × 32 centre w ≤ 3.5e-4 and element-centre mx, my ≤ 7.3e-4 (gates 2e-3, 5e-3), falling 8 → 16 → 32 at O(h²); no shear locking at a/t = 300 (16 × 16 w 1.3e-3, gate 2e-2).",
  },
  {
    id: "M10-P3-CLAMPED",
    title: "Clamped square against Timoshenko & Woinowsky-Krieger Table 35",
    evidence: "kernel_validation",
    tests: { "plate-kernel": ["p_cl_timoshenko"] },
    observation:
      "32 × 32: w 0.001271 (0.00126), centre mx 0.02286 (0.0231), edge-mid line moment from reactions −0.05122 (−0.0513), all within 2 %; the four clamped edges agree by symmetry to 1e-9.",
  },
  {
    id: "M10-P4-OPENSEES",
    title: "OpenSees ShellMITC4 on identical meshes",
    evidence: "kernel_validation",
    tests: {
      "plate-kernel": [
        "p_cl_opensees_identical_mesh",
        "p_open_opensees_identical_mesh",
        "p_distort_navier_and_opensees",
      ],
    },
    observation:
      "Clamped 16 × 16 and the 6 × 5 m panel with a 1 × 1 m opening (464 elements): nodal w and element-centre mx, my, mxy within 1e-6. Checkerboard-distorted meshes (no parallelogram cells): Navier w error 2.1e-2 → 6.6e-3 → 1.8e-3 (gate 1e-2 at 32) and the difference from OpenSees falls 9.7e-4 → 6.6e-4 → 5.4e-4 (gate 1e-3). The two use different published MITC4 shear transformations off parallelograms (ADR 0021).",
  },
  {
    id: "M10-P5-EQUILIBRIUM",
    title: "Equilibrium, refusals and the convergence indicator",
    evidence: "failure_path",
    tests: {
      "plate-kernel": [
        "p_balance_mixed_edges_and_target_mesh",
        "refusals",
        "convergence_indicator_falls_with_refinement",
        "convergence_indicator_exposes_reentrant_corners",
        "wood_armer_cases",
      ],
      "slab-protocol": ["refusals_leave_the_project_unchanged"],
    },
    observation:
      "Reactions balance the pressure resultant to 1e-9 with mixed edges and an opening. Only-free edges or a single simple edge are UNSTABLE_MODEL, meshes over 40 000 cells are MEMORY_LIMIT, and invalid material or load is INVALID_SETTINGS or INVALID_SCHEMA, each leaving the project unchanged. The convergence indicator falls on smooth panels and stays above 5 % at re-entrant opening corners. Wood–Armer handles its corrected branches.",
  },
  {
    id: "M10-P6-PROTOCOL",
    title: "Slab drafts solve their panel through the protocol",
    evidence: "kernel_validation",
    tests: {
      "slab-protocol": [
        "plate_source_reproduces_the_opening_oracle",
        "clamped_edges_report_line_moments",
        "new_slab_drafts_carry_synthetic_plate_inputs",
        "preview_all_families_persist_and_never_claim_compliance",
      ],
    },
    observation:
      "The kernel's evaluateDesignPreview with sourceMode plate reproduces P-OPEN-OS to 1e-6 and is deterministic. Wood–Armer governing values equal the field maxima. Every slab code check stays UNSUPPORTED and overall stays unsupported.",
  },
  {
    id: "M10-P7-SCHEMA",
    title: "Schema 1.5.0 and migration",
    evidence: "save_and_reopen",
    tests: {
      "schema-1-5": [
        "plate_inputs_round_trip",
        "plate_inputs_are_validated",
        "a_1_4_project_migrates_by_version_only",
        "a_1_3_project_migrates_by_version_only",
      ],
      "slab-protocol": ["migrated_slab_drafts_are_not_configured"],
    },
    observation:
      "Plate inputs round-trip with per-field provenance, invalid or out-of-panel values are INVALID_SCHEMA, and 1.4.0 projects migrate by version only with unconfigured slabs. A 1.4.0 file carrying plate inputs is refused.",
  },
  {
    id: "M10-P8-BROWSER",
    title: "Browser journey on the same build",
    evidence: "ui_journey",
    tests: {
      "slab-browser": [
        "Slab plate analysis reproduces the opening oracle, shows contours and persists",
        "Slab plate refusals keep the project and explain the reason",
        "Concrete preview slab: source, stale, undo, persistence and export",
      ],
    },
    observation:
      "In the browser build, the P-OPEN-OS panel reproduces the oracle to 1e-6 from the downloaded run record. The browser test switches the contours through mx, my, Top X, Bottom Y and w. Edits make the run STALE, and clamped edges show line moments. The project downloads and reopens with its plate inputs. A mechanism and an invalid Poisson's ratio are refused with their reasons shown.",
  },
];
const { rows, issues } = await evaluateCriteria(dir, build, criteria);
const limitations =
  "plate-v1 mechanics only: flat rectangular panels with one rectangular opening, uniform pressure, linear elastic isotropic material, free/simple/clamped edges, no frame–slab coupling, column supports, cracking or long-term effects. Reinforcement areas, punching, detailing and deflection limits need the slab code profile (M08 resources) and stay UNSUPPORTED; the M10 parent is not accepted.";
await record("m10-plate-acceptance", {
  status: issues.length ? "FAIL" : "PASS",
  testCount: rows.length,
  testIds: rows.map((r) => r.id),
  command: ["node", "tools/run-m10-plate.mjs"],
  issues,
  criteria: rows,
  limitations,
});
await writeFile(
  `${dir}/ACCEPTANCE.md`,
  acceptanceMarkdown("M10-PLATE", build, rows, issues, limitations),
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
