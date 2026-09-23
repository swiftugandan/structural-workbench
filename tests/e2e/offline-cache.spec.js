import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { evidenceDir, record } from "../../tools/evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M04/offline-cache";
process.env.WORKBENCH_TASK_ID ||= "M04-B";
process.env.WORKBENCH_MILESTONE ||= "M04";

const evidence = () => evidenceDir("evidence/M04/offline-cache");

async function waitForServiceWorker(page) {
  await page.waitForFunction(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg?.active) return false;
    const keys = await caches.keys();
    return keys.some((k) => k.startsWith("workbench-build-"));
  });
}

test.describe("M04 offline build-ID cache", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearPermissions();
  });

  test("precaches atomic build and reopens offline from IndexedDB", async ({
    page,
    context,
  }) => {
    await mkdir(evidence(), { recursive: true });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    const fixture = JSON.parse(
      await readFile("fixtures/models/B02.json", "utf8"),
    );
    await page.goto("/");
    await expect(page.locator("#build-status")).toContainText(/Build [a-f0-9]{12}/);
    await waitForServiceWorker(page);

    const buildHash = await page.locator("#build-status").getAttribute(
      "data-build-hash",
    );
    expect(buildHash).toMatch(/^[a-f0-9]{64}$/);

    await page.locator("#import-file").setInputFiles({
      name: "B02.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
    await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
    await expect(page.locator("#save-status")).toHaveText("Saved locally", {
      timeout: 10000,
    });
    const projectName = await page.locator("#project-name").inputValue();
    const hashBefore = await page.locator("#hash-status").textContent();

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("#local-badge")).toContainText(/Offline/i);
    await expect(page.locator("#offline-status")).toContainText(/Offline/i);
    await expect(page.locator("#build-status")).toHaveAttribute(
      "data-build-hash",
      buildHash,
    );

    await page.getByRole("button", { name: new RegExp(projectName) }).click();
    await expect(page.locator("#workspace")).toBeVisible();
    await expect(page.locator("#hash-status")).toHaveText(hashBefore);
    await expect(page.locator("#kernel-status")).toContainText("ready");

    const cacheProbe = await page.evaluate(async () => {
      const keys = await caches.keys();
      const build = keys.find((k) => k.startsWith("workbench-build-"));
      const cache = await caches.open(build);
      const js = await cache.match("./app.js");
      const wasm = await cache.match("./pkg/workbench_wasm_api_bg.wasm");
      const manifest = await cache.match("./build.json");
      const body = manifest ? await manifest.json() : null;
      return {
        cacheName: build,
        hasAppJs: !!js,
        hasWasm: !!wasm,
        manifestBuild: body?.buildHash || null,
      };
    });
    expect(cacheProbe.hasAppJs).toBe(true);
    expect(cacheProbe.hasWasm).toBe(true);
    expect(cacheProbe.manifestBuild).toBe(buildHash);
    expect(cacheProbe.cacheName).toBe("workbench-build-" + buildHash);

    expect(errors).toEqual([]);
    await record("offline-reopen", {
      status: "PASS",
      test: "precaches atomic build and reopens offline from IndexedDB",
      buildHash,
      cacheName: cacheProbe.cacheName,
    });
  });

  test("prompts reload after save when a waiting build update is ready", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForServiceWorker(page);
    await page.locator("#new-project").click();
    await expect(page.locator("#save-status")).toHaveText("Saved locally", {
      timeout: 10000,
    });

    await page.evaluate(() => {
      window.__workbenchOffline.markUpdateReady();
      window.__workbenchOffline.afterSaved();
    });
    await expect(page.locator("#update-banner")).toBeVisible();
    await expect(page.locator("#update-banner")).toContainText(
      /same build ID|Reload after save/i,
    );
    await expect(page.locator("#reload-update")).toBeVisible();

    await record("update-after-save", {
      status: "PASS",
      test: "prompts reload after save when a waiting build update is ready",
    });
  });
});
