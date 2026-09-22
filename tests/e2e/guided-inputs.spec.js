import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir } from "node:fs/promises";
const evidence = "evidence/M01/guided-inputs";
async function start(page) {
  await page.goto("/");
  await page.locator("#new-portal").click();
  await page
    .getByRole("button", { name: "Create portal", exact: true })
    .click();
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 3 members");
}
async function edit(page, key, id) {
  await page.locator(`[data-group="${key}"]`).click();
  await page.locator(`[data-edit="${id}"]`).click();
  await expect(page.locator("#entity-form")).toBeVisible();
}
async function save(page) {
  await page
    .locator("#entity-form")
    .getByRole("button", { name: "Save entity", exact: true })
    .click();
  await expect(page.locator("#entity-form")).toHaveCount(0);
  await page.locator("#close-modal").click();
}
async function model(page) {
  const pending = page.waitForEvent("download");
  await page.locator("#export-project").click();
  return JSON.parse(await readFile(await (await pending).path(), "utf8"));
}
test("Guided inputs preserve exact properties and references, edit units, and undo", async ({
  page,
}) => {
  await start(page);
  const original = await model(page);
  for (const [key, id] of [
    ["nodes", "n3"],
    ["materials", "mat1"],
    ["sections", "sec1"],
    ["members", "m2"],
    ["supports", "s1"],
    ["loads", "l1"],
    ["loadCases", "LC1"],
  ]) {
    await edit(page, key, id);
    await expect(page.locator("#entity-form textarea")).toHaveCount(0);
    await expect(page.locator("#entity-form svg").first()).toBeVisible();
    await save(page);
    expect((await model(page))[key]).toEqual(original[key]);
  }
  await edit(page, "sections", "sec1");
  await page.locator('[name="Iy"]').fill("20000000");
  await save(page);
  expect((await model(page)).sections[0].Iy).toBeCloseTo(0.00002, 12);
  await page.locator("#undo").click();
  expect((await model(page)).sections).toEqual(original.sections);
  await edit(page, "nodes", "n3");
  await page.locator('[name="position-0"]').fill("4500 mm");
  await save(page);
  expect((await model(page)).nodes[2].position[0]).toBe(4.5);
  await edit(page, "members", "m2");
  await page.locator('[name="end"]').selectOption("n2");
  await page.locator('#entity-form button[type="submit"]').click();
  await expect(page.locator("#entity-error")).toContainText(
    "two different points",
  );
});
test("Support presets, directional loads, load types and combinations save through real kernel", async ({
  page,
}) => {
  await start(page);
  await edit(page, "supports", "s1");
  await page.locator('[data-support-preset="pinned"]').click();
  await expect(page.locator("[data-support-summary]")).toContainText("Pinned");
  await save(page);
  expect((await model(page)).supports[0].fixed).toEqual([
    true,
    false,
    true,
    false,
    false,
    false,
  ]);
  await page.locator("#undo").click();
  await edit(page, "loads", "l1");
  await page.locator('[name="quick-direction"]').selectOption("2:-1");
  await page.locator('[name="quick-magnitude"]').fill("12");
  await expect(page.locator("[data-load-preview]")).toContainText("−Z · 12 kN");
  await save(page);
  expect((await model(page)).loads[0].values).toEqual([0, 0, -12000, 0, 0, 0]);
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toContainText("Current");
  await edit(page, "loads", "l1");
  await page.locator('[name="type"]').selectOption("uniform");
  await page.locator('[name="quick-magnitude"]').fill("2.5");
  await save(page);
  expect((await model(page)).loads[0]).toMatchObject({
    type: "uniform",
    forcePerLength: [0, 0, -2500],
    axes: "global",
  });
  await edit(page, "loads", "l1");
  await page.locator('[name="type"]').selectOption("selfWeight");
  await save(page);
  expect((await model(page)).loads[0]).toMatchObject({
    type: "selfWeight",
    factor: 1,
    members: ["m1", "m2", "m3"],
  });
  await page.locator('[data-group="combinations"]').click();
  await page.locator("#add-entity").click();
  await page.locator('[name="name"]').fill("Factored weight");
  await page.locator('[name="factor-LC1"]').fill("1.5");
  await save(page);
  expect((await model(page)).combinations[0].terms).toEqual([
    { case: "LC1", factor: 1.5 },
  ]);
});
test("Guided forms are accessible and fit desktop and phone widths", async ({
  page,
}) => {
  await start(page);
  await mkdir(evidence, { recursive: true });
  await expect(page.locator("#model-nav .nav-section-title")).toHaveText([
    "Structure",
    "Member properties",
    "Loading",
  ]);
  expect(
    await page
      .locator("#model-nav .count")
      .evaluateAll((els) =>
        els.every((el) => el.getBoundingClientRect().height === 22),
      ),
  ).toBe(true);
  await page
    .locator(".model-panel")
    .screenshot({ path: `${evidence}/explorer.png` });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (width === 390) await page.locator('[data-panel="model"]').click();
    await edit(page, "supports", "s1");
    const scan = await new AxeBuilder({ page }).include("#modal").analyze();
    expect(scan.violations).toEqual([]);
    expect(
      await page
        .locator("#modal-content")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({ path: `${evidence}/supports-${width}.png` });
    await page.locator("#close-modal").click();
  }
});
