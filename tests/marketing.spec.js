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
    page.getByText("From first member to traceable result."),
  ).toBeVisible();
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
});
