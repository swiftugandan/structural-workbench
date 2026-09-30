import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { menuCommand } from "../menu-helpers.js";
import { CURRENT_SCHEMA } from "../schema-version.js";
import { evidenceDir } from "../../tools/evidence.mjs";

/** M12 RC column section mechanics (ADR 0022) through the browser build: a
 * draft bound to a model member reproduces the column oracle's SQ-PARABOLA
 * capacity at the fixed-end station. */
const dir = evidenceDir("evidence/M12/rc-column");

test("RC column mechanics match the oracle at model station actions, go stale and persist", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const oracle = JSON.parse(
    await readFile("fixtures/column/column-oracle.json", "utf8"),
  );
  const sq = oracle.configs.find((c) => c.id === "SQ-PARABOLA");
  const target = sq.capacities.find(
    (c) => c.thetaDeg === 37 && c.nEd > 1e6 && c.nEd < 2e6,
  );
  // B04 is a 3 m cantilever along X fixed at n1: root Mz = 3 Fy, My = −3 Fz;
  // a tip force along −X compresses it. Put the root at 80 % of M_Rd(N, 37°).
  const theta = (37 * Math.PI) / 180,
    m = 0.8 * target.mRd;
  const model = JSON.parse(await readFile("fixtures/models/B04.json", "utf8"));
  model.id = "rc-column-oracle";
  model.loads[0].values = [
    -target.nEd,
    (m * Math.sin(theta)) / 3,
    (-m * Math.cos(theta)) / 3,
    0,
    0,
    0,
  ];
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "column.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(model)),
  });
  await expect(page.locator("#kernel-status")).toContainText("ready");
  await page.locator("[data-inspector-tab=concrete]").click();
  await page.locator("#preview-kind").selectOption("rcColumn");
  await page.locator("#preview-create").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
  // SQ-PARABOLA: 400 × 400, eight Ø25 at ±150 mm (27.5 + 10 + 12.5).
  await page.locator("#preview-target").selectOption("m1");
  await page.locator("#preview-cover").fill("27.5");
  await page.locator("#preview-mech-law").selectOption("parabolaRectangle");
  for (const [key, value] of [
    ["parabolaPeak", "17"],
    ["strainAtPeak", "0.002"],
    ["parabolaExponent", "2"],
    ["ultimateStrain", "0.0035"],
    ["steelYieldStrength", "435"],
    ["steelModulus", "200"],
    ["fullCompressionStrain", "0.002"],
  ])
    await page.locator(`#preview-mech-${key}`).fill(value);
  await page.locator("#preview-save").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
  await page.locator("#preview-source").selectOption("model");
  await page.locator("#analyse").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
  await page.locator("#preview-run").click();
  await expect(page.locator("#workspace")).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
  await page.locator('[data-preview-pane="mechanics"]').click();
  await expect(page.locator("[data-testid=column-pane]")).toBeVisible();
  await expect(page.locator("[data-testid=column-contour]")).toHaveAttribute(
    "data-points",
    "72",
  );
  const governing = Number(
    await page
      .locator("[data-testid=column-governing]")
      .getAttribute("data-si"),
  );
  expect(Math.abs(governing - 0.8)).toBeLessThanOrEqual(1e-9);
  const squash = Number(
    await page.locator("[data-testid=column-squash]").getAttribute("data-si"),
  );
  expect(Math.abs(squash / sq.closedForm.squash - 1)).toBeLessThanOrEqual(
    1e-12,
  );
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/column-mechanics.png` });
  await writeFile(
    `${dir}/contour.svg`,
    await page
      .locator("[data-testid=column-contour]")
      .evaluate((e) => e.outerHTML),
  );

  const download = page.waitForEvent("download");
  await page.locator("#preview-record").click();
  const run = JSON.parse(await readFile(await (await download).path(), "utf8"));
  const cm = run.columnMechanics;
  expect(cm.basis).toBe("mechanics");
  expect(run.overall).toBe("unsupported");
  expect(run.checks.every((c) => c.status === "unsupported")).toBe(true);
  const root = cm.stations.find((s) => s.station === 0);
  expect(Math.abs(root.nEd / target.nEd - 1)).toBeLessThanOrEqual(1e-9);
  expect(Math.abs(root.capacity.mRd / target.mRd - 1)).toBeLessThanOrEqual(
    oracle.tolerance.capacityRelative,
  );
  expect(Math.abs(root.utilisation - 0.8)).toBeLessThanOrEqual(1e-9);
  await writeFile(`${dir}/column-run.json`, JSON.stringify(run, null, 2));

  // The calculation record carries the column run for this result.
  const report = page.waitForEvent("download");
  await menuCommand(page, "File", "Export calculation report");
  const html = await readFile(await (await report).path(), "utf8");
  expect(html).not.toContain("<script>");
  await writeFile(`${dir}/calculation-record.html`, html);
  const doc = await page.context().newPage();
  await doc.setContent(html);
  await expect(doc.locator("[data-testid=report-column-preview]")).toHaveCount(
    1,
  );
  const utilisations = await doc
    .locator("[data-testid=report-column-utilisation] [data-si]")
    .evaluateAll((els) => els.map((el) => Number(el.dataset.si)));
  expect(Math.max(...utilisations)).toBeCloseTo(0.8, 9);
  await doc.close();

  // Editing the section makes the run stale.
  await page.locator("[data-inspector-tab=concrete]").click();
  await page.locator("#preview-width").fill("450");
  await expect(page.locator("#design-preview-scene")).toContainText("STALE");
  await page.locator("#preview-cancel").click();

  // Persistence: the project reopens with the column draft and its law.
  const p = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const saved = JSON.parse(await readFile(await (await p).path(), "utf8"));
  expect(saved.schemaVersion).toBe(CURRENT_SCHEMA);
  const draft = saved.designPreviews.find((d) => d.kind === "rcColumn");
  expect(draft.mechanics.law).toBe("parabolaRectangle");
  expect(draft.mechanics.inputs.fullCompressionStrain).toBe(0.002);
  await page.locator("#import-file").setInputFiles({
    name: "saved.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await page.locator("[data-inspector-tab=concrete]").click();
  await expect(page.locator("#preview-cover")).toHaveValue("27.5");
  await expect(page.locator("#preview-mech-law")).toHaveValue(
    "parabolaRectangle",
  );
  expect(errors).toEqual([]);
});

test("RC column refusals: bar count and axial force beyond the section", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const model = JSON.parse(await readFile("fixtures/models/B04.json", "utf8"));
  model.id = "rc-column-refusals";
  model.loads[0].values = [-2e7, 0, 0, 0, 0, 0];
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "column.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(model)),
  });
  await expect(page.locator("#kernel-status")).toContainText("ready");
  await page.locator("[data-inspector-tab=concrete]").click();
  await page.locator("#preview-kind").selectOption("rcColumn");
  await page.locator("#preview-create").click();
  await page.locator("#preview-barsAlongWidth").fill("1");
  await page.locator("#preview-save").click();
  await expect(page.locator("#preview-error")).toContainText("2 to 20");
  await page.locator("#preview-cancel").click();
  await page.locator("#preview-target").selectOption("m1");
  await page.locator("#preview-save").click();
  await page.locator("#preview-source").selectOption("model");
  await page.locator("#analyse").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
  await page.locator("#preview-run").click();
  await expect(page.locator("#workspace")).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
  await page.locator('[data-preview-pane="mechanics"]').click();
  // 20 MN exceeds the squash load: reported, never rated.
  await expect(page.locator("[data-testid=column-governing]")).toContainText(
    "beyond the axial range",
  );
  await expect(
    page.locator(
      '[data-testid=column-station][data-status="beyondAxialRange"]',
    ),
  ).not.toHaveCount(0);
  await page.screenshot({ path: `${dir}/beyond-range.png` });
  expect(errors).toEqual([]);
});
