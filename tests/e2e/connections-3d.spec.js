import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
test("3D joint/support presentation preserves restraints, picking and view switching", async ({
  page,
}) => {
  const p = JSON.parse(await readFile("fixtures/models/B04.json", "utf8")),
    m = p.members[0];
  p.id = "support-review";
  p.name = "Illustrative support review";
  p.nodes = [];
  p.members = [];
  p.supports = [];
  p.loads = [];
  for (let i = 0; i < 3; i++) {
    p.nodes.push(
      { id: `a${i}`, position: [i * 3, 0, 0] },
      { id: `b${i}`, position: [i * 3, 0, 3] },
    );
    p.members.push({ ...m, id: `c${i}`, start: `a${i}`, end: `b${i}` });
    p.supports.push({
      id: `s${i}`,
      node: `a${i}`,
      fixed:
        i === 0
          ? [true, true, true, true, true, true]
          : i === 1
            ? [true, true, true, false, false, false]
            : [false, false, true, false, false, false],
      prescribed: [0, 0, 0, 0, 0, 0],
    });
    if (i)
      p.members.push({
        ...m,
        id: `beam${i}`,
        start: `b${i - 1}`,
        end: `b${i}`,
      });
  }
  await mkdir("evidence/connections-3d", { recursive: true });
  await writeFile(
    "evidence/connections-3d/review-model.json",
    JSON.stringify(p, null, 2),
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "supports.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(page.locator("#model-count")).toContainText("6 nodes");
  const hash = await page.locator("#hash-status").textContent();
  await page.locator("[data-inspector-tab=steel]").click();
  await page.locator("#view-3d").click();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-support-display",
    "illustrative-solid",
  );
  for (const [id, kind] of [
    ["s0", "fixed"],
    ["s1", "pinned"],
    ["s2", "roller"],
  ]) {
    const badge = page.locator(`[data-assignment="${id}"]`);
    await expect(badge).toHaveAttribute("data-support-kind", kind);
    await expect(badge).toHaveAttribute(
      "title",
      /Illustrative restraint geometry/,
    );
  }
  await page.screenshot({ path: "evidence/connections-3d/three-supports.png" });
  await page.locator("#view-elevation").click();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-support-display",
    "analytical-symbol",
  );
  await page.locator("#view-3d").click();
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator('[data-assignment="s1"]').click();
  await expect(page.locator("#selected-status")).toContainText("s2");
});
