import { spawnSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { record, evidenceDir } from "./evidence.mjs";
const r = spawnSync("npx", ["playwright", "test"], {
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
});
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
const report = JSON.parse(
  await readFile(`${evidenceDir()}/playwright-results.json`),
);
const ids = [];
const visit = (s) => {
  for (const spec of s.specs || []) ids.push(spec.title);
  for (const child of s.suites || []) visit(child);
};
report.suites.forEach(visit);
const passed =
  r.status === 0 &&
  ids.length > 0 &&
  report.stats.unexpected === 0 &&
  report.stats.skipped === 0;
const log = (r.stdout || "") + (r.stderr || "");
await writeFile(`${evidenceDir()}/browser-suite.log`, log);
const artifacts = (await readdir(evidenceDir())).filter(
  (f) =>
    (/\.(png|html)$/.test(f) ||
      /^(portal|split|connected|capacity)-.*\.json$/.test(f)) &&
    !/^live-visual-/.test(f),
);
await record("browser-suite", {
  status: passed ? "PASS" : "FAIL",
  testCount: ids.length,
  testIds: ids,
  command: ["npx", "playwright", "test"],
  stats: report.stats,
  artifacts: ["playwright-results.json", "browser-suite.log", ...artifacts],
});
process.exitCode = passed ? 0 : 1;
