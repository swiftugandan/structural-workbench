import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { menuCommand } from "../menu-helpers.js";
import { CURRENT_SCHEMA } from "../schema-version.js";
import { evidenceDir } from "../../tools/evidence.mjs";

/** M11 pad footing (ADR 0028) through the browser build: B08's fixed-fixed
 * beam puts 30 kN down and a 30 kN m moment on support s1, so the resultant
 * sits 1.0 m off the 2.4 m base centre (partial contact). */
const dir = evidenceDir("evidence/M11/pad-footing");

test("Pad footing: contact, bearing, EC2 design, schedule, report and persistence", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const model = JSON.parse(await readFile("fixtures/models/B08.json", "utf8"));
  model.id = "pad-footing";
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "footing.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(model)),
  });
  await expect(page.locator("#kernel-status")).toContainText("ready");
  await page.locator("[data-inspector-tab=concrete]").click();
  await page.locator("#preview-kind").selectOption("padFooting");
  await page.locator("#preview-create").click();
  await page.locator("#preview-target").selectOption("s1");
  await page
    .locator("#preview-soil")
    .fill("User-entered demonstration bearing input; not a site report");
  await page.locator("#preview-save").click();
  await page.locator("#preview-source").selectOption("model");
  await page.locator("#analyse").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
  const run = async () => {
    await page.locator("#preview-run").click();
    await expect(page.locator("#workspace")).not.toHaveAttribute(
      "aria-busy",
      "true",
    );
  };
  await run();
  // The ground contact is solved even before the code inputs.
  await expect(page.locator("[data-testid=footing-contact-state]")).toHaveText(
    "PARTIAL",
  );
  await expect(page.locator("[data-testid=preview-state]")).toHaveText(
    "INDETERMINATE",
  );
  await page.locator('[data-preview-pane="soil"]').click();
  await expect(page.locator("[data-testid=footing-contact]")).toBeVisible();
  // The engineer's inputs.
  await page.locator("#code-exposure").selectOption("XC2");
  await page.locator("#code-cover").fill("25 mm");
  await page.locator("#code-aggregate").fill("20 mm");
  await page.locator("#code-blinding").selectOption("yes");
  await page.locator("#code-bearing").selectOption("LC1");
  await page.locator("#preview-save").click();
  await page.locator("#analyse").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
  await run();
  await expect(page.locator("[data-testid=preview-state]")).toHaveText("PASS");
  await page.locator('[data-preview-pane="ec2"]').click();
  await expect(page.locator("[data-testid=ec2-banner]")).toContainText(
    "not a certified design",
  );
  await expect(page.locator("[data-testid=footing-bars-x]")).toContainText("Ø");
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/footing-ec2.png`, fullPage: true });
  await page.locator('[data-preview-pane="soil"]').click();
  await page
    .locator("[data-testid=footing-contact]")
    .screenshot({ path: `${dir}/footing-contact.png` });
  // The run record: partial contact, bars, every check passing.
  const record = page.waitForEvent("download");
  await page.locator("#preview-record").click();
  const result = JSON.parse(
    await readFile(await (await record).path(), "utf8"),
  );
  await writeFile(`${dir}/footing-run.json`, JSON.stringify(result, null, 2));
  expect(result.contactState).toBe("partial");
  expect(result.overall).toBe("pass");
  const cp = result.codeProfilePreview;
  expect(Math.abs(cp.actions.n - 30e3)).toBeLessThan(1e-6);
  // Equilibrium of the solved contact under the column actions.
  expect(cp.design.uls.contact.residual).toBeLessThan(1e-12);
  // Schedule CSV: straight bars along X and Y, the base less the cover.
  const csvDownload = page.waitForEvent("download");
  await page.locator("#preview-schedule").click();
  const csv = await readFile(await (await csvDownload).path(), "utf8");
  const cut = result.inputs.inputs.length - 2 * result.inputs.inputs.cover;
  expect(csv).toContain(",X1,Bottom X,");
  expect(csv).toContain(",Y1,Bottom Y,");
  expect(result.schedule.map((r) => r.mark)).toEqual(["X1", "Y1"]);
  expect(Math.abs(result.schedule[0].cutLength - cut)).toBeLessThan(1e-12);
  // The calculation record carries the footing with the banner and checks.
  const report = page.waitForEvent("download");
  await menuCommand(page, "File", "Export calculation report");
  const html = await readFile(await (await report).path(), "utf8");
  await writeFile(`${dir}/calculation-record.html`, html);
  const doc = await page.context().newPage();
  await doc.setContent(html);
  await expect(doc.locator("[data-testid=report-footing-preview]")).toHaveCount(
    1,
  );
  await expect(doc.locator("[data-testid=report-ec2-banner]")).toContainText(
    "DEMONSTRATION",
  );
  await expect(doc.locator("[data-testid=report-footing-contact]")).toHaveText(
    "partial",
  );
  await expect(
    doc.locator(
      '[data-testid=report-ec2-check][data-check-id="ec2.footing.punching"]',
    ),
  ).toContainText("PASS");
  await doc.close();
  // Persistence.
  const p = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const saved = JSON.parse(await readFile(await (await p).path(), "utf8"));
  expect(saved.schemaVersion).toBe(CURRENT_SCHEMA);
  const draft = saved.designPreviews.find((d) => d.kind === "padFooting");
  expect(draft.codeInputs).toMatchObject({
    castOnBlinding: true,
    bearingCombinationId: "LC1",
  });
  expect(errors).toEqual([]);
});
