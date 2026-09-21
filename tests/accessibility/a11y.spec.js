import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { record } from "../../tools/evidence.mjs";
test("landing and solved workspace accessibility", async ({ page }) => {
  await page.goto("/");
  let scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  await page.locator("#new-project").click();
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  await record("accessibility", {
    status: "PASS",
    testCount: 2,
    testIds: ["landing-a11y", "workspace-a11y"],
    command: ["npm", "run", "test:a11y"],
  });
});
