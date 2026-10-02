import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { sourceHash } from "./build.mjs";
import {
  common,
  m01,
  m01ux,
  m02,
  m03,
  m04,
  m05,
  m06,
  m07,
  m08,
  m09,
  m11,
  m12,
  m14,
  m21,
  m22,
  recordIssues,
} from "./milestone-rules.mjs";
import { evidenceDir } from "./evidence.mjs";
const milestone = process.argv[2] || "M00";
/** Parent gates: evidence directory and required records per milestone. */
const gates = {
  "M01-UX": ["evidence/M01/ux", m01ux],
  M01: ["evidence/M01/full", m01],
  M02: ["evidence/M02/full", m02],
  M03: ["evidence/M03/full", m03],
  M04: ["evidence/M04/full", m04],
  M05: ["evidence/M05/full", m05],
  M06: ["evidence/M06/full", m06],
  M07: ["evidence/M07/full", m07],
  M08: ["evidence/M08/full", m08],
  M09: ["evidence/M09/full", m09],
  M11: ["evidence/M11/full", m11],
  M12: ["evidence/M12/full", m12],
  M14: ["evidence/M14/full", m14],
  M21: ["evidence/M21/full", m21],
  M22: ["evidence/M22/full", m22],
};
const [fallbackDir, required] = gates[milestone] || [
  "evidence/M00/current",
  common,
];
const dir = evidenceDir(fallbackDir);
const issues = [];
const build = JSON.parse(await readFile("dist/build.json"));
const hash = await sourceHash();
if (hash !== build.sourceHash)
  issues.push("Application/test/fixture source changed since build");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const [file, expected] of Object.entries(build.files))
  try {
    if (digest(await readFile("dist/" + file)) !== expected)
      issues.push("Changed build artifact " + file);
  } catch {
    issues.push("Missing build artifact " + file);
  }
for (const name of required) {
  try {
    const e = JSON.parse(await readFile(`${dir}/${name}.json`));
    issues.push(...recordIssues(name, e, build, { milestone }));
    for (const [file, expected] of Object.entries(e.lockHashes || {}))
      if (digest(await readFile(file)) !== expected)
        issues.push(`${name}: changed input ${file}`);
    for (const [file, expected] of Object.entries(e.artifactHashes || {}))
      if (digest(await readFile(`${dir}/${file}`)) !== expected)
        issues.push(`${name}: changed evidence artifact ${file}`);
  } catch (error) {
    issues.push(
      `${name}: missing or unreadable evidence (${error.code || error.message})`,
    );
  }
}
if (milestone !== "M00" && !gates[milestone])
  issues.push(
    `${milestone}: remaining milestone-specific gates are not implemented`,
  );
const status = issues.length ? "BLOCKED" : "PASS";
await mkdir(dir, { recursive: true });
await writeFile(
  `${dir}/gate-${milestone}.json`,
  JSON.stringify(
    {
      milestone,
      status,
      sourceHash: hash,
      buildHash: build.buildHash,
      required,
      issues,
      observedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ milestone, status, issues }, null, 2));
process.exitCode = issues.length ? 1 : 0;
