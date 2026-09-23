import { menuCommand } from "../menu-helpers.js";
import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { evidenceDir, record } from "../../tools/evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M06/full";
process.env.WORKBENCH_TASK_ID ||= "M06-parent";
process.env.WORKBENCH_MILESTONE ||= "M06";

const evidence = () => evidenceDir("evidence/M06/full");

test("M06 release tour: analyse, stress screen, ledger, save and report", async ({
  page,
}) => {
  await mkdir(evidence(), { recursive: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const fixture = JSON.parse(
    await readFile("fixtures/models/B02.json", "utf8"),
  );
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "B02.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  await expect(page.locator("#message")).toContainText(/parity:\s*UNKNOWN/i);

  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");

  await page.locator('[data-testid="tab-stress"]').click();
  await expect(page.locator("[data-testid='stress-disclaimer']")).toContainText(
    /Not a member stability/,
  );
  await expect(page.locator("#results-content")).toContainText(/σ max/);

  await page.locator("#scope").click();
  await expect(page.locator("[data-testid='parity-unknown']")).toContainText(
    /UNKNOWN/,
  );
  await expect(page.locator("[data-testid='excluded-domains']")).toContainText(
    "shells",
  );
  await page.locator("#modal").evaluate((el) => el.close());

  await expect(page.locator("#save-status")).toHaveText("Saved locally", {
    timeout: 15000,
  });

  const reportDownload = page.waitForEvent("download");
  await menuCommand(page, "File", "Export calculation report");
  const reportFile = await reportDownload;
  const html = await readFile(await reportFile.path(), "utf8");
  expect(html).toContain("Excluded capabilities");
  expect(html).toMatch(/UNKNOWN/i);
  expect(html).toContain("shells");
  expect(html).not.toContain("<script>");
  await writeFile(`${evidence()}/calculation-report.html`, html);

  const projectDownload = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const projectFile = await projectDownload;
  const projectJson = await readFile(await projectFile.path(), "utf8");
  expect(JSON.parse(projectJson).schemaVersion).toBe("1.0.0");
  await writeFile(`${evidence()}/exported-project.json`, projectJson);

  expect(errors).toEqual([]);
  await record("m06-release-tour", {
    status: "PASS",
    pageErrors: errors,
    test: "M06 release tour: analyse, stress screen, ledger, save and report",
  });
});
