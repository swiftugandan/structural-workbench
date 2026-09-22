import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function open(page, name, edit = () => {}) {
  const p = JSON.parse(await readFile(`fixtures/models/${name}.json`, "utf8"));
  edit(p);
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "shear.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
}
async function solve(page) {
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
}
test("Canvas exposes signed Vy and Vz, units, stale protection and retained selection after solving", async ({
  page,
}) => {
  await open(page, "B02", (p) => (p.loads[0].values[1] = 6000));
  await page.locator("#result-family").selectOption("forces");
  await page.locator("#display-result").selectOption("shearY");
  await expect(page.locator("#action-legend")).toContainText(
    "Analyse to display",
  );
  await solve(page);
  await expect(page.locator("#display-result")).toHaveValue("shearY");
  await expect(page.locator('[data-result-component="Vy"]')).toContainText(
    "+6 kN",
  );
  await page.locator("#result-family").selectOption("forces");
  await page.locator("#display-result").selectOption("shearZ");
  await expect(page.locator('[data-result-component="Vz"]')).toContainText(
    "-10 kN",
  );
  await expect(page.locator("#action-legend")).toContainText("peak 10 kN");
  const hash = await page.locator("#hash-status").textContent();
  await page.locator("#units").selectOption("SI");
  await expect(page.locator('[data-result-component="Vz"]')).toContainText(
    "-10,000 N",
  );
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("#span").fill("4");
  await page
    .locator("#member-form")
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(page.locator("#action-legend")).toContainText("Stale results");
  await expect(page.locator("[data-result-component]")).toHaveCount(0);
  await solve(page);
  await expect(page.locator("#display-result")).toHaveValue("shearZ");
  await expect(page.locator('[data-result-component="Vz"]')).toContainText(
    "-10,000 N",
  );
  await page.locator("#result-family").selectOption("moments");
  await page.locator("#display-result").selectOption("moment");
  await expect(page.locator("#action-legend")).toContainText("Moment My");
});
test("Uniform-load shear shows both signs and the unused component reports zero", async ({
  page,
}) => {
  await open(page, "B07");
  await solve(page);
  await page.locator("#result-family").selectOption("forces");
  await page.locator("#display-result").selectOption("shearZ");
  const labels = page.locator('[data-result-component="Vz"]');
  await expect(labels).toHaveCount(2);
  const values = (
    await labels.evaluateAll((es) =>
      es.map((e) => Number(e.dataset.resultValue)),
    )
  ).sort((a, b) => a - b);
  expect(values[0]).toBeCloseTo(-30000, 5);
  expect(values[1]).toBeCloseTo(30000, 5);
  await expect(page.locator("#action-legend")).toContainText("peak 30 kN");
  await page.locator("#result-family").selectOption("forces");
  await page.locator("#display-result").selectOption("shearY");
  await expect(page.locator("#action-legend")).toContainText("All values zero");
  await expect(page.locator('[data-result-component="Vy"]')).toContainText(
    "0 kN",
  );
});
test("Member forces table exposes signed shear at every station and exports it", async ({
  page,
}) => {
  await open(page, "B07");
  await solve(page);
  await page.locator('[data-tab="section-forces"]').click();
  const table = page.locator("#results-content table");
  await expect(
    table.getByRole("columnheader", { name: "Shear Vy [kN]", exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole("columnheader", { name: "Shear Vz [kN]", exact: true }),
  ).toBeVisible();
  const values = await table
    .locator("tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) =>
        [...row.cells].map((c) => Number(c.textContent.replaceAll(",", ""))),
      ),
    );
  expect(values.length).toBeGreaterThan(2);
  expect(values[0][1]).toBe(0);
  expect(values.at(-1)[1]).toBe(100);
  expect(values.every((row) => row[3] === 0)).toBe(true);
  expect(Math.min(...values.map((row) => row[4]))).toBeCloseTo(-30, 5);
  expect(Math.max(...values.map((row) => row[4]))).toBeCloseTo(30, 5);
  await page.locator("#units").selectOption("SI");
  await expect(
    table.getByRole("columnheader", { name: "Shear Vz [N]", exact: true }),
  ).toBeVisible();
  await expect(table.locator("tbody")).toContainText("30,000");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-csv").click();
  const download = await downloadPromise;
  const csv = await readFile(await download.path(), "utf8");
  expect(csv).toContain("Shear Vy [N]");
  expect(csv).toContain("Shear Vz [N]");
  expect(csv).toContain("30000");
  await page.screenshot({
    path: `${process.env.WORKBENCH_EVIDENCE_DIR}/shear-table.png`,
  });
  await page.locator('[data-tab="forces"]').click();
  await expect(page.locator("#results-content")).toContainText("nodal actions");
});
