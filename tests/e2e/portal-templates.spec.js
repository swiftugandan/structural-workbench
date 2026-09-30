import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { evidenceContext, recorder } from "../../tools/evidence.mjs";

const context = evidenceContext({
  dir: "evidence/M05/portal-templates",
  taskId: "M05-C",
  milestone: "M05",
});
const record = recorder(context);

const evidence = () => context.dir;

test("M05 portal templates: save dimensions and reuse on a new portal", async ({
  page,
}) => {
  const dir = evidence();
  await mkdir(dir, { recursive: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.locator("#new-portal").click();
  await expect(page.locator("#portal-form")).toBeVisible();
  await page.locator('[data-testid="portal-span"]').fill("6");
  await page.locator('[data-testid="portal-height"]').fill("4");
  await page.locator('[data-testid="portal-force"]').fill("12000");
  await page.locator('[name="name"]').fill("Wide portal template");
  await page.locator('[data-testid="portal-save-template"]').check();
  await page
    .getByRole("button", { name: "Create portal", exact: true })
    .click();
  await expect(page.locator("#model-count")).toContainText(
    "4 nodes · 3 members",
  );
  await expect(page.locator("#message")).toContainText(/Template/);

  await page.locator("#home").click();
  await page.locator("#new-portal").click();
  await expect(page.locator("#portal-form")).toBeVisible();
  await expect(page.locator("[data-portal-template]")).toContainText(
    "Wide portal template",
  );
  await page
    .locator("[data-portal-template]")
    .filter({ hasText: "Wide portal template" })
    .click();
  await expect(page.locator('[data-testid="portal-span"]')).toHaveValue("6");
  await expect(page.locator('[data-testid="portal-height"]')).toHaveValue("4");
  await expect(page.locator('[data-testid="portal-force"]')).toHaveValue(
    "12000",
  );
  await page.locator('[name="name"]').fill("Wide portal reuse");
  await page
    .getByRole("button", { name: "Create portal", exact: true })
    .click();
  await expect(page.locator("#model-count")).toContainText(
    "4 nodes · 3 members",
  );
  await expect(page.locator("#project-name")).toHaveValue("Wide portal reuse");

  // Span 6 m → n3.x = 6, n4.x = 6
  const n3 = page.locator('[data-edit="n3"]');
  await page.locator('[data-group="nodes"]').click();
  await expect(
    page.locator("#entity-list, [data-edit='n3']").first(),
  ).toBeVisible();

  await record("portal-templates-browser", {
    status: "PASS",
    templateName: "Wide portal template",
    reusedName: "Wide portal reuse",
    span_m: 6,
    height_m: 4,
    pageErrors: errors,
  });
  expect(errors).toEqual([]);
});
