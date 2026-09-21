import { test, expect } from "@playwright/test";
import { readFile, readdir, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { record } from "../tools/evidence.mjs";
test("M01 startup: cached controls and viewport, cold network and compressed payload", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const context = await browser.newContext();
  await context.addInitScript(() => {
    // Measure the actual ready transition, excluding assertion polling latency.
    window.startupReady = new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const workspace = document.querySelector("#workspace"),
          analyse = document.querySelector("#analyse");
        if (
          workspace &&
          !workspace.hidden &&
          analyse &&
          !analyse.disabled &&
          document
            .querySelector("#gpu-status")
            ?.textContent.includes("WEBGPU") &&
          document
            .querySelector("#kernel-status")
            ?.textContent.includes("ready")
        ) {
          observer.disconnect();
          resolve(performance.now());
        }
      });
      observer.observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
    });
  });
  const page = await context.newPage();
  const warm = [];
  for (let i = 0; i < 6; i++) {
    await page.goto("/");
    await page.locator("#new-project").click();
    await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
    await expect(page.locator("#kernel-status")).toContainText("ready");
    const ready = await page.evaluate(() => window.startupReady);
    if (i) warm.push(ready);
  }
  const coldPage = await context.newPage();
  const cdp = await context.newCDPSession(coldPage);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 50,
    downloadThroughput: (10 * 1000 * 1000) / 8,
    uploadThroughput: (10 * 1000 * 1000) / 8,
  });
  await coldPage.goto("/");
  await coldPage.locator("#new-project").click();
  await expect(coldPage.locator("#gpu-status")).toContainText("WEBGPU");
  await expect(coldPage.locator("#kernel-status")).toContainText("ready");
  const coldMs = await coldPage.evaluate(() => window.startupReady);
  const files = [];
  async function walk(path) {
    for (const name of await readdir(path)) {
      if (name === "examples" || name === "build.json") continue;
      const file = path + "/" + name;
      if ((await stat(file)).isDirectory()) await walk(file);
      else files.push(file);
    }
  }
  await walk("dist");
  const compressedBytes = (
    await Promise.all(
      files.map(async (f) => gzipSync(await readFile(f)).length),
    )
  ).reduce((a, b) => a + b, 0);
  await record("m01-startup", {
    status:
      Math.max(...warm) <= 2000 &&
      coldMs <= 5000 &&
      compressedBytes <= 8 * 1024 * 1024
        ? "PASS"
        : "FAIL",
    testCount: 3,
    testIds: [
      "M01-cached-startup",
      "M01-cold-network-startup",
      "M01-compressed-core",
    ],
    command: ["npx", "playwright", "test", "tests/startup.spec.js"],
    samples: { warm },
    coldMs,
    compressedBytes,
    browser: browser.version(),
  });
  expect(Math.max(...warm)).toBeLessThanOrEqual(2000);
  expect(coldMs).toBeLessThanOrEqual(5000);
  expect(compressedBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
  await context.close();
});
