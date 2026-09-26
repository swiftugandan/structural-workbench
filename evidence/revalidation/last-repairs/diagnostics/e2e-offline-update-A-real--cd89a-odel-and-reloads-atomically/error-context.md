# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/offline-update.spec.js >> A real waiting build installs, preserves the saved model, and reloads atomically
- Location: tests/e2e/offline-update.spec.js:8:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('#update-banner')
Expected: visible
Received: hidden
Timeout:  5000ms

Call log:
  - Expect "toBeVisible" locator('#update-banner') with timeout 5000ms
  - waiting for locator('#update-banner')
    14 × locator resolved to <div hidden="" role="status" id="update-banner" aria-live="polite">…</div>
       - unexpected value "hidden"

```

```yaml
- main:
  - button "Projects home"
  - menubar "Application menu":
    - menuitem "File"
    - menuitem "Edit"
    - menuitem "View"
    - menuitem "Model"
    - menuitem "Analysis"
    - menuitem "Design"
    - menuitem "Help"
  - textbox "Project name": Untitled cantilever
  - button "Undo (⌘Z)"
  - button "Redo (⌘⇧Z)" [disabled]
  - combobox "Analysis case":
    - option "lc1 · Reference load" [selected]
  - button "Analyse"
  - region "Modelling commands":
    - button "Draw member"
    - button "Node"
    - button "Support"
    - button "Load"
    - text: Create
    - button "Select" [pressed]
    - button "Edit selection"
    - button "Topology"
    - button "Measure"
    - text: Selection
    - button "Results table"
    - button "Actions"
    - text: Inspect
    - button "Member steel design"
    - button "Concrete previews"
    - button "Reference checks"
    - text: Design
    - button "Move"
    - button "Copy"
    - button "Delete"
    - button "Split"
    - text: Canvas edits
  - complementary:
    - text: Model explorer r1
    - strong: Frame model
    - text: 2 nodes · 1 members
    - searchbox "Search model"
    - button "Expand all"
    - button "Collapse all"
    - navigation "Model entities":
      - group:
        - text: Structure
        - group:
          - text: Storeys & physical members
          - button "+ Add storey"
          - group:
            - text: Unassigned storey1
            - group:
              - text: Unassigned role1
              - button "m1 unassigned"
              - group:
                - text: Analytical members1
                - button "m1 n1 → n2"
        - button "Members 1"
        - group: Grids0
        - group: Layers0
        - group: Groups0
        - group: Joints2
        - group: Support details1
        - group: Design object bindings0
        - group:
          - text: Analytical nodes2
          - button "Analytical nodes 2"
          - button "n1"
          - button "n2"
        - group:
          - text: Supports1
          - button "Supports 1"
          - button "s1 n1"
        - group:
          - text: Design objects · mock
          - group:
            - text: RC beams0
            - paragraph: None in this model
          - group:
            - text: Slabs0
            - paragraph: None in this model
          - group:
            - text: Foundations0
            - paragraph: None in this model
      - group:
        - text: Load cases & combinations
        - group:
          - text: Load cases1
          - button "Load cases 1"
          - button "lc1 Reference load"
        - group:
          - text: Loads1
          - button "Loads 1"
          - button "l1 n2"
        - group:
          - text: Combinations0
          - button "Combinations 0"
      - group:
        - text: Materials1
        - button "Materials 1"
        - button "mat1 Synthetic isotropic material"
      - group:
        - text: Sections1
        - button "Sections 1"
        - button "sec1 Synthetic principal section"
    - paragraph: ANALYSIS MODEL
    - text: Mode
    - combobox "Mode":
      - option "Spatial frame" [selected]
      - option "Planar XZ"
    - paragraph: Linear elastic · Euler–Bernoulli Custom synthetic sections
    - button "View capabilities ↗"
  - region "Structural viewport":
    - button "Plan"
    - button "Elevation"
    - button "Side"
    - button "3D"
    - group "Canvas navigation and overlays":
      - button "Pan"
      - button "Orbit"
      - button "Fit"
    - group "Model display":
      - text: Display
      - button "Lines" [pressed]
      - button "Solid"
    - button "Assumptions"
    - button "Copy bay"
    - text: Results
    - combobox "Result family":
      - option "Model & deformation" [selected]
      - option "Member forces"
      - option "Member moments"
    - text: Component
    - combobox "Result component":
      - option "Model" [selected]
      - option "Deformation"
    - group: Display & annotations
    - text: Storey
    - combobox "Visible storey":
      - option "All storeys" [selected]
    - text: Layer
    - combobox "Visible layer":
      - option "All layers" [selected]
    - button "Isolate selection"
    - button "Hide selection"
    - button "Fit selection"
    - button "Show all"
    - status "View filter only; analysis always uses the complete model.": 1 / 1 members visible
    - text: STRUCTURAL MODEL
    - strong: Untitled cantilever
    - text: Global XZ · metres n1 n2 m1 7 m
    - 'button "Properties for s1: Fixed · restrained X, Y, Z, Rx, Ry, Rz"': s1 · Fixed
    - 'button "Properties for l1: l1 · 10 kN"': l1 · 10 kN
    - text: Undeformed
    - 'img "Global axes follow the camera: X red, Y green, Z blue"': Y X Z GLOBAL AXES
    - text: WEBGPU · amd Select · Plane XZ
    - status
    - text: Member m1 selected · n1 → n2 3c2f3298b317 · f64
  - complementary:
    - text: Selection m1
    - group "Selection details":
      - button "Properties" [pressed]
      - button "Member results"
      - button "Concrete previews"
      - button "Steel design"
    - strong: Member m1
    - text: n1 → n2 · Custom section
    - heading "Geometry" [level=3]
    - img "A member connects a start point and an end point.": Start point End point Beam or column
    - text: Span [m]
    - textbox "Span [m]": "7"
    - heading "Material · mat1" [level=3]
    - text: Elastic stiffness E [GPa]
    - textbox "Elastic stiffness E [GPa]": "200"
    - text: Poisson ratio ν
    - textbox "Poisson ratio ν": "0.25"
    - text: Density [kg/m³]
    - textbox "Density [kg/m³]": "7850"
    - heading "Section · sec1" [level=3]
    - text: Area [m²]
    - textbox "Area [m²]": "0.01"
    - text: Twisting resistance J [m⁴]
    - textbox "Twisting resistance J [m⁴]": "0.00002"
    - text: Bending about y · Iy [m⁴]
    - textbox "Bending about y · Iy [m⁴]": "0.00001"
    - text: Bending about z · Iz [m⁴]
    - textbox "Bending about z · Iz [m⁴]": "0.00002"
    - paragraph: Principal axes · Original analytical fixture, not a catalogue section
    - heading "Support & loading" [level=3]
    - checkbox "Fixed at n1" [checked]
    - text: Fixed at n1 Vertical tip force [kN]
    - textbox "Vertical tip force [kN]": "-10"
    - paragraph: Negative Fz acts downward, along global −Z. Unit suffixes such as “-13000 N” are accepted.
    - alert
    - button "Apply changes"
    - button "Cancel changes"
    - paragraph: Material and section edits affect every member using these definitions.
  - button "Displacements"
  - button "Reactions"
  - button "Member forces"
  - button "End actions"
  - button "Elastic stress"
  - button "Equilibrium"
  - button "Design preview"
  - button "Steel design"
  - button "Model steel review"
  - text: Not analysed
  - button "CSV" [disabled]
  - button "Expand results"
  - text: "Units:"
  - combobox "Display units":
    - option "m · kN · mm" [selected]
    - option "m · N · m"
  - text: ● Rust / WASM ready Build 5f09b2edcaa4 Online
  - button "Analysis & design scope"
```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | import { createServer } from "node:http";
  3   | import { readFile } from "node:fs/promises";
  4   | import { createHash } from "node:crypto";
  5   | 
  6   | // Two static deployments of the actual built application and WASM. Only the
  7   | // deployment marker differs. No solver, result, storage or worker mocks.
  8   | test("A real waiting build installs, preserves the saved model, and reloads atomically", async ({
  9   |   page,
  10  | }) => {
  11  |   test.setTimeout(90000);
  12  |   const manifest = JSON.parse(await readFile("dist/build.json", "utf8"));
  13  |   const versions = [];
  14  |   for (const version of ["A", "B"]) {
  15  |     const sourceHash = createHash("sha256")
  16  |       .update(`update-fixture-${version}-${manifest.sourceHash}`)
  17  |       .digest("hex");
  18  |     const files = {};
  19  |     for (const file of Object.keys(manifest.files))
  20  |       files[file] = await readFile(`dist/${file}`);
  21  |     files["sw.js"] = Buffer.from(
  22  |       files["sw.js"].toString().replace(manifest.sourceHash, sourceHash),
  23  |     );
  24  |     files["app.js"] = Buffer.from(
  25  |       `window.deploymentMarker = '${version}';\n` + files["app.js"],
  26  |     );
  27  |     const hashes = Object.fromEntries(
  28  |       Object.entries(files).map(([file, bytes]) => [
  29  |         file,
  30  |         createHash("sha256").update(bytes).digest("hex"),
  31  |       ]),
  32  |     );
  33  |     const buildHash = createHash("sha256")
  34  |       .update(JSON.stringify(hashes))
  35  |       .digest("hex");
  36  |     files["build.json"] = Buffer.from(
  37  |       JSON.stringify({ sourceHash, buildHash, files: hashes }),
  38  |     );
  39  |     versions.push({ files, buildHash });
  40  |   }
  41  |   let current = 0;
  42  |   const server = createServer((req, res) => {
  43  |     const pathname = new URL(req.url, "http://local").pathname;
  44  |     const file = pathname === "/" ? "app.html" : pathname.slice(1);
  45  |     const bytes = versions[current].files[file];
  46  |     if (!bytes) {
  47  |       res.writeHead(404);
  48  |       res.end();
  49  |       return;
  50  |     }
  51  |     res.writeHead(200, {
  52  |       "Content-Type": file.endsWith(".js")
  53  |         ? "text/javascript"
  54  |         : file.endsWith(".wasm")
  55  |           ? "application/wasm"
  56  |           : file.endsWith(".css")
  57  |             ? "text/css"
  58  |             : file.endsWith(".json")
  59  |               ? "application/json"
  60  |               : "text/html",
  61  |       "Cache-Control": "no-store",
  62  |     });
  63  |     res.end(bytes);
  64  |   });
  65  |   await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  66  |   try {
  67  |     await page.goto(`http://127.0.0.1:${server.address().port}`);
  68  |     await page.waitForFunction(() => !!window.__workbenchOffline);
  69  |     await page.locator("#new-project").click();
  70  |     await expect(page.locator("#save-status")).toHaveText("Saved locally");
  71  |     await expect
  72  |       .poll(() => page.evaluate(() => window.deploymentMarker))
  73  |       .toBe("A");
  74  |     current = 1;
  75  |     await page.evaluate(async () =>
  76  |       (await navigator.serviceWorker.getRegistration()).update(),
  77  |     );
  78  |     await page.waitForFunction(
  79  |       async () => !!(await navigator.serviceWorker.getRegistration())?.waiting,
  80  |     );
  81  |     // The active tab must still fetch assets only from A, even while B is cached.
  82  |     expect(
  83  |       await page.evaluate(() =>
  84  |         fetch("./app.js")
  85  |           .then((r) => r.text())
  86  |           .then((t) => t.includes("deploymentMarker = 'A'")),
  87  |       ),
  88  |     ).toBe(true);
  89  |     await page.locator("#span").fill("7");
  90  |     await page.locator("#member-form button.primary").click();
> 91  |     await expect(page.locator("#update-banner")).toBeVisible();
      |                                                  ^ Error: expect(locator).toBeVisible() failed
  92  |     await page.locator("#reload-update").click();
  93  |     await page.waitForFunction(() => window.deploymentMarker === "B");
  94  |     await expect(page.locator("#build-status")).toHaveAttribute(
  95  |       "data-build-hash",
  96  |       versions[1].buildHash,
  97  |     );
  98  |     await page.locator("#recent-projects .recent-row").first().click();
  99  |     await expect(page.locator("#span")).toHaveValue("7");
  100 |     await page.locator("#analyse").click();
  101 |     await expect(page.locator("#result-status")).toHaveText("✓ Current");
  102 |   } finally {
  103 |     await new Promise((resolve) => server.close(resolve));
  104 |   }
  105 | });
  106 | 
```