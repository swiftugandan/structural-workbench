import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("Grouped results expose all six actions and retain component across analysis", async ({
  page,
}) => {
  const p = JSON.parse(await readFile("fixtures/models/B03.json", "utf8"));
  p.loads[0].values = [10000, 5000, -10000, 1000, 0, 0];
  await page.goto("/");
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "components.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
  await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  const hash = await page.locator("#hash-status").textContent();
  await page.locator("#result-family").selectOption("moments");
  await page.locator("#display-result").selectOption("momentZ");
  await expect(page.locator("#action-legend")).toContainText(
    "Analyse to display",
  );
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await expect(page.locator("#display-result")).toHaveValue("momentZ");
  for (const [family, value, name, peak] of [
    ["forces", "axial", "N", 10000],
    ["forces", "shearY", "Vy", 5000],
    ["forces", "shearZ", "Vz", 10000],
    ["moments", "moment", "My", 20000],
    ["moments", "momentZ", "Mz", 10000],
    ["moments", "torsion", "T", 1000],
  ]) {
    await page.locator("#result-family").selectOption(family);
    await expect(page.locator("#display-result option")).toHaveCount(3);
    await page.locator("#display-result").selectOption(value);
    await expect(page.locator("#action-legend")).toHaveAttribute(
      "data-component",
      name,
    );
    const actual = Number(
      await page.locator("#action-legend").getAttribute("data-peak"),
    );
    expect(actual).toBeCloseTo(peak, 5);
    await expect(
      page.locator(`[data-result-component="${name}"]`).first(),
    ).toBeVisible();
  }
  await page.locator("#result-family").selectOption("forces");
  await expect(page.locator("#display-result")).toHaveValue("shearZ");
  await page.locator("#result-family").selectOption("moments");
  await expect(page.locator("#display-result")).toHaveValue("torsion");
  await page.locator("#analyse").click();
  await expect(page.locator("#result-status")).toHaveText("✓ Current");
  await expect(page.locator("#display-result")).toHaveValue("torsion");
  await expect(page.locator("#hash-status")).toHaveText(hash);
});
