import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { sourceHash } from "./build.mjs";
import { common, m01, m01ux, m02, m03, m04, recordIssues } from "./milestone-rules.mjs";
import { evidenceDir } from "./evidence.mjs";
const milestone = process.argv[2] || "M00";
const dir = evidenceDir(
  milestone === "M01-UX"
    ? "evidence/M01/ux"
    : milestone === "M01"
      ? "evidence/M01/full"
      : milestone === "M02"
        ? "evidence/M02/full"
        : milestone === "M03"
          ? "evidence/M03/full"
          : milestone === "M04"
            ? "evidence/M04/full"
            : "evidence/M00/current",
);
const required =
  milestone === "M01-UX"
    ? m01ux
    : milestone === "M01"
      ? m01
      : milestone === "M02"
        ? m02
        : milestone === "M03"
          ? m03
          : milestone === "M04"
            ? m04
            : common;
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
if (!["M00", "M01", "M01-UX", "M02", "M03", "M04"].includes(milestone))
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
