import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { evidenceDir, record } from "../../tools/evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M06/stress-screen";
process.env.WORKBENCH_TASK_ID ||= "M06-A";
process.env.WORKBENCH_MILESTONE ||= "M06";

const evidence = () => evidenceDir("evidence/M06/stress-screen");

test("M06 stress screen: B02 shows elastic fibre stresses with disclaimer", async ({
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
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");

  await page.locator('[data-testid="tab-stress"]').click();
  await expect(page.locator("[data-testid='stress-disclaimer']")).toContainText(
    /Not a member stability/,
  );
  await expect(page.locator("#results-content table tbody tr")).toHaveCount(1);
  const text = await page.locator("#results-content").textContent();
  expect(text).toMatch(/σ max/);
  expect(text).toMatch(/-?\d/);

  await record("stress-screen-browser", {
    status: "PASS",
    pageErrors: errors,
  });
  expect(errors).toEqual([]);
});
