import { test, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { menuCommand } from "../menu-helpers.js";
import { evidenceDir } from "../../tools/evidence.mjs";

const evidenceRoot = evidenceDir("evidence/M07/catalogue-study");

test("M07-G catalogue study reanalyses self weight, applies explicitly and undoes", async ({
  page,
}) => {
  const p = JSON.parse(await readFile("fixtures/models/B04.json", "utf8"));
  p.id = "steel-study";
  p.name = "Synthetic cantilever · catalogue study";
  p.gravity = [0, 9.80665, 0];
  p.loads = [
    { id: "l1", case: "LC1", type: "selfWeight", members: ["m1"], factor: 1 },
  ];
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "study.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await page.locator("[data-inspector-tab=steel]").click();
  await expect(page.locator("#design-assign")).toBeVisible();
  await page.locator("[data-tab=steel-overview]").click();
  await page.locator("[data-steel-screen=catalogue]").click();
  await page.locator("#catalogue-search").fill("W18X50");
  await page.locator("#catalogue-search").press("Tab");
  await expect(page.locator("[data-catalogue-row]")).toHaveCount(1);
  await page.locator("[data-assign-ref]").click();
  await expect(page.locator("#design-save")).toBeEnabled();
  for (const [k, v] of Object.entries({ ky: "1", kz: "1", lb: "0", cb: "1" }))
    await page.locator(`#design-${k}`).fill(v);
  await page.locator("#design-bracing").selectOption("continuous");
  await page.locator("#design-basis").check();
  await page.locator("#design-save").click();
  await expect(page.locator("[data-testid=design-readiness]")).toHaveText(
    "READY",
  );
  await page.locator("[data-steel-screen=study]").click();
  await expect(page.locator("#candidate-run")).toBeDisabled();
  await page.locator("#catalogue-search").fill("");
  await page.locator("#catalogue-search").press("Tab");
  // The whole verified subset is listed (tools/extract-aisc-shapes.py).
  await expect(page.locator("[data-candidate-ref]")).toHaveCount(14);
  // Select exactly the two published sections regardless of catalogue ordering.
  for (const el of await page.locator("[data-candidate-ref]").all()) {
    const ref = await el.getAttribute("data-candidate-ref");
    await el.setChecked(ref.endsWith(":W18X50") || ref.endsWith(":W24X62"));
  }
  await page.locator("#analyse").click();
  await expect(page.locator("#candidate-run")).toBeEnabled();
  await page.locator("#candidate-run").click();
  await expect(page.locator("[data-candidate-result]")).toHaveCount(2);
  await expect(page.locator("[data-candidate-result=W18X50]")).toContainText(
    "PASS",
  );
  const dl = page.waitForEvent("download");
  await page.locator("#candidate-download").click();
  const report = JSON.parse(await readFile(await (await dl).path(), "utf8"));
  expect(report.complete).toBe(true);
  expect(report.candidates).toHaveLength(2);
  for (const r of report.candidates) {
    const area = r.designation === "W18X50" ? 14.7 : 18.2;
    const mass = 7850 * area * 0.0254 ** 2 * 3;
    expect(r.massKg).toBeCloseTo(mass, 8);
    expect(r.reanalysed).toBe(true);
    expect(r.modelHash).toBe(r.run.modelHash);
    expect(r.resultId).toBe(r.run.resultId);
    expect(
      Math.max(...r.run.stationChecks.map((c) => Math.abs(c.actions[5]))),
    ).toBeCloseTo(mass * 9.80665 * 1.5, 6);
  }
  const choice = page.locator(
    "[data-candidate-result=W24X62] [data-apply-candidate]",
  );
  await choice.click();
  await expect(page.locator("#design-section")).toHaveValue(
    "aisc-shapes-v16.0-subset-1:W24X62",
  );
  await expect(page.locator("#result-status")).toContainText("Stale");
  await expect(choice).toBeDisabled();
  await page.locator("#undo").click();
  await expect(page.locator("#design-section")).toHaveValue(
    "aisc-shapes-v16.0-subset-1:W18X50",
  );
  await expect(choice).toBeEnabled();
  await choice.click();
  await page.locator("#analyse").click();
  await expect(page.locator("#candidate-run")).toBeEnabled();
  await expect(choice).toBeDisabled();
  await page.locator("#candidate-run").click();
  await expect(choice).toBeEnabled();
  const projectDl = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const saved = JSON.parse(
    await readFile(await (await projectDl).path(), "utf8"),
  );
  expect(saved.members[0].steelDesign.sectionRef).toContain("W24X62");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-device-generation",
    /\d+/,
  );
  await mkdir(evidenceRoot, { recursive: true });
  await page.screenshot({
    path: `${evidenceRoot}/study.png`,
    fullPage: true,
  });
  await writeFile(
    `${evidenceRoot}/study.json`,
    JSON.stringify(report, null, 2),
  );
});
