import { test } from "@playwright/test";
// Full reference model: assertions use the documented full-model budget.
import { expect, FULL_MODEL_TEST_TIMEOUT_MS } from "../full-model-helpers.js";

test("One selection identity follows a bound footing, its support and physical members", async ({
  page,
}) => {
  test.setTimeout(FULL_MODEL_TEST_TIMEOUT_MS);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator("#worked-examples").click();
  await page.locator("[data-example=UKR01]").click();
  await expect(page.locator("#model-count")).toHaveText(
    "447 nodes · 642 members",
  );
  await page.locator("#explorer-expand").click();
  const draft = page.locator("#model-nav [data-preview]").first();
  await draft.click();
  await expect(page.locator("#preview-source")).toHaveValue("model");
  await expect(page.locator("#preview-run")).toBeDisabled();
  const target = await page.locator("#preview-target").inputValue();
  const title = (await page.locator("#concrete-inspector h2").innerText())
    .replace(/Mock workflow/i, "")
    .trim();
  await expect(page.locator("#selected-status")).toContainText(title);
  await expect(page.locator("#selection-tag")).toHaveText(title);
  await expect(draft).toHaveAttribute("aria-current", "true");
  // Explicit synthetic choice remains possible, never a silent substitute for missing results.
  await page.locator("#preview-source").selectOption("synthetic");
  await page.locator("#preview-run").click();
  await expect(page.locator("[data-testid=preview-state]")).toHaveText(
    "UNSUPPORTED",
  );
  await expect(page.locator("#results-content")).toContainText(
    "SYNTHETIC FIXTURE",
  );
  await page.locator("[data-inspector-tab=properties]").click();
  await expect(page.locator("#selected-status")).not.toContainText(
    "No entities selected",
  );
  await expect(page.locator(`[data-entity-id="${target}"]`)).toHaveAttribute(
    "aria-current",
    "true",
  );
  await page.locator("#model-nav [data-preview]").first().click();
  await expect(page.locator("#preview-source")).toHaveValue("model");
  // Selecting a different analytical object must not retain the old footing inspector/results.
  await page.locator("#model-nav [data-member]").first().click();
  await expect(page.locator("#concrete-inspector")).toContainText(
    "Select a design object",
  );
  await expect(page.locator("#results-content")).toContainText(
    "No concrete design object selected",
  );
  const physical = page.locator("[data-structure-key=physicalMembers]").first();
  const name = await physical.locator("span").innerText();
  await physical.click();
  await expect(physical).toHaveAttribute("aria-current", "true");
  await expect(page.locator("#selection-tag")).toHaveText(name);
  await expect(page.locator("#selected-status")).toContainText(name);
  await page
    .locator("#structure-form [name=name]")
    .fill("Reviewed physical member");
  await page.locator("#structure-form button.primary").click();
  await expect(page.locator("#selection-tag")).toHaveText(
    "Reviewed physical member",
  );
  await page.locator("#undo").click();
  await expect(page.locator("#selection-tag")).toHaveText(name);
  await page.screenshot({
    path: "evidence/model-coherence/physical-selection.png",
  });
  expect(errors).toEqual([]);
});
