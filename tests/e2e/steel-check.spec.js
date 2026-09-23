import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

async function record(name, body) {
  const dir = "evidence/M07/steel-ui";
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/${name}.json`, JSON.stringify(body, null, 2));
}

test("standalone S2-D1 steel check passes via evaluateDesign UI", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await page.locator("#new-project").click();
  await expect(page.locator("#kernel-status")).toContainText("ready", {
    timeout: 60_000,
  });

  await page.locator("[data-testid='steel-check-open']").evaluate((el) => {
    el.hidden = false;
    el.click();
  });
  await expect(page.locator("[data-testid='steel-check-panel']")).toBeVisible();
  await expect(page.locator("[data-testid='steel-profile-badge']")).toContainText(
    /enabled/i,
  );

  await page.locator("[data-testid='steel-load-s2d1']").click();
  await expect(page.locator("[data-testid='steel-case-loaded']")).toBeVisible();
  await page.locator("[data-testid='steel-run-check']").click();
  await expect(page.locator("[data-testid='steel-overall']")).toHaveText("pass", {
    timeout: 15_000,
  });
  await expect(
    page.locator('[data-testid="steel-check-row"][data-check-id="tension"]'),
  ).toContainText("pass");

  await record("steel-ui-s2d1", {
    status: "PASS",
    pageErrors: errors,
    overall: "pass",
    fixture: "S2-D1",
  });
  expect(errors).toEqual([]);
});
