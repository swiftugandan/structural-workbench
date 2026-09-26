# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/structure-model.spec.js >> Authored structure survives save, undo, topology and reopen; invalid bindings fail closed
- Location: tests/e2e/structure-model.spec.js:9:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  locator('#model-count')
Expected: "3 nodes · 2 members"
Received: "2 nodes · 1 members"
Timeout:  5000ms

Call log:
  - Expect "toHaveText" locator('#model-count') with timeout 5000ms
  - waiting for locator('#model-count')
    2 × locator resolved to <small id="model-count"></small>
      - unexpected value ""
    12 × locator resolved to <small id="model-count">2 nodes · 1 members</small>
       - unexpected value "2 nodes · 1 members"

```

```yaml
- text: 2 nodes · 1 members
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import { readFile, mkdir, writeFile } from "node:fs/promises";
  3  | import { menuCommand } from "../menu-helpers.js";
  4  | async function exported(page) {
  5  |   const pending = page.waitForEvent("download");
  6  |   await menuCommand(page, "File", "Download project");
  7  |   return JSON.parse(await readFile(await (await pending).path(), "utf8"));
  8  | }
  9  | test("Authored structure survives save, undo, topology and reopen; invalid bindings fail closed", async ({
  10 |   page,
  11 | }) => {
  12 |   const errors = [];
  13 |   page.on("pageerror", (e) => errors.push(e.message));
  14 |   await page.goto("/");
  15 |   await page.locator("#import-file").setInputFiles("fixtures/models/B07.json");
  16 |   await expect(page.locator("#model-count")).toHaveText("2 nodes · 1 members");
  17 |   await page.locator("#analyse").click();
  18 |   await expect(page.locator("#result-status")).toHaveText("✓ Current");
  19 |   const original = await exported(page);
  20 |   expect(original.schemaVersion).toBe("1.1.0");
  21 |   const owner = original.structure.physicalMembers[0];
  22 |   await page.locator("[data-structure-add=storeys]").click();
  23 |   await page.locator("#structure-form [name=name]").fill("Level 1");
  24 |   await page.locator("#structure-form [name=elevation]").fill("3000 mm");
  25 |   await page.locator("#structure-form button.primary").click();
  26 |   await page.locator(`[data-structure-id="${owner.id}"]`).click();
  27 |   await page.locator("#structure-form [name=role]").selectOption("beam");
  28 |   await page
  29 |     .locator("#structure-form [name=storeyId]")
  30 |     .selectOption({ label: "Level 1" });
  31 |   await page.locator("#structure-form [name=name]").fill("Beam B01");
  32 |   await page.locator("#structure-form button.primary").click();
  33 |   await expect(page.locator("#result-status")).toHaveText("✓ Current");
  34 |   await page.locator("[data-branch=layers] > summary").click();
  35 |   await page.locator("[data-structure-add=layers]").click();
  36 |   await page.locator("#structure-form [name=name]").fill("Primary framing");
  37 |   await page
  38 |     .locator(`#structure-form [value="physicalMember:${owner.id}"]`)
  39 |     .check();
  40 |   await page.locator("#structure-form button.primary").click();
  41 |   await page.locator("[data-branch=grids] > summary").click();
  42 |   await page.locator("[data-structure-add=grids]").click();
  43 |   await page.locator("#structure-form [name=name]").fill("Grid A");
  44 |   await page.locator("#structure-form [name=end0]").fill("8000 mm");
  45 |   await page.locator("#structure-form button.primary").click();
  46 |   let authored = await exported(page);
  47 |   expect(authored.structure.grids[0].end).toEqual([8, 0, 0]);
  48 |   expect(authored.structure.layers[0].members).toEqual([
  49 |     { kind: "physicalMember", id: owner.id },
  50 |   ]);
  51 |   await page.locator("[data-structure-key=storeys]").click();
  52 |   await page.locator("#structure-delete").click();
  53 |   await expect(page.locator("#structure-error")).toContainText("storey");
  54 |   await page.locator("#structure-cancel").click();
  55 |   await page.locator("[data-member=m1]").click();
  56 |   await page.locator("#topology").click();
  57 |   await page.locator("#split-stations").fill("0.5");
  58 |   await page
  59 |     .getByRole("button", { name: "Preview topology", exact: true })
  60 |     .click();
  61 |   await page.locator("#topology-commit").click();
  62 |   await expect(page.locator("#model-count")).toHaveText("3 nodes · 2 members");
  63 |   await expect(page.locator("#result-status")).toContainText("Stale");
  64 |   const split = await exported(page);
  65 |   expect(split.structure.physicalMembers[0]).toMatchObject({
  66 |     id: owner.id,
  67 |     name: "Beam B01",
  68 |     role: "beam",
  69 |   });
  70 |   expect(split.structure.physicalMembers[0].analyticalMemberIds).toHaveLength(
  71 |     2,
  72 |   );
  73 |   expect(split.structure.joints).toHaveLength(3);
  74 |   await page.locator("#undo").click();
  75 |   expect((await exported(page)).structure).toEqual(authored.structure);
  76 |   await page.locator("#redo").click();
  77 |   await page.reload();
  78 |   await page.locator("#recent-projects .recent-row").first().click();
> 79 |   await expect(page.locator("#model-count")).toHaveText("3 nodes · 2 members");
     |                                              ^ Error: expect(locator).toHaveText(expected) failed
  80 |   expect((await exported(page)).structure).toEqual(split.structure);
  81 |   await page.locator("#explorer-expand").click();
  82 |   await page.locator(`[data-structure-id="${owner.id}"]`).click();
  83 |   await page.locator("#view-3d").click();
  84 |   expect(
  85 |     await page
  86 |       .locator("#inspector-content")
  87 |       .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  88 |   ).toBe(true);
  89 | 
  90 |   await mkdir("evidence/structure-model", { recursive: true });
  91 |   await page.screenshot({ path: "evidence/structure-model/authored-tree.png" });
  92 |   await writeFile(
  93 |     "evidence/structure-model/project.json",
  94 |     JSON.stringify(await exported(page), null, 2),
  95 |   );
  96 |   expect(errors).toEqual([]);
  97 | });
  98 | 
```