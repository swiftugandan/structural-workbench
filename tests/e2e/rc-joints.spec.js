import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { evidenceDir } from "../../tools/evidence.mjs";

/** M16 joint bar clashes (ADR 0032) through the browser build: J01's two
 * equal beams framing into a column top clash with each other and with the
 * column's face bars; deepening one beam by 40 mm moves its rows one Ø20
 * clear of the other beam's. */
const dir = evidenceDir("evidence/M16/joints");

async function joints(page) {
  await page.locator('[data-preview-pane="joints"]').click();
  await expect(page.locator("[data-testid=joint]")).toHaveCount(1);
}

test("RC joints: clashes are reported, a deeper beam clears the crossing", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const model = JSON.parse(await readFile("fixtures/models/J01.json", "utf8"));
  const beamY = model.designPreviews.find((d) => d.targetId === "beamY").id;
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "joint.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(model)),
  });
  await expect(page.locator("#kernel-status")).toContainText("ready");
  await page.locator("[data-inspector-tab=concrete]").click();
  await page.locator(`#model-nav [data-preview="${beamY}"]`).click();
  await page.locator("#preview-source").selectOption("model");
  await page.locator("#analyse").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
  await page.locator("#preview-run").click();
  await expect(page.locator("#workspace")).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
  await joints(page);
  const joint = page.locator("[data-testid=joint]");
  await expect(joint).toHaveAttribute("data-status", "clash");
  const crossing = page.locator(
    '[data-testid=joint-clash][data-kind="beamBeam"]',
  );
  await expect(crossing).toHaveCount(2);
  await expect(crossing.first().locator("td").nth(2)).toHaveText("0.0 mm");
  const columnClashes = await page
    .locator('[data-testid=joint-clash][data-kind="beamColumn"]')
    .count();
  expect(columnClashes).toBeGreaterThan(0);
  const before = await joint.innerText();

  await page.locator("#preview-depth").fill("640");
  await page.locator("#preview-save").click();
  // The edit is a new revision: analyse it before the run.
  await page.locator("#analyse").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
  await page.locator("#preview-run").click();
  await expect(page.locator("#workspace")).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
  await joints(page);
  await expect(
    page.locator('[data-testid=joint-clash][data-kind="beamBeam"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-testid=joint-clash][data-kind="beamColumn"]'),
  ).toHaveCount(columnClashes);
  const after = await joint.innerText();
  expect(errors).toEqual([]);
  await mkdir(dir, { recursive: true });
  await writeFile(
    `${dir}/rc-joints-browser.json`,
    JSON.stringify(
      {
        check: "rc-joints-browser",
        status: "PASS",
        fixture: "fixtures/models/J01.json",
        beamBeamBefore: 2,
        beamColumn: columnClashes,
        before,
        after,
      },
      null,
      2,
    ) + "\n",
  );
});
