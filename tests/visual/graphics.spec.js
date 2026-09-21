import { test, expect } from "@playwright/test";
import { record } from "../../tools/evidence.mjs";
test("GPU ID attachment agrees with authoritative CPU ray; zoom/resize preserve engineering hash", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#new-project").click();
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  const box = await page.locator("#viewport").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.53);
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-last-gpu-pick",
    "m1",
  );
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-last-cpu-pick",
    "m1",
  );
  const hash = await page.locator("#hash-status").textContent();
  await page.mouse.wheel(0, -150);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator("#view-3d").click();
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await expect(page.locator("#gpu-notice")).toBeHidden();
  const gpu = await page.evaluate(async () => {
    const adapter = await navigator.gpu.requestAdapter();
    return {
      info: {
        vendor: adapter.info.vendor,
        architecture: adapter.info.architecture,
        device: adapter.info.device,
        description: adapter.info.description,
      },
      features: [...adapter.features],
      limits: { maxTextureDimension2D: adapter.limits.maxTextureDimension2D },
      dpr: devicePixelRatio,
      userAgent: navigator.userAgent,
    };
  });
  await record("graphics", {
    status: "PASS",
    testCount: 3,
    testIds: ["gpu-cpu-member-id", "resize-1280", "view-invariance"],
    command: ["npx", "playwright", "test", "tests/visual"],
    gpu,
    limitations:
      "Focused M00 graphics checks; full clipping/occlusion/far-origin performance matrix is not established.",
  });
});
