#!/usr/bin/env node
/**
 * Record M04 parent acceptance criteria against the current build.
 * Fail closed: every criterion must cite sibling evidence that PASS on this build.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { record, evidenceDir } from "./evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M04/full";
process.env.WORKBENCH_TASK_ID ||= "M04-parent";
process.env.WORKBENCH_MILESTONE ||= "M04";

const dir = evidenceDir("evidence/M04/full");
await mkdir(dir, { recursive: true });
const build = JSON.parse(await readFile("dist/build.json", "utf8"));

const criteria = [
  {
    id: "M04-RECOVERY",
    title: "Historical revision recovery without claiming unsaved edits",
    required: ["m04-browser.json"],
    requireTestIds: [
      "M04 recovery: restore committed revision; refuse while form dirty",
    ],
    observation:
      "File → Recover revision restores a committed snapshot; dirty forms refuse recovery.",
  },
  {
    id: "M04-OFFLINE",
    title: "Atomic build-ID offline cache",
    required: ["m04-browser.json"],
    requireTestIds: [
      "precaches atomic build and reopens offline from IndexedDB",
      "prompts reload after save when a waiting build update is ready",
    ],
    observation:
      "Service worker caches one build set; offline reopen works; update prompts after save.",
  },
  {
    id: "M04-MIGRATION",
    title: "Schema migration with original retention",
    required: ["migrate.json", "m04-browser.json"],
    requireTestIds: [
      "M04 migration: 0.9.0 imports, retains original, unknown schema refused",
    ],
    observation:
      "0.9.0→1.0.0 migrates with hash parity; originals retained; unknown majors refused.",
  },
  {
    id: "M04-RELIABILITY",
    title: "Corrupt snapshot, Worker crash, persistence denied",
    required: ["m04-browser.json"],
    requireTestIds: [
      "corrupt latest snapshot recovers verified history revision",
      "model Worker crash restores last confirmed in-memory model",
      "persistence denied warns without blocking export",
    ],
    observation:
      "Corrupt projects pointer falls back to verified history; Worker crash restores memory model; persistence denial warns.",
  },
  {
    id: "M04-QUOTA-LEASE",
    title: "Quota failure and single-writer lease",
    required: ["m04-browser.json"],
    requireTestIds: [
      "storage quota failure is explicit and downloads survive",
      "single writer lock protects the second tab",
    ],
    observation:
      "STORAGE_QUOTA keeps export available; second tab opens read-only under the lease.",
  },
  {
    id: "M04-SECURITY-EXPORTS",
    title: "Escaped reports and CSV formula neutralization",
    required: ["security.json"],
    observation:
      "HTML labels escape; CSV formula cells are neutralized before download.",
  },
  {
    id: "M04-RECORD",
    title: "Calculation record and export/import equivalence",
    required: ["m04-browser.json", "m04-record.json"],
    requireTestIds: [
      "M04 record: export/import equivalence and report matches displayed results",
    ],
    observation:
      "Project/report/CSV export round-trip preserves hash and displayed tip results.",
  },
];

const issues = [];
const evaluated = [];
for (const c of criteria) {
  const notes = [];
  let ok = true;
  for (const file of c.required) {
    let e;
    try {
      e = JSON.parse(await readFile(`${dir}/${file}`, "utf8"));
    } catch (error) {
      ok = false;
      notes.push(`missing ${file} (${error.code || error.message})`);
      continue;
    }
    if (e.status !== "PASS") {
      ok = false;
      notes.push(`${file} status ${e.status || "missing"}`);
    }
    if (e.sourceHash !== build.sourceHash || e.buildHash !== build.buildHash) {
      ok = false;
      notes.push(`${file} stale vs dist/build.json`);
    }
    if (c.requireTestIds && (file === "m04-browser.json" || file === "m04-record.json")) {
      for (const id of c.requireTestIds) {
        if (
          !e.testIds?.includes(id) &&
          e.test !== id &&
          !(e.testIds || []).some((t) => String(t).includes(id.slice(0, 24)))
        )
          notes.push(`${file} missing test id ${id}`), (ok = false);
      }
    }
  }
  evaluated.push({
    ...c,
    status: ok ? "PASS" : "FAIL",
    notes,
  });
  if (!ok) issues.push(`${c.id}: ${notes.join("; ")}`);
}

const status = issues.length ? "FAIL" : "PASS";
const checklist = `# M04 acceptance record

Source hash: \`${build.sourceHash}\`
Build hash: \`${build.buildHash}\`
Observed: ${new Date().toISOString()}
Status: **${status}**

| ID | Title | Status | Observation |
| --- | --- | --- | --- |
${evaluated
  .map(
    (c) =>
      `| ${c.id} | ${c.title} | ${c.status} | ${c.observation.replace(/\|/g, "/")}${c.notes?.length ? ` · ${c.notes.join("; ").replace(/\|/g, "/")}` : ""} |`,
  )
  .join("\n")}

## Limitations

- Parent M04 packages recovery, offline cache, migration, reliability and calculation-record slices; it does not claim M05 catalogue/templates or commercial report parity.
- Full 100-cycle memory soak remains a later release gate.
- Platform hardware evidence continues to follow ADR 0005 lab Metal path from earlier milestones.
`;

await writeFile(`${dir}/ACCEPTANCE.md`, checklist);

await record("m04-acceptance", {
  status,
  testCount: evaluated.filter((c) => c.status === "PASS").length,
  testIds: evaluated.map((c) => c.id),
  command: [
    "node",
    "tools/record-m04-acceptance.mjs",
    "npm",
    "run",
    "verify:milestone",
    "--",
    "M04",
  ],
  artifacts: ["ACCEPTANCE.md"],
  criteria: evaluated,
  issues,
  limitations:
    "Fail-closed parent recorder; memory soak and M05 catalogue work remain out of scope.",
});

console.log(
  JSON.stringify(
    { status, issues, testIds: evaluated.map((c) => c.id) },
    null,
    2,
  ),
);
if (issues.length) process.exitCode = 1;
