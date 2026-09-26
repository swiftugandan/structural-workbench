import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { frame } from "../helpers/frame.js";

test.use({ trace: { mode: "on", snapshots: false, screenshots: true } });

test("Large Explorer defers closed branches and exposes every member on expansion and search", async ({
  page,
}) => {
  test.setTimeout(90000);
  const p = frame(
    JSON.parse(await readFile("fixtures/models/B02.json", "utf8")),
    1500,
  );
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "large-tree.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(page.locator("#model-count")).toContainText("1500 members");
  const level = page.locator('[data-branch="storey:null"]');
  await expect(level).toHaveAttribute("data-lazy", "true");
  await expect(page.locator("[data-member]")).toHaveCount(0);
  await level.locator(":scope > summary").click();
  await expect(
    page.locator('[data-structure-key="physicalMembers"]'),
  ).toHaveCount(1500);
  await page.locator("#model-search").fill("m1499");
  await page.locator('[data-member="m1499"]').click();
  await page.locator("#model-search").fill("");
  await expect(page.locator('[data-member="m1499"]')).toBeVisible();
  const owner = await page
    .locator(".physical-object")
    .filter({ has: page.locator('[data-member="m1499"]') })
    .locator("[data-structure-id]")
    .getAttribute("data-structure-id");
  await page.locator("[data-branch=layers] > summary").click();
  await page.locator("[data-structure-add=layers]").click();
  await page
    .locator("#structure-form [name=name]")
    .fill("Large frame selection");
  await page
    .locator(`#structure-form [value="physicalMember:${owner}"]`)
    .check();
  await page.locator("#structure-form button.primary").click();
  await page.locator("#explorer-expand").click();
  await expect(page.locator("[data-member]")).toHaveCount(1500);
  await expect(page.locator("details[data-lazy]")).toHaveCount(0);
  await page.locator("#explorer-collapse").click();
  await expect(page.locator("#model-nav details[open]")).toHaveCount(0);
  await page.locator("#model-search").fill("missing member");
  await page.locator("#model-search").fill("");
  await expect(page.locator(`[data-structure-id="${owner}"]`)).toHaveCount(0);
  await page.locator("[data-branch=structure] > summary").click();
  await page.locator("[data-branch=layers] > summary").click();
  await page.locator(`[data-structure-ref="${owner}"]`).click();
  await expect(page.locator("#structure-form [name=name]")).toHaveValue(
    "m1499",
  );
  await expect(page.locator(`[data-structure-id="${owner}"]`)).toHaveCount(1);
});
