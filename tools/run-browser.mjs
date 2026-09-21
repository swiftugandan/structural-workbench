import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { record } from "./evidence.mjs";
const r = spawnSync("npx", ["playwright", "test"], {
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
});
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
const report = JSON.parse(
  await readFile("evidence/M00/current/playwright-results.json"),
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
await record("browser-suite", {
  status: passed ? "PASS" : "FAIL",
  testCount: ids.length,
  testIds: ids,
  command: ["npx", "playwright", "test"],
  stats: report.stats,
  artifacts: ["playwright-results.json"],
});
process.exitCode = passed ? 0 : 1;
