#!/usr/bin/env node
/**
 * Record M21 parent acceptance against the current build. Each criterion of
 * SPECIFICATION.md M21 names the executed tests that prove it; a criterion
 * passes only when every named test is in a same-build PASS record.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { record, evidenceDir } from "./evidence.mjs";
import { acceptanceMarkdown, evaluateCriteria } from "./parent-gate.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M21/full";
process.env.WORKBENCH_TASK_ID ||= "M21-parent";
process.env.WORKBENCH_MILESTONE ||= "M21";

const dir = evidenceDir("evidence/M21/full");
await mkdir(dir, { recursive: true });
const build = JSON.parse(await readFile("dist/build.json", "utf8"));

const IFC_JOURNEY =
  "IFC import: conversion review, mapping manifest, analysis, save and reopen";
const DXF_JOURNEY =
  "DXF import answered in the form; refusals keep the project";
const EXPORT_JOURNEY =
  "IFC and DXF export: the files the independent tools checked, with their ledgers";
const LEDGER_JOURNEY =
  "M06 capability ledger: View capabilities shows UNKNOWN parity and exclusions";

const criteria = [
  {
    id: "M21-FORMATS",
    title: "Explicitly supported readers and writers",
    evidence: "kernel_validation",
    tests: {
      "exchange-native": [
        "step::tests::reals_round_trip_in_step_form",
        "step::tests::strings_round_trip_with_quotes_and_unicode",
        "step::tests::parses_typed_values_lists_enums_and_comments",
        "step::tests::refuses_malformed_files",
        "guid::tests::buildingsmart_example_encodes",
        "guid::tests::entity_ids_round_trip_guids",
        "refusals_name_the_reason",
      ],
    },
    observation:
      "ISO 10303-21 reals and strings (quotes, \\X2\\ Unicode) round-trip; IfcGloballyUniqueId matches the buildingSMART example; IFC4 is read and written, IFC2X3/IFC4X3, binary DXF, non-STEP text and files with nothing to import are refused by name.",
  },
  {
    id: "M21-UNITS-ORIENTATION",
    title: "Units and orientation fixtures",
    evidence: "kernel_validation",
    tests: {
      "exchange-native": [
        "ifc_corpus_imports_to_the_expected_si_models",
        "dxf_corpus_imports_segments_in_metres",
        "a_member_without_axis_takes_the_workbench_default_and_says_so",
      ],
    },
    observation:
      "mm/kN with prefixed and derived units, feet/kips via conversion-based units (derived units decided), a 30°-rotated and translated shared placement, Axis-defined local axes, local and global loads, loads per projected length, and DXF in a mirrored and an arbitrary OCS all import to the oracle's SI model within 1e-9. A member without Axis takes the workbench default and says so.",
  },
  {
    id: "M21-REFERENCE-CORPUS",
    title: "Reference corpus from independent tools",
    evidence: "kernel_validation",
    tests: {
      "exchange-native": [
        "ifc_corpus_imports_to_the_expected_si_models",
        "dxf_corpus_imports_segments_in_metres",
      ],
      "exchange-protocol": ["imported_ifc_models_are_the_project_and_analyse"],
    },
    observation:
      "IfcOpenShell-authored IFC4 files (schema- and EXPRESS-rule-valid) and ezdxf-authored DXF files, with expectations computed by the oracle from its own inputs, import exactly as expected; every imported corpus model analyses in every case and combination through the protocol.",
  },
  {
    id: "M21-SEMANTIC-ROUND-TRIP",
    title: "Semantic round trips with identity",
    evidence: "save_and_reopen",
    tests: {
      "exchange-native": [
        "ifc_round_trip_preserves_the_analysis_model",
        "imported_guids_survive_a_round_trip",
        "dxf_round_trip_with_explicit_layer_decisions",
      ],
      "exchange-protocol": ["exports_carry_their_ledger_and_reimport"],
      "m21-browser": [IFC_JOURNEY, EXPORT_JOURNEY],
    },
    observation:
      "Every fixture model, X-FRAME and UKR01 go project → IFC → project to the same analysis model (reals within 1e-12) and re-export byte-identically; an export re-imports to the same model hash; foreign GUIDs are kept as IDs and written back after save and reopen; DXF round-trips its geometry with explicit layer decisions.",
  },
  {
    id: "M21-LOSS-LEDGER",
    title: "Missing-object and conversion ledger",
    evidence: "exported_outcome",
    tests: {
      "exchange-native": [
        "export_ledger_names_what_ifc_cannot_carry",
        "ifc_corpus_imports_to_the_expected_si_models",
        "dxf_corpus_imports_segments_in_metres",
      ],
      "m21-browser": [IFC_JOURNEY, EXPORT_JOURNEY],
    },
    observation:
      "Imports list physical elements, reactions, surface members, unsupported loads, elastic conditions, projected loads and discrete actions with counts and examples; exports list settlements, design data, mass sources, spectra, results and partial self weight. The ledgers are shown and downloadable, and the conversion record keeps the mapping.",
  },
  {
    id: "M21-DECISIONS-AND-MANIFEST",
    title: "Deterministic forms and explicit batch manifests",
    evidence: "ui_journey",
    tests: {
      "exchange-native": ["dxf_round_trip_with_explicit_layer_decisions"],
      "exchange-cli": [
        "tests::batch_exchange_import_needs_an_explicit_mapping",
      ],
      "m21-browser": [IFC_JOURNEY, DXF_JOURNEY],
    },
    observation:
      "Every undefined unit, elastic or unset condition, unknown purpose and skipped content is a decision; the review preselects nothing and Import waits for every answer; the form's manifest equals a loaded one; the CLI refuses a manifest without answers and writes the project and conversion record with one.",
  },
  {
    id: "M21-FAILURE-PATHS",
    title: "Atomic refusals",
    evidence: "failure_path",
    tests: {
      "exchange-native": [
        "a_connection_between_member_ends_blocks_at_read",
        "refusals_name_the_reason",
      ],
      "exchange-protocol": ["a_refused_import_leaves_the_project_unchanged"],
      "m21-browser": [DXF_JOURNEY],
    },
    observation:
      "Blocking content (released translations, mid-member connections) is shown at review and refused at import; unanswered decisions, mappings for another file and malformed mappings are refused; the model hash and revision are unchanged after each refusal.",
  },
  {
    id: "M21-EXPORT-VALIDATED",
    title: "Exports validated by independent tools, hash-bound",
    evidence: "exported_outcome",
    tests: {
      "exchange-native": [
        "workbench_exports_are_the_ones_the_independent_tools_checked",
      ],
      "exchange-protocol": ["exports_carry_their_ledger_and_reimport"],
      "m21-browser": [EXPORT_JOURNEY],
    },
    observation:
      "The IFC files the kernel, the protocol and the browser write for X-FRAME and UKR01 are byte-identical (at the oracle's timestamp) to the ones IfcOpenShell validated with no issues and read back in SI; the DXF files are the ones ezdxf audited with no errors.",
  },
  {
    id: "M21-UI-JOURNEY",
    title: "Import, resolve mappings, analyse and export in the browser",
    evidence: "ui_journey",
    tests: { "m21-browser": [IFC_JOURNEY, DXF_JOURNEY, EXPORT_JOURNEY] },
    observation:
      "Import from the landing page or File menu, review, answer or load a manifest, import, analyse to a current result, save and reopen, export IFC and DXF with their ledgers, and re-import the exported IFC with no decisions.",
  },
  {
    id: "M21-SCOPE-DISCLOSURE",
    title: "Browser-only exchange is not a native adapter",
    evidence: "capability_ledger",
    tests: { "m21-browser": [IFC_JOURNEY, LEDGER_JOURNEY] },
    observation:
      "The review states browser-only file exchange, not a native Revit or authoring-tool round trip; the capability ledger lists model-exchange with its limitations and UNKNOWN comparison, and Revit plugins stay excluded.",
  },
];

const { rows, issues } = await evaluateCriteria(dir, build, criteria);

const oracle = JSON.parse(
  await readFile("fixtures/exchange/exchange-oracle.json", "utf8"),
);
const generator = createHash("sha256")
  .update(await readFile(oracle.generator))
  .digest("hex");
const clean =
  oracle.corpus.every((c) => !(c.validationIssues || []).length) &&
  oracle.exportChecks.every(
    (c) => !c.ifcValidationIssues.length && c.dxfAuditErrors === 0,
  );
const provenance = {
  id: "M21-ORACLE-PROVENANCE",
  title: "Independent corpus generated by the recorded script",
  evidence: "regression_results",
  observation: `${oracle.generator} sha256 ${generator}; recorded ${oracle.generatorSha256}; IfcOpenShell ${oracle.tools.ifcopenshell}, ezdxf ${oracle.tools.ezdxf}; ${oracle.corpus.length} corpus files; export checks ${clean ? "clean" : "NOT clean"}.`,
  status: generator === oracle.generatorSha256 && clean ? "PASS" : "FAIL",
  missing: generator === oracle.generatorSha256 ? [] : ["generator changed"],
};
if (provenance.status !== "PASS")
  issues.push(`${provenance.id}: generator hash or independent checks`);
rows.push(provenance);

const limitations =
  "exchange-v1 is browser-only file exchange of IFC4 structural analysis models and DXF wireframes into the frame model. IFC2X3/IFC4X3, physical-only IFC models, surface members, curved or varying members, eccentric connections and composite profiles are refused or skipped by explicit decision. DXF carries geometry only. Support settlements, design data, mass sources, spectra and results are not exported to IFC. There is no native Revit or other authoring-tool adapter and no commercial BIM-exchange equivalence. A member-end release at a node with free rotation leaves that rotation without stiffness; the solver refuses such models (unused-DOF exclusion is not implemented). Commercial-solver parity remains UNKNOWN.";

await record("m21-acceptance", {
  status: issues.length ? "FAIL" : "PASS",
  testCount: rows.length,
  testIds: rows.map((c) => c.id),
  command: ["node", "tools/record-m21-acceptance.mjs"],
  issues,
  criteria: rows,
  limitations,
});
const md = acceptanceMarkdown("M21", build, rows, issues, limitations);
await writeFile(`${dir}/ACCEPTANCE.md`, md);
console.log(md);
if (issues.length) process.exitCode = 1;
