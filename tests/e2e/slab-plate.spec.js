import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { menuCommand } from "../menu-helpers.js";

/** M10 slab plate analysis (plate-v1, ADR 0021) through the browser build:
 * inputs, solve, contour display, oracle agreement, refusals, stale state and
 * persistence. */
const dir = "evidence/M10/slab-plate";

async function openSlab(page, id) {
  const model = JSON.parse(await readFile("fixtures/models/B04.json", "utf8"));
  model.id = id;
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "slab.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(model)),
  });
  await expect(page.locator("#kernel-status")).toContainText("ready");
  await page.locator("[data-inspector-tab=concrete]").click();
  await page.locator("#preview-kind").selectOption("slab");
  await page.locator("#preview-create").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
}

async function run(page) {
  await page.locator("#preview-run").click();
  await expect(page.locator("#workspace")).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
}

async function record(page) {
  const download = page.waitForEvent("download");
  await page.locator("#preview-record").click();
  return JSON.parse(await readFile(await (await download).path(), "utf8"));
}

test("Slab plate analysis reproduces the opening oracle, shows contours and persists", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const oracle = JSON.parse(
    await readFile("fixtures/plate/plate-oracle.json", "utf8"),
  ).openingOpenSees;
  await openSlab(page, "slab-plate-oracle");
  await expect(page.locator("#preview-plate")).toBeVisible();
  await expect(page.locator("#preview-source")).toHaveValue("plate");
  // The P-OPEN-OS panel: 6 × 5 m, t = 0.2 m, 1 × 1 m opening at (2, 2),
  // 0.25 m cells, 10 kPa, E = 30 GPa, ν = 0.2, all edges hard simple.
  await page.locator("#preview-thickness").fill("200 mm");
  await page.locator("#preview-meshSize").fill("250 mm");
  await page.locator("#preview-plate-openingX").fill("2 m");
  await page.locator("#preview-save").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
  await run(page);
  await page.locator('[data-preview-pane="actions"]').click();
  await expect(page.locator("[data-testid=plate-pane]")).toBeVisible();
  await expect(page.locator("[data-testid=plate-contour]")).toHaveAttribute(
    "data-cells",
    String(oracle.elements),
  );
  await expect(page.locator("[data-testid=plate-elements]")).toContainText(
    `${oracle.elements} elements · ${oracle.nodes} nodes`,
  );
  const balance = Number(
    await page.locator("[data-testid=plate-balance]").getAttribute("data-si"),
  );
  expect(balance).toBeLessThanOrEqual(1e-9);
  for (const field of ["my", "topX", "bottomY", "w"]) {
    await page.locator(`[data-plate-field="${field}"]`).click();
    await expect(page.locator("[data-testid=plate-contour]")).toHaveAttribute(
      "data-field",
      field,
    );
  }
  await page.locator('[data-plate-field="mx"]').click();
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/opening-mx.png` });
  await writeFile(
    `${dir}/opening-mx.svg`,
    await page
      .locator("[data-testid=plate-contour]")
      .evaluate((e) => e.outerHTML),
  );

  const r = await record(page);
  const pa = r.plateAnalysis;
  expect(pa.status).toBe("evaluated");
  expect(pa.basis).toBe("mechanics");
  expect(r.sourceProvenance).toMatchObject({
    kind: "plateAnalysis",
    mock: false,
  });
  expect(r.overall).toBe("unsupported");
  expect(r.checks.every((c) => c.status === "unsupported")).toBe(true);
  const at = (list, key) => list.findIndex((g) => g.join(",") === key);
  const tol = oracle.tolerance;
  for (const [key, want] of Object.entries(oracle.nodeW)) {
    const got = pa.fields.w[at(pa.fields.nodes, key)];
    expect(Math.abs(got - want)).toBeLessThanOrEqual(tol * Math.abs(want));
  }
  for (const [key, want] of Object.entries(oracle.elementMoments)) {
    const e = at(pa.fields.cells, key);
    const scale = Math.max(Math.abs(want.mx), Math.abs(want.my));
    for (const m of ["mx", "my", "mxy"])
      expect(Math.abs(pa.fields[m][e] - want[m])).toBeLessThanOrEqual(
        tol * scale,
      );
  }
  await writeFile(`${dir}/opening-run.json`, JSON.stringify(r, null, 2));

  // Editing the load makes the run stale; the draft keeps provenance.
  await page.locator("[data-inspector-tab=concrete]").click();
  await page.locator("#preview-plate-pressure").fill("12.5");
  await expect(page.locator("#design-preview-scene")).toContainText("STALE");
  await page.locator("#preview-plate-edge-2").selectOption("clamped");
  await page.locator("#preview-plate-opening").uncheck();
  await page.locator("#preview-save").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
  await run(page);
  await page.locator('[data-preview-pane="actions"]').click();
  await expect(page.locator("[data-testid=plate-pane]")).toContainText(
    "Clamped-edge line moments",
  );
  await expect(
    page.locator('[data-testid=plate-contour] [data-condition="clamped"]'),
  ).toHaveCount(1);
  await page.locator('[data-plate-field="topY"]').click();
  await page.screenshot({ path: `${dir}/clamped-topY.png` });
  await writeFile(
    `${dir}/clamped-topY.svg`,
    await page
      .locator("[data-testid=plate-contour]")
      .evaluate((e) => e.outerHTML),
  );
  const clamped = await record(page);
  expect(clamped.plateAnalysis.panel.opening).toBeNull();
  expect(clamped.plateAnalysis.load.pressure).toBe(12500);
  expect(clamped.inputs.plate.inputSources.pressure).toBe("user");
  expect(clamped.inputs.plate.inputSources.edges).toBe("user");
  await writeFile(`${dir}/clamped-run.json`, JSON.stringify(clamped, null, 2));

  // Persistence: the downloaded project reopens with the plate inputs.
  const p = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const saved = JSON.parse(await readFile(await (await p).path(), "utf8"));
  expect(saved.schemaVersion).toBe("1.5.0");
  expect(saved.designPreviews[0].plate.edges).toEqual([
    "simple",
    "simple",
    "clamped",
    "simple",
  ]);
  await page.locator("#import-file").setInputFiles({
    name: "saved.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await page.locator("[data-inspector-tab=concrete]").click();
  await expect(page.locator("#preview-plate-edge-2")).toHaveValue("clamped");
  await expect(page.locator("#preview-plate-pressure")).toHaveValue("12.5");
  await expect(page.locator("#preview-plate-opening")).not.toBeChecked();
  expect(errors).toEqual([]);
});

test("Slab plate refusals keep the project and explain the reason", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openSlab(page, "slab-plate-refusals");
  // A single simple edge is a mechanism: refused with the reason.
  for (const i of [1, 2, 3])
    await page.locator(`#preview-plate-edge-${i}`).selectOption("free");
  await page.locator("#preview-save").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
  await page.locator("#preview-run").click();
  await expect(page.locator("#preview-error")).toContainText(
    "rotate about a single simple edge",
  );
  await expect(page.locator("#preview-plate-edge-1")).toHaveValue("free");
  // Invalid values are refused atomically.
  await page.locator("#preview-plate-poissonRatio").fill("0.5");
  await page.locator("#preview-save").click();
  await expect(page.locator("#preview-error")).toContainText("Poisson");
  await page.locator("#preview-cancel").click();
  await expect(page.locator("#preview-plate-poissonRatio")).toHaveValue("0.2");
  await page.screenshot({ path: `${dir}/refusal.png` });
  expect(errors).toEqual([]);
});
