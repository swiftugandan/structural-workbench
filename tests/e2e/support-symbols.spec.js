import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("Support symbols track restraints, orientation, property edits and undo", async ({
  page,
}) => {
  const p = JSON.parse(await readFile("fixtures/models/B02.json", "utf8"));
  p.analysisMode = "planarXZ";
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
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
  await page.getByText("Custom movement restraints", { exact: true }).click();
  await page.locator('[name="fixed-4"]').uncheck();
  await page
    .locator("#direct-properties")
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(badge).toHaveAttribute("data-support-kind", "pinned");
  await page.getByText("Custom movement restraints", { exact: true }).click();
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
  await page.getByText("Custom movement restraints", { exact: true }).click();
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

test("Support labels toggle independently without invalidating analysis", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#import-file").setInputFiles("fixtures/models/B02.json");
  await expect(page.locator(".support-label")).toHaveCount(1);
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  const hash = await page.locator("#hash-status").textContent();
  await page.locator("#support-labels").click();
  await expect(page.locator("#support-labels")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  for (const view of ["3d", "plan", "elevation"]) {
    await page.locator(`#view-${view}`).click();
    await expect(page.locator(".support-label")).toHaveCount(0);
    await expect(page.locator("#viewport")).toHaveAttribute(
      "data-support-display",
      view === "3d" ? "illustrative-solid" : "analytical-symbol",
    );
    await expect(page.locator("#result-status")).toHaveText("✓ Current");
    await expect(page.locator("#hash-status")).toHaveText(hash);
  }
  await page.locator("#support-labels").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#support-labels")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".support-label")).toHaveCount(1);
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
});

test("Member label Auto, Show all and Hide are independent of support labels", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#worked-examples").click();
  await page.locator("[data-example=UKR01]").click();
  await expect(page.locator("#model-count")).toHaveText(
    "447 nodes · 642 members",
  );
  const hash = await page.locator("#hash-status").textContent();
  await expect(page.locator(".member-label")).toHaveCount(1);
  const selectedLabels = await page.locator(".member-label").count();
  expect(selectedLabels).toBeLessThan(642);
  await page.locator("#member-labels").selectOption("show");
  await expect(page.locator(".member-label")).toHaveCount(642);
  await expect(page.locator(".support-label")).toHaveCount(12);
  await page.locator("#support-labels").click();
  await expect(page.locator(".support-label")).toHaveCount(0);
  await expect(page.locator(".member-label")).toHaveCount(642);
  await page.locator("#member-labels").selectOption("hide");
  for (const view of ["plan", "elevation", "3d"]) {
    await page.locator(`#view-${view}`).click();
    await expect(page.locator(".member-label")).toHaveCount(0);
  }
  await page.locator("#support-labels").click();
  await expect(page.locator(".support-label")).toHaveCount(12);
  await expect(page.locator(".member-label")).toHaveCount(0);
  await page.locator("#member-labels").selectOption("auto");
  await expect(page.locator(".member-label")).toHaveCount(selectedLabels);
  await expect(page.locator("#hash-status")).toHaveText(hash);
});
