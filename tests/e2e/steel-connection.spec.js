import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { menuCommand } from "../menu-helpers.js";
import { CURRENT_SCHEMA } from "../schema-version.js";
import { evidenceDir } from "../../tools/evidence.mjs";

/** M13 single-plate connection (ADR 0030) through the browser build: C01's
 * W18X50 beam is pinned between two W14X90 columns under 30 kN/m, so each
 * end carries wL/2 = 135 kN with no moment. */
const dir = evidenceDir("evidence/M13/connection");

async function open(page, model) {
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "connection.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(model)),
  });
  await expect(page.locator("#kernel-status")).toContainText("ready");
  await page.locator("[data-inspector-tab=concrete]").click();
  await page.locator("#preview-kind").selectOption("singlePlate");
  await page.locator("#preview-create").click();
  await expect(page.locator("#conn-end")).toBeVisible();
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

const fixture = async () =>
  JSON.parse(await readFile("fixtures/models/C01.json", "utf8"));

test("Steel connection: bind the beam end, check, draw, bill, report and persist", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, await fixture());
  await page.locator("#preview-target").selectOption("beam");
  await page.locator("#conn-end").selectOption("end");
  // Only the members meeting the beam's end node are offered.
  await expect(page.locator("#conn-support option[value=c2]")).toHaveCount(1);
  await expect(page.locator("#conn-support option[value=c1]")).toHaveCount(0);
  await page.locator("#conn-support").selectOption("c2");
  await page.locator("#conn-kind").selectOption("columnFlange");
  await page.locator("#conn-braced").selectOption("yes");
  await page.locator("#preview-weldSize").fill("8 mm");
  await page.locator("#preview-save").click();
  await run(page);
  await expect(page.locator("[data-testid=preview-state]")).toHaveText("PASS");
  await expect(page.locator("[data-testid=design-basis]")).toContainText(
    "ANSI/AISC 360 2022",
  );
  await expect(page.locator("[data-testid=design-basis]")).toContainText(
    "not a certified design",
  );
  // End actions: the exact reaction, no moment.
  await page.locator('[data-preview-pane="actions"]').click();
  const v = Number(
    await page
      .locator("[data-testid=conn-actions] td")
      .first()
      .getAttribute("data-si"),
  );
  expect(Math.abs(v - 135e3)).toBeLessThan(1e-6 * 135e3);
  // Every limit state with its clause.
  await page.locator('[data-preview-pane="checks"]').click();
  await expect(
    page.locator('[data-testid=conn-check][data-check="connection.boltGroup"]'),
  ).toHaveAttribute("data-status", "pass");
  await expect(page.locator("[data-testid=conn-bolt-row]")).toHaveCount(4);
  const failing = await page
    .locator("[data-testid=conn-check]:not([data-status=pass])")
    .count();
  expect(failing).toBe(0);
  await mkdir(dir, { recursive: true });
  await page.screenshot({
    path: `${dir}/connection-checks.png`,
    fullPage: true,
  });
  // The dimensioned drawing from the run's geometry.
  await page.locator('[data-preview-pane="drawing"]').click();
  const drawing = page.locator("[data-testid=conn-drawing]");
  await expect(drawing).toBeVisible();
  await expect(drawing.locator("[data-testid=conn-bolt]")).toHaveCount(4);
  await drawing.screenshot({ path: `${dir}/connection-drawing.png` });
  await writeFile(
    `${dir}/connection-drawing.svg`,
    await drawing.evaluate((e) => e.outerHTML),
  );
  // The run record matches the drawing and the bill of materials.
  const record = page.waitForEvent("download");
  await page.locator("#preview-record").click();
  const result = JSON.parse(
    await readFile(await (await record).path(), "utf8"),
  );
  await writeFile(
    `${dir}/connection-run.json`,
    JSON.stringify(result, null, 2),
  );
  expect(result.overall).toBe("pass");
  const cp = result.codeProfilePreview;
  const inputs = result.inputs.inputs;
  const length = 2 * inputs.lev + (inputs.rows - 1) * inputs.pitch;
  expect(Math.abs(cp.geometry.plate.length - length)).toBeLessThan(1e-12);
  const shown = Number(
    await drawing
      .locator('[data-testid=conn-dimension][data-label="l"]')
      .getAttribute("data-si"),
  );
  expect(shown).toBe(cp.geometry.plate.length);
  expect(Math.abs(cp.freeBody.supportReaction.V + cp.actions.V)).toBe(0);
  expect(result.schedule.map((r) => r.item)).toEqual([
    "Plate",
    "Bolts",
    "Fillet weld",
  ]);
  expect(result.schedule[1].quantity).toBe(4);
  await page.locator('[data-preview-pane="schedule"]').click();
  await expect(page.locator("[data-testid=conn-bill-row]")).toHaveCount(3);
  const csvDownload = page.waitForEvent("download");
  await page.locator("#preview-schedule").click();
  const csv = await readFile(await (await csvDownload).path(), "utf8");
  expect(csv).toContain(",Plate,");
  expect(csv).toContain(",Bolts,");
  // The calculation record carries the connection.
  const report = page.waitForEvent("download");
  await menuCommand(page, "File", "Export calculation report");
  const html = await readFile(await (await report).path(), "utf8");
  await writeFile(`${dir}/calculation-record.html`, html);
  const doc = await page.context().newPage();
  await doc.setContent(html);
  await expect(doc.locator("[data-testid=report-connection]")).toHaveCount(1);
  await expect(doc.locator("[data-testid=report-aisc-banner]")).toContainText(
    "DEMONSTRATION",
  );
  await expect(
    doc.locator("[data-testid=report-connection-overall]"),
  ).toHaveText("PASS");
  await expect(doc.locator("[data-testid=conn-drawing]")).toHaveCount(1);
  await expect(
    doc.locator(
      '[data-testid=report-connection-check][data-check-id="connection.plate.ductility"]',
    ),
  ).toContainText("PASS");
  await doc.close();
  // Persistence.
  const p = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const saved = JSON.parse(await readFile(await (await p).path(), "utf8"));
  expect(saved.schemaVersion).toBe(CURRENT_SCHEMA);
  const draft = saved.designPreviews.find((d) => d.kind === "singlePlate");
  expect(draft.connection).toMatchObject({
    end: "end",
    supportMemberId: "c2",
    supportKind: "columnFlange",
    bolt: "3/4",
    bracedAgainstRotation: true,
  });
  expect(draft.inputs.weldSize).toBeCloseTo(0.008, 12);
  expect(draft.inputSources.weldSize).toBe("user");
  expect(errors).toEqual([]);
});

test("Steel connection: moment transfer and missing inputs are never a pass", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // A rigid beam end carries moment: a single plate cannot.
  const model = await fixture();
  for (const m of model.members)
    if (m.id === "beam") {
      m.releaseStart = { my: false, mz: false };
      m.releaseEnd = { my: false, mz: false };
    }
  await open(page, model);
  await page.locator("#preview-target").selectOption("beam");
  await page.locator("#conn-end").selectOption("start");
  await expect(page.locator("#conn-support option[value=c1]")).toHaveCount(1);
  await expect(page.locator("#conn-support option[value=c2]")).toHaveCount(0);
  // Saved without a support: the check names what is missing.
  await page.locator("#preview-save").click();
  await run(page);
  await expect(page.locator("[data-testid=preview-state]")).not.toHaveText(
    "PASS",
  );
  await page.locator('[data-preview-pane="checks"]').click();
  await expect(page.locator("[data-testid=conn-unavailable]")).toContainText(
    "supporting member",
  );
  await page.locator("#conn-support").selectOption("c1");
  await page.locator("#conn-braced").selectOption("yes");
  await page.locator("#preview-save").click();
  await run(page);
  await expect(page.locator("[data-testid=preview-state]")).not.toHaveText(
    "PASS",
  );
  await expect(
    page.locator(
      '[data-testid=preview-check-row][data-check="Simple connection"]',
    ),
  ).toContainText("UNSUPPORTED");
  await page.locator('[data-preview-pane="checks"]').click();
  await expect(
    page.locator(
      '[data-testid=conn-check][data-check="connection.momentTransfer"]',
    ),
  ).toHaveAttribute("data-status", "unsupported");
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/moment-transfer.png`, fullPage: true });
  expect(errors).toEqual([]);
});
