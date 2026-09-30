import { test, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { menuCommand } from "../menu-helpers.js";
import { evidenceDir } from "../../tools/evidence.mjs";
const dir = evidenceDir("evidence/model-visibility");

test("Inspect one storey's return stairs in plan, side and 3D without changing engineering data", async ({
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
  // The viewport publishes its scope once WebGPU is ready to draw.
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU", {
    timeout: 60000,
  });
  const hash = await page.locator("#hash-status").textContent();
  await page.locator("#view-storey").selectOption("level1");
  await page.locator("#view-layer").selectOption("layerstair");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-visible-members",
    "2",
  );
  await expect(page.locator("#view-scope-status")).toContainText("2 / 642");
  await mkdir(dir, { recursive: true });
  for (const view of ["plan", "side", "3d"]) {
    await page.locator(`#view-${view}`).click();
    const bounds = JSON.parse(
      await page.locator("#viewport").getAttribute("data-fit-bounds"),
    );
    const size = await page.locator("#viewport").boundingBox();
    expect(bounds[0]).toBeGreaterThan(0);
    expect(bounds[1]).toBeGreaterThan(0);
    expect(bounds[2]).toBeLessThan(size.width);
    expect(bounds[3]).toBeLessThan(size.height);
    await page.screenshot({ path: `${dir}/stair-${view}.png` });
  }
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("#view-layer").selectOption("layerlanding");
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-visible-members",
    "4",
  );
  await page.locator("#view-layer").selectOption("");
  await page.locator("#explorer-expand").click();
  await page
    .locator(
      '[data-branch="storey:level1:stair"] [data-structure-key=physicalMembers]',
    )
    .first()
    .click();
  await page.locator("#isolate-selection").click();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-visible-members",
    "1",
  );
  await page.locator("#hide-selection").click();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-visible-members",
    "0",
  );
  await page.locator("#show-all-model").click();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-visible-members",
    "642",
  );
  await page.locator("#fit-selection").click();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-visible-members",
    "642",
  );
  await expect(page.locator("#hash-status")).toHaveText(hash);
  const pending = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const model = JSON.parse(
    await readFile(await (await pending).path(), "utf8"),
  );
  expect(model.members).toHaveLength(642);
  expect(
    model.structure.physicalMembers.filter((m) => m.role === "stair"),
  ).toHaveLength(8);
  await page.locator("#fit").click();
  await page.screenshot({ path: `${dir}/restored-model.png` });
  expect(errors).toEqual([]);
});

test("Hidden members cannot be picked and view changes preserve current results", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#import-file").setInputFiles("fixtures/models/B02.json");
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await page.locator("#hide-selection").click();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-visible-members",
    "0",
  );
  const box = await page.locator("#viewport").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.53);
  await expect(page.locator("#selected-status")).toHaveText(
    "No entities selected",
  );
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-last-cpu-pick",
    "",
  );
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await page.locator("#show-all-model").click();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.53);
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-last-cpu-pick",
    "m1",
  );
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
});
