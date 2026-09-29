// M14 user journey (dynamics-v1): declare mass sources on a frame, obtain
// modal frequencies, shapes and participation, and export a vibration report.
// Expected values come from the independent oracle, never from the kernel.
import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { menuCommand } from "../menu-helpers.js";

const dir = process.env.WORKBENCH_EVIDENCE_DIR || "evidence/M14/modal";
const oracle = JSON.parse(
  await readFile("fixtures/dynamics/modal-oracle.json", "utf8"),
);
const po = oracle.portal;
const hz = (omega) => omega / (2 * Math.PI);

/** The oracle's fixed-base planar portal, with no mass declared yet. */
function portal() {
  const sec = (id, part) => ({
    id,
    name: id,
    A: part.A,
    Iy: part.Iy,
    Iz: part.Iz,
    J: part.J,
    cy: 0.1,
    cz: 0.1,
    provenance: "dynamics-v1 oracle portal",
  });
  const member = (id, start, end, section) => ({
    id,
    start,
    end,
    material: "mat1",
    section,
    localY: [0, 1, 0],
    releaseStart: { my: false, mz: false },
    releaseEnd: { my: false, mz: false },
  });
  return {
    schemaVersion: "1.0.0",
    id: "modal-portal",
    name: "Modal portal",
    revision: 0,
    displayUnits: "SI",
    analysisMode: "planarXZ",
    gravity: [0, 0, -9.80665],
    materials: [
      { id: "mat1", name: "steel", E: po.E, nu: po.nu, density: po.density },
    ],
    sections: [sec("col", po.column), sec("beam", po.beam)],
    nodes: [
      { id: "bl", position: [0, 0, 0] },
      { id: "br", position: [po.span, 0, 0] },
      { id: "tl", position: [0, 0, po.height] },
      { id: "tr", position: [po.span, 0, po.height] },
    ],
    members: [
      member("cl", "bl", "tl", "col"),
      member("cr", "br", "tr", "col"),
      member("bm", "tl", "tr", "beam"),
    ],
    supports: ["bl", "br"].map((node, i) => ({
      id: `s${i + 1}`,
      node,
      fixed: Array(6).fill(true),
      prescribed: Array(6).fill(0),
    })),
    loadCases: [
      { id: "LC1", name: "Finishes", category: "dead" },
      { id: "LC2", name: "Uplift", category: "wind" },
    ],
    loads: [
      {
        id: "g1",
        case: "LC1",
        type: "uniform",
        member: "bm",
        axes: "global",
        forcePerLength: [0, 0, -2000],
      },
      {
        id: "u1",
        case: "LC2",
        type: "nodal",
        node: "tl",
        values: [0, 0, 5000, 0, 0, 0],
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
    metadata: { description: "M14 modal journey portal", createdBy: "tests" },
  };
}

async function addSource(page, fill) {
  await page.locator("#add-entity").click();
  await fill();
  await page.getByRole("button", { name: "Save entity", exact: true }).click();
}

test("M14 modal: declare mass, frequencies against the oracle, participation, stale, failure, reopen and report", async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1300 });
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "portal.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(portal())),
  });
  await expect(page.locator("#kernel-status")).toContainText("ready");
  await expect(page.locator("#message")).toContainText(/1\.0\.0 → 1\.5\.0/);

  // No mass is implied: the modal tab says so and cannot run.
  await page.locator("[data-testid=tab-modal]").click();
  await expect(page.locator("[data-testid=modal-disclosure]")).toContainText(
    "not a floor-vibration or code serviceability check",
  );
  await expect(page.locator("[data-testid=modal-no-sources]")).toBeVisible();
  await expect(page.locator("#modal-run")).toBeDisabled();

  // Declare self mass and the two top masses of the oracle portal.
  await page.locator("#modal-edit-sources").click();
  await addSource(page, async () => {
    await page.locator("#entity-form [name=kind]").selectOption("selfMass");
    await page.locator("#entity-form [name=factor]").fill("1");
  });
  for (const node of ["tl", "tr"])
    await addSource(page, async () => {
      await page.locator("#entity-form [name=kind]").selectOption("nodalMass");
      await page.locator("#entity-form [name=node]").selectOption(node);
      await page.locator("#entity-form [name=mass]").fill(`${po.nodalMass} kg`);
    });
  await page.locator("#close-modal").click();
  await page.locator("[data-testid=tab-modal]").click();
  await expect(page.locator("[data-testid=modal-sources] li")).toHaveCount(3);

  // Four modes against OpenSees (consistent mass, 8 elements per member).
  await page.locator("[name=modal-modes]").fill("4");
  await page.locator("#modal-run").click();
  await expect(page.locator("[data-testid=modal-state]")).toHaveText(
    "✓ Current",
  );
  const frequencies = await page
    .locator("[data-testid=modal-frequency]")
    .evaluateAll((cells) => cells.map((c) => Number(c.dataset.si)));
  expect(frequencies).toHaveLength(4);
  frequencies.forEach((f, i) =>
    expect(Math.abs(f / hz(po.omega[i]) - 1)).toBeLessThanOrEqual(po.tolerance),
  );
  const total = Number(
    await page
      .locator("[data-testid=modal-total-mass]")
      .getAttribute("data-si"),
  );
  const members =
    2 * po.column.A * po.height * po.density + po.beam.A * po.span * po.density;
  expect(
    Math.abs(total / (members + 2 * po.nodalMass) - 1),
  ).toBeLessThanOrEqual(1e-12);
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-mode-shape",
    /^Mode 1 · /,
  );
  await expect(page.locator('[data-direction="Y"]')).toContainText(
    "no participating mass",
  );
  const x = page.locator('[data-testid=modal-direction][data-direction="X"]');
  const reachedWithFour = await x.getAttribute("data-achieved");
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/modal-modes.png` });

  // Twelve modes reach the 90 % target in X; the report states it.
  await page.locator("[name=modal-modes]").fill("12");
  await page.locator("#modal-run").click();
  await expect(x).toHaveAttribute("data-achieved", "true");
  await page.locator("[data-modal-mode='1']").click();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-mode-shape",
    /^Mode 2 · /,
  );
  await page.locator("#viewport").screenshot({ path: `${dir}/mode-2.png` });
  const reportDownload = page.waitForEvent("download");
  await page.locator("#modal-report").click();
  const report = await readFile(await (await reportDownload).path(), "utf8");
  expect(report).toContain('data-testid="vibration-banner"');
  const first12 = await page
    .locator("[data-testid=modal-frequency]")
    .first()
    .getAttribute("data-si");
  expect(report).toContain(`data-si="${first12}"`);
  expect(report).toContain('data-testid="vibration-achieved-X">yes');
  expect(report).not.toContain("<script");
  await writeFile(`${dir}/vibration-report.html`, report);
  const recordDownload = page.waitForEvent("download");
  await page.locator("#modal-download").click();
  const record = JSON.parse(
    await readFile(await (await recordDownload).path(), "utf8"),
  );
  expect(record.request.modal.massMatrix).toBe("consistent");
  await writeFile(`${dir}/modal-run.json`, JSON.stringify(record, null, 2));

  // Editing a mass source makes the result stale; undo restores it.
  const hash = await page.locator("#hash-status").textContent();
  await page.locator("#modal-edit-sources").click();
  await page.getByRole("button", { name: "Edit ms2", exact: true }).click();
  await page.locator("#entity-form [name=mass]").fill("4000 kg");
  await page.getByRole("button", { name: "Save entity", exact: true }).click();
  await page.locator("#close-modal").click();
  await page.locator("[data-testid=tab-modal]").click();
  await expect(page.locator("[data-testid=modal-state]")).toHaveText(
    "⚠ Stale",
  );
  await expect(page.locator("#viewport")).not.toHaveAttribute(
    "data-mode-shape",
    /.*/,
  );
  await page.locator("#undo").click();
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("[data-testid=tab-modal]").click();
  await expect(page.locator("[data-testid=modal-state]")).toHaveText(
    "✓ Current",
  );

  // Save and reopen: mass sources persist, results do not; the rerun is exact.
  const projectDownload = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const saved = await readFile(await (await projectDownload).path(), "utf8");
  expect(JSON.parse(saved).schemaVersion).toBe("1.5.0");
  expect(JSON.parse(saved).massSources).toHaveLength(3);
  await writeFile(`${dir}/project.json`, saved);
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "modal-portal.json",
    mimeType: "application/json",
    buffer: Buffer.from(saved),
  });
  await expect(page.locator("#kernel-status")).toContainText("ready");
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("[data-testid=tab-modal]").click();
  await expect(page.locator("[data-testid=modal-sources] li")).toHaveCount(3);
  await expect(page.locator("[data-testid=modal-result]")).toHaveCount(0);
  await page.locator("[name=modal-modes]").fill("4");
  await page.locator("#modal-run").click();
  await expect(page.locator("[data-testid=modal-state]")).toHaveText(
    "✓ Current",
  );
  expect(
    await page
      .locator("[data-testid=modal-frequency]")
      .evaluateAll((cells) => cells.map((c) => Number(c.dataset.si))),
  ).toEqual(frequencies);

  // Negative mass is refused: a load case acting against gravity.
  await page.locator("#modal-edit-sources").click();
  await addSource(page, async () => {
    await page.locator("#entity-form [name=kind]").selectOption("loadCase");
    await page.locator("#entity-form [name=case]").selectOption("LC2");
    await page.locator("#entity-form [name=factor]").fill("1");
  });
  await page.locator("#close-modal").click();
  await page.locator("[data-testid=tab-modal]").click();
  await page.locator("#modal-run").click();
  await expect(page.locator("[data-testid=modal-failure]")).toContainText(
    "NEGATIVE_MASS",
  );
  await expect(page.locator("[data-testid=modal-frequency]")).toHaveCount(0);
  await page
    .locator("[data-testid=modal-result]")
    .screenshot({ path: `${dir}/negative-mass.png` });

  expect(errors).toEqual([]);
  await writeFile(
    `${dir}/journey.json`,
    JSON.stringify(
      {
        test: "M14 modal journey",
        oracle: "fixtures/dynamics/modal-oracle.json#portal",
        frequenciesHz: frequencies,
        expectedHz: po.omega.map(hz),
        tolerance: po.tolerance,
        totalMass: total,
        fourModesReachXTarget: reachedWithFour === "true",
        reopenedIdentical: true,
        negativeMass: "NEGATIVE_MASS, no frequencies",
        modelHash: hash,
      },
      null,
      2,
    ),
  );
});
