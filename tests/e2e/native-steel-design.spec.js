import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { menuCommand } from "../menu-helpers.js";
import { evidenceDir } from "../../tools/evidence.mjs";

const dir = evidenceDir("evidence/M07/native-inputs");

async function openModel(page, load = 10000) {
  const model = JSON.parse(await readFile("fixtures/models/B04.json", "utf8"));
  model.id = "native-steel-test";
  model.loads[0].values = [0, load, 0, 0, 0, 0];
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "steel-input.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(model)),
  });
  await expect(page.locator("#kernel-status")).toContainText("ready");
  // Viewport markers are drawn only once WebGPU is ready.
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU", {
    timeout: 60000,
  });
  await page.locator("[data-inspector-tab='steel']").click();
  await expect(page.locator("[data-testid='design-readiness']")).toHaveText(
    "INCOMPLETE",
  );
  await page
    .locator("#design-section")
    .selectOption("aisc-shapes-v16.0-subset-1:W18X50");
  await page.locator("#design-assign").click();
  await expect(page.locator("#design-save")).toBeEnabled();
  for (const [key, value] of Object.entries({
    ky: "1",
    kz: "1",
    lb: "0",
    cb: "1",
  }))
    await page.locator(`#design-${key}`).fill(value);
  await page.locator("#design-bracing").selectOption("continuous");
  await page.locator("#design-basis").check();
  await page.locator("#design-save").click();
  await expect(page.locator("[data-testid='design-readiness']")).toHaveText(
    "READY",
  );
  await expect(page.locator("#design-run")).toBeDisabled();
  await page.locator("#analyse").click();
  await expect(page.locator("#design-run")).toBeEnabled();
}

test("DW-E/F: model-native catalogue, check, provenance, stale, undo and reopen", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openModel(page);
  await page.locator("#design-run").click();
  await expect(page.locator("[data-testid='native-design-state']")).toHaveText(
    "PASS",
  );
  await expect(page.locator("#modal")).not.toBeVisible();
  const result = page.locator("[data-testid='native-design-result']");
  await expect(result.locator("[data-testid='steel-overall']")).toHaveText(
    "pass",
  );
  await expect(result.locator("[data-check-id='flexure']")).toContainText(
    "30.0 kN·m",
  );
  await page.locator("#design-why").click();
  await expect(
    page.locator("[data-testid='design-governing-marker']"),
  ).toContainText("x/L 0.000");
  const recordDownload = page.waitForEvent("download");
  await page.locator("#design-download").click();
  const record = JSON.parse(
    await readFile(await (await recordDownload).path(), "utf8"),
  );
  expect(record.source).toBe("modelNative");
  expect(record.mock).toBe(false);
  expect(record.resultId).toBeTruthy();
  expect(record.checks.find((c) => c.checkId === "flexure").demand).toBeCloseTo(
    30000,
    6,
  );
  expect(
    record.checks.find((c) => c.checkId === "flexure").resistance /
      1355.8179483314,
  ).toBeCloseTo(378.75, 1);
  await page.locator("#design-ky").fill("1.2");
  await expect(result.locator("[data-testid='steel-overall']")).toHaveText(
    "stale",
  );
  await expect(page.locator("#export-report")).toBeDisabled();
  await page.locator("#design-save").click();
  await expect(page.locator("[data-testid='native-design-state']")).toHaveText(
    "STALE",
  );
  await page.locator("#undo").click();
  await expect(page.locator("#design-ky")).toHaveValue("1");
  await expect(page.locator("[data-testid='native-design-state']")).toHaveText(
    "PASS",
  );
  const reportDownload = page.waitForEvent("download");
  await menuCommand(page, "File", "Export calculation report");
  const html = await readFile(await (await reportDownload).path(), "utf8");
  expect(html).toContain(record.designRunId);
  expect(html).toContain(record.designSettingsHash);
  const projectDownload = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const saved = await readFile(await (await projectDownload).path());
  await page.locator("#import-file").setInputFiles({
    name: "reopen.json",
    mimeType: "application/json",
    buffer: saved,
  });
  await expect(page.locator("#design-ky")).toHaveValue("1");
  await expect(page.locator("[data-testid='design-readiness']")).toHaveText(
    "READY",
  );
  await page.locator("#analyse").click();
  await expect(page.locator("#design-run")).toBeEnabled();
  await page.locator("#design-run").click();
  await expect(page.locator("[data-testid='native-design-state']")).toHaveText(
    "PASS",
  );
  await mkdir(dir, { recursive: true });
  await page.screenshot({
    path: `${dir}/member-steel-pass.png`,
    fullPage: true,
  });
  await writeFile(`${dir}/design-run.json`, JSON.stringify(record, null, 2));
  await info.attach("native-design-record", {
    body: JSON.stringify(record),
    contentType: "application/json",
  });
  expect(errors).toEqual([]);
});

test("DW-F4: fail reaches governing station and clause; LTB governs once Lb exceeds Lp", async ({
  page,
}) => {
  await openModel(page, 300000);
  await page.locator("#design-run").click();
  await expect(page.locator("[data-testid='native-design-state']")).toHaveText(
    "FAIL",
  );
  await page.locator("#design-why").click();
  await expect(
    page.locator("[data-testid='design-governing-marker']"),
  ).toContainText("F2-1");
  await page.locator("[data-steel-pane=details]").click();
  await expect(page.locator("[data-steel-view=details]")).toContainText("Mp");
  await page.locator("#design-lb").fill("3");
  await page.locator("#design-bracing").selectOption("unbraced");
  await page.locator("#design-save").click();
  await page.locator("#analyse").click();
  await expect(page.locator("#design-run")).toBeEnabled();
  await page.locator("#design-run").click();
  // Lb = 3 m on the W18×50 is past Lp: inelastic lateral-torsional buckling
  // (F2-2) now governs the flexure check instead of yielding.
  await expect(page.locator("[data-check-id='flexure']")).toContainText("F2-2");
  await expect(page.locator("[data-testid='native-design-state']")).toHaveText(
    "FAIL",
  );
});

test("DW-SVc1: a deflection criterion is a separate serviceability status", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openModel(page);
  // B04: 3 m cantilever, 10 kN tip load, W18×50 bending about AISC x.
  const E = 29000 * 6.894757293168361e6;
  const I = 800 * 0.0254 ** 4;
  const tip = (10000 * 3 ** 3) / (3 * E * I);

  await page.locator("#design-service-case").selectOption("LC1");
  await page.locator("#design-service-ratio").fill("180");
  await page.locator("#design-service-basis").selectOption("absolute");
  await page.locator("#design-save").click();
  await page.locator("#analyse").click();
  await expect(page.locator("#design-run")).toBeEnabled();
  await page.locator("#design-run").click();
  const service = page.locator("[data-testid='steel-serviceability']").first();
  await expect(service).toHaveAttribute("data-status", "pass");
  const demand = Number(
    await service
      .locator("[data-testid='steel-serviceability-demand']")
      .getAttribute("data-si"),
  );
  expect(Math.abs(demand / tip - 1)).toBeLessThanOrEqual(1e-6);

  // A far tighter limit fails serviceability; strength is unaffected.
  await page.locator("#design-service-ratio").fill("100000");
  await page.locator("#design-save").click();
  await page.locator("#analyse").click();
  await expect(page.locator("#design-run")).toBeEnabled();
  await page.locator("#design-run").click();
  await expect(service).toHaveAttribute("data-status", "fail");
  await expect(page.locator("[data-testid='native-design-state']")).toHaveText(
    "PASS",
  );

  // The record carries both, separately.
  const download = page.waitForEvent("download");
  await page.locator("#design-download").click();
  const record = JSON.parse(
    await readFile(await (await download).path(), "utf8"),
  );
  expect(record.overall).toBe("pass");
  expect(record.serviceability.status).toBe("fail");
  expect(record.serviceability.basis).toBe("absolute");
  expect(errors).toEqual([]);
});

test("Derived Cb: the model's moment diagram sets Cb, with Cb = 1 for a free cantilever end", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openModel(page);
  // B04 is a 3 m cantilever: unbraced over its length, Cb derived.
  await page.locator("#design-lb").fill("3");
  await page.locator("#design-bracing").selectOption("unbraced");
  await page.locator("#design-cb-model").check();
  await expect(page.locator("#design-cb")).toBeDisabled();
  await page.locator("#design-save").click();
  await expect(page.locator("[data-testid='design-readiness']")).toHaveText(
    "READY",
  );
  await page.locator("#analyse").click();
  await expect(page.locator("#design-run")).toBeEnabled();
  await page.locator("#design-run").click();
  await expect(page.locator("[data-testid='cb-derivation']")).toContainText(
    "Cᵦ = 1 derived",
  );
  await expect(page.locator("[data-testid='cb-derivation']")).toContainText(
    "cantilever",
  );
  await expect(page.locator("[data-check-id='flexure']")).toContainText("F2-2");
  expect(errors).toEqual([]);
});

test("Bracing points: each segment gets its own Lb and Cb, with Cb = 1 at the free end", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openModel(page);
  // B04 (3 m cantilever) braced at mid-length: segment 0–0.5 has the linear
  // diagram 3P→1.5P, so F1-1 gives 12.5·3 / (7.5 + 7.875 + 9 + 5.625) = 1.25;
  // segment 0.5–1 ends at the free tip, Cb = 1.
  await page.locator("#design-bracing").selectOption("points");
  await expect(page.locator("#design-lb")).toBeDisabled();
  await page.locator("#design-bracing-points").fill("0.5");
  await page.locator("#design-cb-model").check();
  await page.locator("#design-save").click();
  await expect(page.locator("[data-testid='design-readiness']")).toHaveText(
    "READY",
  );
  await page.locator("#analyse").click();
  await expect(page.locator("#design-run")).toBeEnabled();
  await page.locator("#design-run").click();
  await expect(
    page.locator("[data-testid='bracing-segments'] tbody tr"),
  ).toHaveCount(2);
  const rows = await page
    .locator("[data-testid='bracing-segments'] tbody tr")
    .evaluateAll((trs) =>
      trs.map((tr) =>
        [...tr.querySelectorAll("td[data-si]")].map((td) =>
          Number(td.dataset.si),
        ),
      ),
    );
  expect(rows).toHaveLength(2);
  for (const [lb] of rows)
    expect(Math.abs(lb - 1.5)).toBeLessThanOrEqual(1e-12);
  expect(Math.abs(rows[0][1] - 1.25)).toBeLessThanOrEqual(1e-9);
  expect(rows[1][1]).toBe(1);
  expect(errors).toEqual([]);
});
