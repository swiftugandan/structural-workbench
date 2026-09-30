import { test, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { menuCommand } from "../menu-helpers.js";
import { evidenceDir } from "../../tools/evidence.mjs";

const evidenceRoot = evidenceDir("evidence/M07/task-journey");

test("Steel task: find failure, compare, apply, reanalyse, review colours and export", async ({
  page,
}) => {
  const p = JSON.parse(await readFile("fixtures/models/B04.json", "utf8"));
  p.id = "steel-task";
  p.name = "Synthetic steel task · 300 kN";
  p.loads[0].values = [0, 300000, 0, 0, 0, 0];
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "task.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await page.locator("[data-inspector-tab=steel]").click();
  await expect(page.locator("#design-assign")).toBeVisible();
  await page
    .locator("#design-section")
    .selectOption("aisc-shapes-v16.0-subset-1:W18X50");
  await page.locator("#design-assign").click();
  await expect(page.locator("#design-save")).toBeEnabled();
  for (const [k, v] of Object.entries({ ky: "1", kz: "1", lb: "0", cb: "1" }))
    await page.locator(`#design-${k}`).fill(v);
  await page.locator("#design-bracing").selectOption("continuous");
  await page.locator("#design-basis").check();
  await page.locator("#design-save").click();
  await expect(page.locator("[data-testid=design-readiness]")).toHaveText(
    "READY",
  );
  await page.locator("[data-tab=steel-overview]").click();
  await page.locator("#analyse").click();
  await expect(page.locator("#steel-review-run")).toBeEnabled();
  await page.locator("#steel-review-run").click();
  await expect(page.locator("[data-review-member=m1]")).toContainText("FAIL");
  await page.locator("#steel-colour-toggle").check();
  await expect(page.locator("#steel-review-legend")).toContainText("FAIL 1");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-design-statuses",
    JSON.stringify({ m1: "fail" }),
  );
  await page.locator("#steel-review-filter").selectOption("fail");
  await page.locator("[data-review-select=m1]").click();
  await page.locator("[data-steel-pane=details]").click();
  await expect(page.locator("[data-steel-view=details]")).toContainText("F2-1");
  await page.locator("[data-tab=steel-overview]").click();
  await page.locator("[data-steel-screen=study]").click();
  await expect(page.locator("#candidate-run")).toBeEnabled();
  await page.locator("#candidate-run").click();
  const candidate = page.locator("[data-candidate-result=W14X132]");
  await expect(candidate).toContainText("PASS");
  await candidate.locator("[data-apply-candidate]").click();
  await expect(page.locator("#steel-review-legend")).toContainText("STALE 1");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-design-statuses",
    JSON.stringify({ m1: "stale" }),
  );
  await page.locator("#analyse").click();
  await expect(page.locator("#candidate-run")).toBeEnabled();
  await page.locator("[data-steel-screen=overview]").click();
  await page.locator("#steel-review-filter").selectOption("all");
  await page.locator("#steel-review-run").click();
  await expect(page.locator("[data-review-member=m1]")).toContainText("PASS");
  await expect(page.locator("#steel-review-legend")).toContainText("PASS 1");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-design-statuses",
    JSON.stringify({ m1: "pass" }),
  );
  await page.locator("[data-review-select=m1]").click();
  const dl = page.waitForEvent("download");
  await page.locator("#design-download").click();
  const run = JSON.parse(await readFile(await (await dl).path(), "utf8"));
  expect(run.checks.find((c) => c.checkId === "flexure").demand).toBeCloseTo(
    900000,
    5,
  );
  const htmlDl = page.waitForEvent("download");
  await menuCommand(page, "File", "Export calculation report");
  const html = await readFile(await (await htmlDl).path(), "utf8");
  expect(html).toContain(run.designRunId);
  expect(html).toContain(run.resultId);
  await page.locator("[data-tab=steel-overview]").click();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-device-generation",
    /\d+/,
  );
  await mkdir(evidenceRoot, { recursive: true });
  await page.screenshot({
    path: `${evidenceRoot}/review-pass.png`,
    fullPage: true,
  });
  await writeFile(`${evidenceRoot}/report.html`, html);
  await writeFile(
    `${evidenceRoot}/design-run.json`,
    JSON.stringify(run, null, 2),
  );
  await page.locator("#steel-colour-toggle").uncheck();
  await expect(page.locator("#steel-review-legend")).toBeHidden();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-design-statuses",
    "{}",
  );
});
