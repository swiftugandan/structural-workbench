import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { evidenceDir } from "../../tools/evidence.mjs";
import { menuCommand } from "../menu-helpers.js";

const evidence = () => evidenceDir("evidence/M22/study-ui");

test("M22-B: load study JSON, compare variants, download report", async ({
  page,
}) => {
  const dir = evidence();
  await mkdir(dir, { recursive: true });
  const fixture = JSON.parse(
    await readFile("fixtures/models/B02.json", "utf8"),
  );
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
    .getByTestId("study-model-hash")
    .evaluateAll((cells) => cells.map((c) => c.dataset.hash));
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

async function openB02(page) {
  const fixture = JSON.parse(
    await readFile("fixtures/models/B02.json", "utf8"),
  );
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "B02.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await expect(page.locator("#kernel-status")).toContainText("ready");
}

async function runStudy(page, study) {
  await page.locator("#study-file").setInputFiles({
    name: `${study.id}.json`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(study)),
  });
}

const sweep = (id, variants) => ({
  schemaVersion: "1.0.0",
  id,
  name: id,
  caseId: "LC1",
  observe: { nodeId: "n2", dof: "uz" },
  variants,
});
const stiffness = (id, E) => ({
  id,
  set: [{ path: "/materials/0/E", value: E }],
});

test("M22-C: a study variant matches the same edit made by hand", async ({
  page,
}) => {
  await openB02(page);
  await runStudy(
    page,
    sweep("S-manual", [stiffness("E200", 200e9), stiffness("E210", 210e9)]),
  );
  await expect(page.getByTestId("study-report-table")).toBeVisible({
    timeout: 90000,
  });
  await expect(page.getByTestId("study-stale")).toHaveCount(0);
  const hash = await page
    .getByTestId("study-model-hash")
    .nth(1)
    .getAttribute("data-hash");
  const observed = Number(
    await page.getByTestId("study-observed").nth(1).getAttribute("data-si"),
  );

  // The same change through the materials editor gives the same model.
  await menuCommand(page, "Model", "Materials…");
  await page.getByRole("button", { name: "Edit mat1", exact: true }).click();
  await page.locator("#entity-form [name=E]").fill("210");
  await page.getByRole("button", { name: "Save entity", exact: true }).click();
  await page.locator("#close-modal").click();
  await expect(page.locator("#hash-status")).toHaveText(
    `${hash.slice(0, 12)} · f64`,
  );
  await page.locator("[data-tab=study]").click();
  await expect(page.getByTestId("study-stale")).toBeVisible();

  // ...and the same displacement when analysed by hand.
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await page.locator("[data-tab=displacements]").click();
  const uz = Number(
    await page
      .locator("#results-content tbody tr")
      .nth(1)
      .locator("td")
      .nth(2)
      .textContent(),
  );
  // Displayed in mm to six decimals.
  expect(Math.abs(uz - observed * 1000)).toBeLessThan(0.00000051);
  await mkdir(evidence(), { recursive: true });
  await writeFile(
    `${evidence()}/manual-equivalence.json`,
    JSON.stringify(
      {
        status: "PASS",
        variant: "E210",
        modelHash: hash,
        studyUz: observed,
        manualUzMm: uz,
      },
      null,
      2,
    ),
  );
});

test("M22-C: study failures name the variant and step; guards are not bypassed", async ({
  page,
}) => {
  await openB02(page);
  const hash = await page.locator("#hash-status").textContent();
  await runStudy(
    page,
    sweep("S-bad-path", [
      stiffness("ok", 200e9),
      {
        id: "bad",
        set: [
          { path: "/materials/0/E", value: 1e11 },
          { path: "/materials/9/E", value: 1e11 },
        ],
      },
    ]),
  );
  const failure = page.getByTestId("study-failure");
  await expect(failure).toBeVisible({ timeout: 90000 });
  await expect(failure).toHaveAttribute("data-variant", "bad");
  await expect(failure).toHaveAttribute("data-step", "2");
  await expect(failure).toContainText(
    "variant 2 (bad), step 2 (/materials/9/E)",
  );
  await expect(page.getByTestId("study-report-table")).toHaveCount(0);
  await runStudy(
    page,
    sweep("S-guard", [
      {
        id: "dangling",
        set: [{ path: "/members/0/section", value: "missing" }],
      },
    ]),
  );
  await expect(failure).toContainText("DANGLING_REFERENCE");
  await expect(failure).toHaveAttribute("data-stage", "validate");
  await runStudy(
    page,
    sweep("S-override", [
      { id: "fast", set: [{ path: "/solverOverride", value: "fast" }] },
    ]),
  );
  await expect(failure).toContainText("UNSUPPORTED_FEATURE");
  // The open project never changed.
  await expect(page.locator("#hash-status")).toHaveText(hash);
});

test("M22-C: a running study can be cancelled and the Worker recovers", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto("/");
  await page.locator("#worked-examples").click();
  await page.locator("[data-example=UKR01]").click();
  await expect(page.locator("#model-count")).toHaveText(
    "447 nodes · 642 members",
  );
  await expect(page.locator("#kernel-status")).toContainText("ready");
  const hash = await page.locator("#hash-status").textContent();
  const heavy = {
    schemaVersion: "1.0.0",
    id: "S-heavy",
    name: "S-heavy",
    variants: Array.from({ length: 50 }, (_, i) => ({
      id: `v${i}`,
      set: [{ path: "/materials/0/E", value: 25e9 + i * 1e8 }],
    })),
  };
  heavy.caseId = await page
    .locator("#result-case option")
    .first()
    .getAttribute("value");
  await runStudy(page, heavy);
  await expect(page.locator("#cancel")).toBeVisible();
  await page.locator("#cancel").click();
  await expect(page.locator("#message")).toContainText("Study cancelled");
  await expect(page.locator("#cancel")).toBeHidden();
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("[data-tab=study]").click();
  await expect(page.getByTestId("study-report-table")).toHaveCount(0);
  // The respawned analysis Worker runs the next study.
  await runStudy(page, {
    ...heavy,
    id: "S-after",
    variants: heavy.variants.slice(0, 2),
  });
  await expect(page.getByTestId("study-report-table")).toBeVisible({
    timeout: 120000,
  });
  await expect(page.getByTestId("study-model-hash")).toHaveCount(2);
});
