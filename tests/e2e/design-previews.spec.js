import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { menuCommand } from "../menu-helpers.js";
const dir = "evidence/design-previews";
for (const kind of ["rcBeam", "slab", "padFooting"])
  test(`Concrete preview ${kind}: source, stale, undo, persistence and export`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const model = JSON.parse(
      await readFile("fixtures/models/B04.json", "utf8"),
    );
    model.id = `preview-${kind}`;
    await page.goto("/");
    await page.locator("#import-file").setInputFiles({
      name: "preview.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(model)),
    });
    await expect(page.locator("#kernel-status")).toContainText("ready");
    await page.locator("[data-inspector-tab=concrete]").click();
    await page.locator("#preview-kind").selectOption(kind);
    await page.locator("#preview-create").click();
    await expect(page.locator("#preview-run")).toBeEnabled();
    await expect(page.locator("#model-nav [data-preview]")).toHaveCount(1);
    await page.locator("#preview-run").click();
    await expect(page.locator("[data-testid=preview-state]")).toHaveText(
      "UNSUPPORTED",
    );
    await expect(page.locator("#design-preview-scene")).toContainText(
      "MOCK WORKFLOW",
    );
    if (kind === "slab") {
      await expect(page.locator("#preview-source option")).toHaveCount(1);
      for (const face of ["Top X", "Top Y", "Bottom X", "Bottom Y"]) {
        await page.locator("#preview-face").selectOption(face);
        await expect(page.locator("#design-preview-scene")).toContainText(face);
      }
    } else {
      await page
        .locator("#preview-target")
        .selectOption(kind === "rcBeam" ? "m1" : "s1");
      if (kind === "padFooting")
        await page
          .locator("#preview-soil")
          .fill("User-entered demonstration bearing input; not a site report");
      await page.locator("#preview-save").click();
      await expect(page.locator("#preview-run")).toBeEnabled();
      await page.locator("#preview-source").selectOption("model");
      await expect(page.locator("#preview-run")).toBeDisabled();
      await page.locator("#analyse").click();
      await expect(page.locator("#preview-run")).toBeEnabled();
      await page.locator("#preview-run").click();
      await expect(page.locator("[data-testid=preview-result]")).toContainText(
        "Actual model analysis",
      );
    }
    const key = kind === "rcBeam" ? "depth" : "thickness";
    await page.locator(`#preview-${key}`).fill("650 mm");
    await expect(page.locator("[data-testid=preview-state]")).toHaveText(
      "STALE",
    );
    await expect(page.locator("#preview-run")).toBeDisabled();
    await page.locator("#preview-cancel").click();
    await expect(page.locator("[data-testid=preview-state]")).toHaveText(
      "UNSUPPORTED",
    );
    await page.locator(`#preview-${key}`).fill("650 mm");
    await page.locator("#preview-save").click();
    await expect(page.locator("[data-testid=preview-state]")).toHaveText(
      "STALE",
    );
    await page.locator("#undo").click();
    await expect(page.locator("[data-testid=preview-state]")).toHaveText(
      "UNSUPPORTED",
    );
    const download = page.waitForEvent("download");
    await page.locator("#preview-record").click();
    const run = JSON.parse(
      await readFile(await (await download).path(), "utf8"),
    );
    expect(run.overall).toBe("unsupported");
    expect(run.codeProfile).toBeNull();
    expect(run.mock).toBe(true);
    expect(
      run.checks.every(
        (c) => c.status === "unsupported" && c.utilisation === null,
      ),
    ).toBe(true);
    expect(run.sourceProvenance.mock).toBe(kind === "slab");
    if (kind === "rcBeam") {
      const d = page.waitForEvent("download");
      await page.locator("#preview-schedule").click();
      const csv = await readFile(await (await d).path(), "utf8");
      expect(csv).toContain(run.previewRunId);
      expect(csv).toContain(",0.02,4,,illustrationOnly,unverified");
    }
    if (kind === "padFooting") {
      expect(run.contactState).toBe("indeterminate");
      expect(run.soilProvenance.computedByWorkbench).toBe(false);
      // JSON canonicalises signed zero; compare exact numeric equality.
      run.sourceProvenance.foundationActions.forEach((v, i) =>
        expect(v === -run.sourceProvenance.supportReaction[i]).toBe(true),
      );
    }
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/${kind}-run.json`, JSON.stringify(run, null, 2));
    await page.screenshot({ path: `${dir}/${kind}.png` });
    const p = page.waitForEvent("download");
    await menuCommand(page, "File", "Download project");
    const saved = JSON.parse(await readFile(await (await p).path(), "utf8"));
    await page.locator("#import-file").setInputFiles({
      name: "saved.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(saved)),
    });
    await page.locator("[data-inspector-tab=concrete]").click();
    await expect(
      page.locator('#preview-active option[value]:not([value=""])'),
    ).toHaveCount(1);
    await expect(page.locator(`#preview-${key}`)).toHaveValue(
      kind === "rcBeam" ? "600" : kind === "slab" ? "225" : "550",
    );
    expect(errors).toEqual([]);
  });

test("RC beam section mechanics: per-face oracle values, law switch, provenance, fit failure and reopen", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const cases = JSON.parse(
    await readFile("fixtures/design/rc-section-mechanics/cases.json", "utf8"),
  ).cases;
  const kNm = (id) =>
    `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(
      cases.find((c) => c.id === id).expected.ultimate.moment / 1000,
    )} kN·m`;
  const model = JSON.parse(await readFile("fixtures/models/B04.json", "utf8"));
  model.id = "preview-mechanics";
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "preview.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(model)),
  });
  await expect(page.locator("#kernel-status")).toContainText("ready");
  await page.locator("[data-inspector-tab=concrete]").click();
  await page.locator("#preview-kind").selectOption("rcBeam");
  await page.locator("#preview-create").click();
  await expect(page.locator("#preview-mech-law")).toHaveValue(
    "rectangularBlock",
  );
  const runAndOpen = async () => {
    await page.locator("#preview-run").click();
    await page.locator('[data-preview-pane="mechanics"]').click();
  };
  await runAndOpen();
  const pane = page.locator("[data-testid=preview-result]");
  await expect(pane).toContainText("MECHANICS ONLY");
  // Equal default rows: sagging and hogging both equal the oracle default.
  for (const face of ["sagging", "hogging"])
    await expect(
      page.locator(`[data-testid=mechanics-moment-${face}]`),
    ).toHaveText(kNm("RC-PREVIEW-DEFAULT"));
  // Unequal rows: each face matches its own oracle case.
  await page.locator("#preview-topBarCount").fill("2");
  await page.locator("#preview-topBarDiameter").fill("16");
  await page.locator("#preview-bottomBarDiameter").fill("25");
  await page.locator("#preview-save").click();
  await runAndOpen();
  await expect(
    page.locator("[data-testid=mechanics-moment-sagging]"),
  ).toHaveText(kNm("RC-PREVIEW-ASYM-SAGGING"));
  await expect(
    page.locator("[data-testid=mechanics-moment-hogging]"),
  ).toHaveText(kNm("RC-PREVIEW-ASYM-HOGGING"));
  await page.locator('[data-preview-pane="summary"]').click();
  await expect(page.locator("[data-testid=preview-state]")).toHaveText(
    "UNSUPPORTED",
  );

  await page.locator("#preview-mech-law").selectOption("parabolaRectangle");
  await expect(page.locator("#preview-mech-parabolaPeak")).toBeVisible();
  await page.locator("#preview-mech-parabolaPeak").fill("25");
  await page.locator("#preview-save").click();
  await expect(page.locator("#preview-mech-law")).toHaveValue(
    "parabolaRectangle",
  );
  await expect(
    page.locator("label:has(#preview-mech-parabolaPeak) abbr"),
  ).toHaveText("U");
  await expect(
    page.locator("label:has(#preview-mech-strainAtPeak) abbr"),
  ).toHaveText("S");
  // Untouched values survive save bit-exactly: no display-rounding provenance flip.
  await expect(page.locator("#preview-mech-concreteModulus")).toHaveValue("30");
  await expect(
    page.locator("label:has(#preview-mech-concreteModulus) abbr"),
  ).toHaveText("S");
  await runAndOpen();
  await expect(pane).toContainText("parabola-rectangle");

  await page.locator("#preview-bottomBarCount").fill("12");
  await page.locator("#preview-save").click();
  await runAndOpen();
  await expect(page.locator("[data-testid=mechanics-fit-bottom]")).toHaveText(
    "No",
  );
  await expect(page.locator("[data-testid=mechanics-fit-top]")).toHaveText(
    "Yes",
  );
  await expect(page.locator("[data-testid=mechanics-status]")).toContainText(
    "Row does not fit",
  );
  await page.locator("#undo").click();

  const p = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const saved = JSON.parse(await readFile(await (await p).path(), "utf8"));
  expect(saved.schemaVersion).toBe("1.2.0");
  expect(saved.designPreviews[0].inputs.topBarCount).toBe(2);
  expect(saved.designPreviews[0].inputs.bottomBarDiameter).toBe(0.025);
  expect(saved.designPreviews[0].mechanics.law).toBe("parabolaRectangle");
  expect(saved.designPreviews[0].mechanics.inputs.parabolaPeak).toBe(25e6);
  await page.locator("#import-file").setInputFiles({
    name: "saved.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await page.locator("[data-inspector-tab=concrete]").click();
  await expect(page.locator("#preview-mech-law")).toHaveValue(
    "parabolaRectangle",
  );
  await expect(page.locator("#preview-mech-parabolaPeak")).toHaveValue("25");
  await mkdir(dir, { recursive: true });
  await runAndOpen();
  await page.screenshot({ path: `${dir}/rcBeam-mechanics.png` });
  expect(errors).toEqual([]);
});
for (const [localY, orientation, sagging, hogging] of [
  [[0, 1, 0], "points up", "15 kN·m", "30 kN·m"],
  [[0, -1, 0], "points DOWN", "30 kN·m", "15 kN·m"],
])
  test(`RC beam model design moments beside mechanics capacities (top face ${orientation})`, async ({
    page,
  }) => {
    // ADR 0014: B08 fixed-fixed UDL, closed-form qL²/24 = 15 kN·m sagging at
    // midspan and qL²/12 = 30 kN·m hogging at the ends; reversing localY
    // points the draft top face (local +z) down and swaps the faces.
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const model = JSON.parse(
      await readFile("fixtures/models/B08.json", "utf8"),
    );
    model.id = "preview-demand";
    model.members[0].localY = localY;
    await page.goto("/");
    await page.locator("#import-file").setInputFiles({
      name: "preview.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(model)),
    });
    await expect(page.locator("#kernel-status")).toContainText("ready");
    await page.locator("[data-inspector-tab=concrete]").click();
    await page.locator("#preview-kind").selectOption("rcBeam");
    await page.locator("#preview-create").click();
    await page.locator("#preview-run").click();
    await page.locator('[data-preview-pane="mechanics"]').click();
    const pane = page.locator("[data-testid=preview-result]");
    await expect(page.locator("[data-testid=demand-status]")).toContainText(
      "synthetic actions are illustrative",
    );
    await page.locator("#preview-target").selectOption("m1");
    await page.locator("#preview-save").click();
    await page.locator("#preview-source").selectOption("model");
    await page.locator("#analyse").click();
    await expect(page.locator("#preview-run")).toBeEnabled();
    await page.locator("#preview-run").click();
    await page.locator('[data-preview-pane="mechanics"]').click();
    await expect(
      page.locator("[data-testid=demand-moment-sagging]"),
    ).toHaveText(sagging);
    await expect(
      page.locator("[data-testid=demand-moment-hogging]"),
    ).toHaveText(hogging);
    await expect(
      page.locator("[data-testid=demand-orientation]"),
    ).toContainText(orientation);
    await expect(pane).toContainText("Model design moments · LC1");
    await expect(pane).toContainText("No utilisation ratio");
    await expect(pane).toContainText("MECHANICS ONLY");
    const capacity = await page
      .locator("[data-testid=mechanics-moment-sagging]")
      .textContent();
    await expect(pane.locator("tbody tr").first()).toContainText(capacity);
    await page.locator('[data-preview-pane="summary"]').click();
    await expect(page.locator("[data-testid=preview-state]")).toHaveText(
      "UNSUPPORTED",
    );
    expect(errors).toEqual([]);
  });
