import { test, expect } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { menuCommand } from "../menu-helpers.js";

async function record(name, body) {
  const dir = "evidence/M07/steel-ui";
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/${name}.json`, JSON.stringify(body, null, 2));
}

async function openSteelPanel(page) {
  await page.locator("[data-testid='steel-check-open']").evaluate((el) => {
    el.hidden = false;
    el.click();
  });
  await expect(page.locator("[data-testid='steel-check-panel']")).toBeVisible();
  await expect(page.locator("[data-testid='steel-profile-badge']")).toContainText(
    /enabled/i,
  );
}

async function closeModal(page) {
  await page.locator("#close-modal").click();
  await expect(page.locator("#modal")).not.toBeVisible();
}

test("standalone S2-D1 steel check passes via evaluateDesign UI", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await page.locator("#new-project").click();
  await expect(page.locator("#kernel-status")).toContainText("ready", {
    timeout: 60_000,
  });

  await openSteelPanel(page);

  await page.locator("[data-testid='steel-load-s2d1']").click();
  await expect(page.locator("[data-testid='steel-case-loaded']")).toBeVisible();
  await page.locator("[data-testid='steel-run-check']").click();
  await expect(page.locator("[data-testid='steel-overall']")).toHaveText("pass", {
    timeout: 15_000,
  });
  await expect(
    page.locator('[data-testid="steel-check-row"][data-check-id="tension"]'),
  ).toContainText("pass");

  await record("steel-ui-s2d1", {
    status: "PASS",
    pageErrors: errors,
    overall: "pass",
    fixture: "S2-D1",
  });
  expect(errors).toEqual([]);
});

test("standalone S2-D1 fail seed reports overall fail", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await page.locator("#new-project").click();
  await expect(page.locator("#kernel-status")).toContainText("ready", {
    timeout: 60_000,
  });

  await openSteelPanel(page);
  await page.locator("[data-testid='steel-load-s2d1-fail']").click();
  await expect(page.locator("[data-testid='steel-case-loaded']")).toContainText(
    /fail/i,
  );
  await page.locator("[data-testid='steel-run-check']").click();
  await expect(page.locator("[data-testid='steel-overall']")).toHaveText("fail", {
    timeout: 15_000,
  });
  await expect(
    page.locator('[data-testid="steel-check-row"][data-check-id="tension"]'),
  ).toContainText("fail");

  await record("steel-ui-s2d1-fail", {
    status: "PASS",
    pageErrors: errors,
    overall: "fail",
    fixture: "S2-D1-fail",
  });
  expect(errors).toEqual([]);
});

test("model-derived demand check lands in calculation report clause trail", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const fixture = JSON.parse(
    await readFile("fixtures/models/B02.json", "utf8"),
  );
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "B02.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await expect(page.locator("#kernel-status")).toContainText("ready", {
    timeout: 60_000,
  });
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");

  await openSteelPanel(page);
  await page.locator("[data-testid='steel-load-s2d1']").click();
  await expect(page.locator("[data-testid='steel-use-analysis']")).toBeEnabled();
  await page.locator("[data-testid='steel-use-analysis']").click();
  await expect(page.locator("[data-testid='steel-case-loaded']")).toContainText(
    /Model-derived/i,
  );
  await page.locator("[data-testid='steel-run-check']").click();
  await expect(page.locator("[data-testid='steel-overall']")).toBeVisible({
    timeout: 15_000,
  });
  const overall = await page.locator("[data-testid='steel-overall']").innerText();
  expect(["pass", "fail", "unsupported", "indeterminate"]).toContain(overall);

  await closeModal(page);

  const reportPromise = page.waitForEvent("download");
  await menuCommand(page, "File", "Export calculation report");
  const download = await reportPromise;
  const html = await readFile(await download.path(), "utf8");
  expect(html).toMatch(/Steel design checks/);
  expect(html).toMatch(/data-testid="report-design-run"/);
  expect(html).toMatch(/data-testid="report-design-check"/);
  expect(html).toMatch(/B4\.1a|D2|F2-1|G2\.1|H1/);

  await record("steel-ui-model-derived-report", {
    status: "PASS",
    pageErrors: errors,
    overall,
    reportHasClauseTrail: true,
  });
  expect(errors).toEqual([]);
});
