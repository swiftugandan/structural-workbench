import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { menuCommand } from "../menu-helpers.js";

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
  await mkdir("evidence/M07/native-inputs", { recursive: true });
  await page.screenshot({
    path: "evidence/M07/native-inputs/member-steel-pass.png",
    fullPage: true,
  });
  await writeFile(
    "evidence/M07/native-inputs/design-run.json",
    JSON.stringify(record, null, 2),
  );
  await info.attach("native-design-record", {
    body: JSON.stringify(record),
    contentType: "application/json",
  });
  expect(errors).toEqual([]);
});

test("DW-F4: fail reaches governing station and clause; LTB stays unsupported", async ({
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
  await expect(page.locator("[data-testid='native-design-state']")).toHaveText(
    "UNSUPPORTED",
  );
  await expect(page.locator("[data-check-id='flexure']")).toContainText(
    "unsupported",
  );
});
