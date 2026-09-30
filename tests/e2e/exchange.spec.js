// M21 user journeys (exchange-v1, ADR 0025): import IFC4 and DXF through
// the conversion review, analyse, save and reopen, and export loss-accounted
// IFC and DXF files. Expected values come from the independent corpus in
// fixtures/exchange/exchange-oracle.json, never from the kernel.
import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { menuCommand } from "../menu-helpers.js";

const dir = process.env.WORKBENCH_EVIDENCE_DIR || "evidence/M21/exchange";
const oracle = JSON.parse(
  await readFile("fixtures/exchange/exchange-oracle.json", "utf8"),
);
const entry = (file) => oracle.corpus.find((e) => e.file === file);
const sha = (text) => createHash("sha256").update(text).digest("hex");

async function start(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page.goto("/");
  // The gateway queues requests until the kernel Worker is ready.
  await expect(page.locator("#landing")).toBeVisible();
  return errors;
}

async function chooseExchange(page, file) {
  await page
    .locator("#exchange-file")
    .setInputFiles(`fixtures/exchange/${file}`);
  await expect(page.locator("[data-testid=exchange-review]")).toBeVisible();
}

test("IFC import: conversion review, mapping manifest, analysis, save and reopen", async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors = await start(page);
  const e = entry("X-FEET-KIP.ifc");
  await chooseExchange(page, e.file);
  await expect(page.locator("[data-testid=exchange-sha]")).toHaveText(e.sha256);
  await expect(page.locator("[data-testid=exchange-disclosure]")).toContainText(
    "not a native Revit",
  );
  // Every decision the oracle expects, none preselected, Import disabled.
  const ids = await page
    .locator("[data-decision]")
    .evaluateAll((els) => els.map((x) => x.dataset.decision).sort());
  expect(ids).toEqual(e.decisions);
  expect(
    await page.locator("[data-decision] input[type=radio]:checked").count(),
  ).toBe(0);
  await expect(page.locator("[data-testid=exchange-accept]")).toBeDisabled();
  for (const subject of ["IfcBeam", "IfcStructuralPointReaction"])
    await expect(
      page.locator(
        `[data-testid=exchange-ledger] tr[data-subject="${subject}"]`,
      ),
    ).toHaveCount(1);
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/ifc-review.png`, fullPage: true });

  // The batch manifest drives the same form.
  const manifest = JSON.stringify({
    format: "workbench-exchange-mapping-v1",
    sourceSha256: e.sha256,
    answers: e.mapping,
  });
  await page.locator("#exchange-mapping-file").setInputFiles({
    name: "mapping.json",
    mimeType: "application/json",
    buffer: Buffer.from(manifest),
  });
  await expect(page.locator("[data-testid=exchange-accept]")).toBeEnabled();
  // The form's own manifest equals the one loaded.
  const saved = page.waitForEvent("download");
  await page.locator("[data-testid=exchange-save-mapping]").click();
  const roundTripped = JSON.parse(
    await readFile(await (await saved).path(), "utf8"),
  );
  expect(roundTripped.answers).toEqual(e.mapping);
  await page.locator("[data-testid=exchange-accept]").click();
  await expect(page.locator("[data-testid=exchange-imported]")).toBeVisible();
  await expect(
    page.locator(
      '[data-testid=exchange-import-ledger] tr[data-subject="elastic support"]',
    ),
  ).toHaveCount(1);
  const record = page.waitForEvent("download");
  await page.locator("[data-testid=exchange-record]").click();
  const conversion = JSON.parse(
    await readFile(await (await record).path(), "utf8"),
  );
  expect(conversion.source.sha256).toBe(e.sha256);
  expect(conversion.mapping.answers).toEqual(e.mapping);
  await writeFile(
    `${dir}/ifc-conversion-record.json`,
    JSON.stringify(conversion, null, 2),
  );
  await page.locator("#close-modal").click();

  // The imported frame is the project: its geometry matches the oracle.
  const download = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const project = JSON.parse(
    await readFile(await (await download).path(), "utf8"),
  );
  expect(project.members).toHaveLength(Object.keys(e.members).length);
  for (const [id, pos] of Object.entries(e.nodes)) {
    const n = project.nodes.find((x) => x.id === id);
    for (let k = 0; k < 3; k++)
      expect(Math.abs(n.position[k] - pos[k])).toBeLessThanOrEqual(
        1e-9 * Math.max(1, Math.abs(pos[k])),
      );
  }
  await writeFile(
    `${dir}/ifc-imported-project.json`,
    JSON.stringify(project, null, 2),
  );

  // It analyses.
  await page.locator("#analyse").click();
  await expect(page.locator("#workspace")).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await page.screenshot({ path: `${dir}/ifc-analysed.png` });

  // Save and reopen: identities (GUID-based IDs) and the model survive, and
  // a re-export writes the file's GUIDs back.
  await page.locator("#import-file").setInputFiles({
    name: "saved.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.locator("#kernel-status")).toContainText("ready");
  const again = page.waitForEvent("download");
  await menuCommand(page, "File", "Export IFC (analysis model)");
  const ifc = await readFile(await (await again).path(), "utf8");
  const source = await readFile(`fixtures/exchange/${e.file}`, "utf8");
  const guids = (t, kind) =>
    t
      .split("\n")
      .filter((l) => l.includes(`${kind}(`))
      .map((l) => l.split("'")[1])
      .sort();
  for (const kind of [
    "IFCSTRUCTURALCURVEMEMBER",
    "IFCSTRUCTURALPOINTCONNECTION",
  ])
    expect(guids(ifc, kind)).toEqual(guids(source, kind));
  expect(errors).toEqual([]);
});

test("DXF import answered in the form; refusals keep the project", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors = await start(page);
  // A file that cannot be imported: the reason is shown, Import stays off.
  await chooseExchange(page, "X-BLOCKED.ifc");
  await expect(page.locator("[data-testid=exchange-blocking]")).toContainText(
    "released translations or torsion",
  );
  await expect(page.locator("[data-testid=exchange-accept]")).toBeDisabled();
  await page.screenshot({ path: `${dir}/blocked.png` });
  await page.locator("#close-modal").click();
  await expect(page.locator("#landing")).toBeVisible();

  const e = entry("X-DXF-NOUNITS.dxf");
  await chooseExchange(page, e.file);
  await expect(page.locator("[data-testid=unit-length]")).toContainText(
    "not stated",
  );
  const decision = (id) => page.locator(`[data-decision="${id}"]`);
  await decision("units:length").getByLabel("foot").check();
  await decision("supports").getByLabel("No supports").check();
  const values = e.mapping["layer:A"].values;
  for (const [k, v] of Object.entries(values))
    await decision("layer:A").locator(`[data-field="${k}"]`).fill(String(v));
  await expect(page.locator("[data-testid=exchange-accept]")).toBeDisabled();
  await decision("nodes:tolerance")
    .locator('[data-field="tolerance"]')
    .fill("0.001");
  await expect(page.locator("[data-testid=exchange-accept]")).toBeEnabled();
  await page.locator("[data-testid=exchange-accept]").click();
  await expect(page.locator("[data-testid=exchange-imported]")).toBeVisible();
  await page.locator("#close-modal").click();
  const download = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const project = JSON.parse(
    await readFile(await (await download).path(), "utf8"),
  );
  const xs = project.nodes.map((n) => n.position[0]).sort((a, b) => a - b);
  expect(xs[1]).toBeCloseTo(3.048, 12);
  expect(project.supports).toEqual([]);
  expect(errors).toEqual([]);
});

test("IFC and DXF export: the files the independent tools checked, with their ledgers", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors = await start(page);
  const frame = await readFile("fixtures/exchange/X-FRAME.json", "utf8");
  await page.locator("#import-file").setInputFiles({
    name: "X-FRAME.json",
    mimeType: "application/json",
    buffer: Buffer.from(frame),
  });
  await expect(page.locator("#kernel-status")).toContainText("ready");
  const check = oracle.exportChecks.find((c) => c.project === "X-FRAME");

  const ifcDownload = page.waitForEvent("download");
  await menuCommand(page, "File", "Export IFC (analysis model)");
  const ifc = await readFile(await (await ifcDownload).path(), "utf8");
  await expect(page.locator("[data-testid=exchange-exported]")).toBeVisible();
  const exportedHash = await page
    .locator("[data-testid=exchange-export-model]")
    .textContent();
  await expect(
    page.locator(
      '[data-testid=exchange-export-ledger] tr[data-subject="analysis results"]',
    ),
  ).toHaveCount(1);
  // The browser stamps the current time; with the oracle's timestamp the
  // file is byte-identical to the one IfcOpenShell validated.
  const stamped = ifc.replace(
    /FILE_NAME\(('[^']*'),'[^']*'/,
    "FILE_NAME($1,'1970-01-01T00:00:00'",
  );
  expect(sha(stamped)).toBe(check.ifcSha256);
  await writeFile(`${dir}/X-FRAME.ifc`, ifc);
  const ledger = page.waitForEvent("download");
  await page.locator("[data-testid=exchange-ledger-download]").click();
  await writeFile(
    `${dir}/X-FRAME.ifc.ledger.json`,
    await readFile(await (await ledger).path(), "utf8"),
  );
  await page.screenshot({ path: `${dir}/ifc-export.png` });
  await page.locator("#close-modal").click();

  const dxfDownload = page.waitForEvent("download");
  await menuCommand(page, "File", "Export DXF (wireframe)");
  const dxf = await readFile(await (await dxfDownload).path(), "utf8");
  expect(sha(dxf)).toBe(check.dxfSha256);
  await writeFile(`${dir}/X-FRAME.dxf`, dxf);
  await page.locator("#close-modal").click();

  // Re-import the IFC just written: no decisions, same model hash.
  await page.locator("#exchange-file").setInputFiles({
    name: "X-FRAME.ifc",
    mimeType: "application/x-step",
    buffer: Buffer.from(ifc),
  });
  await expect(
    page.locator("[data-testid=exchange-no-decisions]"),
  ).toBeVisible();
  await expect(page.locator("[data-testid=exchange-accept]")).toBeEnabled();
  await page.locator("[data-testid=exchange-accept]").click();
  await expect(page.locator("[data-testid=exchange-imported]")).toBeVisible();
  const hash = await page
    .locator("[data-testid=exchange-model-hash]")
    .textContent();
  const download = page.waitForEvent("download");
  await page.locator("#close-modal").click();
  await menuCommand(page, "File", "Download project");
  const reimported = JSON.parse(
    await readFile(await (await download).path(), "utf8"),
  );
  expect(reimported.members).toHaveLength(JSON.parse(frame).members.length);
  expect(hash).toBe(exportedHash);
  expect(errors).toEqual([]);
});
