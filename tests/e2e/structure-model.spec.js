import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { menuCommand } from "../menu-helpers.js";
async function exported(page) {
  const pending = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  return JSON.parse(await readFile(await (await pending).path(), "utf8"));
}
test("Authored structure survives save, undo, topology and reopen; invalid bindings fail closed", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator("#import-file").setInputFiles("fixtures/models/B07.json");
  await expect(page.locator("#model-count")).toHaveText("2 nodes · 1 members");
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  const original = await exported(page);
  expect(original.schemaVersion).toBe("1.5.0");
  const owner = original.structure.physicalMembers[0];
  await page.locator("[data-structure-add=storeys]").click();
  await page.locator("#structure-form [name=name]").fill("Level 1");
  await page.locator("#structure-form [name=elevation]").fill("3000 mm");
  await page.locator("#structure-form button.primary").click();
  await page.locator(`[data-structure-id="${owner.id}"]`).click();
  await page.locator("#structure-form [name=role]").selectOption("beam");
  await page
    .locator("#structure-form [name=storeyId]")
    .selectOption({ label: "Level 1" });
  await page.locator("#structure-form [name=name]").fill("Beam B01");
  await page.locator("#structure-form button.primary").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await page.locator("[data-branch=layers] > summary").click();
  await page.locator("[data-structure-add=layers]").click();
  await page.locator("#structure-form [name=name]").fill("Primary framing");
  await page
    .locator(`#structure-form [value="physicalMember:${owner.id}"]`)
    .check();
  await page.locator("#structure-form button.primary").click();
  await page.locator("[data-branch=grids] > summary").click();
  await page.locator("[data-structure-add=grids]").click();
  await page.locator("#structure-form [name=name]").fill("Grid A");
  await page.locator("#structure-form [name=end0]").fill("8000 mm");
  await page.locator("#structure-form button.primary").click();
  let authored = await exported(page);
  expect(authored.structure.grids[0].end).toEqual([8, 0, 0]);
  expect(authored.structure.layers[0].members).toEqual([
    { kind: "physicalMember", id: owner.id },
  ]);
  await page.locator("[data-structure-key=storeys]").click();
  await page.locator("#structure-delete").click();
  await expect(page.locator("#structure-error")).toContainText("storey");
  await page.locator("#structure-cancel").click();
  await page.locator("[data-member=m1]").click();
  await page.locator("#topology").click();
  await page.locator("#split-stations").fill("0.5");
  await page
    .getByRole("button", { name: "Preview topology", exact: true })
    .click();
  await page.locator("#topology-commit").click();
  await expect(page.locator("#model-count")).toHaveText("3 nodes · 2 members");
  await expect(page.locator("#result-status")).toContainText("Stale");
  const split = await exported(page);
  expect(split.structure.physicalMembers[0]).toMatchObject({
    id: owner.id,
    name: "Beam B01",
    role: "beam",
  });
  expect(split.structure.physicalMembers[0].analyticalMemberIds).toHaveLength(
    2,
  );
  expect(split.structure.joints).toHaveLength(3);
  await page.locator("#undo").click();
  expect((await exported(page)).structure).toEqual(authored.structure);
  await page.locator("#redo").click();
  await expect(page.locator("#model-count")).toHaveText("3 nodes · 2 members");
  await expect(page.locator("#save-status")).toHaveText("Saved locally");
  await page.reload();
  await page.locator("#recent-projects .recent-row").first().click();
  await expect(page.locator("#model-count")).toHaveText("3 nodes · 2 members");
  expect((await exported(page)).structure).toEqual(split.structure);
  await page.locator("#explorer-expand").click();
  await page.locator(`[data-structure-id="${owner.id}"]`).click();
  await page.locator("#view-3d").click();
  expect(
    await page
      .locator("#inspector-content")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);

  await mkdir("evidence/structure-model", { recursive: true });
  await page.screenshot({ path: "evidence/structure-model/authored-tree.png" });
  await writeFile(
    "evidence/structure-model/project.json",
    JSON.stringify(await exported(page), null, 2),
  );
  expect(errors).toEqual([]);
});
