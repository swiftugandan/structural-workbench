import { test, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { record, evidenceDir } from "../../tools/evidence.mjs";
async function start(page) {
  await page.goto("/");
  await page.locator("#new-project").click();
  await expect(page.locator("#kernel-status")).toContainText("ready");
}
async function solve(page) {
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
}
test("M00-tour: edit, solve, stale, select, export, reopen, instability", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  await solve(page);
  await expect(page.locator("#results-content")).toContainText("-45");
  await expect(page.locator("#results-content")).toContainText("0.0225");
  await page.getByRole("button", { name: "Reactions", exact: true }).click();
  await expect(page.locator("#results-content")).toContainText("-30");
  await expect(page.locator("#results-content")).toContainText("10");
  await page.locator("#inertia-y").fill("0.00002");
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(page.locator("#result-status")).toContainText("Stale");
  await expect(page.locator("#export-report")).toBeDisabled();
  await solve(page);
  await page
    .getByRole("button", { name: "Displacements", exact: true })
    .click();
  await expect(page.locator("#results-content")).toContainText("-22.5");
  await page.locator("#tip-load").fill("-13");
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await solve(page);
  await expect(page.locator("#results-content")).toContainText("-29.25");
  await page.locator("#units").selectOption("SI");
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await expect(page.locator("#results-content")).toContainText("-0.02925");
  await page.locator("#units").selectOption("engineeringMetric");
  await page.locator("#view-3d").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await page.locator("#view-elevation").click();
  const box = await page.locator("#viewport").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.53);
  await expect(page.locator("#selected-status")).toContainText("m1");
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  const hash = await page.locator("#hash-status").textContent();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-project").click();
  const download = await downloadPromise;
  const project = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(project.sections[0].Iy).toBe(0.00002);
  expect(project.loads[0].values[2]).toBe(-13000);
  expect(project).not.toHaveProperty("canUndo");
  await mkdir(evidenceDir("evidence/M00/current"), { recursive: true });
  await writeFile(
    `${evidenceDir("evidence/M00/current")}/exported-project.json`,
    JSON.stringify(project, null, 2),
  );
  const reportPromise = page.waitForEvent("download");
  await page.locator("#export-report").click();
  const report = await reportPromise;
  const html = await readFile(await report.path(), "utf8");
  expect(html).toContain("calculation record");
  expect(html).toContain("-0.0292500000");
  await writeFile(
    `${evidenceDir("evidence/M00/current")}/calculation-report.html`,
    html,
  );
  await page.screenshot({
    path: `${evidenceDir("evidence/M00/current")}/workspace.png`,
    fullPage: true,
  });
  await page.reload();
  await page
    .getByRole("button", { name: /Untitled cantilever.*nodes/ })
    .click();
  await solve(page);
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await expect(page.locator("#results-content")).toContainText("-29.25");
  await page.locator("#home").click();
  await page.locator("#import-file").setInputFiles({
    name: "reopen.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await solve(page);
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("#fixed-support").uncheck();
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await page.locator("#analyse").click();
  await expect(page.locator("#message")).toContainText("UNSTABLE_MODEL");
  await expect(page.locator("#result-status")).toHaveText("Analysis failed");
  await expect(page.locator("#results-content table")).toHaveCount(0);
  expect(errors).toEqual([]);
  await record("e2e-tour", {
    status: "PASS",
    testCount: 1,
    testIds: ["M00-tour"],
    command: ["npm", "run", "test:e2e"],
    browser: page.context().browser().version(),
    artifacts: [
      "workspace.png",
      "exported-project.json",
      "calculation-report.html",
    ],
  });
});
test("GPU unavailable retains analysis and exports", async ({ page }) => {
  await page.goto("/?noGPU");
  await page.locator("#new-project").click();
  await expect(page.locator("#gpu-notice")).toContainText(
    "Viewport unavailable",
  );
  await solve(page);
  await expect(page.locator("#results-content")).toContainText("-45");
  await expect(page.locator("#export-report")).toBeEnabled();
  await expect(page.locator("#export-project")).toBeEnabled();
});
test("invalid import preserves current model and results", async ({ page }) => {
  await start(page);
  await solve(page);
  const hash = await page.locator("#hash-status").textContent();
  await page.locator("#home").click();
  const bad = JSON.parse(await readFile("fixtures/models/B02.json"));
  bad.schemaVersion = "99.0.0";
  await page.locator("#import-file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(bad)),
  });
  await expect(page.locator("#modal")).toContainText("UNSUPPORTED_SCHEMA");
  await page.locator("#close-modal").click();
  await page
    .getByRole("button", { name: /Untitled cantilever.*nodes/ })
    .click();
  await expect(page.locator("#hash-status")).toHaveText(hash);
});
test("undo restores model hash and redo re-applies edit", async ({ page }) => {
  await start(page);
  const hash = await page.locator("#hash-status").textContent();
  await page.locator("#span").fill("4.25");
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(page.locator("#span")).toHaveValue("4.25");
  await page.locator("#undo").click();
  await expect(page.locator("#span")).toHaveValue("3");
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("#redo").click();
  await expect(page.locator("#span")).toHaveValue("4.25");
});
test("narrow screen retains tables and portable export", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await solve(page);
  await expect(page.locator("#export-project")).toBeVisible();
  await expect(page.locator("#results-content")).toContainText("-45");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: `${evidenceDir("evidence/M00/current")}/mobile.png`,
    fullPage: true,
  });
});

test("unit-suffixed inputs are converted by Rust; incompatible units preserve model", async ({
  page,
}) => {
  await start(page);
  await page.locator("#span").fill("4000 mm");
  await page.locator("#elasticity").fill("210000 MPa");
  await page.locator("#tip-load").fill("-12000 N");
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(page.locator("#span")).toHaveValue("4");
  await expect(page.locator("#elasticity")).toHaveValue("210");
  await expect(page.locator("#tip-load")).toHaveValue("-12");
  await solve(page);
  await expect(page.locator("#results-content")).toContainText("-121.904762");
  const hash = await page.locator("#hash-status").textContent();
  await page.locator("#span").fill("10 kN");
  await page
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(page.locator("#form-error")).toContainText("incompatible unit");
  await expect(page.locator("#hash-status")).toHaveText(hash);
});
