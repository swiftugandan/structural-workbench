import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { evidenceDir, record } from "../../tools/evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M04/reliability";
process.env.WORKBENCH_TASK_ID ||= "M04-D";
process.env.WORKBENCH_MILESTONE ||= "M04";

const evidence = () => evidenceDir("evidence/M04/reliability");

test.describe("M04 reliability matrix", () => {
  test("corrupt latest snapshot recovers verified history revision", async ({
    page,
  }) => {
    await mkdir(evidence(), { recursive: true });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");
    await page.locator("#new-project").click();
    await expect(page.locator("#save-status")).toHaveText("Saved locally", {
      timeout: 10000,
    });
    const firstHash = await page.locator("#hash-status").textContent();
    const firstRev = await page.locator("#revision").textContent();

    await page.locator("#inspector-content input").first().fill("210");
    await page
      .locator("#inspector-content")
      .getByRole("button", { name: "Apply changes", exact: true })
      .click();
    await expect(page.locator("#save-status")).toHaveText("Saved locally", {
      timeout: 10000,
    });
    await expect(page.locator("#hash-status")).not.toHaveText(firstHash);
    const secondHash = await page.locator("#hash-status").textContent();
    const projectId = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open("structural-workbench");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });
      const rows = await new Promise((resolve, reject) => {
        const tx = db.transaction("projects");
        const r = tx.objectStore("projects").getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      return rows[0].id;
    });

    // Corrupt only the projects pointer; history keeps verified revisions.
    await page.evaluate(async (id) => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open("structural-workbench");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction("projects", "readwrite");
        tx.objectStore("projects").put({
          id,
          updated: Date.now(),
          project: { id, name: "Corrupt", revision: 99, broken: true },
        });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }, projectId);

    await page.goto("/");
    await expect(page.locator(".recent-row")).toContainText(/recovered r/i);
    await page.locator(".recent-row").first().click();
    await expect(page.locator("#workspace")).toBeVisible();
    await expect(page.locator("#message")).toContainText(
      /Latest snapshot was corrupt|Restored verified revision/i,
    );
    await expect(page.locator("#hash-status")).toHaveText(secondHash);
    expect(firstRev).not.toBe("");

    expect(errors).toEqual([]);
    await record("corrupt-snapshot-recovery", {
      status: "PASS",
      projectId,
      restoredHashPrefix: secondHash?.slice(0, 12),
    });
  });

  test("model Worker crash restores last confirmed in-memory model", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("#new-project").click();
    await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
    await page.locator("#analyse").click();
    await expect(page.locator("#result-status")).toHaveText("✓ Current");
    const hash = await page.locator("#hash-status").textContent();

    await page.evaluate(async () => {
      await window.__workbenchTest.crashModelWorker();
    });
    await expect(page.locator("#message")).toContainText(
      /Model Worker stopped|Restored the last confirmed/i,
    );
    await expect(page.locator("#hash-status")).toHaveText(hash);
    await page.locator("#analyse").click();
    await expect(page.locator("#result-status")).toHaveText("✓ Current");
    await expect(page.locator("#results-content")).toContainText("-45");

    await record("model-worker-crash", {
      status: "PASS",
      hashPrefix: hash?.slice(0, 12),
    });
  });

  test("persistence denied warns without blocking export", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "storage", {
        configurable: true,
        value: {
          persist: async () => false,
          estimate: async () => ({ quota: 0, usage: 0 }),
        },
      });
    });
    await page.goto("/");
    await page.locator("#new-project").click();
    await expect(page.locator("#message")).toContainText(
      /persistence was not granted|download a project backup/i,
    );
    await expect(page.locator("#export-project")).toBeEnabled();
    await expect(page.locator("#save-status")).toHaveText("Saved locally", {
      timeout: 10000,
    });

    await record("persistence-denied", {
      status: "PASS",
    });
  });
});
