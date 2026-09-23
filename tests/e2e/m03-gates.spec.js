import { menuCommand } from "../menu-helpers.js";
import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { evidenceDir, record } from "../../tools/evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M03/gates";
process.env.WORKBENCH_TASK_ID ||= "M03-gaps";
process.env.WORKBENCH_MILESTONE ||= "M03";

const evidence = () => evidenceDir("evidence/M03/gates");

async function blockAnalyse(page, ms = 2500) {
  await page.route("**/worker.js", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      "const response = JSON.parse(",
      `if(r.operation === "analyse"){const end=Date.now()+${ms};while(Date.now()<end){}} const response = JSON.parse(`,
    );
    await route.fulfill({ response, body });
  });
}

test("M03 cancel timing: cancelled ≤250ms and editing restored ≤1s", async ({
  page,
}) => {
  await blockAnalyse(page, 3000);
  await page.goto("/");
  await page.locator("#new-project").click();
  await expect(page.locator("#hash-status")).toContainText(/^[0-9a-f]{12}/i);
  const hash = await page.locator("#hash-status").textContent();
  await page.locator("#analyse").click();
  await expect(page.locator("#cancel")).toBeVisible();

  const timing = await page.evaluate(async () => {
    const t0 = performance.now();
    document.querySelector("#cancel").click();
    while (
      !(document.querySelector("#message")?.textContent || "").includes(
        "CANCELLED",
      )
    ) {
      if (performance.now() - t0 > 2000)
        return { error: "cancelled-timeout", t0 };
      await new Promise((r) => requestAnimationFrame(r));
    }
    const cancelledMs = performance.now() - t0;
    while (document.querySelector("#analyse")?.disabled) {
      if (performance.now() - t0 > 2000)
        return { cancelledMs, error: "editing-timeout" };
      await new Promise((r) => requestAnimationFrame(r));
    }
    return {
      cancelledMs,
      editingRestoredMs: performance.now() - t0,
    };
  });
  expect(timing.error).toBeUndefined();
  expect(timing.cancelledMs).toBeLessThanOrEqual(250);
  expect(timing.editingRestoredMs).toBeLessThanOrEqual(1000);
  await expect(page.locator("#hash-status")).toHaveText(hash);

  await mkdir(evidence(), { recursive: true });
  await record("cancel-timing", {
    status: "PASS",
    testCount: 1,
    testIds: ["m03-cancel-timing"],
    cancelledMs: timing.cancelledMs,
    editingRestoredMs: timing.editingRestoredMs,
  });
});

test("M03 analyse click keeps UI event-loop gaps ≤100ms", async ({ page }) => {
  await blockAnalyse(page, 1500);
  await page.goto("/");
  await page.locator("#new-project").click();
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  const gap = await page.evaluate(async () => {
    let maxGap = 0;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      maxGap = Math.max(maxGap, now - last);
      last = now;
    }, 0);
    document.querySelector("#analyse").click();
    await new Promise((r) => setTimeout(r, 200));
    clearInterval(id);
    return maxGap;
  });
  expect(gap).toBeLessThanOrEqual(100);
  await page.locator("#cancel").click();
  await expect(page.locator("#message")).toContainText("CANCELLED");

  await mkdir(evidence(), { recursive: true });
  await record("ui-responsiveness", {
    status: "PASS",
    testCount: 1,
    testIds: ["m03-analyse-ui-gap"],
    maxEventLoopGapMs: gap,
  });
});

test("M03 GPU loss during blocked analysis preserves model hash", async ({
  page,
}) => {
  await blockAnalyse(page, 3000);
  await page.goto("/");
  await page.locator("#new-project").click();
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  await expect(page.locator("#hash-status")).toContainText(/^[0-9a-f]{12}/i);
  const hash = await page.locator("#hash-status").textContent();
  await expect(page.locator("#model-count")).toContainText("2 nodes");

  await page.locator("#analyse").click();
  await expect(page.locator("#cancel")).toBeVisible();
  await menuCommand(page, "View", "Recreate viewport");
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await expect(page.locator("#model-count")).toContainText("2 nodes");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-device-generation",
    /[2-9]|[1-9][0-9]+/,
  );

  await page.locator("#cancel").click();
  await expect(page.locator("#message")).toContainText("CANCELLED");
  await expect(page.locator("#hash-status")).toHaveText(hash);

  await mkdir(evidence(), { recursive: true });
  await record("gpu-during-analysis", {
    status: "PASS",
    testCount: 1,
    testIds: ["m03-gpu-loss-during-analysis"],
  });
});
