import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { evidenceDir, record } from "../../tools/evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M06/capability-ledger";
process.env.WORKBENCH_TASK_ID ||= "M06-B";
process.env.WORKBENCH_MILESTONE ||= "M06";

const evidence = () => evidenceDir("evidence/M06/capability-ledger");

test("M06 capability ledger: View capabilities shows UNKNOWN parity and exclusions", async ({
  page,
}) => {
  const dir = evidence();
  await mkdir(dir, { recursive: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const ledger = JSON.parse(await readFile("capabilities.json", "utf8"));
  expect(ledger.comparisonStatus).toBe("UNKNOWN");
  expect(ledger.excludedDomains).toEqual(
    expect.arrayContaining(["shells", "plasticity", "DWG/native PROKON formats"]),
  );

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
  await expect(page.locator("#message")).not.toContainText(/parity:|Excluded/i);
  await expect(page.locator("#footer-scope")).toBeVisible();

  await page.locator("#scope").click();
  await expect(page.locator("[data-testid='parity-unknown']")).toContainText(
    /UNKNOWN/,
  );
  await expect(page.locator("[data-testid='capability-ledger']")).toBeVisible();
  await expect(
    page.locator('[data-testid="comparison-status"]').first(),
  ).toHaveText("UNKNOWN");
  await expect(page.locator("[data-testid='excluded-domains']")).toContainText(
    "shells",
  );
  await expect(page.locator("[data-testid='excluded-domains']")).toContainText(
    "DWG/native PROKON formats",
  );
  await expect(
    page.locator('[data-capability-id="elastic-stress-screen"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-capability-id="steel-code"]'),
  ).toContainText("partial");

  const capsRes = await page.request.get("/capabilities.json");
  expect(capsRes.ok()).toBeTruthy();
  const served = await capsRes.json();
  expect(served.comparisonStatus).toBe("UNKNOWN");
  expect(served.excludedDomains.length).toBeGreaterThan(5);

  await record("capability-ledger-browser", {
    status: "PASS",
    pageErrors: errors,
    comparisonStatus: served.comparisonStatus,
    excludedCount: served.excludedDomains.length,
    capabilityCount: served.capabilities.length,
  });
  expect(errors).toEqual([]);
});
