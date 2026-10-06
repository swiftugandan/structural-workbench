import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { menuCommand } from "../menu-helpers.js";
import { CURRENT_SCHEMA } from "../schema-version.js";
import { evidenceDir } from "../../tools/evidence.mjs";

/** M17 composite beam (ADR 0031) through the browser build: CB01 is AISC
 * Design Example I.1 as a model (45 ft W21X50, stage cases WET, CONST, SDL,
 * LIVE; combinations C-CON and C-COMP). */
const dir = evidenceDir("evidence/M17/composite");
const FT = 0.3048,
  KIP_FT = 4448.2216152605 * FT,
  IN = 0.0254;

async function open(page) {
  const model = JSON.parse(await readFile("fixtures/models/CB01.json", "utf8"));
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "composite.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(model)),
  });
  await expect(page.locator("#kernel-status")).toContainText("ready");
  await page.locator("[data-inspector-tab=concrete]").click();
  await page.locator("#preview-kind").selectOption("compositeBeam");
  await page.locator("#preview-create").click();
  await expect(page.locator("#comp-deck")).toBeVisible();
  await page.locator("#preview-target").selectOption("beam");
}

async function run(page) {
  await page.locator("#preview-source").selectOption("model");
  await page.locator("#analyse").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
  await page.locator("#preview-run").click();
  await expect(page.locator("#workspace")).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
}

test("Composite beam: stages, checks, section, deflections, report and persistence", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await page.locator("#comp-construction").selectOption("C-CON");
  await page.locator("#comp-composite").selectOption("C-COMP");
  await page.locator("#comp-wet").selectOption("WET");
  await page.locator("#comp-live").selectOption("LIVE");
  await page.locator("#comp-sustained").selectOption("SDL");
  await page.locator("#preview-camber").fill("50.8 mm");
  await page.locator("#comp-pre-limit").fill("240");
  await page.locator("#comp-live-limit").fill("360");
  await page.locator("#comp-long-limit").fill("240");
  await page.locator("#comp-shrinkage").fill("0.0002");
  await page.locator("#comp-creep").selectOption("yes");
  await page.locator("#preview-save").click();
  await run(page);
  await expect(page.locator("[data-testid=preview-state]")).toHaveText("PASS");
  await expect(page.locator("[data-testid=design-basis]")).toContainText(
    "ANSI/AISC 360 2022",
  );
  // Stages: the construction and composite diagrams.
  await page.locator('[data-preview-pane="actions"]').click();
  await expect(
    page.locator("[data-testid=comp-stage-composite]"),
  ).toBeVisible();
  await expect(
    page.locator("[data-testid=comp-stage-construction]"),
  ).toBeVisible();
  // Every check passes; the stage moments are the example's.
  await page.locator('[data-preview-pane="checks"]').click();
  expect(
    await page
      .locator("[data-testid=comp-check]:not([data-status=pass])")
      .count(),
  ).toBe(0);
  const demand = async (id) =>
    Number(
      await page
        .locator(`[data-testid=comp-check][data-check="${id}"] td`)
        .nth(2)
        .getAttribute("data-si"),
    );
  expect(
    Math.abs(
      (await demand("composite.construction.flexure")) / KIP_FT - 344.25,
    ),
  ).toBeLessThan(0.01);
  expect(
    Math.abs((await demand("composite.flexure")) / KIP_FT - 678.4),
  ).toBeLessThan(0.1);
  await mkdir(dir, { recursive: true });
  await page.screenshot({
    path: `${dir}/composite-checks.png`,
    fullPage: true,
  });
  // The section at the governing station, with the PNA and stress block.
  await page.locator('[data-preview-pane="section"]').click();
  const section = page.locator("[data-testid=comp-section]");
  await expect(section.locator("[data-testid=comp-pna]")).toHaveCount(1);
  await expect(section.locator("[data-testid=comp-block]")).toHaveCount(1);
  await section.screenshot({ path: `${dir}/composite-section.png` });
  await writeFile(
    `${dir}/composite-section.svg`,
    await section.evaluate((e) => e.outerHTML),
  );
  // Deflections by stage: the wet concrete deflection of the example.
  await page.locator('[data-preview-pane="deflections"]').click();
  const wet = Number(
    await page
      .locator("[data-testid=comp-deflection] td")
      .nth(1)
      .getAttribute("data-si"),
  );
  expect(Math.abs(Math.abs(wet) / IN - 2.59)).toBeLessThan(0.005);
  // The run record and the bill of materials.
  const record = page.waitForEvent("download");
  await page.locator("#preview-record").click();
  const result = JSON.parse(
    await readFile(await (await record).path(), "utf8"),
  );
  await writeFile(`${dir}/composite-run.json`, JSON.stringify(result, null, 2));
  expect(result.overall).toBe("pass");
  const cp = result.codeProfilePreview;
  expect(cp.stages.constructionCaseId).toBe("C-CON");
  expect(cp.studs.total).toBe(45);
  expect(result.schedule.map((r) => r.item)).toEqual(["Beam", "Headed studs"]);
  // The calculation record carries the composite beam.
  const report = page.waitForEvent("download");
  await menuCommand(page, "File", "Export calculation report");
  const html = await readFile(await (await report).path(), "utf8");
  await writeFile(`${dir}/calculation-record.html`, html);
  const doc = await page.context().newPage();
  await doc.setContent(html);
  await expect(doc.locator("[data-testid=report-composite]")).toHaveCount(1);
  await expect(
    doc.locator("[data-testid=report-composite-overall]"),
  ).toHaveText("PASS");
  await expect(
    doc.locator(
      '[data-testid=report-composite-check][data-check-id="composite.creep"]',
    ),
  ).toContainText("PASS");
  await doc.close();
  // Persistence.
  const p = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const saved = JSON.parse(await readFile(await (await p).path(), "utf8"));
  expect(saved.schemaVersion).toBe(CURRENT_SCHEMA);
  const draft = saved.designPreviews.find((d) => d.kind === "compositeBeam");
  expect(draft.composite).toMatchObject({
    constructionCaseId: "C-CON",
    compositeCaseId: "C-COMP",
    creepJudgement: true,
    shrinkageStrain: 0.0002,
  });
  expect(draft.inputs.camber).toBeCloseTo(2 * IN, 12);
  expect(errors).toEqual([]);
});

test("Composite beam: missing stages and judgements are never a pass", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await page.locator("#preview-save").click();
  await run(page);
  await expect(page.locator("[data-testid=preview-state]")).not.toHaveText(
    "PASS",
  );
  await page.locator('[data-preview-pane="checks"]').click();
  await expect(page.locator("[data-testid=comp-unavailable]")).toContainText(
    "stage",
  );
  // Stages chosen, creep not judged and no shrinkage strain: indeterminate.
  await page.locator("#comp-construction").selectOption("C-CON");
  await page.locator("#comp-composite").selectOption("C-COMP");
  await page.locator("#comp-wet").selectOption("WET");
  await page.locator("#comp-live").selectOption("LIVE");
  await page.locator("#preview-save").click();
  await run(page);
  await expect(page.locator("[data-testid=preview-state]")).toHaveText(
    "INDETERMINATE",
  );
  await expect(
    page.locator(
      '[data-testid=preview-check-row][data-check="Time-dependent effects"]',
    ),
  ).toContainText("INDETERMINATE");
  await mkdir(dir, { recursive: true });
  await page.screenshot({
    path: `${dir}/composite-indeterminate.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
