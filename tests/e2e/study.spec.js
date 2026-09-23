import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { evidenceDir } from "../../tools/evidence.mjs";

const evidence = () => evidenceDir("evidence/M22/study-ui");

test("M22-B: load study JSON, compare variants, download report", async ({
  page,
}) => {
  const dir = evidence();
  await mkdir(dir, { recursive: true });
  const fixture = JSON.parse(await readFile("fixtures/models/B02.json", "utf8"));
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "B02.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU", {
    timeout: 60000,
  });

  const study = JSON.parse(
    await readFile("fixtures/studies/S22-E.json", "utf8"),
  );
  delete study.baseProject;

  await page.locator("#study-file").setInputFiles({
    name: "S22-E.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(study)),
  });

  await expect(page.getByTestId("study-report-table")).toBeVisible({
    timeout: 90000,
  });
  const hashCells = await page
    .getByTestId("study-report-table")
    .locator("tbody tr td:nth-child(2)")
    .allTextContents();
  expect(hashCells).toHaveLength(2);
  expect(hashCells[0]).not.toEqual(hashCells[1]);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#download-study-report").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/S22-E-report\.html/);

  await writeFile(
    `${dir}/study-ui-browser.json`,
    JSON.stringify(
      {
        status: "PASS",
        testId: "m22-b-study-ui",
        variantHashes: hashCells,
        download: download.suggestedFilename(),
      },
      null,
      2,
    ),
  );
});
