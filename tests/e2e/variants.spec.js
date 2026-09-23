import { menuCommand } from "../menu-helpers.js";
import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { evidenceDir, record } from "../../tools/evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M05/variants";
process.env.WORKBENCH_TASK_ID ||= "M05-B";
process.env.WORKBENCH_MILESTONE ||= "M05";

const evidence = () => evidenceDir("evidence/M05/variants");

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

test("M05 variants: duplicate, stiffen, compare retains both hashes and reports", async ({
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

  await menuCommand(page, "File", "Duplicate as variant");
  await expect(page.locator("#project-name")).toHaveValue(/\(variant\)/);
  await expect(page.locator("#message")).toContainText(/Baseline/);

  await edit(page, "sections", "sec1");
  await page.locator('[data-testid="rect-width"]').fill("100");
  await page.locator('[data-testid="rect-depth"]').fill("200");
  await page.locator('[data-testid="compute-rectangle"]').click();
  await expect(page.locator("[data-rect-status]")).toContainText(/filled/i);
  await save(page);

  await menuCommand(page, "File", "Compare with baseline…");
  await expect(page.locator(".variant-compare")).toBeVisible({ timeout: 60000 });
  await expect(page.locator(".variant-compare")).toContainText("Model hash");
  const hashes = await page.locator(".variant-compare code").allTextContents();
  expect(hashes.length).toBe(2);
  expect(hashes[0]).not.toEqual(hashes[1]);
  await expect(page.locator(".variant-compare")).toContainText("Tip uz");
  const tipText = await page
    .locator(".variant-compare tbody tr")
    .filter({ hasText: "Tip uz" })
    .textContent();
  expect(tipText).toMatch(/-?\d/);
  const tipValues = [...tipText.matchAll(/(-?\d+(?:\.\d+)?)\s*mm/g)].map((m) =>
    Number(m[1]),
  );
  expect(tipValues.length).toBe(2);
  expect(Math.abs(tipValues[0])).toBeGreaterThan(Math.abs(tipValues[1]));
  const baselineReport = page.waitForEvent("download");
  await page.locator("#download-baseline-report").click();
  const baselineFile = await baselineReport;
  const baselineHtml = await readFile(await baselineFile.path(), "utf8");
  expect(baselineHtml).toContain("calculation record");
  expect(baselineHtml).toContain(hashes[0]);

  const variantReport = page.waitForEvent("download");
  await page.locator("#download-variant-report").click();
  const variantFile = await variantReport;
  const variantHtml = await readFile(await variantFile.path(), "utf8");
  expect(variantHtml).toContain("calculation record");
  expect(variantHtml).toContain(hashes[1]);

  await record("variants-browser", {
    status: "PASS",
    baselineHash: hashes[0],
    variantHash: hashes[1],
    pageErrors: errors,
  });
  expect(errors).toEqual([]);
});
