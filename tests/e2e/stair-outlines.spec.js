import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { evidenceDir } from "../../tools/evidence.mjs";

test("Residential stair widths remain visible in analytical view without changing the model", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator("#worked-examples").click();
  await page.locator("[data-example=UKR01]").click();
  await expect(page.locator("#model-count")).toHaveText(
    "447 nodes · 642 members",
  );
  await expect(page.locator("#model-solids")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-stair-outlines",
    "0",
  );
  const hash = await page.locator("#hash-status").textContent();
  await page.locator("#model-solids").click();
  await page.locator("#support-labels").click();
  await page.locator("#member-labels").selectOption("hide");
  for (const view of ["plan", "elevation", "3d"]) {
    await page.locator(`#view-${view}`).click();
    await expect(page.locator("#viewport")).toHaveAttribute(
      "data-stair-outlines",
      "26",
    );
    await expect(page.locator("#stair-outline-legend")).toBeVisible();
    await expect(page.locator("#hash-status")).toHaveText(hash);
  }
  await mkdir(evidenceDir(), { recursive: true });
  await page.screenshot({ path: `${evidenceDir()}/analytical-stairs.png` });
  await page.locator("#model-solids").click();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-stair-outlines",
    "0",
  );
  await expect(page.locator("#stair-outline-legend")).toBeHidden();
  await expect(page.locator("#hash-status")).toHaveText(hash);
  expect(errors).toEqual([]);
});
