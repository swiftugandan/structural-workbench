import { test } from "@playwright/test";
// Full reference model: assertions use the documented full-model budget.
import { expect, FULL_MODEL_TEST_TIMEOUT_MS } from "../full-model-helpers.js";
import { mkdir, writeFile } from "node:fs/promises";
const dir = process.env.WORKBENCH_EVIDENCE_DIR || "evidence/render-budget";

/**
 * PERF-FULL-MODEL-RENDER: one user action on the 642-member reference model
 * redraws the viewport once per task and rebuilds the explorer only when the
 * selection it shows changes. Counts are structural; timings are recorded as
 * evidence only (software GPU, machine dependent).
 */
test("UKR01 preview run and undo: one viewport frame per task, no redundant explorer rebuilds", async ({
  page,
}) => {
  test.setTimeout(FULL_MODEL_TEST_TIMEOUT_MS);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const probe = (window.__renderProbe = {
      frames: 0,
      explorer: 0,
      longTaskMs: 0,
    });
    const submit = GPUQueue.prototype.submit;
    GPUQueue.prototype.submit = function (...args) {
      probe.frames++;
      return submit.apply(this, args);
    };
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) probe.longTaskMs += e.duration;
    }).observe({ type: "longtask" });
    addEventListener("DOMContentLoaded", () =>
      new MutationObserver((records) => {
        for (const r of records) if (r.removedNodes.length) probe.explorer++;
      }).observe(document.querySelector("#model-nav"), { childList: true }),
    );
  });
  const settle = async () => {
    await expect.poll(() => page.evaluate(() => window.__studyReady())).toBe(
      true,
    );
    // Let follow-up Worker queries (view geometry, axes) land and draw.
    await page.waitForTimeout(800);
  };
  const reset = () =>
    page.evaluate(() =>
      Object.assign(window.__renderProbe, {
        frames: 0,
        explorer: 0,
        longTaskMs: 0,
      }),
    );
  const read = () => page.evaluate(() => ({ ...window.__renderProbe }));

  await page.goto("/");
  await page.locator("#worked-examples").click();
  await page.locator("[data-example=UKR01]").click();
  await expect(page.locator("#model-count")).toHaveText(
    "447 nodes · 642 members",
  );
  await page.locator("#result-case").selectOption("SLS");
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await page.locator("#model-nav [data-preview]").first().click();
  await page.locator("#preview-source").selectOption("model");

  const runs = [];
  for (let i = 0; i < 3; i++) {
    await settle();
    await reset();
    await page.locator("#preview-run").click();
    // The UKR01 footing is designed on model actions and waits for the
    // engineer's code inputs (ADR 0028).
    await expect(page.locator("[data-testid=preview-state]")).toHaveText(
      "INDETERMINATE",
    );
    await settle();
    runs.push(await read());
  }
  // Warm runs only: the first includes the analysis Worker's cold start.
  for (const run of runs.slice(1)) {
    expect(run.explorer).toBe(0);
    expect(run.frames).toBeLessThanOrEqual(1);
  }
  await expect(
    page.locator('#model-nav [data-preview][aria-current="true"]'),
  ).toHaveCount(1);

  await page.locator("#preview-thickness").fill("700 mm");
  await page.locator("#preview-save").click();
  await expect(page.locator("#result-status")).toContainText("Stale");
  await settle();
  await reset();
  await page.locator("#undo").click();
  await expect(page.locator("#save-status")).toHaveText("Saved locally");
  await settle();
  const undo = await read();
  // The restored revision rebuilds the explorer once; the synchronous
  // refresh draws once and each follow-up Worker query draws once.
  expect(undo.explorer).toBe(1);
  expect(undo.frames).toBeLessThanOrEqual(5);
  expect(errors).toEqual([]);

  await mkdir(dir, { recursive: true });
  await writeFile(
    `${dir}/ukr01-render-budget.json`,
    JSON.stringify(
      {
        model: "UKR01 (447 nodes, 642 members)",
        gpu: "software (SwiftShader) unless WORKBENCH_REAL_GPU=1",
        previewRuns: runs,
        undo,
        note: "frames = GPUQueue.submit calls; explorer = #model-nav rebuilds; longTaskMs = main-thread long tasks during the action",
      },
      null,
      2,
    ),
  );
});
