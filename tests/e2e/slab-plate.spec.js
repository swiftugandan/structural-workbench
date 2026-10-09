import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { menuCommand } from "../menu-helpers.js";
import { CURRENT_SCHEMA } from "../schema-version.js";
import { evidenceDir } from "../../tools/evidence.mjs";

/** M10 slab plate analysis (plate-v1, ADR 0021) through the browser build:
 * inputs, solve, contour display, oracle agreement, refusals, stale state and
 * persistence. */
const dir = evidenceDir("evidence/M10/slab-plate");

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
  // Smoothing is a display option on the raw moments only (ADR 0021 item 3).
  const contour = page.locator("[data-testid=plate-contour]");
  await expect(contour).toHaveAttribute("data-recovery", "elementCentre");
  await page.locator('[data-plate-recovery="nodalAverage"]').click();
  await expect(contour).toHaveAttribute("data-recovery", "nodalAverage");
  await expect(page.locator("[data-testid=plate-pane]")).toContainText(
    "display only, never used for design",
  );
  await page.locator('[data-plate-field="topX"]').click();
  await expect(page.locator("[data-plate-recovery]")).toHaveCount(0);
  await expect(contour).toHaveAttribute("data-recovery", "elementCentre");
  await page.locator('[data-plate-field="mx"]').click();
  await page.locator('[data-plate-recovery="elementCentre"]').click();
  await expect(contour).toHaveAttribute("data-recovery", "elementCentre");
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
  // The EC2 slab design (ADR 0029) waits for the structural system.
  expect(r.overall).toBe("indeterminate");
  expect(r.codeProfile.id).toBe("ec2-uk-na");
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

  // The calculation record (after an analysis of the frame) carries the
  // current slab plate run.
  await page.locator("#analyse").click();
  await expect(page.locator("#workspace")).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
  const report = page.waitForEvent("download");
  await menuCommand(page, "File", "Export calculation report");
  const html = await readFile(await (await report).path(), "utf8");
  expect(html).not.toContain("<script>");
  await writeFile(`${dir}/calculation-record.html`, html);
  const doc = await page.context().newPage();
  await doc.setContent(html);
  await expect(doc.locator("[data-testid=report-plate-preview]")).toHaveCount(
    1,
  );
  expect(
    Number(
      await doc
        .locator("[data-testid=report-plate-balance]")
        .getAttribute("data-si"),
    ),
  ).toBeLessThanOrEqual(1e-9);
  const topX = Number(
    await doc
      .locator("[data-testid=report-plate-design-moment] [data-si]")
      .nth(2)
      .getAttribute("data-si"),
  );
  expect(topX).toBe(pa.designMoments.topX.value);
  await doc.close();

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
  expect(saved.schemaVersion).toBe(CURRENT_SCHEMA);
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
    "can rotate or lift as a rigid plate",
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

/** Four 3 m columns with fixed bases and top ties; an empty "Slab" case. */
function columnFrame() {
  const corners = [
    [0, 0],
    [6, 0],
    [0, 5],
    [6, 5],
  ];
  const member = (id, start, end, localY) => ({
    id,
    start,
    end,
    material: "mat1",
    section: "col",
    localY,
    releaseStart: { my: false, mz: false },
    releaseEnd: { my: false, mz: false },
  });
  return {
    schemaVersion: "1.0.0",
    id: "slab-columns",
    name: "Slab on columns",
    revision: 0,
    displayUnits: "SI",
    analysisMode: "spatial",
    gravity: [0, 0, -9.80665],
    materials: [{ id: "mat1", name: "concrete", E: 30e9, nu: 0.2, density: 0 }],
    sections: [
      {
        id: "col",
        name: "col",
        A: 0.04,
        Iy: 1.2e-4,
        Iz: 2e-4,
        J: 2e-4,
        cy: 0.1,
        cz: 0.1,
        provenance: "test",
      },
    ],
    nodes: corners.flatMap(([x, y], i) => [
      { id: `b${i}`, position: [x, y, 0] },
      { id: `t${i}`, position: [x, y, 3] },
    ]),
    members: [
      ...corners.map((_, i) => member(`c${i}`, `b${i}`, `t${i}`, [1, 0, 0])),
      ...[
        [0, 1],
        [2, 3],
        [0, 2],
        [1, 3],
      ].map(([a, b], i) => member(`g${i}`, `t${a}`, `t${b}`, [0, 0, 1])),
    ],
    supports: corners.map((_, i) => ({
      id: `s${i}`,
      node: `b${i}`,
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
    metadata: { description: "slab on columns", createdBy: "tests" },
  };
}

test("Slab on model columns: derive the columns, solve and apply the column loads to the frame", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1300 });
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "frame.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(columnFrame())),
  });
  await expect(page.locator("#kernel-status")).toContainText("ready");
  await page.locator("[data-inspector-tab=concrete]").click();
  await page.locator("#preview-kind").selectOption("slab");
  await page.locator("#preview-create").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
  for (const i of [0, 1, 2, 3])
    await page.locator(`#preview-plate-edge-${i}`).selectOption("free");
  await page.locator("#preview-plate-opening").uncheck();
  // The slab's placement is saved with its inputs (ADR 0035).
  await page.locator("#slab-placed").check();
  await page.locator("#slab-placement-z").fill("3");
  await page.locator("#preview-save").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
  await page.locator("#slab-derive-columns").click();
  await expect(
    page.locator('[data-testid=slab-column][data-source="model"]'),
  ).toHaveCount(4);
  await page.locator("#preview-run").click();
  await expect(page.locator("#workspace")).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
  await page.locator('[data-preview-pane="actions"]').click();
  await expect(page.locator("[data-testid=plate-column-marker]")).toHaveCount(
    4,
  );
  const reactions = await page
    .locator("[data-testid=plate-column-reaction] td[data-si]")
    .evaluateAll((cells) => cells.map((c) => Number(c.dataset.si)));
  const fz = reactions.filter((_, k) => k % 3 === 0);
  const total = 10e3 * 6 * 5;
  expect(Math.abs(fz.reduce((a, b) => a + b, 0) - total)).toBeLessThanOrEqual(
    1e-8 * total,
  );
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/columns.png` });
  await page.locator("#slab-apply-case").selectOption("SL");
  await page.locator("#slab-apply-loads").click();
  await expect(page.locator("#workspace")).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
  const p = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const saved = JSON.parse(await readFile(await (await p).path(), "utf8"));
  const loads = saved.loads.filter((l) => l.case === "SL");
  expect(loads).toHaveLength(4);
  expect(
    Math.abs(loads.reduce((a, l) => a - l.values[2], 0) - total),
  ).toBeLessThanOrEqual(1e-8 * total);
  expect(saved.designPreviews[0].plate.placement).toEqual([0, 0, 3]);
  expect(errors).toEqual([]);
});

test("Slab EC2 design: reinforcement map, span/depth, report and persistence", async ({
  page,
}) => {
  // ADR 0029: the default 6 × 5 × 0.225 m simply supported panel with its
  // opening, 10 kPa. The A_s,req map is the per-element design value.
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openSlab(page, "slab-ec2");
  await page.locator("#code-exposure").selectOption("XC1");
  await page.locator("#code-cover").fill("15 mm");
  await page.locator("#code-aggregate").fill("20 mm");
  await page.locator("#code-system").selectOption("simplySupported");
  await page.locator("#code-partitions").selectOption("no");
  await page.locator("#preview-save").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
  await run(page);
  await expect(page.locator("[data-testid=preview-state]")).toHaveText("PASS");
  await page.locator('[data-preview-pane="ec2"]').click();
  await expect(page.locator("[data-testid=ec2-banner]")).toContainText(
    "not a certified design",
  );
  await expect(
    page.locator('[data-testid=slab-layer][data-layer="bottomX"]'),
  ).toContainText("Ø");
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/slab-ec2.png`, fullPage: true });
  // The map: A_s,req per element, the same values as the run record.
  await page.locator('[data-preview-pane="actions"]').click();
  await page.locator('[data-plate-field="asBottomX"]').click();
  await expect(page.locator("[data-testid=plate-contour]")).toHaveAttribute(
    "data-field",
    "asBottomX",
  );
  await page
    .locator("[data-testid=plate-contour]")
    .screenshot({ path: `${dir}/slab-as-bottom-x.png` });
  const r = await record(page);
  await writeFile(`${dir}/slab-ec2-run.json`, JSON.stringify(r, null, 2));
  const cp = r.codeProfilePreview;
  expect(cp.reinforcementMap.bottomX.length).toBe(
    r.plateAnalysis.mesh.elements,
  );
  expect(
    Math.max(...cp.reinforcementMap.bottomXUtilisation),
  ).toBeLessThanOrEqual(1 + 1e-12);
  expect(r.schedule.map((x) => x.mark)).toContain("B1");
  // Report: the calculation record needs a current frame result.
  await page.locator("#analyse").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
  const report = page.waitForEvent("download");
  await menuCommand(page, "File", "Export calculation report");
  const html = await readFile(await (await report).path(), "utf8");
  const doc = await page.context().newPage();
  await doc.setContent(html);
  await expect(doc.locator("[data-testid=report-ec2-banner]")).toContainText(
    "DEMONSTRATION",
  );
  await expect(
    doc.locator('[data-testid=report-slab-layer][data-layer="bottomX"]'),
  ).toContainText("Ø");
  await expect(
    doc.locator(
      '[data-testid=report-ec2-check][data-check-id="ec2.slab.deflection"]',
    ),
  ).toContainText("PASS");
  await doc.close();
  // Persistence.
  const p = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const saved = JSON.parse(await readFile(await (await p).path(), "utf8"));
  expect(saved.schemaVersion).toBe(CURRENT_SCHEMA);
  expect(saved.designPreviews[0].codeInputs).toMatchObject({
    structuralSystem: "simplySupported",
    partitionsSensitive: false,
  });
  expect(errors).toEqual([]);
});
