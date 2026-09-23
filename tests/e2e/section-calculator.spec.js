import { menuCommand } from "../menu-helpers.js";
import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { evidenceDir, record } from "../../tools/evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M05/section-calculator";
process.env.WORKBENCH_TASK_ID ||= "M05-A";
process.env.WORKBENCH_MILESTONE ||= "M05";

const evidence = () => evidenceDir("evidence/M05/section-calculator");

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
  await menuCommand(page, "File", "Download project");
  return JSON.parse(await readFile(await (await pending).path(), "utf8"));
}

test("M05 section calculator: rectangle stiffens tip deflection and clears stale result", async ({
  page,
}) => {
  const dir = evidence();
  await mkdir(dir, { recursive: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const fixture = JSON.parse(
    await readFile("fixtures/models/B02.json", "utf8"),
  );
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "B02.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  await expect(page.locator("#model-count")).toContainText("2 nodes · 1 members");

  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await expect(page.locator("#results-content")).toContainText("-45");

  await edit(page, "sections", "sec1");
  await page.locator('[data-testid="rect-width"]').fill("100");
  await page.locator('[data-testid="rect-depth"]').fill("200");
  await page.locator('[data-testid="compute-rectangle"]').click();
  await expect(page.locator("[data-rect-status]")).toContainText(/filled/i);
  await expect(page.locator('#entity-form [name="provenance"]')).toHaveValue(
    /Computed solid rectangle/,
  );
  await expect(page.locator('#entity-form [name="Iy"]')).not.toHaveValue("10000000");
  await save(page);

  await expect(page.locator("#result-status")).not.toHaveText("✓ Current");
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await page.locator('[data-tab="displacements"]').click();
  // Stiffer Iy ≈ 6.667e-5 vs 1e-5 → |tip uz| roughly 6.7× smaller than 45 mm.
  await expect(page.locator("#results-content")).not.toContainText("-45");
  const tipRow = page
    .locator("#results-content table tbody tr")
    .filter({ has: page.locator("th, td", { hasText: /^n2$/ }) });
  const tipCells = await tipRow.locator("td").allTextContents();
  // columns after node label: ux, uy, uz, ...
  const tipMm = Number(String(tipCells[2] ?? tipCells[0]).replaceAll(",", ""));
  expect(Math.abs(tipMm)).toBeLessThan(20);
  expect(Math.abs(tipMm)).toBeGreaterThan(1);

  const exported = await model(page);
  expect(exported.sections[0].provenance).toMatch(/Computed solid rectangle/);
  expect(exported.sections[0].Iy).toBeCloseTo(0.1 * 0.2 ** 3 / 12, 12);
  expect(exported.sections[0].Iz).toBeCloseTo(0.2 * 0.1 ** 3 / 12, 12);

  await record("section-calculator-browser", {
    status: "PASS",
    tipUzApprox_mm: tipMm,
    Iy: exported.sections[0].Iy,
    Iz: exported.sections[0].Iz,
    J: exported.sections[0].J,
    provenance: exported.sections[0].provenance,
    pageErrors: errors,
  });
  expect(errors).toEqual([]);
});
