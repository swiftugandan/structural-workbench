import { menuCommand } from "../menu-helpers.js";
import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { evidenceDir } from "../../tools/evidence.mjs";

const evidence = () => evidenceDir("evidence/M02/prescribed");

async function model(page) {
  const pending = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  return JSON.parse(await readFile(await (await pending).path(), "utf8"));
}

async function edit(page, key, id) {
  await page.locator(`[data-group="${key}"]`).click();
  await page.locator(`[data-edit="${id}"]`).click();
  await expect(page.locator("#entity-form")).toBeVisible();
}

async function saveOk(page) {
  await page
    .locator("#entity-form")
    .getByRole("button", { name: "Save entity", exact: true })
    .click();
  await expect(page.locator("#entity-form")).toHaveCount(0);
  await page.locator("#close-modal").click();
}

function tdNumbers(row) {
  return row
    .locator("td")
    .allTextContents()
    .then((cells) => cells.map((c) => Number(c.replaceAll(",", ""))));
}

test("M02 prescribed: B09 analyse, edit settlement, reject free-DOF prescription", async ({
  page,
}) => {
  const dir = evidence();
  await mkdir(dir, { recursive: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const fixture = JSON.parse(
    await readFile("fixtures/models/B09.json", "utf8"),
  );
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "B09.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  await expect(page.locator("#model-count")).toContainText("2 nodes · 1 members");

  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");

  await page.locator('[data-tab="displacements"]').click();
  await expect(
    page.getByRole("columnheader", { name: "ux [mm]", exact: true }),
  ).toBeVisible();
  const n2 = page
    .locator("#results-content table tbody tr")
    .filter({ hasText: "n2" });
  // d = 0.001 m → 1 mm
  expect((await tdNumbers(n2))[0]).toBeCloseTo(1, 5);

  await page.locator('[data-tab="reactions"]').click();
  await expect(
    page.getByRole("columnheader", { name: "Fx [kN]", exact: true }),
  ).toBeVisible();
  const s1 = page
    .locator("#results-content table tbody tr")
    .filter({ hasText: "s1" });
  const s2 = page
    .locator("#results-content table tbody tr")
    .filter({ hasText: "s2" });
  // ±E*A*d/L = ±1e6 N → ±1000 kN
  expect((await tdNumbers(s1))[0]).toBeCloseTo(-1000, 5);
  expect((await tdNumbers(s2))[0]).toBeCloseTo(1000, 5);

  await writeFile(
    `${dir}/b09-project.json`,
    JSON.stringify(await model(page), null, 2),
  );
  await page.screenshot({
    path: `${dir}/prescribed-results.png`,
    fullPage: true,
  });

  // Edit imposed settlement on s2 and reanalyse
  await edit(page, "supports", "s2");
  await expect(
    page.locator('details.guided-advanced', { hasText: "Support settlement" }),
  ).toHaveAttribute("open", "");
  await page.locator('[name="prescribed-0"]').fill("2 mm");
  await saveOk(page);
  expect((await model(page)).supports.find((s) => s.id === "s2").prescribed[0]).toBeCloseTo(
    0.002,
    12,
  );
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await page.locator('[data-tab="reactions"]').click();
  expect(
    (
      await tdNumbers(
        page.locator("#results-content table tbody tr").filter({ hasText: "s1" }),
      )
    )[0],
  ).toBeCloseTo(-2000, 5);

  // Prescribed value on a free DOF must fail closed
  await edit(page, "supports", "s1");
  await page
    .locator('details.guided-advanced', { hasText: "Custom movement" })
    .locator("summary")
    .click();
  await page.locator('[name="fixed-0"]').uncheck();
  await page
    .locator('details.guided-advanced', { hasText: "Support settlement" })
    .locator("summary")
    .click();
  await page.locator('[name="prescribed-0"]').fill("1 mm");
  await page
    .locator("#entity-form")
    .getByRole("button", { name: "Save entity", exact: true })
    .click();
  await expect(page.locator("#entity-error")).toContainText("INVALID_RESTRAINT");
  await page.locator("#close-modal").click();
  const after = await model(page);
  expect(after.supports.find((s) => s.id === "s1").fixed[0]).toBe(true);
  expect(after.supports.find((s) => s.id === "s1").prescribed[0]).toBe(0);
  expect(errors).toEqual([]);
});
