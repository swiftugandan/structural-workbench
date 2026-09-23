import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { evidenceDir, record } from "../../tools/evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M03/dual-workers";
process.env.WORKBENCH_TASK_ID ||= "M03-B";
process.env.WORKBENCH_MILESTONE ||= "M03";

test("M03 dual Workers: cancel leaves model intact; superseded solve stays stale", async ({
  page,
}) => {
  await page.route("**/worker.js", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      "const response = JSON.parse(",
      'if(r.operation === "analyse"){const end=Date.now()+2500;while(Date.now()<end){}} const response = JSON.parse(',
    );
    await route.fulfill({ response, body });
  });
  await page.goto("/");
  await page.locator("#new-project").click();
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  const hash = await page.locator("#hash-status").textContent();

  await page.locator("#analyse").click();
  await expect(page.locator("#cancel")).toBeVisible();
  await page.locator("#cancel").click();
  await expect(page.locator("#message")).toContainText("CANCELLED");
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await expect(page.locator("#analyse")).toBeEnabled();

  await page.locator("#analyse").click();
  await expect(page.locator("#cancel")).toBeVisible();
  await page.locator("#inspector-content input").first().fill("3.5");
  await page
    .locator("#inspector-content")
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(page.locator("#hash-status")).not.toHaveText(hash);
  await expect(page.locator("#message")).toContainText(/stale|earlier model/i, {
    timeout: 10000,
  });
  await expect(page.locator("#result-status")).not.toHaveText("✓ Current");

  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current", {
    timeout: 15000,
  });

  await mkdir(evidenceDir(), { recursive: true });
  await record("dual-workers-browser", {
    status: "PASS",
    testCount: 1,
    testIds: ["m03-dual-workers-cancel-and-stale"],
  });
});
