import { menuCommand } from "../menu-helpers.js";
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
    await menuCommand(
      page,
      "View",
      {
        model: "Model tree",
        properties: "Properties",
        results: "Results panel",
      }[key],
    );
  await expect(page.locator(".inspector")).toBeHidden();
  const expanded = await page.locator("#viewport").boundingBox();
  expect(expanded.width).toBeGreaterThan(before.width + 400);
  expect(expanded.height).toBeGreaterThan(before.height + 150);
  await menuCommand(page, "View", "Focus canvas");
  await expect(page.locator(".command-ribbon")).toBeHidden();
  await expect(page.locator(".viewport-toolbar")).toBeHidden();
  const focused = await page.locator("#viewport").boundingBox();
  expect(focused.height).toBeGreaterThan(expanded.height);
  await menuCommand(page, "View", "Restore layout");
  await expect(page.locator(".command-ribbon")).toBeVisible();
  await expect(page.locator(".inspector")).toBeHidden();
  await menuCommand(page, "View", "Properties");
  await expect(page.locator("#inertia-y")).toHaveValue("0.00003");
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await menuCommand(page, "View", "Results panel");
  await expect(page.locator("#result-status")).toContainText(
    "Unapplied changes",
  );
  await page.locator("#discard-properties").click();
  await expect(page.locator("#result-status")).toContainText("Current");
  await menuCommand(page, "View", "Ribbon");
  await page.reload();
  await expect(page.locator('[data-layout="ribbon"]')).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
