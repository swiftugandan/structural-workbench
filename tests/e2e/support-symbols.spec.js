import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("Support symbols track restraints, orientation, property edits and undo", async ({
  page,
}) => {
  const p = JSON.parse(await readFile("fixtures/models/B02.json", "utf8"));
  p.analysisMode = "planarXZ";
  await page.goto("/");
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "supports.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  await page.locator("#view-elevation").click();
  const badge = page.locator('[data-assignment="s1"]');
  await expect(badge).toHaveAttribute("data-support-kind", "fixed");
  let dir = (await badge.getAttribute("data-support-direction"))
    .split(",")
    .map(Number);
  expect(dir[0]).toBeCloseTo(-1);
  expect(dir[1]).toBeCloseTo(0);
  await badge.click({ button: "right" });
  await page.locator('[name="fixed-4"]').uncheck();
  await page
    .locator("#direct-properties")
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(badge).toHaveAttribute("data-support-kind", "pinned");
  await page.locator('[name="fixed-0"]').uncheck();
  await page
    .locator("#direct-properties")
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(badge).toHaveAttribute("data-support-kind", "roller");
  dir = (await badge.getAttribute("data-support-direction"))
    .split(",")
    .map(Number);
  expect(dir[0]).toBeCloseTo(0);
  expect(dir[1]).toBeCloseTo(1);
  await page.locator("#view-plan").click();
  await expect(badge).toHaveAttribute("data-support-end-on", "true");
  await expect(badge).toContainText("end-on");
  await page.locator("#view-elevation").click();
  await page.locator('[name="fixed-4"]').check();
  await page
    .locator("#direct-properties")
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(badge).toHaveAttribute("data-support-kind", "custom");
  await expect(badge).toContainText("Z, Ry");
  await page.locator("#undo").click();
  await expect(badge).toHaveAttribute("data-support-kind", "roller");
});
