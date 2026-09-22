import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function start(page) {
  await page.goto("/");
  await page.locator("#new-portal").click();
  await page
    .getByRole("button", { name: "Create portal", exact: true })
    .click();
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 3 members");
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
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
async function model(page) {
  const d = page.waitForEvent("download");
  await page.locator("#export-project").click();
  return JSON.parse(await readFile(await (await d).path(), "utf8"));
}
async function clickNode(page, id) {
  const p = await point(page, id);
  await page.mouse.click(p.x, p.y);
}

test("Canvas first: place support, draw force, edit assignments and undo without dialogs", async ({
  page,
}) => {
  await start(page);
  const initial = await model(page);
  await page.locator("#add-support-tool").click();
  await page.locator("#support-preset").selectOption("pinned");
  await clickNode(page, "n2");
  await expect(page.locator("#selection-tag")).toHaveText(/^s/);
  await expect(page.locator("#modal")).not.toBeVisible();
  let p = await model(page);
  const support = p.supports.find((s) => s.node === "n2");
  expect(support).toBeTruthy();
  expect(support.fixed).toEqual([true, false, true, false, false, false]);
  await page.locator("#placement-cancel").click();
  await page
    .locator(`[data-assignment="${support.id}"]`)
    .click({ button: "right" });
  await expect(page.locator("#direct-properties")).toBeVisible();
  await page.getByText("Custom movement restraints", { exact: true }).click();
  await page.locator('#direct-properties [name="fixed-4"]').check();
  await page
    .locator("#direct-properties")
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  expect(
    (await model(page)).supports.find((s) => s.id === support.id).fixed[4],
  ).toBe(true);
  await page.locator("#add-load-tool").click();
  const n = await point(page, "n2");
  await page.mouse.move(n.x, n.y);
  await page.mouse.down();
  await page.mouse.move(n.x + 70, n.y);
  await page.mouse.up();
  await expect(page.locator("#selection-tag")).toHaveText(/^l/);
  p = await model(page);
  const load = p.loads.find((l) => !initial.loads.some((x) => x.id === l.id));
  expect(load.node).toBe("n2");
  expect(load.values[0]).toBeCloseTo(10000);
  expect(load.values[2]).toBeCloseTo(0);
  await expect(page.locator("#modal")).not.toBeVisible();
  await page.locator("#placement-cancel").click();
  await page
    .locator(`[data-assignment="${load.id}"]`)
    .click({ button: "right" });
  await page
    .getByText("Force components · custom direction", { exact: true })
    .click();
  await page.locator('#direct-properties [name="values-0"]').fill("5 kN");
  await page
    .locator("#direct-properties")
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  expect(
    (await model(page)).loads.find((l) => l.id === load.id).values[0],
  ).toBe(5000);
  await page.locator("#undo").click();
  expect(
    (await model(page)).loads.find((l) => l.id === load.id).values[0],
  ).toBe(10000);
  await page.locator("#undo").click();
  expect((await model(page)).loads).toEqual(initial.loads);
});

test("Canvas first: two-click members, distributed loads, measure and nonmodal precision panel", async ({
  page,
}) => {
  await start(page);
  await page.locator("#draw-toggle").click();
  await clickNode(page, "n1");
  await clickNode(page, "n3");
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 4 members");
  await page.locator("#cancel-drawing").click();
  await page.locator("#add-load-tool").click();
  const a = await point(page, "n2"),
    b = await point(page, "n3");
  await page.mouse.click((a.x + b.x) / 2, (a.y + b.y) / 2);
  await expect(page.locator("#selection-tag")).toHaveText(/^l/);
  const p = await model(page);
  expect(
    p.loads.some(
      (l) =>
        l.type === "uniform" &&
        l.member === "m2" &&
        l.forcePerLength[2] === -10000,
    ),
  ).toBe(true);
  await page.locator("#placement-cancel").click();
  await page.locator("#measure-tool").click();
  await clickNode(page, "n2");
  await clickNode(page, "n3");
  await expect(page.locator("#placement-help")).toContainText("4 m");
  await page.locator("#placement-cancel").click();
  await page.locator("#cad-tools").click();
  await expect(page.locator("#modal")).toHaveClass(/command-dock/);
  expect(
    await page.locator("#modal").evaluate((el) => el.matches(":modal")),
  ).toBe(false);
  await expect(page.locator("#viewport")).toBeVisible();
  await page.locator("#close-modal").click();
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toContainText("Current");
});

test("Canvas first: point-to-point copy and dependency delete stay on canvas", async ({
  page,
}) => {
  await start(page);
  await page.locator('[data-member="m2"]').click();
  await page.locator("#canvas-copy").click();
  await clickNode(page, "n2");
  await expect(page.locator("#placement-help")).toContainText("destination");
  const b = await point(page, "n3");
  await page.mouse.click(b.x, b.y + 65);
  await expect(page.locator("#model-count")).toHaveText("6 nodes · 4 members");
  await expect(page.locator("#modal")).not.toBeVisible();
  await page.locator("#placement-cancel").click();
  await page.locator("#undo").click();
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 3 members");
  await page.locator('[data-member="m2"]').click();
  await page.locator("#canvas-delete").click();
  await expect(page.locator("#placement-confirm")).toBeVisible();
  await expect(page.locator("#placement-help")).toContainText("1 members");
  await page.locator("#placement-confirm").click();
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 2 members");
  await page.locator("#undo").click();
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 3 members");
});

test("Canvas first: node placement, split, move and Escape preserve atomic history", async ({
  page,
}) => {
  await start(page);
  const initial = await model(page);
  await page.locator("#add-node-tool").click();
  await expect(page.locator("#active-tool")).toContainText("Node");
  const box = await page.locator("#viewport").boundingBox();
  await page.mouse.click(box.x + box.width * 0.1, box.y + box.height * 0.65);
  await expect(page.locator("#model-count")).toHaveText("5 nodes · 3 members");
  await page.locator("#viewport").press("Escape");
  await page.locator("#undo").click();
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 3 members");
  await page.locator("#canvas-split").click();
  const a = await point(page, "n2"),
    b = await point(page, "n3");
  await page.mouse.click((a.x + b.x) / 2, (a.y + b.y) / 2);
  await expect(page.locator("#model-count")).toHaveText("5 nodes · 4 members");
  await page.locator("#placement-cancel").click();
  await page.locator("#undo").click();
  expect((await model(page)).members).toEqual(initial.members);
  await page.locator('[data-member="m2"]').click();
  await page.locator("#canvas-move").click();
  await clickNode(page, "n2");
  await expect(page.locator("#placement-help")).toContainText("destination");
  await page.locator("#viewport").press("Escape");
  expect((await model(page)).nodes).toEqual(initial.nodes);
  await page.locator("#canvas-move").click();
  await clickNode(page, "n2");
  await expect(page.locator("#placement-help")).toContainText("destination");
  const p = await point(page, "n2");
  await page.mouse.click(p.x + 55, p.y);
  await expect
    .poll(async () => JSON.stringify((await model(page)).nodes))
    .not.toBe(JSON.stringify(initial.nodes));
  await page.locator("#placement-cancel").click();
  await page.locator("#undo").click();
  expect((await model(page)).nodes).toEqual(initial.nodes);
  await expect(page.locator("#modal")).not.toBeVisible();
});

test("Readable labels hide internal IDs and persist after copy and reopen", async ({
  page,
}) => {
  await start(page);
  await page.locator('[data-member="m1"]').click();
  await page.locator("#canvas-copy").click();
  await clickNode(page, "n1");
  await clickNode(page, "n4");
  await expect(page.locator("#model-count")).toHaveText("6 nodes · 4 members");
  const saved = await model(page);
  const added = saved.members.find((m) => !["m1", "m2", "m3"].includes(m.id));
  expect(added.id).not.toBe("m4");
  expect(saved.metadata.entityLabels[added.id]).toBe("m4");
  await page.keyboard.press("Escape");
  await page.locator(`[data-member="${added.id}"]`).click();
  await expect(page.locator("#selection-tag")).toHaveText("m4");
  await expect(page.locator("#inspector-content")).not.toContainText(added.id);
  await expect(
    page.locator("#viewport-labels .member-label").filter({ hasText: /^m4$/ }),
  ).toBeVisible();
  await page.locator("#import-file").setInputFiles({
    name: "labels.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(page.locator(`[data-member="${added.id}"]`)).toContainText("m4");
  expect((await model(page)).metadata.entityLabels).toEqual(
    saved.metadata.entityLabels,
  );
});
