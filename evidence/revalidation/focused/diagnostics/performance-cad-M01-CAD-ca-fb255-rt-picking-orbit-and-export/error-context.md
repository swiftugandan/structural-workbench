# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: performance-cad.spec.js >> M01 CAD capacity: 1000-member editing, 10000-member import picking orbit and export
- Location: tests/performance-cad.spec.js:8:1

# Error details

```
Test timeout of 240000ms exceeded.
```

```
Error: mouse.move: Test timeout of 240000ms exceeded.
```

```
Error: page.evaluate: Test timeout of 240000ms exceeded.
```

# Test source

```ts
  1   | import { menuCommand } from "./menu-helpers.js";
  2   | import { test, expect } from "@playwright/test";
  3   | import { readFile, mkdir, writeFile } from "node:fs/promises";
  4   | import { frame } from "./helpers/frame.js";
  5   | import { evidenceDir, record } from "../tools/evidence.mjs";
  6   | // Capturing the 10,000-member DOM after every orbit gesture distorts the
  7   | // performance measurement. Keep action/network traces and screenshots.
  8   | test.use({ trace: { mode: "on", snapshots: false, screenshots: true } });
  9   | const p95 = (values) =>
  10  |   [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
  11  | test("M01 CAD capacity: 1000-member editing, 10000-member import picking orbit and export", async ({
  12  |   page,
  13  | }) => {
  14  |   test.setTimeout(240000);
  15  |   await page.goto("/");
  16  |   const base = JSON.parse(await readFile("fixtures/models/B02.json", "utf8"));
  17  |   const large = frame(base);
  18  |   await mkdir(evidenceDir(), { recursive: true });
  19  |   await writeFile(
  20  |     `${evidenceDir()}/capacity-model.json`,
  21  |     JSON.stringify(large),
  22  |   );
  23  |   const start = Date.now();
  24  |   await page.locator("#import-file").setInputFiles({
  25  |     name: "capacity.json",
  26  |     mimeType: "application/json",
  27  |     buffer: Buffer.from(JSON.stringify(large)),
  28  |   });
  29  |   await expect(page.locator("#model-count")).toHaveText(
  30  |     "5000 nodes · 10000 members",
  31  |     { timeout: 30000 },
  32  |   );
  33  |   await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  34  |   const importMs = Date.now() - start;
  35  |   const gpu = await page.evaluate(async () => {
  36  |     const a = await navigator.gpu.requestAdapter();
  37  |     return {
  38  |       vendor: a.info.vendor,
  39  |       device: a.info.device,
  40  |       architecture: a.info.architecture,
  41  |       description: a.info.description,
  42  |       dpr: devicePixelRatio,
  43  |       userAgent: navigator.userAgent,
  44  |     };
  45  |   });
  46  |   await page.locator("#view-3d").click();
  47  |   const box = await page.locator("#viewport").boundingBox();
> 48  |   // Sample genuine requestAnimationFrame intervals while repeated pointer gestures
      |                           ^ Error: page.evaluate: Test timeout of 240000ms exceeded.
  49  |   // orbit the real viewport. No model/results are injected into the application.
  50  |   const orbitStart = Date.now();
  51  |   const frameTimes = page.evaluate(
  52  |     () =>
  53  |       new Promise((resolve) => {
  54  |         const times = [];
  55  |         let previous = performance.now(),
  56  |           start = previous;
  57  |         function tick(now) {
  58  |           times.push(now - previous);
  59  |           previous = now;
  60  |           if (now - start < 60000) requestAnimationFrame(tick);
  61  |           else resolve(times.slice(1));
  62  |         }
  63  |         requestAnimationFrame(tick);
  64  |       }),
  65  |   );
  66  |   await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  67  |   await page.mouse.down({ button: "right" });
  68  |   while (Date.now() - orbitStart < 60500) {
  69  |     const t = (Date.now() - orbitStart) * 0.002;
  70  |     await page.mouse.move(
  71  |       box.x + box.width * 0.5 + Math.sin(t) * 100,
  72  |       box.y + box.height * 0.5 + Math.cos(t) * 40,
  73  |     );
  74  |   }
  75  |   await page.mouse.up({ button: "right" });
  76  |   const intervals = await frameTimes;
  77  |   // Picking has a separate kernel round-trip probe against an actual WASM instance.
  78  |   // This isolates kernel latency from Playwright polling, and does not mock data.
  79  |   const kernelTimes = await page.evaluate(async (p) => {
  80  |     const api = await import("/pkg/workbench_wasm_api.js");
  81  |     await api.default();
  82  |     const k = new api.Kernel();
  83  |     let rev = 0;
  84  |     const req = (operation, payload) => {
  85  |       const r = JSON.parse(
  86  |         k.request(
  87  |           JSON.stringify({
  88  |             protocolVersion: 1,
  89  |             requestId: "capacity",
  90  |             expectedRevision: rev,
  91  |             operation,
  92  |             payload,
  93  |           }),
  94  |         ),
  95  |       );
  96  |       if (r.status !== "ok") throw Error(JSON.stringify(r));
  97  |       rev = r.revision;
  98  |       return r;
  99  |     };
  100 |     req("createProject", { project: p });
  101 |     const camera = {
  102 |       origin: [40, 48, 13.5],
  103 |       basis: [
  104 |         [1, 0, 0],
  105 |         [0, 0, 1],
  106 |         [0, -1, 0],
  107 |       ],
  108 |       center: [450, 200],
  109 |       factor: 5,
  110 |     };
  111 |     const pick = [],
  112 |       snaps = [];
  113 |     for (let i = 0; i < 101; i++) {
  114 |       let t = performance.now();
  115 |       req("queryGeometry", {
  116 |         kind: "screenPick",
  117 |         query: { camera, point: [450 + (i % 10), 200] },
  118 |         viewRevision: 0,
  119 |       });
  120 |       if (i) pick.push(performance.now() - t);
  121 |       t = performance.now();
  122 |       req("queryGeometry", {
  123 |         kind: "snap",
  124 |         query: {
  125 |           position: [(i % 20) * 4, 0, 3],
  126 |           plane: "XZ",
  127 |           features: true,
  128 |           grid: 0.5,
  129 |           tolerance: 0.1,
  130 |         },
  131 |         viewRevision: 0,
  132 |       });
  133 |       if (i) snaps.push(performance.now() - t);
  134 |     }
  135 |     k.free();
  136 |     return { pick, snaps };
  137 |   }, large);
  138 |   const exportStart = Date.now(),
  139 |     download = page.waitForEvent("download");
  140 |   await menuCommand(page, "File", "Download project");
  141 |   const file = await (await download).path();
  142 |   const exported = JSON.parse(await readFile(file, "utf8"));
  143 |   const exportMs = Date.now() - exportStart;
  144 |   expect(exported.members).toHaveLength(10000);
  145 |   const small = frame(base, 1000);
  146 |   const editTimes = await page.evaluate(async (p) => {
  147 |     const api = await import("/pkg/workbench_wasm_api.js");
  148 |     await api.default();
```