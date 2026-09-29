// M09 user journey (stability-v1): compare first- and second-order sway of a
// loaded portal and inspect elastic buckling modes with load-factor meaning.
// Expected values come from the independent oracle, never from the kernel.
import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { menuCommand } from "../menu-helpers.js";

const dir = process.env.WORKBENCH_EVIDENCE_DIR || "evidence/M09/stability";
const oracle = JSON.parse(
  await readFile("fixtures/stability/stability-oracle.json", "utf8"),
);
const pb = oracle.portalBuckling;
const pd50 = oracle.secondOrder.find((c) => c.id === "S-POR-PD-050");
const H = oracle.firstOrderSwayUnderH.H;

/**
 * The oracle portal: LC1 puts P = 0.5 Pcr on each column top, LC2 is the
 * lateral load H. C1 = LC1 + LC2 is S-POR-PD-050; C2 = 2.02 LC1 + LC2 is
 * 1.01 Pcr (S-OVER).
 */
function portal() {
  const P = pd50.PPerColumn;
  const sec = (id, part) => ({
    id,
    name: id,
    A: part.A,
    Iy: part.I,
    Iz: part.I,
    J: 1e-4,
    cy: 0.1,
    cz: 0.1,
    provenance: "stability-v1 oracle portal",
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
  const { h, b } = pb.geometry;
  return {
    schemaVersion: "1.0.0",
    id: "stability-portal",
    name: "Stability portal",
    revision: 0,
    displayUnits: "SI",
    analysisMode: "planarXZ",
    gravity: [0, 0, -9.80665],
    materials: [{ id: "mat1", name: "steel", E: 210e9, nu: 0.3, density: 0 }],
    sections: [sec("col", pb.column), sec("beam", pb.beam)],
    nodes: [
      { id: "bl", position: [0, 0, 0] },
      { id: "br", position: [b, 0, 0] },
      { id: "tl", position: [0, 0, h] },
      { id: "tr", position: [b, 0, h] },
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
      { id: "LC1", name: "Gravity 0.5 Pcr", category: "dead" },
      { id: "LC2", name: "Lateral H", category: "other" },
    ],
    loads: [
      { id: "g1", case: "LC1", type: "nodal", node: "tl", values: [0, 0, -P, 0, 0, 0] },
      { id: "g2", case: "LC1", type: "nodal", node: "tr", values: [0, 0, -P, 0, 0, 0] },
      { id: "h1", case: "LC2", type: "nodal", node: "tl", values: [H, 0, 0, 0, 0, 0] },
    ],
    combinations: [
      { id: "C1", name: "Gravity + lateral", purpose: "analysis", terms: [{ case: "LC1", factor: 1 }, { case: "LC2", factor: 1 }] },
      { id: "C2", name: "Over-critical", purpose: "analysis", terms: [{ case: "LC1", factor: 2.02 }, { case: "LC2", factor: 1 }] },
    ],
    analysisSettings: {
      type: "linearStatic",
      formulation: "eulerBernoulli3D",
      mergeTolerance: 1e-6,
      timeoutMs: 30000,
      memoryLimitMiB: 512,
    },
    metadata: { description: "M09 stability journey portal", createdBy: "tests" },
  };
}

test("M09 stability: buckling modes, first- vs second-order sway, over-critical failure, stale and record", async ({
  page,
}) => {
  test.setTimeout(120000);
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
  await page.locator("#result-case").selectOption("LC1");
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");

  // Elastic buckling of LC1: λ = Pcr / (0.5 Pcr) = 2 against the oracle.
  await page.locator("[data-testid=tab-stability]").click();
  await expect(page.locator("[data-testid=stability-disclosure]")).toContainText(
    "not a member resistance",
  );
  await page.locator("#stability-run").click();
  await expect(page.locator("[data-testid=stability-state]")).toHaveText("✓ Current");
  const factor = Number(
    await page.locator("[data-testid=stability-factor]").first().getAttribute("data-si"),
  );
  const expected = pb.PcrPerColumn / pd50.PPerColumn;
  expect(Math.abs(factor / expected - 1)).toBeLessThanOrEqual(1e-4);
  await expect(page.locator("[data-testid=stability-factor]")).toHaveCount(5);
  // Mode 1 is drawn in the viewport as a normalised shape.
  await expect(page.locator("#viewport")).toHaveAttribute("data-mode-shape", /^Mode 1 · λ = /);
  await page.locator("[data-stability-mode='1']").click();
  await expect(page.locator("#viewport")).toHaveAttribute("data-mode-shape", /^Mode 2/);
  await expect(page.locator("#overlay-legend")).toBeVisible();
  await expect(page.locator("#overlay-legend")).toContainText("shape only");
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/buckling-mode.png` });
  await page.locator("[data-testid=stability-result]").screenshot({
    path: `${dir}/buckling-table.png`,
  });

  // Second order on C1 (0.5 Pcr + H) against the exact beam-column solution.
  await page.locator("#result-case").selectOption("C1");
  await expect(page.locator("[data-testid=stability-state]")).toHaveText("⚠ Stale");
  await expect(page.locator("#viewport")).not.toHaveAttribute("data-mode-shape", /.*/);
  await expect(page.locator("#overlay-legend")).toBeHidden();
  await page.locator("[name=stability-type][value=secondOrder]").check();
  await page.locator("#stability-run").click();
  await expect(page.locator("[data-testid=stability-state]")).toHaveText("✓ Current");
  const sway = Number(
    await page.locator("[data-testid=stability-sway]").getAttribute("data-si"),
  );
  expect(Math.abs(sway / pd50.exact.sway - 1)).toBeLessThanOrEqual(1e-3);
  const amplification = Number(
    await page.locator("[data-testid=stability-amplification]").textContent(),
  );
  expect(Math.abs(amplification / pd50.exact.amplification - 1)).toBeLessThanOrEqual(1e-3);
  await expect(page.locator("[data-testid=stability-imperfection]")).toContainText(
    "none (stated)",
  );
  // The second-order shape is drawn at the deformation scale.
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-second-order-shape",
    /^Second order · /,
  );
  await expect(page.locator("#overlay-legend")).toContainText("Second order");
  await page.screenshot({ path: `${dir}/second-order.png` });
  await page.locator("[data-testid=stability-result]").screenshot({
    path: `${dir}/second-order-table.png`,
  });

  // The stability record download carries the run with its request.
  const runDownload = page.waitForEvent("download");
  await page.locator("#stability-download").click();
  const runRecord = JSON.parse(
    await readFile(await (await runDownload).path(), "utf8"),
  );
  expect(runRecord.kind).toBe("secondOrder");
  expect(runRecord.currentState).toBe("current");
  expect(runRecord.request.stability.imperfection).toEqual({ kind: "none" });
  await writeFile(`${dir}/second-order-run.json`, JSON.stringify(runRecord, null, 2));

  // The calculation record carries the current second-order run. With the
  // first-order analysis of C1 current too, both shapes overlay one to one.
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await page.locator("[data-testid=tab-stability]").click();
  await expect(page.locator("#deformation-legend")).toBeVisible();
  await expect(page.locator("#viewport")).toHaveAttribute(
    "data-second-order-shape",
    /^Second order · /,
  );
  await page.locator("#deformation-scale").fill("2000");
  await expect(page.locator("#overlay-legend")).toContainText("× 2000");
  await page.locator("#viewport").screenshot({ path: `${dir}/sway-comparison.png` });
  const reportDownload = page.waitForEvent("download");
  await menuCommand(page, "File", "Export calculation report");
  const record = await readFile(await (await reportDownload).path(), "utf8");
  expect(record).toContain('data-testid="report-stability-banner"');
  expect(record).toContain("not a member resistance");
  expect(record).toContain(`data-si="${sway}"`);
  expect(record).not.toContain("<script");
  await writeFile(`${dir}/record.html`, record);

  // Editing the model makes the stability result stale; undo restores the
  // exact model, so the same run is current again.
  const hash = await page.locator("#hash-status").textContent();
  await menuCommand(page, "Model", "Nodes…");
  await page.getByRole("button", { name: "Edit n4", exact: true }).click();
  await page.getByLabel("X m", { exact: true }).fill("6.5");
  await page.getByRole("button", { name: "Save entity", exact: true }).click();
  await page.locator("#close-modal").click();
  await page.locator("[data-testid=tab-stability]").click();
  await expect(page.locator("[data-testid=stability-state]")).toHaveText("⚠ Stale");
  await expect(page.locator("#stability-download")).toHaveCount(1);
  await page.locator("#undo").click();
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("[data-testid=tab-stability]").click();
  await expect(page.locator("[data-testid=stability-state]")).toHaveText("✓ Current");

  // Over-critical C2 (1.01 Pcr): a reasoned failure and no numbers.
  await page.locator("#result-case").selectOption("C2");
  await page.locator("#stability-run").click();
  await expect(page.locator("[data-testid=stability-failure]")).toContainText(
    "TANGENT_NOT_POSITIVE_DEFINITE",
  );
  await expect(page.locator("[data-testid=stability-failure]")).toContainText(
    "at or beyond the elastic critical state",
  );
  await expect(page.locator("[data-testid=stability-sway]")).toHaveCount(0);
  await expect(page.locator("#stability-download")).toHaveCount(0);
  await page.locator("[data-testid=stability-result]").screenshot({
    path: `${dir}/over-critical.png`,
  });

  // An envelope is not a stability input.
  await page.locator("#result-case").selectOption("__envelope__");
  await expect(page.locator("#stability-run")).toBeDisabled();
  await expect(page.locator("#stability-readiness")).toContainText(
    "envelopes are not valid inputs",
  );

  // Save and reopen: results are not persisted, so the reopened project has
  // no stability result until it is run again, and the rerun reproduces the
  // saved-session sway exactly.
  const projectDownload = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const saved = await readFile(await (await projectDownload).path(), "utf8");
  await writeFile(`${dir}/project.json`, saved);
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "stability-portal.json",
    mimeType: "application/json",
    buffer: Buffer.from(saved),
  });
  await expect(page.locator("#kernel-status")).toContainText("ready");
  await expect(page.locator("#hash-status")).toHaveText(hash);
  await page.locator("#result-case").selectOption("C1");
  await page.locator("[data-testid=tab-stability]").click();
  await expect(page.locator("[data-testid=stability-result]")).toHaveCount(0);
  await page.locator("[name=stability-type][value=secondOrder]").check();
  await page.locator("#stability-run").click();
  await expect(page.locator("[data-testid=stability-state]")).toHaveText("✓ Current");
  expect(
    Number(await page.locator("[data-testid=stability-sway]").getAttribute("data-si")),
  ).toBe(sway);
  expect(errors).toEqual([]);
  await writeFile(
    `${dir}/journey.json`,
    JSON.stringify(
      {
        test: "M09 stability journey",
        oracle: "fixtures/stability/stability-oracle.json",
        bucklingFactor: { measured: factor, expected, tolerance: 1e-4 },
        secondOrderSway: { measured: sway, expected: pd50.exact.sway, tolerance: 1e-3 },
        amplification: {
          measured: amplification,
          expected: pd50.exact.amplification,
          tolerance: 1e-3,
        },
        overCritical: "TANGENT_NOT_POSITIVE_DEFINITE, no payload",
        reopenedSwayIdentical: true,
        modelHash: hash,
      },
      null,
      2,
    ),
  );
});
