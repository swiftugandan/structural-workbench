# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/reliability.spec.js >> M04 reliability matrix >> model Worker crash restores last confirmed in-memory model
- Location: tests/e2e/reliability.spec.js:89:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('#message')
Expected pattern: /Model Worker stopped|Restored the last confirmed/i
Received string:  "REVISION_CONFLICT: Model changed; reload the current snapshot"
Timeout: 5000ms

Call log:
  - Expect "toContainText" locator('#message') with timeout 5000ms
  - waiting for locator('#message')
    14 × locator resolved to <div id="message" role="status" aria-live="polite">REVISION_CONFLICT: Model changed; reload the curr…</div>
       - unexpected value "REVISION_CONFLICT: Model changed; reload the current snapshot"

```

```yaml
- status: "REVISION_CONFLICT: Model changed; reload the current snapshot"
```

# Test source

```ts
  13  |     page,
  14  |   }) => {
  15  |     await mkdir(evidence(), { recursive: true });
  16  |     const errors = [];
  17  |     page.on("pageerror", (e) => errors.push(e.message));
  18  | 
  19  |     await page.goto("/");
  20  |     await page.locator("#new-project").click();
  21  |     await expect(page.locator("#save-status")).toHaveText("Saved locally", {
  22  |       timeout: 10000,
  23  |     });
  24  |     const firstHash = await page.locator("#hash-status").textContent();
  25  |     const firstRev = await page.locator("#revision").textContent();
  26  | 
  27  |     await page.locator("#inspector-content input").first().fill("210");
  28  |     await page
  29  |       .locator("#inspector-content")
  30  |       .getByRole("button", { name: "Apply changes", exact: true })
  31  |       .click();
  32  |     await expect(page.locator("#save-status")).toHaveText("Saved locally", {
  33  |       timeout: 10000,
  34  |     });
  35  |     await expect(page.locator("#hash-status")).not.toHaveText(firstHash);
  36  |     const secondHash = await page.locator("#hash-status").textContent();
  37  |     const projectId = await page.evaluate(async () => {
  38  |       const db = await new Promise((resolve, reject) => {
  39  |         const req = indexedDB.open("structural-workbench");
  40  |         req.onerror = () => reject(req.error);
  41  |         req.onsuccess = () => resolve(req.result);
  42  |       });
  43  |       const rows = await new Promise((resolve, reject) => {
  44  |         const tx = db.transaction("projects");
  45  |         const r = tx.objectStore("projects").getAll();
  46  |         r.onsuccess = () => resolve(r.result);
  47  |         r.onerror = () => reject(r.error);
  48  |       });
  49  |       return rows[0].id;
  50  |     });
  51  | 
  52  |     // Corrupt only the projects pointer; history keeps verified revisions.
  53  |     await page.evaluate(async (id) => {
  54  |       const db = await new Promise((resolve, reject) => {
  55  |         const req = indexedDB.open("structural-workbench");
  56  |         req.onerror = () => reject(req.error);
  57  |         req.onsuccess = () => resolve(req.result);
  58  |       });
  59  |       await new Promise((resolve, reject) => {
  60  |         const tx = db.transaction("projects", "readwrite");
  61  |         tx.objectStore("projects").put({
  62  |           id,
  63  |           updated: Date.now(),
  64  |           project: { id, name: "Corrupt", revision: 99, broken: true },
  65  |         });
  66  |         tx.oncomplete = resolve;
  67  |         tx.onerror = () => reject(tx.error);
  68  |       });
  69  |     }, projectId);
  70  | 
  71  |     await page.goto("/");
  72  |     await expect(page.locator(".recent-row")).toContainText(/recovered r/i);
  73  |     await page.locator(".recent-row").first().click();
  74  |     await expect(page.locator("#workspace")).toBeVisible();
  75  |     await expect(page.locator("#message")).toContainText(
  76  |       /Latest snapshot was corrupt|Restored verified revision/i,
  77  |     );
  78  |     await expect(page.locator("#hash-status")).toHaveText(secondHash);
  79  |     expect(firstRev).not.toBe("");
  80  | 
  81  |     expect(errors).toEqual([]);
  82  |     await record("corrupt-snapshot-recovery", {
  83  |       status: "PASS",
  84  |       projectId,
  85  |       restoredHashPrefix: secondHash?.slice(0, 12),
  86  |     });
  87  |   });
  88  | 
  89  | test("model Worker crash restores last confirmed in-memory model", async ({
  90  |   page,
  91  |   context,
  92  | }) => {
  93  |   // Avoid a stale service-worker controlling the page during Worker respawn.
  94  |   await context.addInitScript(() => {
  95  |     navigator.serviceWorker
  96  |       ?.getRegistrations?.()
  97  |       .then((regs) => regs.forEach((r) => r.unregister()));
  98  |   });
  99  |   await page.goto("/");
  100 |   await page.evaluate(async () => {
  101 |     const regs = await navigator.serviceWorker?.getRegistrations?.();
  102 |     if (regs) await Promise.all(regs.map((r) => r.unregister()));
  103 |   });
  104 |   await page.locator("#new-project").click();
  105 |   await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  106 |   await page.locator("#analyse").click();
  107 |   await expect(page.locator("#result-status")).toHaveText("✓ Current");
  108 |   const hash = await page.locator("#hash-status").textContent();
  109 | 
  110 |   await page.evaluate(async () => {
  111 |     await window.__workbenchTest.crashModelWorker();
  112 |   });
> 113 |   await expect(page.locator("#message")).toContainText(
      |                                          ^ Error: expect(locator).toContainText(expected) failed
  114 |     /Model Worker stopped|Restored the last confirmed/i,
  115 |   );
  116 |   await expect(page.locator("#hash-status")).toHaveText(hash);
  117 |   await page.locator("#analyse").click();
  118 |   await expect(page.locator("#result-status")).toHaveText("✓ Current");
  119 |   await expect(page.locator("#results-content")).toContainText("-45");
  120 | 
  121 |   await record("model-worker-crash", {
  122 |     status: "PASS",
  123 |     hashPrefix: hash?.slice(0, 12),
  124 |   });
  125 | });
  126 | 
  127 |   test("persistence denied warns without blocking export", async ({ page }) => {
  128 |     await page.addInitScript(() => {
  129 |       Object.defineProperty(navigator, "storage", {
  130 |         configurable: true,
  131 |         value: {
  132 |           persist: async () => false,
  133 |           estimate: async () => ({ quota: 0, usage: 0 }),
  134 |         },
  135 |       });
  136 |     });
  137 |     await page.goto("/");
  138 |     await page.locator("#new-project").click();
  139 |     await expect(page.locator("#message")).toContainText(
  140 |       /persistence was not granted|download a project backup/i,
  141 |     );
  142 |     await expect(page.locator("#export-project")).toBeEnabled();
  143 |     await expect(page.locator("#save-status")).toHaveText("Saved locally", {
  144 |       timeout: 10000,
  145 |     });
  146 | 
  147 |     await record("persistence-denied", {
  148 |       status: "PASS",
  149 |     });
  150 |   });
  151 | });
  152 | 
```