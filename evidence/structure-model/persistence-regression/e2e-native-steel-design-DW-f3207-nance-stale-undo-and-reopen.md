# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/native-steel-design.spec.js >> DW-E/F: model-native catalogue, check, provenance, stale, undo and reopen
- Location: tests/e2e/native-steel-design.spec.js:43:1

# Error details

```
Error: expect(locator).toBeEnabled() failed

Locator:  locator('#design-save')
Expected: enabled
Received: disabled
Timeout:  5000ms

Call log:
  - Expect "toBeEnabled" locator('#design-save') with timeout 5000ms
  - waiting for locator('#design-save')
    13 × locator resolved to <button disabled id="design-save">Save design inputs</button>
       - unexpected value "disabled"

```

```yaml
- button "Save design inputs" [disabled]
```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | import { readFile, mkdir, writeFile } from "node:fs/promises";
  3   | import { menuCommand } from "../menu-helpers.js";
  4   | 
  5   | async function openModel(page, load = 10000) {
  6   |   const model = JSON.parse(await readFile("fixtures/models/B04.json", "utf8"));
  7   |   model.id = "native-steel-test";
  8   |   model.loads[0].values = [0, load, 0, 0, 0, 0];
  9   |   await page.goto("/");
  10  |   await page.locator("#import-file").setInputFiles({
  11  |     name: "steel-input.json",
  12  |     mimeType: "application/json",
  13  |     buffer: Buffer.from(JSON.stringify(model)),
  14  |   });
  15  |   await expect(page.locator("#kernel-status")).toContainText("ready");
  16  |   await page.locator("[data-inspector-tab='steel']").click();
  17  |   await expect(page.locator("[data-testid='design-readiness']")).toHaveText(
  18  |     "INCOMPLETE",
  19  |   );
  20  |   await page
  21  |     .locator("#design-section")
  22  |     .selectOption("aisc-shapes-v16.0-subset-1:W18X50");
  23  |   await page.locator("#design-assign").click();
> 24  |   await expect(page.locator("#design-save")).toBeEnabled();
      |                                              ^ Error: expect(locator).toBeEnabled() failed
  25  |   for (const [key, value] of Object.entries({
  26  |     ky: "1",
  27  |     kz: "1",
  28  |     lb: "0",
  29  |     cb: "1",
  30  |   }))
  31  |     await page.locator(`#design-${key}`).fill(value);
  32  |   await page.locator("#design-bracing").selectOption("continuous");
  33  |   await page.locator("#design-basis").check();
  34  |   await page.locator("#design-save").click();
  35  |   await expect(page.locator("[data-testid='design-readiness']")).toHaveText(
  36  |     "READY",
  37  |   );
  38  |   await expect(page.locator("#design-run")).toBeDisabled();
  39  |   await page.locator("#analyse").click();
  40  |   await expect(page.locator("#design-run")).toBeEnabled();
  41  | }
  42  | 
  43  | test("DW-E/F: model-native catalogue, check, provenance, stale, undo and reopen", async ({
  44  |   page,
  45  | }, info) => {
  46  |   const errors = [];
  47  |   page.on("pageerror", (e) => errors.push(e.message));
  48  |   await openModel(page);
  49  |   await page.locator("#design-run").click();
  50  |   await expect(page.locator("[data-testid='native-design-state']")).toHaveText(
  51  |     "PASS",
  52  |   );
  53  |   await expect(page.locator("#modal")).not.toBeVisible();
  54  |   const result = page.locator("[data-testid='native-design-result']");
  55  |   await expect(result.locator("[data-testid='steel-overall']")).toHaveText(
  56  |     "pass",
  57  |   );
  58  |   await expect(result.locator("[data-check-id='flexure']")).toContainText(
  59  |     "30.0 kN·m",
  60  |   );
  61  |   await page.locator("#design-why").click();
  62  |   await expect(
  63  |     page.locator("[data-testid='design-governing-marker']"),
  64  |   ).toContainText("x/L 0.000");
  65  |   const recordDownload = page.waitForEvent("download");
  66  |   await page.locator("#design-download").click();
  67  |   const record = JSON.parse(
  68  |     await readFile(await (await recordDownload).path(), "utf8"),
  69  |   );
  70  |   expect(record.source).toBe("modelNative");
  71  |   expect(record.mock).toBe(false);
  72  |   expect(record.resultId).toBeTruthy();
  73  |   expect(record.checks.find((c) => c.checkId === "flexure").demand).toBeCloseTo(
  74  |     30000,
  75  |     6,
  76  |   );
  77  |   expect(
  78  |     record.checks.find((c) => c.checkId === "flexure").resistance /
  79  |       1355.8179483314,
  80  |   ).toBeCloseTo(378.75, 1);
  81  |   await page.locator("#design-ky").fill("1.2");
  82  |   await expect(result.locator("[data-testid='steel-overall']")).toHaveText(
  83  |     "stale",
  84  |   );
  85  |   await expect(page.locator("#export-report")).toBeDisabled();
  86  |   await page.locator("#design-save").click();
  87  |   await expect(page.locator("[data-testid='native-design-state']")).toHaveText(
  88  |     "STALE",
  89  |   );
  90  |   await page.locator("#undo").click();
  91  |   await expect(page.locator("#design-ky")).toHaveValue("1");
  92  |   await expect(page.locator("[data-testid='native-design-state']")).toHaveText(
  93  |     "PASS",
  94  |   );
  95  |   const reportDownload = page.waitForEvent("download");
  96  |   await menuCommand(page, "File", "Export calculation report");
  97  |   const html = await readFile(await (await reportDownload).path(), "utf8");
  98  |   expect(html).toContain(record.designRunId);
  99  |   expect(html).toContain(record.designSettingsHash);
  100 |   const projectDownload = page.waitForEvent("download");
  101 |   await menuCommand(page, "File", "Download project");
  102 |   const saved = await readFile(await (await projectDownload).path());
  103 |   await page.locator("#import-file").setInputFiles({
  104 |     name: "reopen.json",
  105 |     mimeType: "application/json",
  106 |     buffer: saved,
  107 |   });
  108 |   await expect(page.locator("#design-ky")).toHaveValue("1");
  109 |   await expect(page.locator("[data-testid='design-readiness']")).toHaveText(
  110 |     "READY",
  111 |   );
  112 |   await page.locator("#analyse").click();
  113 |   await expect(page.locator("#design-run")).toBeEnabled();
  114 |   await page.locator("#design-run").click();
  115 |   await expect(page.locator("[data-testid='native-design-state']")).toHaveText(
  116 |     "PASS",
  117 |   );
  118 |   await mkdir("evidence/M07/native-inputs", { recursive: true });
  119 |   await page.screenshot({
  120 |     path: "evidence/M07/native-inputs/member-steel-pass.png",
  121 |     fullPage: true,
  122 |   });
  123 |   await writeFile(
  124 |     "evidence/M07/native-inputs/design-run.json",
```