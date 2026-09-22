import { test, expect } from "@playwright/test";

test("Layout controls reclaim canvas space and restore drafts and results", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#new-project").click();
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toContainText("Current");
  const hash = await page.locator("#hash-status").textContent();
  await page.locator("#inertia-y").fill("0.00003");
  const before = await page.locator("#viewport").boundingBox();
  for (const key of ["model", "properties", "results"])
    await page.locator(`[data-panel="${key}"]`).click();
  await expect(page.locator(".inspector")).toBeHidden();
  const expanded = await page.locator("#viewport").boundingBox();
  expect(expanded.width).toBeGreaterThan(before.width + 400);
  expect(expanded.height).toBeGreaterThan(before.height + 150);
  await page.locator("#focus-canvas").click();
  await expect(page.locator(".command-ribbon")).toBeHidden();
  await expect(page.locator(".viewport-toolbar")).toBeHidden();
  const focused = await page.locator("#viewport").boundingBox();
  expect(focused.height).toBeGreaterThan(expanded.height);
  await page.getByRole("button", { name: "Restore layout" }).click();
  await expect(page.locator(".command-ribbon")).toBeVisible();
  await expect(page.locator(".inspector")).toBeHidden();
  await page.locator('[data-panel="properties"]').click();
  await expect(page.locator("#inertia-y")).toHaveValue("0.00003");
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator('[data-panel="results"]').click();
  await expect(page.locator("#result-status")).toContainText(
    "Unapplied changes",
  );
  await page.locator("#discard-properties").click();
  await expect(page.locator("#result-status")).toContainText("Current");
  await page.locator('[data-layout="ribbon"]').click();
  await page.reload();
  await expect(page.locator('[data-layout="ribbon"]')).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
