import { menuCommand } from "../menu-helpers.js";
import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { evidenceDir, record } from "../../tools/evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M03/hierarchy";
process.env.WORKBENCH_TASK_ID ||= "M03-F";
process.env.WORKBENCH_MILESTONE ||= "M03";

const evidence = () => evidenceDir("evidence/M03/hierarchy");

async function exported(page) {
  const pending = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  return JSON.parse(await readFile(await (await pending).path(), "utf8"));
}

test("M03 hierarchy: split shows physical parent and analytical children", async ({
  page,
}) => {
  const dir = evidence();
  await mkdir(dir, { recursive: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const fixture = JSON.parse(
    await readFile("fixtures/models/B07.json", "utf8"),
  );
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "B07.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await expect(page.locator("#model-count")).toContainText("2 nodes · 1 members");
  await expect(page.locator("#model-nav .hierarchy-group")).toHaveCount(0);

  await page.locator("#topology").click();
  await page.locator("#split-stations").fill("0.25, 0.75");
  await page
    .getByRole("button", { name: "Preview topology", exact: true })
    .click();
  await expect(page.locator("#topology-commit")).toBeVisible();
  await page.locator("#topology-commit").click();
  await expect(page.locator("#modal")).not.toBeVisible();
  await expect(page.locator("#model-count")).toHaveText("4 nodes · 3 members");

  await expect(page.locator("#model-nav .hierarchy-group")).toHaveCount(1);
  await expect(page.locator("#model-nav .hierarchy-parent")).toContainText(
    "Physical m1 · 3 analytical",
  );
  await expect(page.locator("#model-nav .hierarchy-child")).toHaveCount(3);

  const first = page.locator("#model-nav .hierarchy-child").first();
  await first.click();
  await expect(page.locator(".lineage-panel")).toBeVisible();
  await expect(page.locator(".lineage-panel")).toContainText(
    "Analytical segment of physical m1",
  );
  await expect(page.locator("#selected-status")).toContainText("physical m1");

  await page.locator('[data-group="members"]').click();
  await expect(
    page.locator('#modal [data-physical="m1"]'),
  ).toHaveCount(3);
  await page.locator("#close-modal").click();

  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");

  const project = await exported(page);
  expect(project.members.every((m) => m.parentMemberId === "m1")).toBe(true);
  await writeFile(`${dir}/hierarchy-project.json`, JSON.stringify(project));

  expect(errors).toEqual([]);
  await record("hierarchy-browser", {
    test: "M03 hierarchy: split shows physical parent and analytical children",
    physicalRoots: 1,
    analyticalChildren: project.members.length,
    artifacts: ["hierarchy-project.json"],
  });
});
