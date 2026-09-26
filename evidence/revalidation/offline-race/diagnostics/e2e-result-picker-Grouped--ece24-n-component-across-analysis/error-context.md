# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/result-picker.spec.js >> Grouped results expose all six actions and retain component across analysis
- Location: tests/e2e/result-picker.spec.js:3:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  locator('#hash-status')
Expected: "SI geometry · f64 precision"
Received: "550959d365b5 · f64"
Timeout:  5000ms

Call log:
  - Expect "toHaveText" locator('#hash-status') with timeout 5000ms
  - waiting for locator('#hash-status')
    14 × locator resolved to <span id="hash-status">550959d365b5 · f64</span>
       - unexpected value "550959d365b5 · f64"

```

```yaml
- text: 550959d365b5 · f64
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import { readFile } from "node:fs/promises";
  3  | test("Grouped results expose all six actions and retain component across analysis", async ({
  4  |   page,
  5  | }) => {
  6  |   const p = JSON.parse(await readFile("fixtures/models/B03.json", "utf8"));
  7  |   p.loads[0].values = [10000, 5000, -10000, 1000, 0, 0];
  8  |   await page.goto("/");
  9  |   await page
  10 |     .locator("#import-file")
  11 |     .setInputFiles({
  12 |       name: "components.json",
  13 |       mimeType: "application/json",
  14 |       buffer: Buffer.from(JSON.stringify(p)),
  15 |     });
  16 |   await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  17 |   const hash = await page.locator("#hash-status").textContent();
  18 |   await page.locator("#result-family").selectOption("moments");
  19 |   await page.locator("#display-result").selectOption("momentZ");
  20 |   await expect(page.locator("#action-legend")).toContainText(
  21 |     "Analyse to display",
  22 |   );
  23 |   await page.locator("#analyse").click();
  24 |   await expect(page.locator("#result-status")).toHaveText("✓ Current");
  25 |   await expect(page.locator("#display-result")).toHaveValue("momentZ");
  26 |   for (const [family, value, name, peak] of [
  27 |     ["forces", "axial", "N", 10000],
  28 |     ["forces", "shearY", "Vy", 5000],
  29 |     ["forces", "shearZ", "Vz", 10000],
  30 |     ["moments", "moment", "My", 20000],
  31 |     ["moments", "momentZ", "Mz", 10000],
  32 |     ["moments", "torsion", "T", 1000],
  33 |   ]) {
  34 |     await page.locator("#result-family").selectOption(family);
  35 |     await expect(page.locator("#display-result option")).toHaveCount(3);
  36 |     await page.locator("#display-result").selectOption(value);
  37 |     await expect(page.locator("#action-legend")).toHaveAttribute(
  38 |       "data-component",
  39 |       name,
  40 |     );
  41 |     const actual = Number(
  42 |       await page.locator("#action-legend").getAttribute("data-peak"),
  43 |     );
  44 |     expect(actual).toBeCloseTo(peak, 5);
  45 |     await expect(
  46 |       page.locator(`[data-result-component="${name}"]`).first(),
  47 |     ).toBeVisible();
  48 |   }
  49 |   await page.locator("#result-family").selectOption("forces");
  50 |   await expect(page.locator("#display-result")).toHaveValue("shearZ");
  51 |   await page.locator("#result-family").selectOption("moments");
  52 |   await expect(page.locator("#display-result")).toHaveValue("torsion");
  53 |   await page.locator("#analyse").click();
  54 |   await expect(page.locator("#result-status")).toHaveText("✓ Current");
  55 |   await expect(page.locator("#display-result")).toHaveValue("torsion");
> 56 |   await expect(page.locator("#hash-status")).toHaveText(hash);
     |                                              ^ Error: expect(locator).toHaveText(expected) failed
  57 | });
  58 | 
```