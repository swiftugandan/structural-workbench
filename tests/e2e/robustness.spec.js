import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { record } from "../../tools/evidence.mjs";
test("storage quota failure is explicit and downloads survive", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const real = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "projects")
        throw new DOMException(
          "Controlled quota injection",
          "QuotaExceededError",
        );
      return real.apply(this, args);
    };
  });
  await page.goto("/");
  await page.locator("#new-project").click();
  await expect(page.locator("#save-status")).toHaveText("Save failed");
  await expect(page.locator("#message")).toContainText("STORAGE_QUOTA");
  await expect(page.locator("#export-project")).toBeEnabled();
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
});
test("single writer lock protects the second tab", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.locator("#new-project").click();
  await expect(page.locator("#save-status")).toHaveText("Saved locally");
  const second = await context.newPage();
  await second.goto("/");
  await second
    .getByRole("button", { name: /Untitled cantilever.*nodes/ })
    .click();
  await expect(second.locator("#message")).toContainText("read-only");
  await expect(
    second.getByRole("button", { name: "Apply changes", exact: true }),
  ).toBeDisabled();
  await expect(second.locator("#export-project")).toBeEnabled();
  await second.close();
});
test("GPU device destruction recovers model and current result", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#new-project").click();
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-device-generation",
    "1",
  );
  await expect(page.locator("#hash-status")).toContainText(/^[a-f0-9]{12}/);
  const hash = await page.locator("#hash-status").textContent();
  await page.locator("#reset-viewport").click();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-device-generation",
    "2",
  );
  await expect(page.locator("#gpu-notice")).toBeHidden();
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await expect(page.locator("#results-content")).toContainText("-45");
  await record("robustness", {
    status: "PASS",
    testCount: 1,
    testIds: ["actual-gpu-destruction-recovery"],
    command: ["npm", "run", "test:e2e"],
    limitations:
      "Quota and cross-tab cases are separately present in Playwright report; full failure matrix remains a later release gate.",
  });
});
test("unknown engineering fields rejected atomically", async ({ page }) => {
  await page.goto("/");
  const p = JSON.parse(await readFile("fixtures/models/B02.json"));
  p.members[0].torsionalSpring = 123;
  await page.locator("#import-file").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(page.locator("#modal")).toContainText("INVALID_SCHEMA");
  await expect(page.locator("#workspace")).toBeHidden();
});

test("cancel terminates a blocked Worker and restores the model", async ({
  page,
}) => {
  await page.route("**/worker.js", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      "const response = JSON.parse(",
      'if(r.operation === "analyse"){const end=Date.now()+2000;while(Date.now()<end){}} const response = JSON.parse(',
    );
    await route.fulfill({ response, body });
  });
  await page.goto("/");
  await page.locator("#new-project").click();
  await expect(page.locator("#hash-status")).toContainText(/^[a-f0-9]{12}/);
  const hash = await page.locator("#hash-status").textContent();
  await page.locator("#analyse").click();
  await page.locator("#cancel").click();
  await expect(page.locator("#message")).toContainText("CANCELLED");
  await expect(page.locator("#analyse")).toBeEnabled();
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await expect(page.locator("#results-content")).toContainText("-45");
});
