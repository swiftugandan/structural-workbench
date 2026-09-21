import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { record, evidenceDir } from "../../tools/evidence.mjs";
for (const dpr of [1, 2])
  test(`M01 graphics: DPR ${dpr}, far-origin rebase, near-coincident warning, resize and clipping`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: dpr,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    const p = JSON.parse(await readFile("fixtures/models/B02.json", "utf8"));
    for (const n of p.nodes) n.position = n.position.map((x) => x + 9990000);
    p.nodes.push({ id: "near", position: [9990000.0000005, 9990000, 9990000] });
    await page.locator("#import-file").setInputFiles({
      name: "far-origin.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
    await expect(page.locator("#model-count")).toHaveText(
      "3 nodes · 1 members",
    );
    await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
    await expect(page.locator("#near-node-status")).toContainText(
      "near-coincident",
    );
    const hash = await page.locator("#hash-status").textContent();
    const projected = await page
      .locator("#viewport-labels .node-label")
      .filter({ hasText: /^n[12]$/ })
      .evaluateAll((els) =>
        els.map((el) => [parseFloat(el.style.left), parseFloat(el.style.top)]),
      );
    expect(projected).toHaveLength(2);
    expect(projected.flat().every(Number.isFinite)).toBe(true);
    expect(Math.abs(projected[0][0] - projected[1][0])).toBeGreaterThan(100);
    const scale = await page
      .locator("#viewport")
      .evaluate((el) => el.width / el.clientWidth);
    expect(scale).toBeCloseTo(dpr, 1);
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.locator("#view-3d").click();
    await page.locator("#viewport").press("Home");
    await expect(page.locator("#gpu-notice")).toBeHidden();
    await expect(page.locator("#hash-status")).toHaveText(hash);
    const box = await page.locator("#viewport").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 100000);
    await page.locator("#viewport").press("Home");
    await expect(page.locator("#gpu-notice")).toBeHidden();
    expect(errors).toEqual([]);
    await mkdir(evidenceDir(), { recursive: true });
    await page.screenshot({
      path: `${evidenceDir()}/far-origin-dpr${dpr}.png`,
      fullPage: true,
    });
    await context.close();
  });
test("M01 graphics: depth occlusion and changing camera during asynchronous selection", async ({
  page,
}) => {
  await page.goto("/");
  const p = JSON.parse(await readFile("fixtures/models/B02.json", "utf8"));
  p.nodes.push(
    { id: "n3", position: [0, 1, 0] },
    { id: "n4", position: [3, 1, 0] },
  );
  p.members.push({ ...p.members[0], id: "m2", start: "n3", end: "n4" });
  await page.locator("#import-file").setInputFiles({
    name: "occlusion.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 2 members");
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  const box = await page.locator("#viewport").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.53);
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-last-cpu-pick",
    "m2",
  );
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-last-gpu-pick",
    "m2",
  );
  const hash = await page.locator("#hash-status").textContent();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.53);
  await page.locator("#view-plan").click();
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await expect(page.locator("#gpu-notice")).toBeHidden();
  await record("m01-graphics", {
    status: "PASS",
    testCount: 3,
    testIds: [
      "M01-far-origin-dpr1",
      "M01-far-origin-dpr2",
      "M01-depth-and-stale-pick",
    ],
    command: ["npx", "playwright", "test", "tests/visual/m01-graphics.spec.js"],
    browser: page.context().browser().version(),
    limitations: "Actual GPU/platform performance acceptance is separate.",
  });
});
