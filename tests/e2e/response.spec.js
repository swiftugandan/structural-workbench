// M15 user journey (response-v1): harmonic sweep and response spectrum on
// the oracle's tip-mass cantilever. Expected values come from the closed
// forms in fixtures/dynamics/response-oracle.json, never from the kernel.
import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { menuCommand } from "../menu-helpers.js";
import { CURRENT_SCHEMA } from "../schema-version.js";

const dir = process.env.WORKBENCH_EVIDENCE_DIR || "evidence/M15/response";
const oracle = JSON.parse(
  await readFile("fixtures/dynamics/response-oracle.json", "utf8"),
);
const sd = oracle.sdof;

/** Massless cantilever along X, tip load along Z (schema 1.0.0, no mass). */
function cantilever() {
  return {
    schemaVersion: "1.0.0",
    id: "response-sdof",
    name: "Response SDOF",
    revision: 0,
    displayUnits: "SI",
    analysisMode: "spatial",
    gravity: [0, 0, -9.80665],
    materials: [{ id: "mat1", name: "steel", E: sd.E, nu: sd.nu, density: 0 }],
    sections: [
      {
        id: "sec1",
        name: "sec1",
        ...sd.section,
        cy: 0.1,
        cz: 0.1,
        provenance: "response-v1 oracle",
      },
    ],
    nodes: [
      { id: "n1", position: [0, 0, 0] },
      { id: "n2", position: [sd.L, 0, 0] },
    ],
    members: [
      {
        id: "m1",
        start: "n1",
        end: "n2",
        material: "mat1",
        section: "sec1",
        localY: [0, 1, 0],
        releaseStart: { my: false, mz: false },
        releaseEnd: { my: false, mz: false },
      },
    ],
    supports: [
      {
        id: "s1",
        node: "n1",
        fixed: [true, true, true, true, true, true],
        prescribed: [0, 0, 0, 0, 0, 0],
      },
    ],
    loadCases: [{ id: "LC1", name: "Excitation", category: "other" }],
    loads: [
      {
        id: "l1",
        case: "LC1",
        type: "nodal",
        node: "n2",
        values: [0, 0, sd.harmonic.force, 0, 0, 0],
      },
    ],
    combinations: [],
    analysisSettings: {
      type: "linearStatic",
      formulation: "eulerBernoulli3D",
      mergeTolerance: 1e-6,
      timeoutMs: 30000,
      memoryLimitMiB: 512,
    },
    metadata: { description: "response-v1 oracle SDOF", createdBy: "tests" },
  };
}

/** Closed-form tip amplitude |U| at f (Hz): the oracle's formula. */
function amplitude(f) {
  const w = 2 * Math.PI * f;
  const { a0, a1, force } = sd.harmonic;
  const re = sd.tipStiffness - sd.tipMass * w * w;
  const im = w * (a1 * sd.tipStiffness + a0 * sd.tipMass);
  return force / Math.hypot(re, im);
}

async function withTipMass(page) {
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "sdof.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(cantilever())),
  });
  await expect(page.locator("#kernel-status")).toContainText("ready");
  await page.locator("[data-testid=tab-response]").click();
  await expect(page.locator("[data-testid=response-no-mass]")).toBeVisible();
  await page.locator("[data-testid=tab-modal]").click();
  await page.locator("#modal-edit-sources").click();
  await page.locator("#add-entity").click();
  await page.locator("#entity-form [name=kind]").selectOption("nodalMass");
  await page.locator("#entity-form [name=node]").selectOption("n2");
  await page.locator("#entity-form [name=mass]").fill(`${sd.tipMass} kg`);
  await page.getByRole("button", { name: "Save entity", exact: true }).click();
  await page.locator("#close-modal").click();
  await page.locator("[data-testid=tab-response]").click();
}

test("M15 response: harmonic sweep and spectrum against the closed forms, stale, report and persistence", async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1300 });
  await withTipMass(page);
  await expect(page.locator("[data-testid=response-disclosure]")).toContainText(
    "not a code seismic or vibration check",
  );

  // Harmonic: 41 log-spaced frequencies across resonance, ζ at fn and 3fn.
  const fn = sd.omega / (2 * Math.PI);
  const [f1, f2] = sd.harmonic.damping.frequencies;
  await page.locator("[name=h-from]").fill(String(0.2 * fn));
  await page.locator("[name=h-to]").fill(String(5 * fn));
  await page.locator("[name=h-count]").fill("41");
  await page
    .locator("[name=h-ratio]")
    .fill(String(sd.harmonic.damping.ratio * 100));
  await page.locator("[name=h-f1]").fill(String(f1));
  await page.locator("[name=h-f2]").fill(String(f2));
  await page.locator("[name=h-subdivisions]").fill("4");
  await page.locator("#harmonic-run").click();
  await expect(page.locator("[data-testid=response-state]")).toHaveText(
    "✓ Current",
  );
  await expect(page.locator("[data-testid=harmonic-frf]")).toBeVisible();
  await expect(page.locator("#harmonic-node")).toHaveValue("n2");
  await expect(page.locator("#harmonic-dof")).toHaveValue("2");
  const rows = await page
    .locator("[data-testid=harmonic-table] tbody tr")
    .evaluateAll((trs) =>
      trs.map((tr) => [
        Number(tr.querySelector("th").dataset.si),
        Number(tr.querySelector("[data-testid=harmonic-amplitude]").dataset.si),
      ]),
    );
  expect(rows).toHaveLength(41);
  for (const [f, a] of rows)
    expect(Math.abs(a / amplitude(f) - 1)).toBeLessThanOrEqual(1e-9);
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/harmonic.png` });
  for (const id of ["harmonic-frf", "harmonic-phase"])
    await writeFile(
      `${dir}/${id}.svg`,
      await page.locator(`[data-testid=${id}]`).evaluate((e) => e.outerHTML),
    );

  // Response spectrum: the oracle's table, entered in the editor.
  await page.locator("[data-response-mode=spectrum]").click();
  await expect(page.locator("[data-testid=spectrum-none]")).toBeVisible();
  await page.locator("#spectrum-new").click();
  await page.locator("[name=sp-name]").fill("Oracle spectrum");
  await page
    .locator("[name=sp-damping]")
    .fill(String(oracle.spectrum.dampingRatio * 100));
  await page
    .locator("[name=sp-points]")
    .fill(oracle.spectrum.points.map(([t, sa]) => `${t} ${sa}`).join("\n"));
  await page.locator("[name=sp-reference]").fill("response-v1 oracle table");
  await page.locator("#spectrum-save").click();
  await expect(page.locator("[data-testid=spectrum-item]")).toHaveCount(1);
  await page.locator("[name=rs-direction]").selectOption("Z");
  await page.locator("[name=rs-combination]").selectOption("srss");
  await page.locator("[name=rs-modes]").fill("3");
  await page.locator("[name=rs-subdivisions]").fill("4");
  await page.locator("#spectrum-run").click();
  await expect(page.locator("[data-testid=response-state]")).toHaveText(
    "✓ Current",
  );
  const base = Number(
    await page
      .locator("[data-testid=spectrum-base] strong")
      .getAttribute("data-si"),
  );
  expect(Math.abs(base / sd.spectrum.baseShear - 1)).toBeLessThanOrEqual(1e-9);
  await expect(page.locator("[data-testid=spectrum-plot]")).toBeVisible();
  await page.screenshot({ path: `${dir}/spectrum.png` });
  await writeFile(
    `${dir}/spectrum-plot.svg`,
    await page
      .locator("[data-testid=spectrum-plot]")
      .evaluate((e) => e.outerHTML),
  );

  // The report carries the same base reaction and the banner.
  const report = page.waitForEvent("download");
  await page.locator("#response-report").click();
  const html = await readFile(await (await report).path(), "utf8");
  expect(html).not.toContain("<script");
  expect(html).toContain("not a code spectrum");
  await writeFile(`${dir}/response-report.html`, html);
  const doc = await page.context().newPage();
  await doc.setContent(html);
  const reported = Number(
    await doc
      .locator("[data-testid=report-spectrum-base] strong")
      .getAttribute("data-si"),
  );
  expect(reported).toBe(base);
  await doc.close();
  const record = page.waitForEvent("download");
  await page.locator("#response-download").click();
  await writeFile(
    `${dir}/spectrum-run.json`,
    await readFile(await (await record).path(), "utf8"),
  );

  // A new name is presentation only (outside the engineering hash); a new
  // damping ratio changes the analysis, so the result goes stale.
  await page.locator("[data-spectrum-edit]").click();
  await page.locator("[name=sp-name]").fill("Oracle spectrum (edited)");
  await page.locator("#spectrum-save").click();
  await expect(page.locator("[data-testid=response-state]")).toHaveText(
    "✓ Current",
  );
  await page.locator("[data-spectrum-edit]").click();
  await page.locator("[name=sp-damping]").fill("3");
  await page.locator("#spectrum-save").click();
  await expect(page.locator("[data-testid=response-state]")).toHaveText(
    "⚠ Stale",
  );

  // Persistence: the spectrum travels with the project.
  const p = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const saved = JSON.parse(await readFile(await (await p).path(), "utf8"));
  expect(saved.schemaVersion).toBe(CURRENT_SCHEMA);
  expect(saved.responseSpectra[0].points).toEqual(oracle.spectrum.points);
  await page.locator("#import-file").setInputFiles({
    name: "saved.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(page.locator("#kernel-status")).toContainText("ready");
  await page.locator("[data-testid=tab-response]").click();
  await page.locator("[data-response-mode=spectrum]").click();
  await expect(page.locator("[data-testid=spectrum-item]")).toContainText(
    "Oracle spectrum (edited)",
  );
  expect(errors).toEqual([]);
});

test("M15 response refusals: a spectrum too short for the modes and invalid tables", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1300 });
  await withTipMass(page);
  await page.locator("[data-response-mode=spectrum]").click();
  // Periods must start at 0: refused with the reason, nothing saved.
  await page.locator("#spectrum-new").click();
  await page.locator("[name=sp-points]").fill("0.1 2\n1 2");
  await page.locator("#spectrum-save").click();
  await expect(page.locator("#spectrum-error")).toContainText(
    "first period must be 0",
  );
  // A 1 s table cannot cover the 1.4 s mode: SPECTRUM_RANGE, no numbers.
  await page.locator("[name=sp-points]").fill("0 2\n1 2");
  await page.locator("#spectrum-save").click();
  await page.locator("[name=rs-direction]").selectOption("Z");
  await page.locator("[name=rs-modes]").fill("3");
  await page.locator("#spectrum-run").click();
  await expect(page.locator("[data-testid=response-failure]")).toContainText(
    "SPECTRUM_RANGE",
  );
  await page.screenshot({ path: `${dir}/spectrum-range.png` });
  expect(errors).toEqual([]);
});
