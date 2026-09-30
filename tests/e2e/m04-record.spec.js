import { menuCommand } from "../menu-helpers.js";
import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { evidenceContext, recorder } from "../../tools/evidence.mjs";
import { CURRENT_SCHEMA } from "../schema-version.js";

const context = evidenceContext({
  dir: "evidence/M04/full",
  taskId: "M04-parent",
  milestone: "M04",
});
const record = recorder(context);

const evidence = () => context.dir;

test("M04 record: export/import equivalence and report matches displayed results", async ({
  page,
}) => {
  await mkdir(evidence(), { recursive: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.locator("#new-project").click();
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await expect(page.locator("#results-content")).toContainText("-45");
  await expect(page.locator("#results-content")).toContainText("0.0225");
  const hash = await page.locator("#hash-status").textContent();

  const projectDownload = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const projectFile = await projectDownload;
  const projectJson = await readFile(await projectFile.path(), "utf8");
  const project = JSON.parse(projectJson);
  expect(project.schemaVersion).toBe(CURRENT_SCHEMA);
  expect(project).not.toHaveProperty("canUndo");
  await writeFile(`${evidence()}/exported-project.json`, projectJson);

  const reportDownload = page.waitForEvent("download");
  await menuCommand(page, "File", "Export calculation report");
  const reportFile = await reportDownload;
  const html = await readFile(await reportFile.path(), "utf8");
  expect(html).toContain("calculation record");
  // Report embeds SI tip values even when the UI displays engineeringMetric mm.
  expect(html).toContain("-0.045");
  expect(html).toMatch(/0\.0225/);
  expect(html).not.toContain("<script>");
  await writeFile(`${evidence()}/calculation-report.html`, html);

  const csvDownload = page.waitForEvent("download");
  await menuCommand(page, "File", "Export results CSV");
  const csvFile = await csvDownload;
  const csv = await readFile(await csvFile.path(), "utf8");
  expect(csv).toMatch(/uz \[m\]/i);
  expect(csv).toMatch(/-0\.0449/);
  expect(csv).toMatch(/0\.0224/);
  await writeFile(`${evidence()}/results.csv`, csv);

  await page.locator("#home").click();
  await page.locator("#import-file").setInputFiles({
    name: "roundtrip.json",
    mimeType: "application/json",
    buffer: Buffer.from(projectJson),
  });
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await expect(page.locator("#results-content")).toContainText("-45");
  await expect(page.locator("#results-content")).toContainText("0.0225");

  expect(errors).toEqual([]);
  await record("m04-record", {
    status: "PASS",
    test: "M04 record: export/import equivalence and report matches displayed results",
    testIds: [
      "M04-export-import-equivalence",
      "M04-report-matches-display",
      "M04-csv-units",
    ],
    testCount: 3,
    command: ["npx", "playwright", "test", "tests/e2e/m04-record.spec.js"],
    hashPrefix: hash?.slice(0, 12),
    artifacts: [
      "exported-project.json",
      "calculation-report.html",
      "results.csv",
    ],
  });
});
