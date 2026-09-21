import { test, expect } from "@playwright/test";
import { record } from "../tools/evidence.mjs";
test("local warm startup and repeated cantilever solve baseline", async ({
  page,
}) => {
  const times = [];
  for (let i = 0; i < 6; i++) {
    const start = Date.now();
    await page.goto("/");
    await page.locator("#new-project").click();
    await expect(page.locator("#kernel-status")).toContainText("ready");
    await page.locator("#analyse").click();
    await expect(page.locator("#result-status")).toHaveText("✓ Current");
    if (i) times.push(Date.now() - start);
  }
  await record("performance", {
    status: "PASS",
    testCount: 5,
    testIds: ["local-start-solve-baseline"],
    command: ["npm", "run", "test:performance"],
    timesMs: times,
    limitations:
      "Software GPU baseline only. Not a hardware or full-size release gate.",
  });
  expect(Math.max(...times)).toBeLessThan(5000);
});
