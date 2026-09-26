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
    await expect(page.locator("#preview-active option")).toHaveCount(1);
    await expect(page.locator(`#preview-${key}`)).toHaveValue(
      kind === "rcBeam" ? "600" : kind === "slab" ? "225" : "550",
    );
    expect(errors).toEqual([]);
  });
