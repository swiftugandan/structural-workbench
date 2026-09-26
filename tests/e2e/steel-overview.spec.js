import { test, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";

test("M07-G overview: complete membership, exact records, row selection, stale and export", async ({
  page,
}) => {
  const p = JSON.parse(await readFile("fixtures/models/B04.json", "utf8"));
  p.id = "steel-review-test";
  p.name = "Steel review — mixed readiness";
  p.nodes.push(
    { id: "n3", position: [0, 2, 0] },
    { id: "n4", position: [3, 2, 0] },
  );
  p.members.push({ ...p.members[0], id: "m2", start: "n3", end: "n4" });
  p.supports.push({ ...p.supports[0], id: "s2", node: "n3" });
  await page.goto("/");
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "review.json",
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
  await expect(page.locator("#steel-review-run")).toBeDisabled();
  await page.locator("#analyse").click();
  await expect(page.locator("#steel-review-run")).toBeEnabled();
  await page.locator("#steel-review-run").click();
  await expect(page.locator("[data-review-member=m1]")).toContainText("PASS");
  await expect(page.locator("[data-review-member=m2]")).toContainText(
    "NOT CHECKED",
  );
  const d = page.waitForEvent("download");
  await page.locator("#steel-review-download").click();
  const review = JSON.parse(await readFile(await (await d).path(), "utf8"));
  expect(review.rows).toHaveLength(2);
  expect(review.rows[1].run).toBeNull();
  expect(review.rows[1].utilisation).toBeNull();
  expect(review.rows[0].run.resultId).toBe(review.resultId);
  expect(
    review.rows[0].run.checks.find((c) => c.checkId === "flexure").demand,
  ).toBeCloseTo(30000, 6);
  await page.locator("#steel-review-filter").selectOption("notChecked");
  await expect(page.locator("[data-review-member]")).toHaveCount(1);
  await page.locator("[data-review-select=m2]").click();
  await expect(page.locator("#results-content")).toContainText("NOT CHECKED");
  await expect(page.locator("[data-testid=native-design-state]")).toHaveText(
    "NOT CHECKED",
  );
  await page.locator("[data-tab=steel-overview]").click();
  await page.locator("#steel-review-filter").selectOption("all");
  await page.locator("[data-review-select=m1]").click();
  await expect(page.locator("[data-testid=steel-overall]")).toHaveText("pass");
  await page.locator("#design-ky").fill("1.2");
  await page.locator("[data-tab=steel-overview]").click();
  await expect(page.locator("[data-review-member=m1]")).toContainText("STALE");
  await expect(page.locator("#steel-review-run")).toBeDisabled();
  await page.locator("#design-save").click();
  await expect(page.locator("#undo")).toBeEnabled();
  await page.locator("#undo").click();
  await expect(page.locator("[data-review-member=m1]")).toContainText("PASS");
  await page.locator("#steel-review-threshold").fill("0.9");
  await page.locator("#steel-review-threshold").press("Tab");
  await expect(page.locator("[data-review-member]")).toHaveCount(0);
  await page.locator("#steel-review-threshold").fill("");
  await page.locator("#steel-review-threshold").press("Tab");
  await expect(page.locator("[data-review-member]")).toHaveCount(2);
  await mkdir("evidence/M07/overview", { recursive: true });
  await page.screenshot({
    path: "evidence/M07/overview/overview.png",
    fullPage: true,
  });
  await writeFile(
    "evidence/M07/overview/review.json",
    JSON.stringify(review, null, 2),
  );
});
