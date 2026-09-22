import { test, expect } from "@playwright/test";
test("Selected member force diagram station, units and stale state", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#new-project").click();
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  await page.locator('[data-inspector-tab="forces"]').click();
  await expect(page.locator("#force-inspector")).toContainText(
    "Analyse the model",
  );
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await expect(page.locator("#member-force-readout")).toContainText("30 kN");
  await page.locator("#member-force-station").fill("40");
  await page.locator("#member-force-station").dispatchEvent("change");
  await expect(page.locator("#member-force-readout")).toContainText("x = 3 m");
  await expect(page.locator("#member-force-readout")).toContainText("0 kN");
  await page.locator("#member-force-component").selectOption("shearZ");
  await expect(page.locator("#member-force-readout")).toContainText("-10 kN");
  await page.locator("#units").selectOption("SI");
  await expect(page.locator("#member-force-readout")).toContainText(
    "-10,000 N",
  );
  const node = await page
    .locator('.node-label[data-entity-id="n2"]')
    .first()
    .boundingBox();
  await page.mouse.click(node.x - 9, node.y - 10);
  await expect(page.locator("#force-inspector")).toContainText(
    "Select a member",
  );
  await expect(page.locator("#force-inspector svg")).toHaveCount(0);
  await expect(page.locator("#force-inspector table")).toHaveCount(0);
  await page.locator('[data-member="m1"]').click();
  await page.locator('[data-inspector-tab="properties"]').click();
  await page.locator("#span").fill("4");
  await page.locator('#member-form button[type="submit"]').click();
  await page.locator('[data-inspector-tab="forces"]').click();
  await expect(page.locator("#force-inspector")).toContainText("stale");
});
