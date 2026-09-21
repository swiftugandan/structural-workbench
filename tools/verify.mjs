import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { sourceHash } from "./build.mjs";
const milestone = process.argv[2] || "M00";
const required = [
  "native",
  "contracts",
  "numerical",
  "wasm",
  "oracle",
  "e2e-tour",
  "browser-suite",
  "accessibility",
  "security",
  "performance",
  "graphics",
  "robustness",
  "hardware-windows-linux",
];
const issues = [];
const build = JSON.parse(await readFile("dist/build.json"));
const hash = await sourceHash();
if (hash !== build.sourceHash)
  issues.push("Application/test/fixture source changed since build");
for (const [file, digest] of Object.entries(build.files)) {
  try {
    if (
      createHash("sha256")
        .update(await readFile("dist/" + file))
        .digest("hex") !== digest
    )
      issues.push("Changed build artifact " + file);
  } catch {
    issues.push("Missing build artifact " + file);
  }
}
for (const name of required) {
  try {
    const e = JSON.parse(await readFile(`evidence/M00/current/${name}.json`));
    if (e.status !== "PASS") issues.push(`${name}: ${e.status}`);
    if (e.sourceHash !== build.sourceHash || e.buildHash !== build.buildHash)
      issues.push(`${name}: stale build evidence`);
    if (!e.testCount || !e.testIds?.length)
      issues.push(`${name}: no executed test IDs/count`);
    for (const [file, digest] of Object.entries(e.lockHashes || {})) {
      if (
        createHash("sha256")
          .update(await readFile(file))
          .digest("hex") !== digest
      )
        issues.push(`${name}: changed input ${file}`);
    }
  } catch {
    issues.push(`${name}: missing evidence`);
  }
}
if (milestone !== "M00")
  issues.push(
    `${milestone}: downstream milestones have not met their acceptance gates`,
  );
const status = issues.length ? "BLOCKED" : "PASS";
await writeFile(
  `evidence/M00/current/gate-${milestone}.json`,
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
