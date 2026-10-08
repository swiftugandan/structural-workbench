import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("Member heatmap colours every member by |action| with a gradient legend", async ({
  page,
}) => {
  const p = JSON.parse(await readFile("fixtures/models/B03.json", "utf8"));
  p.loads[0].values = [10000, 5000, -10000, 1000, 0, 0];
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "heatmap.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  await expect(page.locator("#hash-status")).toHaveText(
    /^[0-9a-f]{12} · f64$/i,
  );
  const hash = await page.locator("#hash-status").textContent();
  const legend = page.locator("#action-legend");

  await page.locator("#result-family").selectOption("heatmap");
  await expect(page.locator("#display-result option")).toHaveCount(6);
  await expect(page.locator("#display-result")).toHaveValue("heatMoment");
  await expect(legend).toBeVisible();
  await expect(legend).toContainText("|My| heatmap · Analyse to display");
  await expect(page.locator(".view-legend")).toBeHidden();
  await expect(page.locator("#diagram-scale-control")).toBeHidden();

  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  // Analysis keeps the heatmap view rather than falling back to deformation.
  await expect(page.locator("#display-result")).toHaveValue("heatMoment");

  // Same peaks as the signed diagrams: the heatmap shares their global scale.
  for (const [value, name, peak] of [
    ["heatAxial", "N", 10000],
    ["heatShearY", "Vy", 5000],
    ["heatShearZ", "Vz", 10000],
    ["heatMoment", "My", 20000],
    ["heatMomentZ", "Mz", 10000],
    ["heatTorsion", "T", 1000],
  ]) {
    await page.locator("#display-result").selectOption(value);
    await expect(legend).toHaveAttribute("data-heatmap", name);
    await expect(legend).toHaveAttribute("data-component", name);
    expect(Number(await legend.getAttribute("data-peak"))).toBeCloseTo(peak, 5);
    await expect(legend.locator(".heat-bar")).toBeVisible();
    const coloured = JSON.parse(
      await page.locator("#viewport").getAttribute("data-heatmap"),
    );
    const members = Object.keys(coloured);
    expect(members.length).toBeGreaterThan(0);
    // The member carrying the model peak is labelled at full intensity.
    const levels = await page
      .locator(`[data-result-component="${name}"]`)
      .evaluateAll((els) => els.map((e) => Number(e.dataset.heatLevel)));
    expect(levels.length).toBeGreaterThan(0);
    expect(Math.max(...levels)).toBeCloseTo(1, 6);
    for (const l of levels) expect(l).toBeLessThanOrEqual(1 + 1e-12);
  }

  // Leaving the heatmap restores the ordinary legend and clears the overlay.
  await page.locator("#result-family").selectOption("shape");
  await expect(legend).toBeHidden();
  await expect(page.locator(".view-legend")).toBeVisible();
  await expect(page.locator("#viewport")).toHaveAttribute("data-heatmap", "");

  // Switching back remembers the last heatmap component; display only.
  await page.locator("#result-family").selectOption("heatmap");
  await expect(page.locator("#display-result")).toHaveValue("heatTorsion");
  await expect(page.locator("#hash-status")).toHaveText(hash);
});

test("Changing the analysis case clears the heatmap until the next analysis", async ({
  page,
}) => {
  const p = JSON.parse(await readFile("fixtures/models/B03.json", "utf8"));
  await page.goto("/");
  await page.locator("#import-file").setInputFiles({
    name: "heatmap-stale.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(p)),
  });
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  await page.locator("#result-family").selectOption("heatmap");
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await expect(page.locator("#viewport")).not.toHaveAttribute(
    "data-heatmap",
    "",
  );
  // A new case discards the result; nothing is coloured from old values.
  await page.locator("#result-case").dispatchEvent("change");
  await expect(page.locator("#action-legend")).toContainText(
    "Analyse to display",
  );
  await expect(page.locator("#viewport")).toHaveAttribute("data-heatmap", "");
});
