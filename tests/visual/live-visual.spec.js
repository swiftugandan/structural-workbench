import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { evidenceDir } from "../../tools/evidence.mjs";

test("Live visual: portal authoring, analyse and results on real GPU", async ({
  page,
}) => {
  test.skip(
    process.env.WORKBENCH_LIVE_VISUAL !== "1",
    "Run via tools/run-live-visual.mjs on a real-GPU build",
  );
  const dir = evidenceDir();
  await mkdir(dir, { recursive: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.screenshot({
    path: `${dir}/live-visual-landing.png`,
    fullPage: true,
  });

  await page.locator("#new-portal").click();
  await page
    .getByRole("button", { name: "Create portal", exact: true })
    .click();
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 3 members");
  await page.screenshot({
    path: `${dir}/live-visual-portal.png`,
    fullPage: true,
  });

  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await page.screenshot({
    path: `${dir}/live-visual-results.png`,
    fullPage: true,
  });

  const gpu = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) return { description: "none" };
    const info = adapter.info || {};
    return {
      vendor: info.vendor,
      architecture: info.architecture,
      device: info.device,
      description: info.description || info.vendor || "Active adapter",
    };
  });
  expect(gpu.description).toBeTruthy();
  expect(JSON.stringify(gpu)).not.toMatch(/swiftshader|software|llvmpipe/i);
  expect(errors).toEqual([]);
});
