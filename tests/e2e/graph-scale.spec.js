import { test, expect } from "@playwright/test";
test("Canvas exaggeration controls preserve model and independent factors", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#new-project").click();
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  const hash = await page.locator("#hash-status").textContent();
  await page.locator("#deformation-scale").fill("100");
  await expect(page.locator("#deformation-factor")).toHaveText("100");
  await page.locator("#result-family").selectOption("moments");
  await page.locator("#diagram-scale").fill("2.5");
  await expect(page.locator("#action-legend")).toContainText("Diagram ×2.5");
  await expect(page.locator("#action-legend")).toContainText("peak 30 kN");
  await page.locator("#diagram-scale").fill("0");
  await expect(page.locator("#action-legend")).toContainText("Diagram ×0");
  await page.locator("#diagram-scale").fill("2.5");
  await page.locator("#result-family").selectOption("shape");
  await expect(page.locator("#deformation-scale")).toHaveValue("100");
  await page.locator("#result-family").selectOption("moments");
  await expect(page.locator("#diagram-scale")).toHaveValue("2.5");
  await page.locator("#display-result").selectOption("torsion");
  await expect(page.locator("#diagram-scale-control")).toBeHidden();
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
});
