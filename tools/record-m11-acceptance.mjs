#!/usr/bin/env node
/**
 * Record M11 parent acceptance against the current build. Each criterion of
 * SPECIFICATION.md M11 names the executed tests that prove it; a criterion
 * passes only when every named test is in a same-build PASS record.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { record, evidenceDir } from "./evidence.mjs";
import { acceptanceMarkdown, evaluateCriteria } from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M11/full";
process.env.WORKBENCH_TASK_ID ||= "M11-parent";
process.env.WORKBENCH_MILESTONE ||= "M11";

const dir = evidenceDir("evidence/M11/full");
await mkdir(dir, { recursive: true });
const build = JSON.parse(await readFile("dist/build.json", "utf8"));

const FOOTING_JOURNEY =
  "Pad footing: contact, bearing, EC2 design, schedule, report and persistence";
const GENERIC_JOURNEY =
  "Concrete preview padFooting: source, stale, undo, persistence and export";
const LAYOUT_JOURNEY =
  "Mockup layout padFooting: 3D focus, drawings, details, source and preserved model";
const LEDGER_JOURNEY =
  "M06 capability ledger: View capabilities shows UNKNOWN parity and exclusions";
const ft = (t) => `profile::ec2uk::footing_tests::${t}`;

const criteria = [
  {
    id: "M11-CONTACT-ANALYTICAL",
    title: "Centred and eccentric analytical pressure checks",
    evidence: "kernel_validation",
    tests: {
      "footing-native": [
        ft("polygon_moments_are_exact_for_a_rectangle"),
        ft("contact_matches_the_independent_oracle"),
      ],
    },
    observation:
      "Centred, in-kern, kern-edge and uniaxial partial contact reproduce the closed forms to 1e-12 (the triangle q_max = 2N/(3Bc) over 3c); biaxial in-kern and partial contact match the oracle's independent strip-integration search; every solved plane is in equilibrium to 1e-12.",
  },
  {
    id: "M11-UPLIFT-DOMAIN",
    title:
      "Uplift and out-of-domain handling; tension never treated as contact",
    evidence: "failure_path",
    tests: {
      "footing-native": [
        ft("contact_refuses_uplift_and_a_resultant_off_the_base"),
        ft("eccentric_pad_partial_contact_and_refusals"),
      ],
      "footing-protocol": [
        "preview_model_sources_are_exact_and_stale_or_forged_results_rejected",
      ],
      "m11-browser": [GENERIC_JOURNEY],
    },
    observation:
      "No downward force and a resultant on or off the base edge are refused with their reason and fail the design; a resultant outside the kern gives partial contact on a tensionless plane, never negative pressure; B04's lateral reaction (no vertical force) reports noEquilibrium and FAIL in the browser.",
  },
  {
    id: "M11-REACTION-PROVENANCE",
    title: "Exact reaction provenance",
    evidence: "kernel_validation",
    tests: {
      "footing-protocol": [
        "preview_model_sources_are_exact_and_stale_or_forged_results_rejected",
        "pad_footing_designs_on_a_support_reaction",
      ],
      "m11-browser": [FOOTING_JOURNEY],
    },
    observation:
      "The foundation actions are the exact simultaneous support reaction reversed (bit-for-bit), bound to the current result; forged or stale results are refused; on B08 the footing carries N = 30 kN and |M| = 30 kN m (q L/2, q L²/12).",
  },
  {
    id: "M11-STRUCTURAL-EXAMPLES",
    title: "Independent structural design examples",
    evidence: "kernel_validation",
    tests: {
      "footing-native": [
        ft("jrc_footing_b2_tie_force_and_anchorage"),
        ft("concentric_pad_by_hand"),
        ft("a_thin_base_fails_punching_or_shear"),
        "profile::ec2uk::detailing_tests::anchorage_lengths_reproduce_jrc_tables_4_1_2_to_4_1_4",
      ],
    },
    observation:
      "JRC footing B-2 (9.8.2.2): F_s,max 1457.9 kN, A_s 3353 mm², F_s(h/2) 1071.0 kN and l_b 360 mm reproduce from the report's own σ'_Ed and z_i, with its self-weight deduction and rounded anchorage comparison documented; a concentric pad matches hand values for face moment, tie force, shear at d, punching v_Ed at the critical perimeter and bearing; a thin base fails.",
  },
  {
    id: "M11-BEARING",
    title: "Bearing against the engineer's allowable pressure",
    evidence: "kernel_validation",
    tests: {
      "footing-native": [
        ft("concentric_pad_by_hand"),
        ft("eccentric_pad_partial_contact_and_refusals"),
      ],
      "footing-protocol": ["pad_footing_designs_on_a_support_reaction"],
    },
    observation:
      "q_max under the engineer's bearing case or combination, including the base self-weight (25 kN/m³) and overburden, is compared with the allowable input; without a bearing combination the check is INDETERMINATE.",
  },
  {
    id: "M11-DETAIL-SCHEDULE",
    title: "Reinforcement details and schedule",
    evidence: "exported_outcome",
    tests: {
      "footing-protocol": ["pad_footing_designs_on_a_support_reaction"],
      "m11-browser": [FOOTING_JOURNEY],
    },
    observation:
      "Bottom bars sized in both directions (lower x layer, y on top) for bending, the 9.8.2.2 tie force and A_s,min within the spacing limits and anchoring straight; the schedule lists X1/Y1 straight bars of the base less cover with counts and masses; the CSV and calculation record carry them.",
  },
  {
    id: "M11-USER-JOURNEY",
    title: "Transfer a reaction, assess contact, design and export",
    evidence: "ui_journey",
    tests: { "m11-browser": [FOOTING_JOURNEY, LAYOUT_JOURNEY] },
    observation:
      "Bind a support, run on model actions (contact solved and drawn before code inputs), enter the code inputs, rerun to PASS, inspect the EC2 checks and the contact plan, download the run, the schedule CSV and the calculation record.",
  },
  {
    id: "M11-PERSISTENCE",
    title: "Footing code inputs save and reopen",
    evidence: "save_and_reopen",
    tests: {
      "footing-model": [
        "footing_code_inputs_apply_only_to_footings_and_reference_a_combination",
        "code_inputs_are_validated_for_the_draft_kind",
      ],
      "m11-browser": [FOOTING_JOURNEY],
    },
    observation:
      "castOnBlinding and bearingCombinationId are kept for footings, refused on other kinds and the combination must exist; the downloaded project keeps them.",
  },
  {
    id: "M11-LEDGER",
    title: "Capability ledger",
    evidence: "capability_ledger",
    tests: { "m11-browser": [LEDGER_JOURNEY] },
    observation:
      "The capability ledger lists pad-footing with its demonstration label, limitations and UNKNOWN comparison.",
  },
];

const { rows, issues } = await evaluateCriteria(dir, build, criteria);

const sha = async (f) =>
  createHash("sha256")
    .update(await readFile(f))
    .digest("hex");
const rec = JSON.parse(
  await readFile(
    "fixtures/design/ec2-uk-na/footing.reconciliation.json",
    "utf8",
  ),
);
const oracleSha = await sha(rec.oracle);
const ok = oracleSha === rec.oracleSha256 && rec.failures.length === 0;
const provenance = {
  id: "M11-ORACLE-PROVENANCE",
  title: "Independent footing oracle is the recorded script",
  evidence: "regression_results",
  observation: `${rec.oracle} sha256 ${oracleSha} (recorded ${rec.oracleSha256}); ${rec.contact.length} contact cases; ${rec.failures.length} failures.`,
  status: ok ? "PASS" : "FAIL",
  missing: ok ? [] : ["oracle changed or failures"],
};
if (!ok) issues.push(`${provenance.id}: oracle hash or failures`);
rows.push(provenance);

const limitations =
  "ec2-uk-na pad footing design is a demonstration of EN 1992-1-1:2004 incl. AC:2008/AC:2010 with the UK NA incl. Amd 1 (2009); A1:2014 and NA+A2:2014 are not held and not reconciled, and no run is a certified design. Rectangular pads with a concentric column on a rigid base over linear tensionless ground; the allowable bearing pressure is the engineer's input and no ground resistance or settlement is computed (EN 1997 not held). Eccentric columns, stepped bases, uplift top steel, punching reinforcement, pile caps and combined footings are unsupported. Commercial-solver parity remains UNKNOWN.";

await record("m11-acceptance", {
  status: issues.length ? "FAIL" : "PASS",
  testCount: rows.length,
  testIds: rows.map((c) => c.id),
  command: ["node", "tools/record-m11-acceptance.mjs"],
  issues,
  criteria: rows,
  limitations,
});
const md = acceptanceMarkdown("M11", build, rows, issues, limitations);
await writeFile(`${dir}/ACCEPTANCE.md`, md);
console.log(md);
if (issues.length) process.exitCode = 1;
