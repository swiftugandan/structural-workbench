import { menuCommand } from "../menu-helpers.js";
import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { evidenceDir, record } from "../../tools/evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M04/recovery";
process.env.WORKBENCH_TASK_ID ||= "M04-A";
process.env.WORKBENCH_MILESTONE ||= "M04";

const evidence = () => evidenceDir("evidence/M04/recovery");

test("M04 recovery: restore committed revision; refuse while form dirty", async ({
  page,
}) => {
  await mkdir(evidence(), { recursive: true });
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
  const secondRev = await page.locator("#revision").textContent();
  expect(secondRev).not.toBe(firstRev);

  await page.locator("#inspector-content input").first().fill("195");
  await expect(page.locator("#result-status")).toHaveText("Unapplied changes");
  await menuCommand(page, "File", "Recover revision…");
  await expect(page.locator("#message")).toContainText(
    /Apply or discard unapplied|never claims unsaved/i,
  );
  await expect(page.locator("#modal")).not.toBeVisible();

  await page.locator("#discard-properties").click();
  await menuCommand(page, "File", "Recover revision…");
  await expect(page.locator("#modal-title")).toHaveText(
    "Recover committed revision",
  );
  const restore = page.locator(`[data-recover]`).first();
  await expect(restore).toBeVisible();
  await restore.click();
  await expect(page.locator("#modal")).not.toBeVisible();
  await expect(page.locator("#hash-status")).toHaveText(firstHash);
  await expect(page.locator("#message")).toContainText(
    /Restored committed revision|Unsaved edits were not claimed/i,
  );
  await expect(page.locator("#save-status")).toHaveText("Saved locally", {
    timeout: 10000,
  });
  expect(secondHash).not.toBe(firstHash);

  expect(errors).toEqual([]);
  await record("recovery-browser", {
    test: "M04 recovery: restore committed revision; refuse while form dirty",
    firstRevision: firstRev,
    secondRevision: secondRev,
    restoredHash: firstHash,
  });
});
