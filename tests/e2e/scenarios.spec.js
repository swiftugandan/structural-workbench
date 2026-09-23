import { menuCommand } from "../menu-helpers.js";
import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { evidenceDir } from "../../tools/evidence.mjs";

const evidence = () => evidenceDir("evidence/M02/scenarios");

async function model(page) {
  const pending = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  return JSON.parse(await readFile(await (await pending).path(), "utf8"));
}

async function importFixture(page, name) {
  const fixture = JSON.parse(
    await readFile(`fixtures/models/${name}.json`, "utf8"),
  );
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: `${name}.json`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  return fixture;
}

async function saveOk(page) {
  await page
    .locator("#entity-form")
    .getByRole("button", { name: "Save entity", exact: true })
    .click();
  await expect(page.locator("#entity-form")).toHaveCount(0);
  await page.locator("#close-modal").click();
}

function tdNumbers(row) {
  return row
    .locator("td")
    .allTextContents()
    .then((cells) => cells.map((c) => Number(String(c).replaceAll(",", ""))));
}

test("M02 scenarios: B11 combination factors tip load and reaction", async ({
  page,
}) => {
  const dir = evidence();
  await mkdir(dir, { recursive: true });
  await importFixture(page, "B11");

  await page.locator("#result-case").selectOption("C1");
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");

  await page.locator('[data-tab="reactions"]').click();
  // a*P1+b*P2 = 1.2*10000+1.5*5000 = 19500 N → 19.5 kN
  const fz = (
    await tdNumbers(
      page.locator("#results-content table tbody tr").filter({ hasText: "s1" }),
    )
  )[2];
  expect(fz).toBeCloseTo(19.5, 5);

  await page.locator('[data-tab="displacements"]').click();
  // uz = -(a*P1+b*P2)*L^3/(3EI) = -0.08775 m → -87.75 mm
  const uz = (
    await tdNumbers(
      page.locator("#results-content table tbody tr").filter({ hasText: "n2" }),
    )
  )[2];
  expect(uz).toBeCloseTo(-87.75, 4);

  await writeFile(
    `${dir}/b11-project.json`,
    JSON.stringify(await model(page), null, 2),
  );
});

test("M02 scenarios: dead/live/wind cases, strength combination and envelope provenance", async ({
  page,
}) => {
  const dir = evidence();
  await mkdir(dir, { recursive: true });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await importFixture(page, "V01");
  let p = await model(page);
  expect(p.loadCases.map((c) => c.category).sort()).toEqual(["dead", "live"]);
  expect(p.combinations[0].terms).toEqual([
    { case: "LC1", factor: 1.2 },
    { case: "LC2", factor: 1.5 },
  ]);

  // Add wind case + lateral nodal force at the free X support node n2
  await page.locator('[data-group="loadCases"]').click();
  await page.locator("#add-entity").click();
  await page.locator('[name="name"]').fill("Wind lateral");
  await page.locator('[name="category"]').selectOption("wind");
  await saveOk(page);
  p = await model(page);
  const windId = p.loadCases.find((c) => c.category === "wind").id;

  await page.locator('[data-group="loads"]').click();
  await page.locator("#add-entity").click();
  await page.locator('[name="type"]').selectOption("nodal");
  await page.locator('[name="case"]').selectOption(windId);
  await page.locator('[name="node"]').selectOption("n2");
  await page.locator('[name="quick-direction"]').selectOption("0:1");
  await page.locator('[name="quick-magnitude"]').fill("5");
  await saveOk(page);

  // Strength combination: 1.2 dead + 1.5 live + 1.0 wind
  await page.locator('[data-group="combinations"]').click();
  await page.locator("#add-entity").click();
  await page.locator('[name="name"]').fill("ULS with wind");
  await page.locator('[name="purpose"]').selectOption("strength");
  await page.locator('[name="include-LC1"]').check();
  await page.locator('[name="include-LC2"]').check();
  await page.locator(`[name="include-${windId}"]`).check();
  await page.locator('[name="factor-LC1"]').fill("1.2");
  await page.locator('[name="factor-LC2"]').fill("1.5");
  await page.locator(`[name="factor-${windId}"]`).fill("1");
  await saveOk(page);
  p = await model(page);
  expect(p.loadCases.some((c) => c.category === "wind")).toBe(true);
  expect(p.combinations.length).toBeGreaterThanOrEqual(2);
  const uls = p.combinations.find((c) => c.name === "ULS with wind");
  expect(uls.terms.map((t) => t.case).sort()).toEqual(
    ["LC1", "LC2", windId].sort(),
  );

  // Analyse strength combination C_uls from the fixture
  await page.locator("#result-case").selectOption("C_uls");
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await page.locator('[data-tab="reactions"]').click();
  // C_uls Fz at s1 = 51 kN
  expect(
    (
      await tdNumbers(
        page.locator("#results-content table tbody tr").filter({ hasText: "s1" }),
      )
    )[2],
  ).toBeCloseTo(51, 4);

  // Full envelope with provenance
  await page.locator("#result-case").selectOption("__envelope__");
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await expect(page.locator("#results-content")).toContainText(
    "ENVELOPE_NOT_SIMULTANEOUS",
  );
  await expect(page.locator("#results-content")).toContainText("Governing");
  const myMin = page
    .locator("#results-content table tbody tr")
    .filter({ hasText: /^m1/ })
    .filter({ hasText: "My" })
    .filter({ hasText: "min" });
  // Visible short label for C_uls (internal id stays C_uls in the model)
  await expect(myMin).toContainText(/c1|C_uls|1\.2 dead/i);
  // −99000 N·m → −99 kN·m
  const myVal = Number(
    (await myMin.locator("td").nth(2).textContent()).replaceAll(",", ""),
  );
  expect(myVal).toBeCloseTo(-99, 3);
  // Provenance must cite a real combination id in the exported engineering result
  const envText = await page.locator("#results-content").innerText();
  expect(envText).toMatch(/x\/L=0\.5/);
  expect(envText).not.toMatch(/mixed extrema/i);

  await writeFile(
    `${dir}/v01-wind-project.json`,
    JSON.stringify(await model(page), null, 2),
  );
  await page.screenshot({
    path: `${dir}/scenarios-envelope.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
