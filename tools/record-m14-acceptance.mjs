#!/usr/bin/env node
/**
 * Record M14 parent acceptance against the current build. Each criterion of
 * SPECIFICATION.md M14 names the executed tests that prove it; a criterion
 * passes only when every named test is in a same-build PASS record.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { record, evidenceDir } from "./evidence.mjs";
import { acceptanceMarkdown, evaluateCriteria } from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M14/full";
process.env.WORKBENCH_TASK_ID ||= "M14-parent";
process.env.WORKBENCH_MILESTONE ||= "M14";

const dir = evidenceDir("evidence/M14/full");
await mkdir(dir, { recursive: true });
const build = JSON.parse(await readFile("dist/build.json", "utf8"));

const JOURNEY =
  "M14 modal: declare mass, frequencies against the oracle, participation, stale, failure, reopen and report";

const criteria = [
  {
    id: "M14-SDOF-CANTILEVER",
    title: "SDOF and cantilever frequencies",
    evidence: "kernel_validation",
    tests: {
      "modal-native": [
        "a_tip_mass_on_a_massless_cantilever_is_the_sdof_closed_form",
        "cantilever_bending_and_torsion_converge_from_above_to_the_closed_forms",
        "simply_supported_beam_matches_n_pi_squared",
        "axial_bar_converges_at_second_order_to_the_quarter_wave_closed_form",
      ],
      "modal-protocol": [
        "SetMassSource with a dimensioned mass gives the SDOF closed form",
      ],
    },
    observation:
      "Tip mass on a massless cantilever matches √(3EI/mL³) per plane and √(EA/mL) to 1e-9 with both mass matrices; cantilever bending (both planes, modes 1–3) and torsion converge from above to within 1e-4/1e-3 at 16 elements; simply supported (nπ)² and quarter-wave axial modes (second-order convergence) match.",
  },
  {
    id: "M14-MASS-MATRIX",
    title: "Documented element mass matrices and generalised eigen solve",
    evidence: "kernel_validation",
    tests: {
      "modal-native": [
        "both_matrices_are_symmetric",
        "a_rigid_translation_carries_the_whole_member_mass_in_every_direction",
        "a_rigid_twist_carries_the_polar_mass_only_in_the_consistent_matrix",
        "a_rigid_rotation_about_the_midpoint_is_exact_in_both_bending_planes",
        "a_fixed_fixed_spring_mass_chain_has_the_closed_form_frequencies",
        "massless_directions_are_never_reported",
      ],
    },
    observation:
      "Consistent and lumped matrices reproduce the exact kinetic energy of rigid motions in both bending planes; K φ = ω² M φ by the stability-v1 subspace iteration with a Sturm count matches a spring–mass chain to 1e-10 and never reports massless directions.",
  },
  {
    id: "M14-MASS-SCALING",
    title: "Mass scaling",
    evidence: "kernel_validation",
    tests: {
      "modal-native": ["scaling_every_mass_by_four_halves_every_frequency"],
    },
    observation:
      "Scaling every mass by 4 halves every frequency to 1e-12 and leaves every participation ratio unchanged, for both mass matrices.",
  },
  {
    id: "M14-ORTHOGONALITY",
    title: "Mode orthogonality",
    evidence: "kernel_validation",
    tests: {
      "modal-native": ["spatial_frame_matches_opensees_with_lumped_mass"],
    },
    observation:
      "ΦᵀMΦ = I and ΦᵀKΦ = Ω² to 1e-8 with per-mode residuals ≤ 1e-8 and a Sturm count equal to the modes below the shift; every result records both orthogonality measures.",
  },
  {
    id: "M14-EFFECTIVE-MASS",
    title: "Effective mass accounting, omitted modes and targets",
    evidence: "kernel_validation",
    tests: {
      "modal-native": [
        "every_mode_together_accounts_for_all_participating_mass",
        "a_short_extraction_reports_the_omitted_mass_and_the_unmet_target",
      ],
      "m14-browser": [JOURNEY],
    },
    observation:
      "All modes together hold all participating mass to 1e-10 in X and Z; a short extraction reports the omitted ratio and PARTICIPATION_TARGET_NOT_MET per direction; the panel and vibration report state per direction whether the target is achieved.",
  },
  {
    id: "M14-FRAME-BENCHMARK",
    title: "Independent frame benchmarks",
    evidence: "kernel_validation",
    tests: {
      "modal-native": [
        "two_storey_shear_frame_matches_the_closed_form",
        "spatial_frame_matches_opensees_with_lumped_mass",
        "planar_portal_matches_opensees_with_consistent_mass",
      ],
      "m14-browser": [JOURNEY],
    },
    observation:
      "Two-storey shear frame within 1e-5 of the closed form; spatial two-storey frame (lumped, 6 modes) and planar portal (consistent, 4 modes) within 1e-6 of OpenSeesPy 3.4.0, natively and for the portal in the browser.",
  },
  {
    id: "M14-MASS-SOURCES",
    title: "Declared mass sources and deduplication",
    evidence: "save_and_reopen",
    tests: {
      "modal-native": [
        "declared_sources_round_trip_and_get_ms_labels",
        "mass_enters_the_model_hash_and_absence_is_not_written",
        "invalid_duplicate_or_dangling_sources_are_refused",
        "a_1_3_project_migrates_by_version_only",
        "load_case_mass_converts_gravity_loads_and_deduplicates_self_weight",
        "settings_and_mass_enter_the_result_identity",
      ],
      "modal-protocol": [
        "a legacy import migrates to 1.4.0 with no mass, and modal refuses to run",
        "malformed or ambiguous modal requests and sources are refused",
      ],
      "m14-browser": [JOURNEY],
    },
    observation:
      "Schema 1.4.0 mass sources (self mass, load-case gravity loads ÷ g, nodal masses) with one self mass, one source per case and one mass per node; self-weight inside a case is deduplicated and reported; mass enters the model hash; 1.3.0 projects migrate by version; sources persist through save and reopen.",
  },
  {
    id: "M14-FAILURE-PATHS",
    title: "Rigid modes, releases, no mass and negative mass are refused",
    evidence: "failure_path",
    tests: {
      "modal-native": ["unsupported_or_meaningless_requests_are_refused"],
      "modal-protocol": ["negative mass fails with its reason and no payload"],
      "m14-browser": [JOURNEY],
    },
    observation:
      "A mechanism is UNSTABLE_MODEL (rigid modes never reported as zero), releases MODAL_RELEASES_UNSUPPORTED, no mass NO_MASS, uplift as mass NEGATIVE_MASS; failures carry no payload and the UI shows no frequencies.",
  },
  {
    id: "M14-UI-JOURNEY",
    title: "Define mass, obtain modes and export a vibration report",
    evidence: "ui_journey, exported_outcome",
    tests: { "m14-browser": [JOURNEY] },
    observation:
      "Mass declared in the entity editor; frequencies, periods, effective-mass ratios and drawn mode shapes; stale on mass edit and current after undo; vibration report (HTML, exact SI) and run JSON; reopened project reruns bit-identically.",
  },
  {
    id: "M14-NOT-A-VERDICT",
    title: "Frequencies are not a serviceability verdict",
    evidence: "capability_ledger",
    tests: {
      "modal-protocol": [
        "capabilities advertise modal analysis and schema 1.4.0",
        "capabilities.json publishes UNKNOWN parity and SPEC exclusions",
      ],
      "m14-browser": [
        JOURNEY,
        "M06 capability ledger: View capabilities shows UNKNOWN parity and exclusions",
      ],
    },
    observation:
      "Panel, legend, vibration report, protocol and ledger state undamped free vibration only, not a floor-vibration, comfort or code serviceability check; response spectrum, time-history and harmonic analysis are excluded (M15).",
  },
];

const { rows, issues } = await evaluateCriteria(dir, build, criteria);

const oracle = JSON.parse(
  await readFile("fixtures/dynamics/modal-oracle.json", "utf8"),
);
const generator = createHash("sha256")
  .update(await readFile(oracle.generator))
  .digest("hex");
const provenance = {
  id: "M14-ORACLE-PROVENANCE",
  title: "Independent oracle generated by the recorded script",
  evidence: "regression_results",
  observation: `${oracle.generator} sha256 ${generator}; recorded ${oracle.generatorSha256}; OpenSees ${oracle.opensees.version} cross-check; internal checks ${oracle.failures.length ? "FAILED" : "passed"}.`,
  status:
    generator === oracle.generatorSha256 && !oracle.failures.length
      ? "PASS"
      : "FAIL",
  missing: generator === oracle.generatorSha256 ? [] : ["generator changed"],
};
if (provenance.status !== "PASS")
  issues.push(`${provenance.id}: generator hash or internal checks`);
rows.push(provenance);

const limitations =
  "dynamics-v1 is undamped free vibration of the elastic Euler–Bernoulli model about its unstressed geometry with declared mass, translational participation only, no rotary inertia, no member end releases and no rigid-body modes. Frequencies are not a floor-vibration or code serviceability verdict; response spectra, time history and harmonic response are M15. Commercial PROKON parity remains UNKNOWN.";

await record("m14-acceptance", {
  status: issues.length ? "FAIL" : "PASS",
  testCount: rows.length,
  testIds: rows.map((c) => c.id),
  command: ["node", "tools/record-m14-acceptance.mjs"],
  issues,
  criteria: rows,
  limitations,
});
const md = acceptanceMarkdown("M14", build, rows, issues, limitations);
await writeFile(`${dir}/ACCEPTANCE.md`, md);
console.log(md);
if (issues.length) process.exitCode = 1;
