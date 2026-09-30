import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { evidenceContext, recorder } from "../../tools/evidence.mjs";
import { CURRENT_SCHEMA, migratedTo } from "../schema-version.js";

const context = evidenceContext({
  dir: "evidence/M04/migrations",
  taskId: "M04-C",
  milestone: "M04",
});
const record = recorder(context);

const evidence = () => context.dir;

test("M04 migration: 0.9.0 imports, retains original, unknown schema refused", async ({
  page,
}) => {
  await mkdir(evidence(), { recursive: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const legacy = await readFile("fixtures/models/LEGACY09-B02.json", "utf8");
  const legacySha = createHash("sha256").update(legacy).digest("hex");
  const current = JSON.parse(
    await readFile("fixtures/models/B02.json", "utf8"),
  );

  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "LEGACY09-B02.json",
    mimeType: "application/json",
    buffer: Buffer.from(legacy),
  });
  await expect(page.locator("#workspace")).toBeVisible();
  await expect(page.locator("#message")).toContainText(migratedTo("0.9.0"));
  await expect(page.locator("#message")).toContainText(legacySha.slice(0, 12));
  await expect(page.locator("#save-status")).toHaveText("Saved locally", {
    timeout: 10000,
  });
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  const migratedHash = await page.locator("#hash-status").textContent();

  const originalRecord = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open("structural-workbench");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
    return new Promise((resolve, reject) => {
      const tx = db.transaction("originals");
      const r = tx.objectStore("originals").getAll();
      r.onsuccess = () => resolve(r.result[0] || null);
      r.onerror = () => reject(r.error);
    });
  });
  expect(originalRecord).toBeTruthy();
  expect(originalRecord.sha256).toBe(legacySha);
  expect(originalRecord.fromSchema).toBe("0.9.0");
  expect(originalRecord.toSchema).toBe(CURRENT_SCHEMA);
  expect(originalRecord.originalUtf8).toBe(legacy);

  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "B02.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(current)),
  });
  await expect(page.locator("#hash-status")).toHaveText(migratedHash);

  await page.goto("/");
  const future = { ...current, schemaVersion: "9.0.0" };
  await page.locator("#import-file").setInputFiles({
    name: "future.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(future)),
  });
  await expect(page.locator("#modal")).toContainText("UNSUPPORTED_SCHEMA");
  await expect(page.locator("#download-unsupported-original")).toBeVisible();
  await expect(page.locator("#workspace")).toBeHidden();

  expect(errors).toEqual([]);
  await record("migration-browser", {
    status: "PASS",
    test: "M04 migration: 0.9.0 imports, retains original, unknown schema refused",
    legacySha256: legacySha,
    migratedHashPrefix: migratedHash?.slice(0, 12),
    originalRetained: true,
  });
});
