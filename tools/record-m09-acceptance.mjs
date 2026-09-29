#!/usr/bin/env node
/**
 * Record M09 parent acceptance against the current build. Each criterion of
 * SPECIFICATION.md M09 names the executed tests that prove it; a criterion
 * passes only when every named test is in a same-build PASS record.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { record, evidenceDir } from "./evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M09/full";
process.env.WORKBENCH_TASK_ID ||= "M09-parent";
process.env.WORKBENCH_MILESTONE ||= "M09";

const dir = evidenceDir("evidence/M09/full");
await mkdir(dir, { recursive: true });
const build = JSON.parse(await readFile("dist/build.json", "utf8"));

const JOURNEY =
  "M09 stability: buckling modes, first- vs second-order sway, over-critical failure, stale and record";

const criteria = [
  {
    id: "M09-EULER",
    title: "Euler-column analytical loads and mesh refinement",
    evidence: "kernel_validation",
    tests: {
      "stability-native": [
        "euler_struts_converge_from_above_to_the_closed_form",
        "both_bending_planes_appear_with_their_own_loads_and_shapes",
        "chain_with_uniform_compression_matches_the_closed_form",
      ],
    },
    observation:
      "Four end conditions in both bending planes within 1e-4 of π²EI/(KL)² at 16 elements; refinement 1→16 decreases monotonically from above with 8→16 error ratio ≥ 8.",
  },
  {
    id: "M09-PDELTA-PORTAL",
    title: "Independent P-Δ portal reference",
    evidence: "kernel_validation",
    tests: {
      "stability-native": [
        "portal_sway_buckling_matches_the_characteristic_equation",
        "portal_p_delta_matches_the_exact_beam_column_solution",
        "column_moments_follow_the_exact_p_delta_shape",
        "equilibrium_holds_in_the_deformed_geometry",
        "the_first_order_record_is_the_linear_response_to_the_same_loads",
      ],
      "stability-protocol": [
        "elasticBuckling returns the portal sway factor with disclosures",
        "secondOrder reproduces the exact P-Delta sway and records convergence",
      ],
      "m09-browser": [JOURNEY],
    },
    observation:
      "Portal sway factor and P-Δ sway at 0.2/0.5/0.8 Pcr match the exact beam-column oracle (fixtures/stability/stability-oracle.json, OpenSees cross-check) natively, through WASM and in the browser.",
  },
  {
    id: "M09-SIGN-NORMALISATION",
    title: "Sign/load reversal; eigenvector sign and normalisation",
    evidence: "kernel_validation",
    tests: {
      "stability-native": [
        "reversing_the_reference_load_negates_the_spectrum",
        "a_strut_in_tension_has_no_critical_factor",
        "mode_shapes_are_normalised_to_a_unit_positive_peak",
        "tension_only_has_no_positive_factor_and_reports_the_reversal",
      ],
    },
    observation:
      "Reversing the reference load negates the spectrum; negative factors are never critical; shapes are normalised to a unit positive peak and compared by MAC, so eigenvector sign cannot affect comparison.",
  },
  {
    id: "M09-NONCONVERGENCE",
    title: "Near-critical and nonconvergent cases",
    evidence: "failure_path",
    tests: {
      "stability-native": [
        "near_critical_portal_converges_with_large_amplification",
        "over_critical_portal_fails_without_a_response",
        "releases_and_envelopes_are_rejected",
        "releases_envelopes_and_bad_settings_are_rejected",
      ],
      "stability-protocol": [
        "an over-critical secondOrder fails with its reason and no payload",
        "malformed or ambiguous stability requests are refused",
      ],
      "m09-browser": [JOURNEY],
    },
    observation:
      "0.99 Pcr converges with the exact amplification; 1.01 Pcr ends NONCONVERGED/TANGENT_NOT_POSITIVE_DEFINITE with no numbers in kernel, protocol and UI; envelopes, releases and bad settings are refused.",
  },
  {
    id: "M09-SEPARATE-TYPES",
    title: "Separate analysis types, explicit imperfection, no superposition",
    evidence: "kernel_validation",
    tests: {
      "stability-native": [
        "sway_imperfection_is_explicit_and_listed",
        "without_axial_force_second_order_is_the_linear_analysis",
        "settings_enter_the_result_identity",
      ],
      "stability-protocol": [
        "capabilities advertise the stability types with precise exclusions",
      ],
    },
    observation:
      "elasticBuckling and secondOrder are distinct analyse types on one real case or combination; imperfections are never implied and are listed as equivalent nodal forces; settings enter the result identity.",
  },
  {
    id: "M09-UI-JOURNEY",
    title: "Compare first/second-order sway and inspect modes in the browser",
    evidence: "ui_journey, save_and_reopen, exported_outcome",
    tests: { "m09-browser": [JOURNEY] },
    observation:
      "Portal journey: buckling factor and drawn modes, first- vs second-order sway and amplification, stale on edit and case change, record and run JSON export, save and reopen reproduces the sway exactly.",
  },
  {
    id: "M09-NOT-A-VERDICT",
    title: "A buckling factor is not a code member-resistance verdict",
    evidence: "capability_ledger",
    tests: {
      "stability-protocol": [
        "capabilities advertise the stability types with precise exclusions",
        "capabilities.json publishes UNKNOWN parity and SPEC exclusions",
      ],
      "m09-browser": [
        JOURNEY,
        "M06 capability ledger: View capabilities shows UNKNOWN parity and exclusions",
      ],
    },
    observation:
      "Panel, legend, report banner, protocol disclosures and ledger all state that a critical factor is an elastic load multiplier, flexural only, not a resistance, effective length or code check.",
  },
];

const records = {};
for (const name of ["stability-native", "stability-protocol", "m09-browser"])
  try {
    records[name] = JSON.parse(await readFile(`${dir}/${name}.json`, "utf8"));
  } catch {
    records[name] = null;
  }

const issues = [];
const rows = [];
for (const c of criteria) {
  const missing = [];
  for (const [name, ids] of Object.entries(c.tests)) {
    const e = records[name];
    if (!e) {
      missing.push(`${name}.json missing`);
      continue;
    }
    if (e.status !== "PASS") missing.push(`${name} status ${e.status}`);
    if (e.sourceHash !== build.sourceHash || e.buildHash !== build.buildHash)
      missing.push(`${name} stale hash`);
    for (const id of ids)
      if (!e.testIds?.includes(id)) missing.push(`${name}: ${id} not executed`);
  }
  const status = missing.length ? "FAIL" : "PASS";
  if (missing.length) issues.push(`${c.id}: ${missing.join("; ")}`);
  rows.push({ ...c, status, missing });
}

// The oracle was generated by the recorded, unchanged independent script.
const oracle = JSON.parse(
  await readFile("fixtures/stability/stability-oracle.json", "utf8"),
);
const generator = createHash("sha256")
  .update(await readFile(oracle.generator))
  .digest("hex");
const provenance = {
  id: "M09-ORACLE-PROVENANCE",
  title: "Independent oracle generated by the recorded script",
  evidence: "regression_results",
  observation: `${oracle.generator} sha256 ${generator}; recorded ${oracle.generatorSha256}; OpenSees ${oracle.opensees.version} cross-check.`,
  status: generator === oracle.generatorSha256 ? "PASS" : "FAIL",
  missing: generator === oracle.generatorSha256 ? [] : ["generator changed"],
};
if (provenance.status !== "PASS")
  issues.push(`${provenance.id}: generator hash mismatch`);
rows.push(provenance);

const limitations =
  "stability-v1 is flexural only (no torsional, flexural-torsional or lateral-torsional modes), small rotations about the undeformed geometry, proportional loading, one real case or combination, and no member end moment releases. A critical factor is never a member resistance or code verdict. Commercial PROKON parity remains UNKNOWN.";

await record("m09-acceptance", {
  status: issues.length ? "FAIL" : "PASS",
  testCount: rows.length,
  testIds: rows.map((c) => c.id),
  command: ["node", "tools/record-m09-acceptance.mjs"],
  issues,
  criteria: rows,
  limitations,
});

const md = `# M09 acceptance record

Source hash: \`${build.sourceHash}\`
Build hash: \`${build.buildHash}\`
Observed: ${new Date().toISOString()}
Status: **${issues.length ? "FAIL" : "PASS"}**

| ID | Title | Evidence | Status | Observation |
| --- | --- | --- | --- | --- |
${rows
  .map(
    (r) =>
      `| ${r.id} | ${r.title} | ${r.evidence} | ${r.status} | ${r.observation}${r.missing?.length ? ` Missing: ${r.missing.join("; ")}` : ""} |`,
  )
  .join("\n")}

Limitations: ${limitations}
`;
await writeFile(`${dir}/ACCEPTANCE.md`, md);
console.log(md);
if (issues.length) process.exitCode = 1;
