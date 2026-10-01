#!/usr/bin/env node
/**
 * Record M08 parent acceptance against the current build. Each criterion of
 * SPECIFICATION.md M08 names the executed tests that prove it; a criterion
 * passes only when every named test is in a same-build PASS record.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { record, evidenceDir } from "./evidence.mjs";
import { acceptanceMarkdown, evaluateCriteria } from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M08/full";
process.env.WORKBENCH_TASK_ID ||= "M08-parent";
process.env.WORKBENCH_MILESTONE ||= "M08";

const dir = evidenceDir("evidence/M08/full");
await mkdir(dir, { recursive: true });
const build = JSON.parse(await readFile("dist/build.json", "utf8"));

const EC2_JOURNEY =
  "RC beam EC2 checks: demonstration profile at governing stations, code inputs, explicit anchorage, report";
const BEAM_JOURNEY =
  "Concrete preview rcBeam: source, stale, undo, persistence and export";
const MECHANICS_JOURNEY =
  "RC beam section mechanics: per-face oracle values, law switch, provenance, fit failure and reopen";
const UP =
  "RC beam model design moments beside mechanics capacities (top face points up)";
const DOWN =
  "RC beam model design moments beside mechanics capacities (top face points DOWN)";
const LEDGER_JOURNEY =
  "M06 capability ledger: View capabilities shows UNKNOWN parity and exclusions";
const ec2 = (t) => `profile::ec2uk::${t}`;

const criteria = [
  {
    id: "M08-PINNED-PROFILE",
    title: "One pinned concrete code profile, edition-labelled",
    evidence: "kernel_validation",
    tests: {
      "concrete-native": [
        ec2("verify::tests::committed_resources_verify"),
        ec2("verify::tests::a_missing_lock_hash_disables_the_profile"),
        "tests::ec2_profile_needs_an_rc_beam_description",
        ec2("fixture_tests::applicability_rejects_out_of_scope_members"),
      ],
      "concrete-protocol": ["rc_beam_ec2_profile_runs_at_governing_stations"],
      "m08-browser": [EC2_JOURNEY, LEDGER_JOURNEY],
    },
    observation:
      "ec2-uk-na is enabled only when the three locked resources carry SHA-256 hashes, the fixture manifest names them and the JRC reconciliation has no failures; removing a hash disables it. Every run, screen and report names EN 1992-1-1:2004 incl. AC:2008/AC:2010 with UK NA incl. Amd 1 (2009), lists A1:2014 and NA+A2:2014 as not reconciled, and says 'Demonstration, not a certified design'; the capability ledger says the same.",
  },
  {
    id: "M08-FLEXURE-BOUNDARIES",
    title: "Independent examples at under- and over-reinforced boundaries",
    evidence: "kernel_validation",
    tests: {
      "concrete-native": [
        "rc_section::tests::oracle_ultimate_and_elastic_cases",
        "rc_section::tests::balanced_boundary_brackets_classification",
        "ec2_block_in_kernel_reproduces_jrc_design_moments",
        ec2(
          "fixture_tests::support_b_hogging_flexure_matches_oracle_for_both_ndp_sets",
        ),
        ec2(
          "detailing_tests::flexure_crosses_the_balanced_boundary_by_the_closed_form",
        ),
        ec2("fixture_tests::reinforcement_limits_match_oracle"),
      ],
    },
    observation:
      "The section kernel matches the independent rc_section oracle on yielded, balanced-under, balanced-over and over-reinforced cases; the EC2 block reproduces the JRC design moments; the profile's M_Rd matches the oracle for both NDP sets and the closed forms either side of the balanced depth (steel yielding below, elastic above); As,min/As,max match the oracle.",
  },
  {
    id: "M08-SHEAR-BOUNDARIES",
    title: "Independent examples at shear boundaries",
    evidence: "kernel_validation",
    tests: {
      "concrete-native": [
        ec2(
          "fixture_tests::shear_with_links_matches_oracle_on_both_theta_branches",
        ),
        ec2(
          "fixture_tests::shear_without_links_uses_vrdc_and_published_jrc_value",
        ),
        ec2(
          "fixture_tests::unconfirmed_anchorage_excludes_asl_and_falls_to_vmin",
        ),
        ec2(
          "detailing_tests::uk_v_rd_max_cap_is_200_bw_squared_and_absent_from_the_eu_set",
        ),
      ],
      "concrete-protocol": [
        "rc_beam_ec2_preview_picks_the_largest_shear_station",
      ],
    },
    observation:
      "V_Rd,c reproduces the published JRC 47.90 kN and fails where links are needed; V_Rd with links matches the oracle on the cot θ = 2.5 clamp and the interior optimum; unanchored steel falls to v_min; the UK 200 bw² cap on V_Rd,max governs a thin deep web and is absent from the EU set; the largest |Vz| station is the one checked.",
  },
  {
    id: "M08-DETAILING-SERVICEABILITY",
    title: "Detailing and explicit serviceability limits",
    evidence: "kernel_validation",
    tests: {
      "concrete-native": [
        ec2(
          "detailing_tests::anchorage_lengths_reproduce_jrc_tables_4_1_2_to_4_1_4",
        ),
        ec2("detailing_tests::span_depth_reproduces_jrc_worked_values"),
        ec2(
          "detailing_tests::crack_tables_are_the_code_tables_with_the_conservative_row",
        ),
        ec2("detailing_tests::cover_and_spacing_follow_4_4_1_and_8_2"),
        ec2("detailing_tests::cracked_stress_matches_the_closed_form"),
        ec2(
          "detailing_tests::required_steel_matches_the_rectangular_block_closed_form",
        ),
        ec2("detailing_tests::a_fully_detailed_beam_passes_every_check"),
      ],
      "concrete-protocol": ["rc_beam_code_inputs_complete_the_ec2_run"],
    },
    observation:
      "Anchorage lengths reproduce 84 JRC table values within 1 mm; span/depth reproduces the JRC worked values; Tables 7.2N/7.3N are the code tables read at the next higher stress; cover and spacing match hand values; the cracked-section stress and A_s,req match closed forms; on model actions with the engineer's inputs the quasi-permanent moment is the case's own, w_max is the UK 0.3 mm and the deflection limit matches a hand calculation.",
  },
  {
    id: "M08-FIT",
    title: "The discrete arrangement fits cover and spacing",
    evidence: "kernel_validation",
    tests: {
      "concrete-native": [
        "rc_section::tests::oracle_row_fits",
        ec2("detailing_tests::cover_and_spacing_follow_4_4_1_and_8_2"),
      ],
      "concrete-protocol": [
        "rc_beam_proposal_passes_and_every_lighter_neighbour_fails",
      ],
      "m08-browser": [MECHANICS_JOURNEY],
    },
    observation:
      "Row fit matches the oracle and a row that does not fit stops the code checks; the EC2 cover and 8.2 spacing checks run on the bars' real positions, and every proposal passes them.",
  },
  {
    id: "M08-SIGNS",
    title: "Action signs preserve support and span faces",
    evidence: "kernel_validation",
    tests: {
      "concrete-native": [ec2("fixture_tests::sign_mapping_follows_adr_0014")],
      "concrete-protocol": [
        "rc_beam_model_demand_matches_closed_form_and_reports_face_orientation",
        "rc_beam_unequal_faces_give_distinct_sagging_and_hogging_matching_oracle",
      ],
      "m08-browser": [UP, DOWN],
    },
    observation:
      "B08 fixed-fixed gives qL²/24 sagging at midspan on the bottom face and qL²/12 hogging at the supports on the top face; reversing local y swaps the faces and is reported, never inferred.",
  },
  {
    id: "M08-PROPOSAL",
    title: "Validated reinforcement proposal from discrete enumeration",
    evidence: "ui_journey",
    tests: {
      "concrete-protocol": [
        "rc_beam_proposal_passes_and_every_lighter_neighbour_fails",
      ],
      "m08-browser": [EC2_JOURNEY],
    },
    observation:
      "The least-steel arrangement over Ø10–32 bars (2–8 per face) and Ø8–12 links at 75–300 mm passes every check; one fewer bar or the next smaller bar on either face, or the next wider link spacing, fails. In the browser the proposal is applied as one undoable command, re-analysed and rerun to PASS.",
  },
  {
    id: "M08-SCHEDULE",
    title: "Schedule counts and lengths match geometry",
    evidence: "exported_outcome",
    tests: {
      "concrete-protocol": ["rc_beam_schedule_is_indicative_and_hand_checked"],
      "m08-browser": [BEAM_JOURNEY],
    },
    observation:
      "Straight bars are the member length less cover + link at each end, links 2(A + B) + 2 max(5φ, 50 mm) at the draft spacing from 50 mm off each end, masses at 7850 kg/m³ — all equal to hand values; the CSV carries the same lengths and masses; an unbound draft has quantities only. Labelled indicative, not a fabrication schedule.",
  },
  {
    id: "M08-INCOMPLETE-NEVER-PASSES",
    title:
      "Unsupported anchorage or serviceability prevents a complete-design pass",
    evidence: "failure_path",
    tests: {
      "concrete-native": [
        ec2(
          "fixture_tests::out_of_scope_actions_are_unsupported_and_missing_inputs_indeterminate",
        ),
        ec2("detailing_tests::a_fully_detailed_beam_passes_every_check"),
      ],
      "concrete-protocol": [
        "rc_beam_ec2_profile_runs_at_governing_stations",
        "rc_beam_anchorage_confirmation_is_explicit_and_rc_only",
        "rc_beam_ec2_preview_is_unavailable_without_model_actions",
      ],
      "m08-browser": [EC2_JOURNEY, BEAM_JOURNEY],
    },
    observation:
      "Without the engineer's anchorage confirmation or code inputs the checks are INDETERMINATE and name what is missing, so the run is INDETERMINATE; out-of-scope actions are UNSUPPORTED; synthetic actions never produce a code result.",
  },
  {
    id: "M08-PERSISTENCE-EXPORT",
    title: "Save, reopen, migrate and export the calculation",
    evidence: "save_and_reopen",
    tests: {
      "concrete-model": [
        "a_1_6_project_migrates_by_version_only_and_cannot_carry_code_inputs",
        "code_inputs_round_trip_and_invalid_values_are_refused",
      ],
      "concrete-protocol": ["rc_beam_code_inputs_complete_the_ec2_run"],
      "m08-browser": [EC2_JOURNEY, BEAM_JOURNEY],
    },
    observation:
      "Schema 1.7.0 code inputs round-trip, invalid values and dangling combinations are refused, 1.6.0 files migrate by version and cannot carry them; the downloaded project keeps them; the HTML calculation record carries the demonstration banner and every check with exact SI values; the run record and schedule CSV download.",
  },
];

const { rows, issues } = await evaluateCriteria(dir, build, criteria);

const sha = async (f) =>
  createHash("sha256")
    .update(await readFile(f))
    .digest("hex");
const rec = JSON.parse(
  await readFile(
    "fixtures/design/ec2-uk-na/jrc-axis2-beam.reconciliation.json",
    "utf8",
  ),
);
const cases = JSON.parse(
  await readFile("fixtures/design/rc-section-mechanics/cases.json", "utf8"),
);
const ec2Oracle = await sha(rec.oracle);
const rcOracle = await sha(cases.oracle);
const ok =
  ec2Oracle === rec.oracleSha256 &&
  rcOracle === cases.oracleSha256 &&
  rec.failures.length === 0;
const provenance = {
  id: "M08-ORACLE-PROVENANCE",
  title: "Independent oracles are the recorded scripts",
  evidence: "regression_results",
  observation: `${rec.oracle} sha256 ${ec2Oracle} (recorded ${rec.oracleSha256}), ${rec.failures.length} reconciliation failures; ${cases.oracle} sha256 ${rcOracle} (recorded ${cases.oracleSha256}).`,
  status: ok ? "PASS" : "FAIL",
  missing: ok ? [] : ["oracle changed or reconciliation failures"],
};
if (!ok) issues.push(`${provenance.id}: oracle hash or reconciliation`);
rows.push(provenance);

const limitations =
  "ec2-uk-na is a demonstration of EN 1992-1-1:2004 incl. AC:2008/AC:2010 with the UK NA incl. Amd 1 (2009); EN 1992-1-1:2004/A1:2014 and UK NA + A2:2014 are not held and not reconciled, and no run is a certified design. Rectangular RC beams with vertical links at the governing key stations of one bound case or combination. Redistribution, direct crack-width and deflection calculation, stress limits, torsion, axial force, flanged sections, laps, curtailment and fck > 50 MPa are unsupported. The schedule is indicative (no BS 8666 shape codes). No UK-specific published beam example is held; UK NDP values are checked by the oracle and closed forms. Commercial PROKON parity remains UNKNOWN.";

await record("m08-acceptance", {
  status: issues.length ? "FAIL" : "PASS",
  testCount: rows.length,
  testIds: rows.map((c) => c.id),
  command: ["node", "tools/record-m08-acceptance.mjs"],
  issues,
  criteria: rows,
  limitations,
});
const md = acceptanceMarkdown("M08", build, rows, issues, limitations);
await writeFile(`${dir}/ACCEPTANCE.md`, md);
console.log(md);
if (issues.length) process.exitCode = 1;
