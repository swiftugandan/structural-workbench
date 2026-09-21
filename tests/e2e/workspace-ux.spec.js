import { test, expect } from "@playwright/test";

test("UX ribbon, keyboard context menu and property drafts preserve model state", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#new-project").click();
  await expect(page.locator("#member-form")).toBeVisible();
  await page.getByRole("tab", { name: "Modify", exact: true }).click();
  await expect(page.locator("#cad-tools")).toBeVisible();
  await expect(page.locator("#draw-toggle")).toBeHidden();
  await page.getByRole("tab", { name: "All tools" }).click();
  await page.locator("#inertia-y").fill("0.00003");
  await page.locator("[data-member]").first().click();
  await expect(page.locator("#inertia-y")).toHaveValue("0.00003");
  await expect(page.locator("#message")).toContainText("Apply or cancel");
  await page.locator("#discard-properties").click();
  await expect(page.locator("#inertia-y")).not.toHaveValue("0.00003");
  await page.locator("#viewport").focus();
  await page.keyboard.press("Shift+F10");
  const menu = page.getByRole("menu", { name: "Selection actions" });
  await expect(menu).toBeVisible();
  await expect(menu).toContainText("1 selected");
  await page.keyboard.press("End");
  await expect(
    page.getByRole("menuitem", { name: "Delete preview…" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.locator("#viewport")).toBeFocused();
  await page.locator("#selection-actions").click();
  await page.getByRole("menuitem", { name: "Copy…" }).click();
  await expect(page.locator("#cad-kind")).toHaveValue("CopySelection");
  await page.locator("#close-modal").click();
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toContainText("Current");
});

test("UX responsive panel navigation retains editable properties and results", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#new-project").click();
  for (const size of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(size);
    if (size.width < 900) {
      await page.locator('button[data-panel="properties"]').click();
      await expect(page.locator("#inertia-y")).toBeVisible();
      await page.locator('button[data-panel="model"]').click();
      await expect(page.locator("#model-nav")).toBeVisible();
      await page.locator('button[data-panel="canvas"]').click();
      await expect(page.locator("#viewport")).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
