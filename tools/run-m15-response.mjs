#!/usr/bin/env node
/**
 * Same-build M15 numerical-family gate (response-v1, ADR 0023): complex
 * factorisation, harmonic and response-spectrum kernel against
 * fixtures/dynamics/response-oracle.json, protocol, schema 1.6.0 and the
 * browser journeys. The M15 parent stays blocked on R-SEISMIC-CODE (code
 * spectra and seismic combination rules); this gate never accepts it.
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

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M15/response-gate";
process.env.WORKBENCH_TASK_ID = "M15-RESPONSE";
process.env.WORKBENCH_MILESTONE = "M15";

const dir = evidenceDir("evidence/M15/response-gate");
await mkdir(dir, { recursive: true });
const build = await buildRecord();
await cargoRecord(dir, "complex-factor", [
  "cargo",
  "test",
  "--locked",
  "--release",
  "-p",
  "workbench-solver",
  "--test",
  "complex",
]);
await cargoRecord(dir, "response-kernel", [
  "cargo",
  "test",
  "--locked",
  "--release",
  "-p",
  "workbench-assembly",
  "--test",
  "response",
  "--test",
  "modal",
  "--test",
  "second_order",
]);
await cargoRecord(dir, "response-protocol", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-wasm-api",
  "--test",
  "response",
]);
await cargoRecord(dir, "schema-1-6", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-model",
  "--test",
  "mass_sources",
  "--test",
  "slab_plate",
]);
await browserRecord(
  dir,
  "response-browser",
  ["tests/e2e/response.spec.js", "tests/e2e/modal.spec.js"],
  { artifacts: ["playwright-results.json"] },
);

const criteria = [
  {
    id: "M15-R1-FACTOR",
    title: "Sparse complex-symmetric LDLᵀ",
    evidence: "kernel_validation",
    tests: {
      "complex-factor": [
        "damped_pencil_matches_dense_elimination_across_resonance",
        "a_real_pencil_agrees_with_the_real_sparse_factor",
        "stiffness_proportional_damping_keeps_resonance_factorisable",
        "a_singular_stiffness_is_refused_and_the_budget_is_enforced",
      ],
    },
    observation:
      "Against dense complex elimination the factor agrees to 1e-11 of the solution scale at six frequencies across resonance, with residuals ≤ 1e-12. A real pencil reproduces the real sparse LDLᵀ to 1e-12. With a stiffness-proportional term the undamped singular point factorises. A singular stiffness is UNSTABLE_MODEL, and the memory budget is enforced.",
  },
  {
    id: "M15-R2-HARMONIC",
    title: "Harmonic response against closed forms and OpenSees",
    evidence: "kernel_validation",
    tests: {
      "response-kernel": [
        "h_sdof_matches_the_closed_form_through_resonance",
        "h_static_limit_is_the_linear_static_solution",
        "h_frame_matches_the_opensees_matrices_direct_solve",
      ],
    },
    observation:
      "The tip-mass cantilever matches U = F/(k(1+iΩa₁) − mΩ² + iΩa₀m) to 1e-9 at seven frequencies including resonance, with consistent and lumped mass, and its support reaction carries the elastic and damping force. At 1e-9 Hz it equals linear static to 1e-8. On the OpenSees spatial frame, with K and M from GimmeMCK, complex nodal amplitudes at five frequencies agree to 1e-6 of the peak.",
  },
  {
    id: "M15-R3-SPECTRUM",
    title: "Response-spectrum analysis against closed forms and OpenSees",
    evidence: "kernel_validation",
    tests: {
      "response-kernel": [
        "r_sdof_matches_the_closed_form",
        "r_shear_frame_matches_srss_and_cqc_by_hand",
        "r_frame_matches_opensees_modal_combination",
      ],
    },
    observation:
      "SDOF: tip displacement Sa/ω², base shear m·Sa and base moment m·Sa·L to 1e-9. Two-storey shear frame: SRSS and CQC floor displacements and base shear by hand to 1e-5. OpenSees spatial frame, X and Y, SRSS and CQC over 12 modes: member end forces (setNodeDisp + localForce), support reactions, node displacements and base reaction all to 1e-6 of each group's largest value.",
  },
  {
    id: "M15-R4-REFUSALS",
    title: "Refusals and spectra validation",
    evidence: "failure_path",
    tests: {
      "response-kernel": ["refusals", "spectra_are_validated_as_project_data"],
      "response-protocol": ["requests_are_validated"],
      "response-browser": [
        "M15 response refusals: a spectrum too short for the modes and invalid tables",
      ],
    },
    observation:
      "Refusals: a₁ = 0, non-positive or excess frequencies and reversed damping frequencies are INVALID_SETTINGS. Unknown cases and unloaded cases are INVALID_LOAD, and no mass is NO_MASS. Unknown spectra are DANGLING_REFERENCE, and a spectrum shorter than a mode period is SPECTRUM_RANGE. Tables that do not start at T = 0, are unordered or have negative Sa are INVALID_SPECTRUM. The browser shows each reason and reports no numbers.",
  },
  {
    id: "M15-R5-PROTOCOL",
    title: "Protocol, schema 1.6.0 and persistence",
    evidence: "save_and_reopen",
    tests: {
      "response-protocol": [
        "spectra_are_project_data_edited_by_command",
        "harmonic_and_spectrum_run_through_analyse",
      ],
      "schema-1-6": [
        "a_1_3_project_migrates_by_version_only",
        "a_1_4_project_migrates_by_version_only",
      ],
    },
    observation:
      "SetResponseSpectrum stores SI (g converted in Rust) with an rs label; invalid tables leave the project unchanged. A log sweep is expanded in Rust. A flat spectrum gives base shear m·Sa through analyse. 1.3/1.4/1.5 projects migrate by version to 1.6.0.",
  },
  {
    id: "M15-R6-BROWSER",
    title: "Browser journey, report and persistence on the same build",
    evidence: "ui_journey",
    tests: {
      "response-browser": [
        "M15 response: harmonic sweep and spectrum against the closed forms, stale, report and persistence",
      ],
    },
    observation:
      "In the browser build, a 41-frequency sweep of the tip-mass cantilever matches the closed form |U| to 1e-9 at every frequency. The spectrum entered in the editor gives the closed-form base shear to 1e-9, and the report carries the same value in data-si. A new name keeps the result current; a new damping ratio makes it stale. The project downloads and reopens with its spectrum.",
  },
  {
    id: "M15-R7-REGRESSION",
    title: "Modal analysis and second order unchanged",
    evidence: "regression_results",
    tests: {
      "response-kernel": [
        "spatial_frame_matches_opensees_with_lumped_mass",
        "planar_portal_matches_opensees_with_consistent_mass",
        "member_loads_at_supports_and_released_ends_match_linear_static",
      ],
      "response-browser": [
        "M14 modal: declare mass, frequencies against the oracle, participation, stale, failure, reopen and report",
      ],
    },
    observation:
      "Modal analysis now builds through the shared dynamic model and still matches OpenSees to 1e-6. The second-order fix passes for member loads at supports and released ends: previously EQUILIBRIUM_FAILURE; now equal to linear static without axial force.",
  },
];
const { rows, issues } = await evaluateCriteria(dir, build, criteria);
const limitations =
  "response-v1 mechanics only: linear elastic frames with declared mass, Rayleigh damping (a₁ > 0) for steady-state harmonic response of one load case (displacements and reactions, no member actions), and modal SRSS/CQC combination of a user spectrum in one direction (peak magnitudes, no missing-mass correction). Code spectra, behaviour factors, accidental torsion and directional combination need R-SEISMIC-CODE; the M15 parent is not accepted.";
await record("m15-response-acceptance", {
  status: issues.length ? "FAIL" : "PASS",
  testCount: rows.length,
  testIds: rows.map((r) => r.id),
  command: ["node", "tools/run-m15-response.mjs"],
  issues,
  criteria: rows,
  limitations,
});
await writeFile(
  `${dir}/ACCEPTANCE.md`,
  acceptanceMarkdown("M15-RESPONSE", build, rows, issues, limitations),
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
