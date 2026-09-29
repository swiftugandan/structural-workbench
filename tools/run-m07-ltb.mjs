#!/usr/bin/env node
/**
 * Same-build M07-LTB (S3 flexure breadth) gate: S2 + S3 fixture regressions,
 * steel UI unit tests and browser journeys, with DW-LTB1 bound to the
 * executed tests. The M07 parent gate is run separately on the same build.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { evidenceDir, record } from "./evidence.mjs";
import {
  acceptanceMarkdown,
  browserRecord,
  buildRecord,
  cargoRecord,
  evaluateCriteria,
  nodeRecord,
} from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR = "evidence/M07/ltb";
process.env.WORKBENCH_TASK_ID = "M07-LTB";
process.env.WORKBENCH_MILESTONE = "M07";

const dir = evidenceDir("evidence/M07/ltb");
await mkdir(dir, { recursive: true });
const build = await buildRecord();
await cargoRecord(dir, "aisc-fixtures", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-design",
  "--lib",
  "--",
  "aisc36022",
]);
await cargoRecord(dir, "design-workspace", [
  "cargo",
  "test",
  "--locked",
  "-p",
  "workbench-wasm-api",
  "--test",
  "design_workspace",
]);
await nodeRecord(dir, "steel-ui-unit", ["tests/steel-check.test.mjs"]);
await browserRecord(
  dir,
  "steel-browser",
  ["tests/e2e/steel-check.spec.js", "tests/e2e/native-steel-design.spec.js"],
  { artifacts: ["playwright-results.json"] },
);

const f = (name) => `profile::aisc36022::fixture_tests::${name}`;
const criteria = [
  {
    id: "DW-LTB1-F2.2",
    title: "Lateral-torsional buckling (F2.2) against published examples",
    evidence: "kernel_validation",
    tests: {
      "aisc-fixtures": [
        f("s3_f12b_inelastic_ltb_matches_example"),
        f("s3_f13b_elastic_ltb_matches_example"),
      ],
      "design-workspace": [
        "noncompact_flanges_and_ltb_use_their_clauses_and_missing_tension_details_never_pass",
      ],
      "steel-browser": [
        "complete-member matrix: ≥3 pass and ≥3 fail seeds",
        "DW-F4: fail reaches governing station and clause; LTB governs once Lb exceeds Lp",
      ],
    },
    observation:
      "F.1-2B (inelastic, Lp 69.9 in., Lr 203 in., φbMn 304 kip-ft) and F.1-3B (elastic, Fcr 43.2 ksi, φbMn 288 kip-ft) within 0.5 %; derived rts and ho reproduce the published 1.98 in. and 17.4 in.; model-native members with Lb > Lp get F2-2 in the browser.",
  },
  {
    id: "DW-LTB1-F3",
    title:
      "Noncompact flange local buckling (F3-1) against the published example",
    evidence: "kernel_validation",
    tests: {
      "aisc-fixtures": [
        f("s3_f3b_noncompact_flange_local_buckling_matches_example"),
        f(
          "s3_full_check_routes_noncompact_flanges_through_f3_and_caps_ltb_at_mp",
        ),
      ],
      "design-workspace": [
        "noncompact_flanges_and_ltb_use_their_clauses_and_missing_tension_details_never_pass",
      ],
    },
    observation:
      "F.3B W21×48 λpf 9.15, λrf 24.1, Mn 5,310 kip-in., φbMn 398 kip-ft; the full check routes noncompact flanges (W14×99) through F3-1 and never lifts LTB above Mp.",
  },
  {
    id: "DW-LTB1-UNSUPPORTED",
    title: "Unsupported cases remain UNSUPPORTED",
    evidence: "failure_path",
    tests: {
      "aisc-fixtures": [f("s3_unsupported_flexure_stays_unsupported")],
      "steel-ui-unit": [
        "seed catalog has ≥3 pass, ≥3 fail, and unsupported scope cases",
      ],
      "steel-browser": ["complete-member matrix: ≥3 pass and ≥3 fail seeds"],
    },
    observation:
      "Slender flanges (F3-2), noncompact webs (F4), missing classification, missing torsional properties for Lb > 0 and Cb < 1 are UNSUPPORTED; the slender-flange seed shows UNSUPPORTED in the browser.",
  },
  {
    id: "DW-LTB1-CB",
    title: "Cb from the model's moment diagram (F1-1)",
    evidence: "kernel_validation",
    tests: {
      "design-workspace": [
        "cb_from_the_model_matches_example_f1_2b_for_third_point_bracing",
        "cb_from_the_model_needs_the_member_to_be_the_unbraced_segment",
        "a_cantilever_with_a_free_end_takes_cb_of_one",
      ],
      "steel-browser": [
        "Derived Cb: the model's moment diagram sets Cb, with Cb = 1 for a free cantilever end",
      ],
    },
    observation:
      "Example F.1-2B modelled as three members gives the published Cb = 1.01 (centre) and 1.46 (ends); derivation needs Lb equal to the member length; a free cantilever end takes Cb = 1.0 per F1.",
  },
  {
    id: "DW-LTB1-SEGMENTS",
    title: "Bracing points: Lb and Cb per unbraced segment (ADR 0024)",
    evidence: "kernel_validation",
    tests: {
      "design-workspace": [
        "one_member_braced_at_thirds_matches_the_three_member_model",
        "bracing_points_are_validated",
      ],
      "steel-browser": [
        "Bracing points: each segment gets its own Lb and Cb, with Cb = 1 at the free end",
      ],
    },
    observation:
      "Example F.1-2B as one member braced at its thirds gives segments with Lb = L/3 and Cb 1.46, 1.01, 1.46, and the governing F2-2 resistance and centre Cb equal the three-member model's to 1e-9. Bracing points without the points assumption, an entered Lb, unordered stations and stations at the ends are refused. In the browser, the B04 cantilever braced at mid-length gives Lb = 1.5 m per segment, Cb = 1.25 (F1-1 on the linear diagram) at the fixed end and 1.0 at the free end.",
  },
  {
    id: "DW-LTB1-S2-REGRESSION",
    title: "S2 fixture regressions still pass",
    evidence: "regression_results",
    tests: {
      "aisc-fixtures": [
        f("s2_d1_tension_matches_example"),
        f("s2_e1c_compression_matches_example"),
        f("s2_f11b_flexure_matches_example"),
        f("s2_g1b_shear_matches_example"),
        f("s2_h1b_interaction_matches_example"),
      ],
    },
    observation:
      "All five S2 published examples still match on the same build; the M07 parent gate is rerun on this build.",
  },
];
const { rows, issues } = await evaluateCriteria(dir, build, criteria);
const limitations =
  "Doubly symmetric W-shapes with compact webs; Cb is user input or derived per member segment; slender flanges, noncompact/slender webs, HSS, channels, weak-axis flexure, torsion and non-prismatic members stay unsupported. Not a claim of full AISC 360 coverage or commercial parity.";
await record("m07-ltb-acceptance", {
  status: issues.length ? "FAIL" : "PASS",
  testCount: rows.length,
  testIds: rows.map((r) => r.id),
  command: ["node", "tools/run-m07-ltb.mjs"],
  issues,
  criteria: rows,
  limitations,
});
await writeFile(
  `${dir}/ACCEPTANCE.md`,
  acceptanceMarkdown("M07-LTB", build, rows, issues, limitations),
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
