import { test, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
const dir = "evidence/design-fidelity";
async function open(page) {
  const model = JSON.parse(await readFile("fixtures/models/B04.json", "utf8"));
  model.id = "design-fidelity";
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "design.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(model)),
  });
  await expect(page.locator("#kernel-status")).toContainText("ready");
}
for (const kind of ["rcBeam", "slab", "padFooting"])
  test(`Mockup layout ${kind}: 3D focus, drawings, details, source and preserved model`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await open(page);
    await page.locator("[data-inspector-tab=concrete]").click();
    await page.locator("#preview-kind").selectOption(kind);
    await page.locator("#preview-create").click();
    await expect(page.locator("#preview-run")).toBeEnabled();
    await expect(page.locator("#view-3d")).toHaveClass(/active/);
    const hash = await page.locator("#hash-status").textContent();
    const before = await page.locator("#viewport").screenshot();
    await page.locator("[data-object-display=reinforcement]").click();
    const after = await page.locator("#viewport").screenshot();
    expect(before.equals(after)).toBe(false);
    await page.locator("[data-object-display=both]").click();
    await page.locator("#preview-run").click();
    await expect(page.locator("[data-testid=preview-state]")).toHaveText(
      "UNSUPPORTED",
    );
    await expect(
      page.locator("#concrete-inspector .design-section"),
    ).toHaveCount(5);
    await expect(page.locator("[data-testid=preview-result] pre")).toHaveCount(
      0,
    );
    await page.locator("[data-preview-pane=details]").click();
    await expect(page.locator(".calculation-layout")).toContainText(
      "UNSUPPORTED",
    );
    await page.locator('[data-preview-check="1"]').click();
    await expect(page.locator(".calculation-layout article")).toContainText(
      kind === "rcBeam"
        ? "Shear"
        : kind === "slab"
          ? "Bottom X/Y reinforcement"
          : "Bearing",
    );
    await page.locator("[data-preview-pane=reinforcement]").click();
    await expect(page.locator(".reinforcement-layout")).toContainText(
      "illustration",
    );
    await mkdir(dir, { recursive: true });
    await page
      .locator("#concrete-inspector")
      .evaluate((e) => (e.scrollTop = 0));
    await page.screenshot({ path: `${dir}/${kind}-reinforcement.png` });
    await page.locator("[data-preview-pane=schedule]").click();
    await expect(page.locator(".design-pane")).toContainText(
      kind === "rcBeam" ? "Unverified" : "unavailable",
    );
    if (kind === "padFooting") {
      await page.locator("[data-preview-pane=soil]").click();
      await expect(page.locator(".design-pane")).toContainText("INDETERMINATE");
      await expect(page.locator(".design-pane")).toContainText(
        "Not calculated",
      );
    }
    if (kind === "slab") {
      // Slabs solve their own panel by default (ADR 0021); plate analysis
      // stages are results, not checks.
      await page.locator("[data-preview-pane=actions]").click();
      await expect(page.locator("[data-testid=plate-pane]")).toContainText(
        "Governing design moments",
      );
      await expect(page.locator("[data-testid=plate-pane]")).toContainText(
        "Mesh convergence",
      );
    }
    await expect(page.locator("#hash-status")).toHaveText(hash);
    await page.locator("[data-inspector-tab=properties]").click();
    await expect(page.locator("#design-preview-scene")).not.toBeVisible();
    await expect(page.locator("#view-elevation")).toHaveClass(/active/);
    expect(errors).toEqual([]);
  });
test("Steel mockup: section card, catalogue, readiness, calculation tree and provenance", async ({
  page,
}) => {
  await open(page);
  await page.locator("[data-inspector-tab=steel]").click();
  await page
    .locator("#design-section")
    .selectOption("aisc-shapes-v16.0-subset-1:W18X50");
  await expect(page.locator(".steel-section-card")).toContainText("W18X50");
  await page.locator("#design-assign").click();
  await expect(page.locator("#design-save")).toBeEnabled();
  for (const [key, value] of Object.entries({
    ky: "1",
    kz: "1",
    lb: "0",
    cb: "1",
  }))
    await page.locator(`#design-${key}`).fill(value);
  await page.locator("#design-bracing").selectOption("continuous");
  await page.locator("#design-basis").check();
  await page.locator("#design-save").click();
  await page.locator("#analyse").click();
  await expect(page.locator("#design-run")).toBeEnabled();
  await page.locator("#design-run").click();
  await expect(page.locator("[data-testid=steel-overall]")).toHaveText("pass");
  await page.locator("[data-steel-pane=details]").click();
  await expect(page.locator(".calculation-layout")).toContainText("Mp");
  await page.locator('[data-steel-check="1"]').click();
  await expect(page.locator(".calculation-layout")).toContainText("Resistance");
  await page.locator("[data-steel-pane=provenance]").click();
  await page.locator(".design-provenance summary").click();
  await expect(page.locator("[data-steel-view=provenance]")).toContainText(
    "Catalogue source",
  );
  await page.locator("[data-steel-pane=summary]").click();
  await page.locator("#view-3d").click();
  await page
    .locator("#steel-design-inspector")
    .evaluate((e) => (e.scrollTop = 0));
  await page.screenshot({ path: `${dir}/steel-member.png` });
});
