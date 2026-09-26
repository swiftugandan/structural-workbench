import { test, expect } from "@playwright/test";

test("marketing page presents the product and launches the workbench", async ({
  page,
}) => {
  await page.goto("/index.html");

  await expect(
    page.getByRole("heading", { name: /See the structure.*Trust the trail/s }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open the workbench" }),
  ).toHaveAttribute("href", "./app.html");
  await expect(
    page.getByText("From your model to a design decision."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Design steel from the model" }),
  ).toBeVisible();
  await expect(page.locator("#status")).toContainText(
    "serviceability checks remain unsupported",
  );
  const preview = page.locator(".workspace-preview img");
  await expect(preview).toBeVisible();
  await expect
    .poll(() => preview.evaluate((img) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(
    page.getByText("Useful today. Honest about tomorrow."),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);

  await page.getByRole("link", { name: "Open the workbench" }).click();
  await expect(page).toHaveURL(/\/app\.html$/);
  await expect(page.locator("#new-project")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Inside the workbench" }),
  ).toBeVisible();
  await expect(page.locator(".landing-capabilities")).toContainText(
    "National Annex checks are not enabled",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.locator("#worked-examples").click();
  await expect(page.locator('[data-example="UKR01"]')).toBeVisible();
  await page.locator('[data-example="UKR01"]').click();
  await expect(page.locator("#model-count")).toHaveText(
    "447 nodes · 642 members",
  );
  await expect(page.locator("#menu-design")).toBeVisible();
});
