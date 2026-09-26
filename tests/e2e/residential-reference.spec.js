import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { menuCommand } from "../menu-helpers.js";
const dir = "evidence/residential-reference";
test("UK residential reference: actual WASM analysis, hierarchy, model-sourced footing review and stale edits", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator("#worked-examples").click();
  await page.locator("[data-example=UKR01]").click();
  await expect(page.locator("#model-count")).toHaveText(
    "423 nodes · 628 members",
  );
  await expect(page.locator("#model-solids")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("#model-assumptions").click();
  await expect(page.getByText(/PRELIMINARY \/ SYNTHETIC INPUTS/)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("#explorer-expand").click();
  await expect(
    page.locator('[data-branch="storey:level1:stair"]'),
  ).toContainText("Stair flights");
  await expect(
    page.locator('[data-branch="storey:level4:slab"]'),
  ).toContainText("Slab");
  await page.locator("#result-case").selectOption("SLS");
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current", {
    timeout: 60000,
  });
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/reference-sls.png` });
  const d = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const project = JSON.parse(await readFile(await (await d).path(), "utf8"));
  await writeFile(`${dir}/UKR01.json`, JSON.stringify(project, null, 2));
  expect(project.structure.storeys).toHaveLength(5);
  expect(project.designPreviews).toHaveLength(12);
  await page.locator("#model-nav [data-preview]").first().click();
  await page.locator("#preview-source").selectOption("model");
  await page.locator("#preview-run").click();
  await expect(page.locator("[data-testid=preview-state]")).toHaveText(
    "UNSUPPORTED",
  );
  const runDownload = page.waitForEvent("download");
  await page.locator("#preview-record").click();
  const run = JSON.parse(
    await readFile(await (await runDownload).path(), "utf8"),
  );
  expect(run.sourceProvenance.mock).toBe(false);
  expect(run.sourceProvenance.combinationId).toBe("SLS");
  expect(run.contactState).toBe("indeterminate");
  expect(run.overall).toBe("unsupported");
  await writeFile(`${dir}/footing-review.json`, JSON.stringify(run, null, 2));
  await page.locator("#preview-thickness").fill("700 mm");
  await expect(page.locator("[data-testid=preview-state]")).toHaveText("STALE");
  await page.locator("#preview-save").click();
  await expect(page.locator("#result-status")).toContainText("Stale");
  await page.locator("#undo").click();
  await expect(page.locator("#save-status")).toHaveText("Saved locally");
  await page.reload();
  await page
    .getByRole("button")
    .filter({ hasText: "UK residential · four storeys" })
    .first()
    .click();
  await expect(page.locator("#model-count")).toHaveText(
    "423 nodes · 628 members",
  );
  expect(errors).toEqual([]);
});
