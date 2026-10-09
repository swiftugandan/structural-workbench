import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { menuCommand } from "../menu-helpers.js";
import { evidenceDir } from "../../tools/evidence.mjs";

/** ADR 0035: slab panels drawn, picked, scoped and placed in the model
 * views, through the browser build and the real Rust geometry. */
const dir = evidenceDir("evidence/M10/slab-panels");

/** An 8 × 6 m two-by-two bay frame: nine 3 m columns with fixed bases, top
 * beams on every grid line, and one ground tie g0 between two bases that no
 * slab column touches. */
function frame() {
  const xs = [0, 4, 8],
    ys = [0, 3, 6];
  const grid = ys.flatMap((y, j) =>
    xs.map((x, i) => ({ k: `${i}${j}`, x, y, i, j })),
  );
  const member = (id, start, end, section, localY) => ({
    id,
    start,
    end,
    material: "c",
    section,
    localY,
    releaseStart: { my: false, mz: false },
    releaseEnd: { my: false, mz: false },
  });
  const beams = [];
  for (const p of grid)
    for (const q of grid)
      if ((q.i === p.i + 1 && q.j === p.j) || (q.j === p.j + 1 && q.i === p.i))
        beams.push(
          member(`b${p.k}${q.k}`, `t${p.k}`, `t${q.k}`, "beam", [0, 0, 1]),
        );
  return {
    schemaVersion: "1.0.0",
    id: "slab-panels",
    name: "Slab panels",
    revision: 0,
    displayUnits: "SI",
    analysisMode: "spatial",
    gravity: [0, 0, -9.80665],
    materials: [{ id: "c", name: "concrete", E: 33e9, nu: 0.2, density: 0 }],
    sections: [
      {
        id: "col",
        name: "col",
        A: 0.09,
        Iy: 6.75e-4,
        Iz: 6.75e-4,
        J: 1.14e-3,
        cy: 0.15,
        cz: 0.15,
        provenance: "test",
      },
      {
        id: "beam",
        name: "beam",
        A: 0.15,
        Iy: 3.125e-3,
        Iz: 1.125e-3,
        J: 2.82e-3,
        cy: 0.15,
        cz: 0.25,
        provenance: "test",
      },
    ],
    nodes: grid.flatMap((p) => [
      { id: `f${p.k}`, position: [p.x, p.y, 0] },
      { id: `t${p.k}`, position: [p.x, p.y, 3] },
    ]),
    members: [
      ...grid.map((p) =>
        member(`c${p.k}`, `f${p.k}`, `t${p.k}`, "col", [1, 0, 0]),
      ),
      ...beams,
      member("g0", "f00", "f10", "beam", [0, 0, 1]),
    ],
    supports: grid.map((p) => ({
      id: `s${p.k}`,
      node: `f${p.k}`,
      fixed: [true, true, true, true, true, true],
      prescribed: [0, 0, 0, 0, 0, 0],
    })),
    loadCases: [{ id: "SL", name: "Slab", category: "dead" }],
    loads: [],
    combinations: [],
    analysisSettings: {
      type: "linearStatic",
      formulation: "eulerBernoulli3D",
      mergeTolerance: 1e-6,
      timeoutMs: 30000,
      memoryLimitMiB: 512,
    },
    metadata: { description: "slab panels", createdBy: "tests" },
  };
}

const slabs = async (page) =>
  JSON.parse(
    (await page.locator("#viewport").getAttribute("data-slabs")) || "[]",
  );

/** Opens the frame and creates an 8 × 6 m slab with its opening at
 * (1.5, 1)…(2.5, 2); placed at support level z = 3 when `place`. */
async function openSlab(page, { place }) {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "frame.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(frame())),
  });
  await expect(page.locator("#kernel-status")).toContainText("ready");
  // A cold SwiftShader start at this size can take longer than 5 s.
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU", {
    timeout: 30000,
  });
  await page.locator("[data-inspector-tab=concrete]").click();
  await page.locator("#preview-kind").selectOption("slab");
  await page.locator("#preview-create").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
  await page.locator("#preview-length").fill("8 m");
  await page.locator("#preview-width").fill("6 m");
  await page.locator("#preview-plate-openingX").fill("1.5 m");
  await page.locator("#preview-plate-openingY").fill("1 m");
  if (place) {
    await page.locator("#slab-placed").check();
    await page.locator("#slab-placement-z").fill("3");
  }
  await page.locator("#preview-save").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
  return page.locator("#preview-active").inputValue();
}

/** Screen point of panel (x, y) in plan, from the fitted bounds (the panel
 * spans the frame exactly). */
async function planPoint(page, x, y) {
  const [x0, y0, x1, y1] = JSON.parse(
    await page.locator("#viewport").getAttribute("data-fit-bounds"),
  );
  const r = await page.locator("#viewport").boundingBox();
  return {
    x: r.x + x0 + (x / 8) * (x1 - x0),
    y: r.y + y1 - (y / 6) * (y1 - y0),
  };
}
async function clickPanel(page, x, y) {
  const p = await planPoint(page, x, y);
  await page.mouse.click(p.x, p.y);
}

test("A placed slab is drawn, picked, scoped and toggled in the model views", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const id = await openSlab(page, { place: true });
  await expect(page.locator("[data-testid=slab-placement-status]")).toHaveText(
    /^Placed: corner \(0, 0\) m at support level z = 3 m/,
  );
  await page.locator("#slab-derive-columns").click();
  await expect(
    page.locator('[data-testid=slab-column][data-source="model"]'),
  ).toHaveCount(9);
  // The sketch's opening is the analysed one: left of centre, low in the panel.
  const sketch = await page
    .locator("[data-testid=slab-sketch-opening]")
    .evaluate((r) => [r.x.baseVal.value, r.y.baseVal.value]);
  expect(sketch[0]).toBeLessThan(150 - 20);
  expect(sketch[1]).toBeGreaterThan(100);
  const hash = await page.locator("#hash-status").textContent();

  // Leave the design object: the model views show the slab in place.
  await page.locator("[data-inspector-tab=properties]").click();
  await page.locator("#view-plan").click();
  await expect
    .poll(() => slabs(page))
    .toEqual([{ id, style: "lines", active: false, loaded: true }]);
  await page.locator("#model-solids").click();
  await expect
    .poll(() => slabs(page))
    .toEqual([{ id, style: "solid", active: false, loaded: true }]);
  await mkdir(dir, { recursive: true });
  await page.locator("#view-3d").click();
  await page.screenshot({ path: `${dir}/slab-3d-solid.png` });
  await page.locator("#model-lines").click();
  await page.screenshot({ path: `${dir}/slab-3d-lines.png` });
  await page.locator("#view-plan").click();
  await expect
    .poll(() => slabs(page))
    .toEqual([{ id, style: "lines", active: false, loaded: true }]);

  // A click on the slab opens it; the frame and the opening keep theirs.
  await clickPanel(page, 6, 4.5);
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-last-cpu-pick",
    id,
  );
  await expect(page.locator("#concrete-inspector")).toBeVisible();
  await expect(page.locator("#preview-active")).toHaveValue(id);
  await page.locator("[data-inspector-tab=properties]").click();
  await clickPanel(page, 2, 1.5);
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-last-cpu-pick",
    "",
  );
  await clickPanel(page, 2, 3);
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-last-cpu-pick",
    "b0111",
  );
  await expect(page.locator("#concrete-inspector")).toBeHidden();
  // Solid: the pick follows the drawn slab (physical faces).
  await page.locator("#model-solids").click();
  await clickPanel(page, 6, 4.5);
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-last-cpu-pick",
    id,
  );
  await page.locator("[data-inspector-tab=properties]").click();
  await page.locator("#model-lines").click();

  // Overlays → Slabs hides the slab from drawing and picking.
  await page.locator("#view-options summary").click();
  await page.locator("#model-slabs").click();
  await expect(page.locator("#model-slabs")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect.poll(() => slabs(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await clickPanel(page, 6, 4.5);
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-last-cpu-pick",
    "",
  );
  await page.locator("#view-options summary").click();
  await page.locator("#model-slabs").click();
  await page.keyboard.press("Escape");
  await expect.poll(() => slabs(page)).toHaveLength(1);

  // Scope: the slab follows its columns. Isolating the ground tie (no slab
  // column) hides it; isolating a column shows it.
  const isolate = async (member) => {
    await page.locator(`#model-nav [data-member="${member}"]`).first().click();
    if ((await page.locator("#view-scope").getAttribute("open")) === null)
      await page.locator("#view-scope summary").click();
    await page.locator("#isolate-selection").click();
  };
  await page.locator("#explorer-expand").click();
  await isolate("g0");
  await expect.poll(() => slabs(page)).toEqual([]);
  await page.locator("#show-all-model").click();
  await expect.poll(() => slabs(page)).toHaveLength(1);
  await isolate("c11");
  await expect.poll(() => slabs(page)).toHaveLength(1);
  await page.locator("#show-all-model").click();
  await page.keyboard.press("Escape");

  // Display only: nothing above changed the model.
  await expect(page.locator("#hash-status")).toHaveText(hash);
  expect(errors).toEqual([]);
});

test("A slab on beams is placed without columns, undoably, and says where it is", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const id = await openSlab(page, { place: false });
  await expect(page.locator("[data-testid=slab-placement-status]")).toHaveText(
    /^Not placed/,
  );
  await expect(page.locator("#slab-derive-columns")).toBeDisabled();
  await expect(page.locator("#slab-placement-z")).toBeDisabled();
  await page.locator("#preview-focus").click();
  await expect(page.locator("#design-scene-caption")).toContainText(
    "Not placed in the model",
  );
  await expect.poll(() => slabs(page)).toEqual([]);

  // Place it at the beam level; no columns are needed.
  await page.locator("#slab-placed").check();
  await expect(page.locator("#slab-placement-z")).toBeEnabled();
  await page.locator("#slab-placement-z").fill("3");
  await page.locator("#preview-save").click();
  // It rests on the twelve top beams (half-height c_y = 0.15 m, local y up).
  await expect(page.locator("#design-scene-caption")).toContainText(
    "support level z = 3 m · soffit on 12 members at z = 3.15 m",
  );
  await expect
    .poll(() => slabs(page))
    .toEqual([{ id, style: expect.any(String), active: true, loaded: true }]);
  // The object heading replaces the canvas caption; nothing overlaps it.
  await expect(page.locator(".view-caption")).toBeHidden();
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/slab-model-context.png` });

  const download = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const saved = JSON.parse(
    await readFile(await (await download).path(), "utf8"),
  );
  expect(saved.designPreviews[0].plate.placement).toEqual([0, 0, 3]);
  expect(saved.designPreviews[0].plate.columns ?? []).toEqual([]);

  // Hiding a selection is not a scope: a slab without columns stays.
  await page.locator("[data-inspector-tab=properties]").click();
  await page.locator("#explorer-expand").click();
  await page.locator('#model-nav [data-member="b0010"]').first().click();
  await page.locator("#view-scope summary").click();
  await page.locator("#hide-selection").click();
  await expect.poll(() => slabs(page)).toHaveLength(1);
  await page.locator("#show-all-model").click();
  await page.keyboard.press("Escape");
  await page.locator("[data-inspector-tab=concrete]").click();

  // Undo restores the unplaced slab.
  await page.locator("#undo").click();
  await expect(page.locator("[data-testid=slab-placement-status]")).toHaveText(
    /^Not placed/,
  );
  await expect.poll(() => slabs(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("The SL01 worked example opens with its slab on the beams, ready to analyse", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU", {
    timeout: 30000,
  });
  await page.locator("#worked-examples").click();
  await page.locator("[data-example=SL01]").click();
  await expect(page.locator("#kernel-status")).toContainText("ready");
  await expect(page.locator("#model-count")).toHaveText(
    "18 nodes · 21 members",
  );
  // Opened in 3D, solid: the slab rests on its beams with its pressure shown.
  await expect(page.locator("#view-3d")).toHaveClass(/active/);
  await expect(page.locator("#model-solids")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(() => slabs(page))
    .toEqual([
      { id: expect.any(String), style: "solid", active: false, loaded: true },
    ]);

  // The slab's column loads are in "Slab reactions": the frame analyses at once.
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await page.locator("#result-family").selectOption("forces");
  await page.locator("#display-result").selectOption("axial");
  // The interior column carries the most: about a third of the 352.5 kN.
  const peak = Number(
    await page.locator("#action-legend").getAttribute("data-peak"),
  );
  expect(peak).toBeGreaterThan(100e3);
  expect(peak).toBeLessThan(352.5e3);

  // Its own plate analysis solves and balances the 352.5 kN.
  await page.locator("[data-inspector-tab=concrete]").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
  await page.locator("#preview-run").click();
  await expect(page.locator("#workspace")).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
  await page.locator('[data-preview-pane="actions"]').click();
  await expect(page.locator("[data-testid=plate-elements]")).toContainText(
    "752 elements",
  );
  expect(
    Number(
      await page.locator("[data-testid=plate-balance]").getAttribute("data-si"),
    ),
  ).toBeLessThanOrEqual(1e-9);
  expect(errors).toEqual([]);
});
