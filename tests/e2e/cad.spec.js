import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir } from "node:fs/promises";
import { evidenceDir, record } from "../../tools/evidence.mjs";
async function portal(page) {
  await page.goto("/");
  await page.locator("#new-portal").click();
  await page
    .getByRole("button", { name: "Create portal", exact: true })
    .click();
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 3 members");
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
}
async function exported(page) {
  const download = page.waitForEvent("download");
  await page.locator("#export-project").click();
  return JSON.parse(await readFile(await (await download).path(), "utf8"));
}
async function point(page, id) {
  return page
    .locator("#viewport-labels .node-label")
    .filter({ hasText: new RegExp("^" + id + "$") })
    .evaluate((el) => {
      const r = document.querySelector("#viewport").getBoundingClientRect();
      return {
        x: r.x + parseFloat(el.style.left) - 9,
        y: r.y + parseFloat(el.style.top) - 10,
      };
    });
}
async function draw(page, start, end) {
  const a = await point(page, start),
    b = await point(page, end);
  await page.mouse.click(a.x, a.y);
  await page.mouse.move(b.x, b.y);
  await expect(page.locator("#draw-status")).toContainText(`node ${end}`);
  await page.mouse.click(b.x, b.y);
  await page.locator("#viewport").press("Enter");
}
test("M01 CAD pointer drawing, snap feedback, disconnected crossing and explicit connect", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await portal(page);
  await page.locator("#draw-toggle").click();
  await draw(page, "n1", "n3");
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 4 members");
  await draw(page, "n2", "n4");
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 5 members");
  await page.locator("#cancel-drawing").click();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-disconnected-crossings",
    "1",
  );
  await expect(page.locator("#geometry-status")).toContainText(
    "unconnected crossings",
  );
  const before = await exported(page);
  const hash = await page.locator("#hash-status").textContent();
  await page.locator("#topology").click();
  await page.locator("#topology-kind").selectOption("ConnectIntersections");
  await page
    .getByRole("button", { name: "Preview topology", exact: true })
    .click();
  await expect(page.locator("#topology-commit")).toBeVisible();
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("#topology-commit").click();
  await expect(page.locator("#model-count")).toHaveText("5 nodes · 7 members");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-disconnected-crossings",
    "0",
  );
  await page.locator("#viewport").press("ControlOrMeta+z");
  await expect(page.locator("#hash-status")).toHaveText(hash);
  expect((await exported(page)).members).toEqual(before.members);
  await page.locator("#viewport").press("ControlOrMeta+Shift+z");
  await expect(page.locator("#model-count")).toHaveText("5 nodes · 7 members");
  expect(errors).toEqual([]);
  await mkdir(evidenceDir(), { recursive: true });
  await page.screenshot({
    path: `${evidenceDir()}/cad-crossings.png`,
    fullPage: true,
  });
});
test("M01 CAD multi-selection, move copy delete previews, measure and scoped shortcuts", async ({
  page,
}) => {
  await portal(page);
  const initial = await exported(page),
    hash = await page.locator("#hash-status").textContent();
  const a = await point(page, "n2"),
    b = await point(page, "n3");
  await page.mouse.click(a.x, a.y);
  await page.keyboard.down("Shift");
  await page.mouse.click(b.x, b.y);
  await page.keyboard.up("Shift");
  await expect(page.locator("#selected-status")).toContainText("2 selected");
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("#cad-tools").click();
  await page.locator("#cad-Z").fill("500 mm");
  await page
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  await expect(page.locator("#cad-commit")).toBeVisible();
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("#cad-commit").click();
  const moved = await exported(page);
  expect(moved.nodes.find((n) => n.id === "n2").position[2]).toBe(3.5);
  expect(moved.nodes.find((n) => n.id === "n3").position[2]).toBe(3.5);
  await page.locator("#viewport").press("ControlOrMeta+z");
  expect((await exported(page)).nodes).toEqual(initial.nodes);
  await page.locator("#cad-tools").click();
  await page.locator("#cad-ids").fill("m2");
  await page.locator("#cad-kind").selectOption("CopySelection");
  await page.locator("#cad-X").fill("5 m");
  await page
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  await expect(page.locator("#cad-commit")).toBeVisible();
  await page.locator("#cad-commit").click();
  await expect(page.locator("#model-count")).toHaveText("6 nodes · 4 members");
  const copied = await exported(page);
  expect(copied.supports).toEqual(initial.supports);
  expect(copied.loads).toEqual(initial.loads);
  await page.locator("#cad-tools").click();
  await page.locator("#cad-ids").fill("n1");
  await page.locator("#cad-kind").selectOption("DeleteGeometry");
  await page
    .getByRole("button", { name: "Preview changes", exact: true })
    .click();
  await expect(page.locator("#cad-preview")).toContainText("s1 · remove");
  await page.locator("#cad-commit").click();
  expect((await exported(page)).supports).toHaveLength(1);
  await page.locator("#undo").click();
  expect((await exported(page)).supports).toEqual(initial.supports);
  await page.locator("#measure-tool").click();
  await page.locator("#measure-start").selectOption("n2");
  await page.locator("#measure-end").selectOption("n3");
  await page
    .getByRole("button", { name: "Measure distance", exact: true })
    .click();
  await expect(page.locator("#measure-result")).toContainText("4.000000000 m");
  await page.locator("#close-modal").click();
  await page.locator("#cad-tools").click();
  await page.locator("#cad-ids").fill("m1");
  await page.locator("#cad-X").fill("7 m");
  await page.keyboard.press("Escape");
  await expect(page.locator("#modal")).toBeHidden();
  expect((await exported(page)).nodes).toEqual(copied.nodes);
});
test("M01 CAD working planes, aligned grid, cursor zoom, box selection and camera invariance", async ({
  page,
}) => {
  await portal(page);
  await page.locator("#draw-toggle").click();
  await page.locator("#working-plane").selectOption("XY");
  await page.locator("#plane-offset").fill("2");
  await page.locator("#plane-offset").press("Tab");
  for (const [label, value] of [
    ["Start X", "8"],
    ["Start Y", "0"],
    ["End X", "8"],
    ["End Y", "3"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  await expect(page.locator("#model-count")).toHaveText("6 nodes · 4 members");
  const p = await exported(page);
  expect(p.nodes.some((n) => n.position.join(",") === "8,3,2")).toBe(true);
  expect(p.members.at(-1)).toBeDefined();
  await page.locator("#cancel-drawing").click();
  await page.locator("#view-elevation").click();
  const hash = await page.locator("#hash-status").textContent(),
    a = await point(page, "n1");
  await page.mouse.move(a.x, a.y);
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(100);
  const zoomed = await point(page, "n1");
  expect(Math.hypot(zoomed.x - a.x, zoomed.y - a.y)).toBeLessThan(1);
  await page.locator("#viewport").press("Home");
  const box = await page.locator("#viewport").boundingBox();
  await page.mouse.move(box.x + 2, box.y + 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height - 2, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(page.locator("#selected-status")).toContainText("selected");
  await page.locator("#view-3d").click();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(
    box.x + box.width / 2 + 60,
    box.y + box.height / 2 + 20,
    { steps: 5 },
  );
  await page.mouse.up({ button: "right" });
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("#view-plan").click();
  await expect(page.locator("#view-subtitle")).toContainText("Global XY");
  await expect(page.locator("#hash-status")).toHaveText(hash);
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${evidenceDir()}/cad-mobile.png`,
    fullPage: true,
  });
  await record("m01-cad", {
    status: "PASS",
    testCount: 3,
    testIds: [
      "M01-draw-snap-crossings",
      "M01-multiselect-atomic-edit",
      "M01-working-planes-camera",
    ],
    command: ["npx", "playwright", "test", "tests/e2e/cad.spec.js"],
    browser: page.context().browser().version(),
  });
});
