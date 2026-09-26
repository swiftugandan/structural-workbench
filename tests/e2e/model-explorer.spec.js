import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
test("Reference Explorer: nested elements, search, disclosure state and selection", async ({
  page,
}) => {
  const p = JSON.parse(await readFile("fixtures/models/B04.json", "utf8"));
  p.id = "explorer-review";
  p.name = "Synthetic hierarchy review";
  p.nodes.push(
    { id: "n3", position: [0, 0, 3] },
    { id: "n4", position: [3, 0, 3] },
  );
  const m = p.members[0];
  p.members.push(
    { ...m, id: "c1", start: "n1", end: "n3" },
    { ...m, id: "b2", start: "n3", end: "n4" },
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "hierarchy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 3 members");
  const hash = await page.locator("#hash-status").textContent();
  await expect(page.locator('[data-branch="level:3"]')).toContainText("Beams");
  await expect(
    page.locator('[data-branch="level:0:Columns"] [data-member="c1"]'),
  ).toBeVisible();
  await page.locator('[data-branch="level:0"] > summary').click();
  await page.locator('[data-member="b2"]').click();
  await expect(page.locator("#selection-tag")).toHaveText("m3");
  await expect(page.locator('[data-branch="level:0"]')).not.toHaveAttribute(
    "open",
    "",
  );
  await page.locator("#model-search").fill("c1");
  await expect(page.locator('[data-member="c1"]')).toBeVisible();
  await expect(page.locator('[data-member="b2"]')).not.toBeVisible();
  await page.locator('[data-member="c1"]').click();
  await expect(page.locator("#selection-tag")).toHaveText("m2");
  await page.locator("#model-search").fill("no matching element");
  await expect(page.locator("#explorer-empty")).toBeVisible();
  await page.locator("#model-search").fill("");
  await page.locator("#explorer-collapse").click();
  await expect(page.locator('[data-member="c1"]')).not.toBeVisible();
  await page.locator("#explorer-expand").click();
  await page.locator('[data-entity-id="mat1"]').click();
  await expect(page.locator("#modal")).toBeVisible();
  await page.locator("#close-modal").click();
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("[data-inspector-tab=steel]").click();
  await expect(page.locator("#steel-design-inspector h2")).toContainText("m2");
  await page.locator("#view-3d").click();
  await mkdir("evidence/explorer-fidelity", { recursive: true });
  await page.screenshot({ path: "evidence/explorer-fidelity/hierarchy.png" });
});
