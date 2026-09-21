import { test, expect } from "@playwright/test";
test("Canvas dimensions show true lengths, update after edits and undo, and toggle without mutation", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#new-project").click();
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  const dim = page.locator('[data-dimension-member="m1"]');
  await expect(dim).toHaveText("3 m");
  const original = await page.locator("#hash-status").textContent();
  await page.locator("#dimensions-toggle").click();
  await expect(dim).toHaveCount(0);
  await expect(page.locator("#hash-status")).toHaveText(original);
  await page.locator("#dimensions-toggle").click();
  await expect(dim).toHaveText("3 m");
  await page.locator("#span").fill("4.5");
  await page
    .locator("#member-form")
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(dim).toHaveText("4.5 m");
  await page.locator("#undo").click();
  await expect(dim).toHaveText("3 m");
  await expect(page.locator("#hash-status")).toHaveText(original);
  await page.locator("#view-3d").click();
  await expect(dim).toHaveText("3 m");
  await expect(page.locator("#hash-status")).toHaveText(original);
  await expect(dim).toHaveCSS("pointer-events", "none");
});
