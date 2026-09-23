import { menuCommand } from "../menu-helpers.js";
import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { evidenceDir } from "../../tools/evidence.mjs";

const evidence = () => evidenceDir("evidence/M02/self-weight");

async function model(page) {
  const pending = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  return JSON.parse(await readFile(await (await pending).path(), "utf8"));
}

async function edit(page, key, id) {
  await page.locator(`[data-group="${key}"]`).click();
  await page.locator(`[data-edit="${id}"]`).click();
  await expect(page.locator("#entity-form")).toBeVisible();
}

async function saveOk(page) {
  await page
    .locator("#entity-form")
    .getByRole("button", { name: "Save entity", exact: true })
    .click();
  await expect(page.locator("#entity-form")).toHaveCount(0);
  await page.locator("#close-modal").click();
}

test("M02 self-weight: B10 analyse, duplicate rejected, case delete keeps combinations valid", async ({
  page,
}) => {
  const dir = evidence();
  await mkdir(dir, { recursive: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const fixture = JSON.parse(
    await readFile("fixtures/models/B10.json", "utf8"),
  );
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "B10.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  await expect(page.locator("#model-count")).toContainText("2 nodes · 1 members");

  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await page.locator('[data-tab="reactions"]').click();
  await expect(
    page.getByRole("columnheader", { name: "Fz [kN]", exact: true }),
  ).toBeVisible();
  const row = page.locator("#results-content table tbody tr").first();
  await expect(row).toContainText("s1");
  const cells = await row.locator("td").allTextContents();
  // First column is <th scope="row">; td[0]=Fx, td[1]=Fy, td[2]=Fz, td[4]=My
  // rho*A*g*L = 2309.466075 N → 2.309466075 kN in engineering metric
  expect(Number(cells[2].replaceAll(",", ""))).toBeCloseTo(2.309466075, 5);
  expect(Number(cells[4].replaceAll(",", ""))).toBeCloseTo(-3.4641991125, 5);

  const before = await model(page);
  expect(before.loads).toEqual([
    {
      id: "l1",
      case: "LC1",
      type: "selfWeight",
      members: ["m1"],
      factor: 1,
    },
  ]);
  await writeFile(`${dir}/b10-project.json`, JSON.stringify(before, null, 2));
  await page.screenshot({
    path: `${dir}/self-weight-results.png`,
    fullPage: true,
  });

  await page.locator('[data-group="loads"]').click();
  await page.locator("#add-entity").click();
  await page.locator('[name="type"]').selectOption("selfWeight");
  await page.locator('[name="weight-m1"]').check();
  await page
    .locator("#entity-form")
    .getByRole("button", { name: "Save entity", exact: true })
    .click();
  await expect(page.locator("#entity-error")).toContainText(
    "DUPLICATE_SELF_WEIGHT",
  );
  await page.locator("#close-modal").click();
  expect((await model(page)).loads).toHaveLength(1);

  await page.locator('[data-group="combinations"]').click();
  await page.locator("#add-entity").click();
  await page.locator('[name="name"]').fill("Factored self-weight");
  await page.locator('[name="factor-LC1"]').fill("1.35");
  await saveOk(page);
  expect((await model(page)).combinations).toHaveLength(1);

  await edit(page, "loadCases", "LC1");
  await page.locator("#delete-entity").click();
  // Rejected without mutation: last load case cannot be removed while the model
  // (and combination terms) still require a case.
  await expect(page.locator("#entity-error")).toContainText(/INVALID_SCHEMA|DANGLING_REFERENCE/);
  await page.locator("#close-modal").click();
  const after = await model(page);
  expect(after.loadCases.map((c) => c.id)).toEqual(["LC1"]);
  expect(after.combinations).toHaveLength(1);
  expect(after.loads).toHaveLength(1);
  expect(errors).toEqual([]);
});
