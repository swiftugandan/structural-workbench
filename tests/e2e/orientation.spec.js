import { test, expect } from "@playwright/test";
test("3D exposes Y direction and reference grid; orbit updates compass without model changes", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#new-project").click();
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  const hash = await page.locator("#hash-status").textContent();
  await page.locator("#view-3d").click();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-reference-plane",
    "XY",
  );
  await expect(page.locator("#reference-plane")).toContainText(
    "XY reference grid",
  );
  const y = page.locator('[data-global-axis="Y"]');
  await expect(y).toContainText("Y");
  const before = await y.getAttribute("data-direction");
  const direction = before.split(",").map(Number);
  expect(Math.hypot(...direction)).toBeGreaterThan(0.7);
  const r = await page.locator("#viewport").boundingBox();
  await page.keyboard.down("Alt");
  await page.mouse.move(r.x + r.width * 0.5, r.y + r.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.5 + 60, r.y + r.height * 0.5 + 25, {
    steps: 5,
  });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(y).not.toHaveAttribute("data-direction", before);
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("#view-elevation").click();
  await expect(page.locator("#reference-plane")).toBeHidden();
  await expect(page.locator('[data-global-axis="Y"] title')).toContainText(
    "end-on",
  );
});
