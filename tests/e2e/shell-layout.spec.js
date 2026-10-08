import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceDir } from "../../tools/evidence.mjs";

/** ADR 0033: the workspace shell fits, resizes and keeps every view reachable. */
const dir = evidenceDir("evidence/shell-layout");

async function workspace(page) {
  await page.goto("/");
  await page.locator("#new-project").click();
  await expect(page.locator("#kernel-status")).toContainText("ready");
}

/** Elements whose content is wider than their box and not scrollable by design. */
function clipped(page) {
  return page.evaluate(() =>
    [
      "#ribbon-content",
      ".viewport-toolbar",
      ".projectbar",
      ".statusbar",
      ".results-trailing",
    ]
      .map((sel) => {
        const el = document.querySelector(sel);
        return el && el.scrollWidth > el.clientWidth + 1 ? sel : null;
      })
      .filter(Boolean),
  );
}

test("Nothing in the shell is clipped at 1280, 1440 and 1920 px", async ({
  page,
}) => {
  const seen = {};
  for (const [w, h] of [
    [1280, 800],
    [1440, 900],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await workspace(page);
    await page.locator("#analyse").click();
    await expect(page.locator("#result-status")).toContainText("Current");
    await page.waitForTimeout(200); // the ribbon fits on the next frame
    expect(await clipped(page), `clipped at ${w}px`).toEqual([]);
    // Every ribbon command stays visible and named, labelled or not.
    for (const b of await page.locator("#ribbon-content button").all()) {
      await expect(b).toBeVisible();
      expect((await b.textContent()).trim().length).toBeGreaterThan(0);
    }
    // One toolbar row above the canvas.
    const bar = await page.locator(".viewport-toolbar").boundingBox();
    expect(bar.height, `toolbar height at ${w}px`).toBeLessThanOrEqual(44);
    const canvas = await page.locator("#viewport").boundingBox();
    seen[w] = { toolbar: bar.height, canvas: [canvas.width, canvas.height] };
    // The canvas gets most of the height.
    expect(canvas.height / h, `canvas share at ${w}px`).toBeGreaterThan(0.4);
  }
  await mkdir(dir, { recursive: true });
  await writeFile(
    `${dir}/shell-fit.json`,
    JSON.stringify({ check: "shell-fit", status: "PASS", seen }, null, 2) +
      "\n",
  );
});

test("Splitters resize by keyboard, persist per viewer and restore defaults", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await workspace(page);
  // The dock (and its splitter) opens with results.
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toContainText("Current");
  if (
    (await page.locator("#toggle-results").getAttribute("aria-expanded")) ===
    "false"
  )
    await page.locator("#toggle-results").click();
  const explorer = page.getByRole("separator", {
    name: "Model explorer width",
  });
  const before = (await page.locator(".model-panel").boundingBox()).width;
  await explorer.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  const wider = (await page.locator(".model-panel").boundingBox()).width;
  expect(Math.round(wider - before)).toBe(80);
  await expect(explorer).toHaveAttribute(
    "aria-valuenow",
    String(Math.round(wider)),
  );
  const dock = page.getByRole("separator", { name: "Results panel height" });
  const dockBefore = (await page.locator(".results-panel").boundingBox())
    .height;
  await dock.focus();
  await page.keyboard.press("Shift+ArrowUp");
  const dockAfter = (await page.locator(".results-panel").boundingBox()).height;
  expect(Math.round(dockAfter - dockBefore)).toBe(64);
  // Sizes survive a reload; double-click restores the stylesheet default.
  await page.reload();
  await page.locator("#new-project").click();
  await expect(page.locator("#kernel-status")).toContainText("ready");
  expect(
    Math.round((await page.locator(".model-panel").boundingBox()).width),
  ).toBe(Math.round(wider));
  await page
    .getByRole("separator", { name: "Model explorer width" })
    .dblclick();
  expect(
    Math.round((await page.locator(".model-panel").boundingBox()).width),
  ).toBe(Math.round(before));
});

test("Every result view stays reachable when the dock tabs overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await workspace(page);
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toContainText("Current");
  const strip = page.locator(".results-tabs .tab-strip");
  await expect(strip).toHaveAttribute("data-overflowing", "");
  // The More menu lists every tab and selects one without moving it.
  await strip.locator(".tab-more").click();
  const menu = page.getByRole("menu", { name: "result views" });
  await expect(menu.getByRole("menuitemradio")).toHaveCount(13);
  await menu.getByRole("menuitemradio", { name: "Model steel review" }).click();
  await expect(page.locator('[data-tab="steel-overview"]')).toHaveClass(
    /active/,
  );
  await expect(page.locator('[data-tab="steel-overview"]')).toBeInViewport();
  // Keyboard: Escape closes the menu and returns focus to its button.
  await strip.locator(".tab-more").click();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(strip.locator(".tab-more")).toBeFocused();
});

test("Messages can be dismissed; the visibility filter shows on the toolbar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await workspace(page);
  await page.locator("#view-scope > summary").click();
  await expect(page.locator("#view-storey")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#view-storey")).toBeHidden();
  await expect(page.locator("#view-scope > summary")).toBeFocused();
  // Hide the selected member: the toolbar shows the filtered count.
  await page.locator("#view-scope > summary").click();
  await page.locator("#hide-selection").click();
  await expect(page.locator("#view-scope-badge")).toHaveText("0/1");
  await page.locator("#show-all-model").click();
  await expect(page.locator("#view-scope-badge")).toHaveText("");
  // A refused action explains itself and can be dismissed.
  await page.evaluate(() => {
    document.querySelector("#message-text").textContent = "Test notice";
    document.querySelector("#message").hidden = false;
  });
  await page.locator("#dismiss-message").click();
  await expect(page.locator("#message")).toBeHidden();
});
