import { menuCommand } from "../menu-helpers.js";
import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { evidenceDir, record } from "../../tools/evidence.mjs";

process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M03/section-axis";
process.env.WORKBENCH_TASK_ID ||= "M03-E";
process.env.WORKBENCH_MILESTONE ||= "M03";

const evidence = () => evidenceDir("evidence/M03/section-axis");

function tdNumbers(row) {
  return row
    .locator("td")
    .allTextContents()
    .then((cells) => cells.map((c) => Number(c.replaceAll(",", ""))));
}

async function memberEndForces(page, end) {
  await page.locator('[data-tab="forces"]').click();
  await expect(
    page.getByRole("columnheader", { name: "My [kN m]", exact: true }),
  ).toBeVisible();
  const row = page
    .locator("#results-content table tbody tr")
    .filter({ has: page.locator("td", { hasText: new RegExp(`^${end}$`) }) });
  // td columns: End, Fx, Fy, Fz, Mx, My, Mz (member id is a th)
  const cells = await tdNumbers(row);
  return { my: cells[5], mz: cells[6] };
}

test("M03 section-axis: edit localY roll swaps My/Mz end actions", async ({
  page,
}) => {
  const dir = evidence();
  await mkdir(dir, { recursive: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const fixture = JSON.parse(
    await readFile("fixtures/models/B02.json", "utf8"),
  );
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "B02.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  await expect(page.locator("#model-count")).toContainText("2 nodes · 1 members");

  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  const before = await memberEndForces(page, "i");
  // B02 tip Fz = −10 kN → My_i = −30 kN·m, Mz_i = 0
  expect(before.my).toBeCloseTo(-30, 5);
  expect(before.mz).toBeCloseTo(0, 5);

  await page.locator('[data-group="members"]').click();
  await page.locator('[data-edit="m1"]').click();
  await expect(page.locator("#entity-form")).toBeVisible();
  await page
    .locator("#entity-form details.guided-advanced summary")
    .filter({ hasText: "Member orientation" })
    .click();
  await page.locator('[name="localY-0"]').fill("0");
  await page.locator('[name="localY-1"]').fill("0");
  await page.locator('[name="localY-2"]').fill("1");
  await page
    .locator("#entity-form")
    .getByRole("button", { name: "Save entity", exact: true })
    .click();
  await expect(page.locator("#entity-form")).toHaveCount(0);
  await page.locator("#close-modal").click();

  const pending = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const exported = JSON.parse(await readFile(await (await pending).path(), "utf8"));
  expect(exported.members[0].localY).toEqual([0, 0, 1]);
  await writeFile(
    `${dir}/rolled-project.json`,
    JSON.stringify(exported),
  );

  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  const after = await memberEndForces(page, "i");
  expect(after.my).toBeCloseTo(0, 5);
  expect(after.mz).toBeCloseTo(30, 5);

  await page.locator('[data-tab="displacements"]').click();
  const n2 = page
    .locator("#results-content table tbody tr")
    .filter({ hasText: "n2" });
  const uz = (await tdNumbers(n2))[2];
  // Half of base tip uz (−45 mm → −22.5 mm) because Iz = 2 Iy
  expect(uz).toBeCloseTo(-22.5, 5);

  expect(errors).toEqual([]);
  await record("section-axis-browser", {
    test: "M03 section-axis: edit localY roll swaps My/Mz end actions",
    beforeEndActions_kNm: before,
    afterEndActions_kNm: after,
    tipUz_mm: uz,
    artifacts: ["rolled-project.json"],
  });
});
