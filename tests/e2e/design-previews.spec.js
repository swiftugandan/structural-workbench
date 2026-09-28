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
  expect(saved.schemaVersion).toBe("1.3.0");
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
// Oracle case whose service moment each state carries (symmetric default draft).
const B08_SERVICE = {
  "15 kN·m": "RC-PREVIEW-B08-SAGGING-SERVICE",
  "30 kN·m": "RC-PREVIEW-B08-HOGGING-SERVICE",
};
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
    // M08-A5: cracked-section service stresses equal the independent oracle.
    const cases = JSON.parse(
      await readFile("fixtures/design/rc-section-mechanics/cases.json", "utf8"),
    ).cases;
    const mpa = (v) =>
      `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(v / 1e6)} MPa`;
    for (const [state, moment] of [
      ["sagging", sagging],
      ["hogging", hogging],
    ]) {
      const want = cases.find((c) => c.id === B08_SERVICE[moment]).expected
        .elastic;
      await expect(
        page.locator(`[data-testid=service-concrete-${state}]`),
      ).toHaveText(mpa(want.serviceConcreteStress));
      for (const i of [0, 1])
        await expect(
          page.locator(`[data-testid=service-steel-${state}-${i}]`),
        ).toHaveText(mpa(want.serviceSteelStress[i]));
      await expect(
        page.locator(`[data-testid=service-uncracked-${state}]`),
      ).toBeVisible();
    }
    // Both state cards fit side by side; wide layer tables scroll in-card.
    const states = page.locator(".mechanics-states");
    expect(await states.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
      true,
    );
    // M08-A6: the calculation record carries the same values exactly (SI in
    // data-si), with provenance; a synthetic re-run is never reported.
    const exportRecord = async () => {
      const download = page.waitForEvent("download");
      await menuCommand(page, "File", "Export calculation report");
      const html = await readFile(await (await download).path(), "utf8");
      expect(html).not.toContain("<script>");
      const doc = await page.context().newPage();
      await doc.setContent(html);
      return { html, doc };
    };
    const { html, doc } = await exportRecord();
    const section = doc.locator("[data-testid=report-rc-preview]");
    await expect(section).toHaveCount(1);
    await expect(section).toContainText("LC1");
    await expect(section.locator("[data-testid=report-rc-overall]")).toHaveText(
      "UNSUPPORTED",
    );
    const exact = async (locator, want) => {
      const got = Number(
        await locator.locator("[data-si]").first().getAttribute("data-si"),
      );
      expect(Math.abs(got - want)).toBeLessThanOrEqual(1e-9 * Math.abs(want));
    };
    for (const [state, moment] of [
      ["sagging", sagging],
      ["hogging", hogging],
    ]) {
      const want = cases.find((c) => c.id === B08_SERVICE[moment]).expected
        .elastic;
      const row = section.locator(`[data-state=${state}]`);
      await exact(
        row.locator("[data-testid=report-rc-demand]"),
        Number.parseFloat(moment) * 1000,
      );
      await exact(
        row.locator("[data-testid=report-rc-service-concrete]"),
        want.serviceConcreteStress,
      );
      const steel = row.locator(
        "[data-testid=report-rc-service-steel] [data-si]",
      );
      await expect(steel).toHaveCount(2);
      for (const i of [0, 1])
        expect(
          Math.abs(
            Number(await steel.nth(i).getAttribute("data-si")) -
              want.serviceSteelStress[i],
          ),
        ).toBeLessThanOrEqual(1e-9 * Math.abs(want.serviceSteelStress[i]));
    }
    expect(html).toContain("MECHANICS ONLY");
    await expect(section.locator("[data-testid=report-rc-section]")).toHaveText(
      "b 0.3 m × h 0.6 m · cover to link 0.035 m · link 0.01 m",
    );
    await expect(
      section.locator("[data-testid=report-rc-orientation-warning]"),
    ).toHaveCount(localY[1] > 0 ? 0 : 1);
    await mkdir(dir, { recursive: true });
    await writeFile(
      `${dir}/rcBeam-mechanics-record-${localY[1] > 0 ? "up" : "down"}.html`,
      html,
    );
    await doc.close();
    await expect(pane).toContainText("MECHANICS ONLY");
    const capacity = await page
      .locator("[data-testid=mechanics-moment-sagging]")
      .textContent();
    await expect(pane.locator("tbody tr").first()).toContainText(capacity);
    await page.locator('[data-preview-pane="summary"]').click();
    await expect(page.locator("[data-testid=preview-state]")).toHaveText(
      "UNSUPPORTED",
    );
    await page.locator("#preview-source").selectOption("synthetic");
    await page.locator("#preview-run").click();
    await expect(page.locator("[data-testid=preview-result]")).toContainText(
      "SYNTHETIC FIXTURE",
    );
    const synthetic = await exportRecord();
    await expect(
      synthetic.doc.locator("[data-testid=report-rc-preview]"),
    ).toHaveCount(0);
    await synthetic.doc.close();
    expect(errors).toEqual([]);
  });
test("RC beam EC2 checks: disabled-profile preview at governing stations, explicit anchorage, overall unsupported", async ({
  page,
}) => {
  // ADR 0016: the disabled ec2-uk-na profile runs at the governing sagging,
  // hogging and shear stations of B08 (fixed-fixed UDL). Expected values come
  // from the independent oracles (RC-PREVIEW-EC2-UK-DEFAULT, previewDefaultDraftUk).
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const rc = JSON.parse(
    await readFile("fixtures/design/rc-section-mechanics/cases.json", "utf8"),
  ).cases;
  const ec2 = JSON.parse(
    await readFile(
      "fixtures/design/ec2-uk-na/jrc-axis2-beam.reconciliation.json",
      "utf8",
    ),
  ).designCheckTargets.previewDefaultDraftUk;
  const fmt = (v) =>
    new Intl.NumberFormat("en-GB", {
      maximumFractionDigits: 3,
      signDisplay: "negative",
    }).format(v);
  const mu =
    rc.find((c) => c.id === "RC-PREVIEW-EC2-UK-DEFAULT").expected.ultimate
      .moment / 1000;
  const model = JSON.parse(await readFile("fixtures/models/B08.json", "utf8"));
  model.id = "preview-ec2";
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
  await expect(page.locator("#preview-linkLegs")).toHaveValue("2");
  await expect(page.locator("#preview-anchorage")).not.toBeChecked();
  await page.locator("#preview-run").click();
  await page.locator('[data-preview-pane="ec2"]').click();
  await expect(page.locator("[data-testid=ec2-status]")).toContainText(
    "Unavailable",
  );
  await page.locator("#preview-target").selectOption("m1");
  await page.locator("#preview-save").click();
  await page.locator("#preview-source").selectOption("model");
  await page.locator("#analyse").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
  await page.locator("#preview-run").click();
  await page.locator('[data-preview-pane="ec2"]').click();
  await expect(page.locator("[data-testid=ec2-banner]")).toContainText(
    "DISABLED PROFILE PREVIEW",
  );
  const stations = page.locator("[data-testid=ec2-station]");
  // B08: hogging and shear govern at the same fixed end, so two station tables.
  await expect(stations).toHaveCount(2);
  await expect(stations.nth(1)).toContainText("Governing hogging and shear");
  const row = (role, id) =>
    page.locator(
      `[data-testid=ec2-check][data-roles~="${role}"][data-check-id="${id}"]`,
    );
  for (const role of ["sagging", "hogging"]) {
    await expect(
      row(role, "ec2.flexure").locator("[data-testid=ec2-resistance]"),
    ).toHaveText(`${fmt(mu)} kN·m`);
    await expect(row(role, "ec2.flexure")).toContainText("PASS");
  }
  await expect(
    row("shear", "ec2.shear").locator("[data-testid=ec2-resistance]"),
  ).toHaveText(`${fmt(ec2.shearWithLinks.VRd_kN)} kN`);
  await expect(page.locator("[data-testid=ec2-anchorage]")).toHaveText(
    "not confirmed (ρl = 0)",
  );
  for (const overall of await page.locator("[data-testid=ec2-overall]").all())
    await expect(overall).toHaveText("UNSUPPORTED");
  await expect(row("shear", "ec2.anchorage")).toContainText("UNSUPPORTED");
  // Confirming anchorage is an explicit, persisted user choice.
  await page.locator("#preview-anchorage").check();
  await page.locator("#preview-save").click();
  await page.locator("#analyse").click();
  await expect(page.locator("#preview-run")).toBeEnabled();
  await page.locator("#preview-run").click();
  await page.locator('[data-preview-pane="ec2"]').click();
  await expect(page.locator("[data-testid=ec2-anchorage]")).toHaveText(
    "confirmed by you",
  );
  // M08-B4: the calculation record carries the same checks, labelled as a
  // disabled-profile preview, with exact SI values.
  const reportDownload = page.waitForEvent("download");
  await menuCommand(page, "File", "Export calculation report");
  const html = await readFile(await (await reportDownload).path(), "utf8");
  expect(html).not.toContain("<script>");
  const doc = await page.context().newPage();
  await doc.setContent(html);
  await expect(doc.locator("[data-testid=report-ec2-banner]")).toContainText(
    "DISABLED PROFILE PREVIEW",
  );
  await expect(doc.locator("[data-testid=report-ec2-anchorage]")).toHaveText(
    "confirmed by the user",
  );
  const si = async (role, id, field) =>
    Number(
      await doc
        .locator(
          `[data-testid=report-ec2-check][data-roles~="${role}"][data-check-id="${id}"] [data-testid=report-ec2-${field}] [data-si]`,
        )
        .getAttribute("data-si"),
    );
  for (const role of ["sagging", "hogging"])
    expect(
      Math.abs((await si(role, "ec2.flexure", "resistance")) - mu * 1000),
    ).toBeLessThanOrEqual(1e-9 * mu * 1000);
  const vrd = ec2.shearWithLinks.VRd_kN * 1000;
  expect(
    Math.abs((await si("shear", "ec2.shear", "resistance")) - vrd),
  ).toBeLessThanOrEqual(1e-5 * vrd);
  expect(await si("shear", "ec2.shear", "demand")).toBeCloseTo(30000, 6);
  await expect(
    doc
      .locator('[data-testid=report-ec2-check][data-check-id="ec2.amendments"]')
      .first(),
  ).toContainText("UNSUPPORTED");
  await doc.close();
  await page.locator('[data-preview-pane="summary"]').click();
  await expect(page.locator("[data-testid=preview-state]")).toHaveText(
    "UNSUPPORTED",
  );
  const download = page.waitForEvent("download");
  await menuCommand(page, "File", "Download project");
  const saved = JSON.parse(
    await readFile(await (await download).path(), "utf8"),
  );
  expect(saved.schemaVersion).toBe("1.3.0");
  expect(saved.designPreviews[0].tensionAnchorageConfirmed).toBe(true);
  expect(saved.designPreviews[0].inputs.linkLegs).toBe(2);
  expect(errors).toEqual([]);
});
