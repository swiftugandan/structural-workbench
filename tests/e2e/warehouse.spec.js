import { test, expect } from "@playwright/test";
test("Warehouse example opens in 3D and solves spatial gravity and lateral loads", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#worked-examples").click();
  await page.locator('[data-example="W01"]').click();
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-reference-plane",
    "XY",
  );
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await page.locator("#display-result").selectOption("moment");
  await expect(
    page.locator('[data-result-component="My"]').first(),
  ).toBeVisible();
  await page.locator("#display-result").selectOption("deformed");
  await expect(page.locator("#deformation-legend")).toBeVisible();
});
