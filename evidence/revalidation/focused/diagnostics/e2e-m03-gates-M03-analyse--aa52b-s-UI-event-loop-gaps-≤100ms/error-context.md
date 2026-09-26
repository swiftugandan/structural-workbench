# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/m03-gates.spec.js >> M03 analyse click keeps UI event-loop gaps ≤100ms
- Location: tests/e2e/m03-gates.spec.js:75:1

# Error details

```
Test timeout of 45000ms exceeded.
```

```
Error: locator.click: Test timeout of 45000ms exceeded.
Call log:
  - waiting for locator('#cancel')
    - locator resolved to <button hidden="" id="cancel">Cancel analysis</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not visible
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not visible
    - retrying click action
      - waiting 100ms
    85 × waiting for element to be visible, enabled and stable
       - element is not visible
     - retrying click action
       - waiting 500ms

```

# Page snapshot

```yaml
- main [ref=e2]:
  - generic [ref=e3]:
    - button "Projects home" [ref=e4] [cursor=pointer]
    - menubar "Application menu" [ref=e7]:
      - menuitem "File" [ref=e8] [cursor=pointer]
      - menuitem "Edit" [ref=e9] [cursor=pointer]
      - menuitem "View" [ref=e10] [cursor=pointer]
      - menuitem "Model" [ref=e11] [cursor=pointer]
      - menuitem "Analysis" [ref=e12] [cursor=pointer]
      - menuitem "Design" [ref=e13] [cursor=pointer]
      - menuitem "Help" [ref=e14] [cursor=pointer]
    - textbox "Project name" [ref=e16]: Untitled cantilever
    - generic [ref=e17]:
      - button "Undo (⌘Z)" [disabled] [ref=e18]
      - button "Redo (⌘⇧Z)" [disabled] [ref=e22]
      - combobox "Analysis case" [ref=e26]:
        - option "lc1 · Reference load" [selected]
      - button "Analyse" [ref=e27] [cursor=pointer]
  - region "Modelling commands" [ref=e31]:
    - generic [ref=e32]:
      - generic [ref=e33]:
        - generic [ref=e34]:
          - button "Draw member" [ref=e35] [cursor=pointer]
          - button "Node" [ref=e41] [cursor=pointer]
          - button "Support" [ref=e46] [cursor=pointer]
          - button "Load" [ref=e51] [cursor=pointer]
        - generic [ref=e56]: Create
      - generic [ref=e57]:
        - generic [ref=e58]:
          - button "Select" [pressed] [ref=e59] [cursor=pointer]
          - button "Edit selection" [ref=e63] [cursor=pointer]
          - button "Topology" [ref=e68] [cursor=pointer]
          - button "Measure" [ref=e75] [cursor=pointer]
        - generic [ref=e83]: Selection
      - generic [ref=e84]:
        - generic [ref=e85]:
          - button "Results table" [ref=e86] [cursor=pointer]
          - button "Actions" [ref=e91] [cursor=pointer]
        - generic [ref=e94]: Inspect
      - generic [ref=e95]:
        - generic [ref=e96]:
          - button "Member steel design" [ref=e97] [cursor=pointer]
          - button "Concrete previews" [ref=e100] [cursor=pointer]
          - button "Reference checks" [ref=e103] [cursor=pointer]
        - generic [ref=e106]: Design
      - generic [ref=e107]:
        - generic [ref=e108]:
          - button "Move" [ref=e109] [cursor=pointer]
          - button "Copy" [ref=e116] [cursor=pointer]
          - button "Delete" [ref=e121] [cursor=pointer]
          - button "Split" [ref=e126] [cursor=pointer]
        - generic [ref=e133]: Canvas edits
  - status [ref=e134]: Migrated schema 1.0.0 → 1.1.0. Original file retained locally (4f3f1b9a6af1…). Browser persistence was not granted. Local snapshots may be evicted; download a project backup.
  - generic [ref=e135]:
    - complementary [ref=e136]:
      - generic [ref=e137]:
        - text: Model explorer
        - generic [ref=e138]: r0
      - generic [ref=e144]:
        - strong [ref=e145]: Frame model
        - generic [ref=e146]: 2 nodes · 1 members
      - generic [ref=e147]:
        - searchbox "Search model" [ref=e148]
        - generic [ref=e149]:
          - button "Expand all" [ref=e150] [cursor=pointer]
          - button "Collapse all" [ref=e151] [cursor=pointer]
      - navigation "Model entities" [ref=e152]:
        - group [ref=e153]:
          - generic "Structure" [ref=e154] [cursor=pointer]
          - generic [ref=e155]:
            - group [ref=e156]:
              - generic "Storeys & physical members" [ref=e157] [cursor=pointer]
              - generic [ref=e158]:
                - button "+ Add storey" [ref=e159] [cursor=pointer]
                - group [ref=e160]:
                  - generic "Unassigned storey1" [ref=e161] [cursor=pointer]
                  - group [ref=e163]:
                    - generic "Unassigned role1" [ref=e164] [cursor=pointer]
                    - generic [ref=e166]:
                      - button "m1 unassigned" [ref=e167] [cursor=pointer]:
                        - generic [ref=e168]: m1
                        - generic [ref=e169]: unassigned
                      - group [ref=e170]:
                        - generic "Analytical members1" [ref=e171] [cursor=pointer]
                        - button "m1 n1 → n2" [ref=e173] [cursor=pointer]:
                          - generic [ref=e174]: m1
                          - generic [ref=e175]: n1 → n2
            - button "Members 1" [ref=e176] [cursor=pointer]:
              - text: Members
              - generic [ref=e177]: "1"
              - generic [aria-hidden] [ref=e178]: ↗
            - group [ref=e179]:
              - generic "Grids0" [ref=e180] [cursor=pointer]
            - group [ref=e181]:
              - generic "Layers0" [ref=e182] [cursor=pointer]
            - group [ref=e183]:
              - generic "Groups0" [ref=e184] [cursor=pointer]
            - group [ref=e185]:
              - generic "Joints2" [ref=e186] [cursor=pointer]
            - group [ref=e187]:
              - generic "Support details1" [ref=e188] [cursor=pointer]
            - group [ref=e189]:
              - generic "Design object bindings0" [ref=e190] [cursor=pointer]
            - group [ref=e191]:
              - generic "Analytical nodes2" [ref=e192] [cursor=pointer]
              - generic [ref=e193]:
                - button "Analytical nodes 2" [ref=e194] [cursor=pointer]:
                  - text: Analytical nodes
                  - generic [ref=e195]: "2"
                  - generic [aria-hidden] [ref=e196]: ↗
                - button "n1" [ref=e197] [cursor=pointer]
                - button "n2" [ref=e203] [cursor=pointer]
            - group [ref=e209]:
              - generic "Supports1" [ref=e210] [cursor=pointer]
              - generic [ref=e211]:
                - button "Supports 1" [ref=e212] [cursor=pointer]:
                  - text: Supports
                  - generic [ref=e213]: "1"
                  - generic [aria-hidden] [ref=e214]: ↗
                - button "s1 n1" [ref=e215] [cursor=pointer]:
                  - generic [ref=e220]: s1
                  - generic [ref=e221]: n1
            - group [ref=e222]:
              - generic "Design objects · mock" [ref=e223] [cursor=pointer]
              - generic [ref=e224]:
                - group [ref=e225]:
                  - generic "RC beams0" [ref=e226] [cursor=pointer]
                  - paragraph [ref=e228]: None in this model
                - group [ref=e229]:
                  - generic "Slabs0" [ref=e230] [cursor=pointer]
                  - paragraph [ref=e232]: None in this model
                - group [ref=e233]:
                  - generic "Foundations0" [ref=e234] [cursor=pointer]
                  - paragraph [ref=e236]: None in this model
        - group [ref=e237]:
          - generic "Load cases & combinations" [ref=e238] [cursor=pointer]
          - generic [ref=e239]:
            - group [ref=e240]:
              - generic "Load cases1" [ref=e241] [cursor=pointer]
              - generic [ref=e242]:
                - button "Load cases 1" [ref=e243] [cursor=pointer]:
                  - text: Load cases
                  - generic [ref=e244]: "1"
                  - generic [aria-hidden] [ref=e245]: ↗
                - button "lc1 Reference load" [ref=e246] [cursor=pointer]:
                  - generic [ref=e251]: lc1
                  - generic [ref=e252]: Reference load
            - group [ref=e253]:
              - generic "Loads1" [ref=e254] [cursor=pointer]
              - generic [ref=e255]:
                - button "Loads 1" [ref=e256] [cursor=pointer]:
                  - text: Loads
                  - generic [ref=e257]: "1"
                  - generic [aria-hidden] [ref=e258]: ↗
                - button "l1 n2" [ref=e259] [cursor=pointer]:
                  - generic [ref=e264]: l1
                  - generic [ref=e265]: n2
            - group [ref=e266]:
              - generic "Combinations0" [ref=e267] [cursor=pointer]
              - button "Combinations 0" [ref=e269] [cursor=pointer]:
                - text: Combinations
                - generic [ref=e270]: "0"
                - generic [aria-hidden] [ref=e271]: ↗
        - group [ref=e272]:
          - generic "Materials1" [ref=e273] [cursor=pointer]
          - generic [ref=e274]:
            - button "Materials 1" [ref=e275] [cursor=pointer]:
              - text: Materials
              - generic [ref=e276]: "1"
              - generic [aria-hidden] [ref=e277]: ↗
            - button "mat1 Synthetic isotropic material" [ref=e278] [cursor=pointer]:
              - generic [ref=e283]: mat1
              - generic [ref=e284]: Synthetic isotropic material
        - group [ref=e285]:
          - generic "Sections1" [ref=e286] [cursor=pointer]
          - generic [ref=e287]:
            - button "Sections 1" [ref=e288] [cursor=pointer]:
              - text: Sections
              - generic [ref=e289]: "1"
              - generic [aria-hidden] [ref=e290]: ↗
            - button "sec1 Synthetic principal section" [ref=e291] [cursor=pointer]:
              - generic [ref=e295]: sec1
              - generic [ref=e296]: Synthetic principal section
      - generic [ref=e297]:
        - paragraph [ref=e298]: ANALYSIS MODEL
        - generic [ref=e299]:
          - text: Mode
          - combobox "Mode" [ref=e300]:
            - option "Spatial frame" [selected]
            - option "Planar XZ"
        - paragraph [ref=e301]: Linear elastic · Euler–BernoulliCustom synthetic sections
        - button "View capabilities ↗" [ref=e302] [cursor=pointer]
    - region "Structural viewport" [ref=e303]:
      - generic [ref=e304]:
        - generic [ref=e305]:
          - button "Plan" [ref=e306] [cursor=pointer]
          - button "Elevation" [ref=e307] [cursor=pointer]
          - button "Side" [ref=e308] [cursor=pointer]
          - button "3D" [ref=e309] [cursor=pointer]
        - group "Canvas navigation and overlays" [ref=e310]:
          - button "Pan" [ref=e311] [cursor=pointer]
          - button "Orbit" [ref=e318] [cursor=pointer]
          - button "Fit" [ref=e326] [cursor=pointer]
        - group "Model display" [ref=e333]:
          - generic [ref=e334]: Display
          - button "Lines" [pressed] [ref=e335] [cursor=pointer]
          - button "Solid" [ref=e336] [cursor=pointer]
        - button "Assumptions" [ref=e337] [cursor=pointer]
        - button "Copy bay" [ref=e338] [cursor=pointer]
        - generic [ref=e339]:
          - text: Results
          - combobox "Result family" [ref=e340]:
            - option "Model & deformation" [selected]
            - option "Member forces"
            - option "Member moments"
        - generic [ref=e341]:
          - text: Component
          - combobox "Result component" [ref=e342]:
            - option "Model" [selected]
            - option "Deformation"
        - group [ref=e343]:
          - generic "Display & annotations" [ref=e344] [cursor=pointer]
          - 'option "Member labels: Auto" [selected]'
          - 'option "Member labels: Show all"'
          - 'option "Member labels: Hide"'
      - generic [ref=e345]:
        - generic [ref=e346]:
          - text: Storey
          - combobox "Visible storey" [ref=e347]:
            - option "All storeys" [selected]
        - generic [ref=e348]:
          - text: Layer
          - combobox "Visible layer" [ref=e349]:
            - option "All layers" [selected]
        - button "Isolate selection" [ref=e350] [cursor=pointer]
        - button "Hide selection" [ref=e351] [cursor=pointer]
        - button "Fit selection" [ref=e352] [cursor=pointer]
        - button "Show all" [ref=e353] [cursor=pointer]
        - status "View filter only; analysis always uses the complete model." [ref=e354]: 1 / 1 members visible
      - generic [ref=e355]:
        - generic "Frame model. Click to select, Shift toggles. Drag a selection box; middle drag or Space pans. Wheel zooms at the cursor." [ref=e356]
        - generic:
          - generic: STRUCTURAL MODEL
          - strong: Untitled cantilever
          - generic: Global XZ · metres
        - generic:
          - generic "n1"
          - generic "n2"
          - generic "m1"
          - generic "m1 · True member length 3 m": 3 m
          - 'button "Properties for s1: Fixed · restrained X, Y, Z, Rx, Ry, Rz" [ref=e357] [cursor=pointer]': s1 · Fixed
          - 'button "Properties for l1: l1 · 10 kN" [ref=e358] [cursor=pointer]': l1 · 10 kN
        - generic [ref=e359]: Undeformed
        - generic:
          - 'img "Global axes follow the camera: X red, Y green, Z blue"':
            - generic "Global Y (end-on)": "Y"
            - generic "Global X": X
            - generic "Global Z": Z
            - generic: GLOBAL AXES
        - generic [ref=e362]: WEBGPU · amd
      - generic [ref=e363]:
        - generic [ref=e364]: Select · Plane XZ
        - status
        - generic [ref=e365]: Member m1 selected · n1 → n2
        - generic [ref=e366]: 8ad1dd3428a2 · f64
    - complementary [ref=e367]:
      - generic [ref=e368]:
        - text: Selection
        - generic [ref=e369]: m1
      - group "Selection details" [ref=e370]:
        - button "Properties" [pressed] [ref=e371] [cursor=pointer]
        - button "Member results" [ref=e372] [cursor=pointer]
        - button "Concrete previews" [ref=e373] [cursor=pointer]
        - button "Steel design" [ref=e374] [cursor=pointer]
      - generic [ref=e375]:
        - generic [ref=e382]:
          - strong [ref=e383]: Member m1
          - text: n1 → n2 · Custom section
        - generic [ref=e384]:
          - generic [ref=e385]:
            - heading "Geometry" [level=3] [ref=e386]
            - img "A member connects a start point and an end point." [ref=e387]:
              - generic [ref=e388]:
                - generic [ref=e391]: Start point
                - generic [ref=e392]: End point
                - generic [ref=e393]: Beam or column
            - generic [ref=e395]:
              - text: Span [m]
              - textbox "Span [m]" [ref=e396]: "3"
          - generic [ref=e397]:
            - heading "Material · mat1" [level=3] [ref=e398]
            - generic [ref=e399]:
              - generic [ref=e400]:
                - text: Elastic stiffness E [GPa]
                - textbox "Elastic stiffness E [GPa]" [ref=e401]: "200"
              - generic [ref=e402]:
                - text: Poisson ratio ν
                - textbox "Poisson ratio ν" [ref=e403]: "0.25"
              - generic [ref=e404]:
                - text: Density [kg/m³]
                - textbox "Density [kg/m³]" [ref=e405]: "7850"
          - generic [ref=e406]:
            - heading "Section · sec1" [level=3] [ref=e407]
            - generic [ref=e408]:
              - generic [ref=e409]:
                - text: Area [m²]
                - textbox "Area [m²]" [ref=e410]: "0.01"
              - generic [ref=e411]:
                - text: Twisting resistance J [m⁴]
                - textbox "Twisting resistance J [m⁴]" [ref=e412]: "0.00002"
              - generic [ref=e413]:
                - text: Bending about y · Iy [m⁴]
                - textbox "Bending about y · Iy [m⁴]" [ref=e414]: "0.00001"
              - generic [ref=e415]:
                - text: Bending about z · Iz [m⁴]
                - textbox "Bending about z · Iz [m⁴]" [ref=e416]: "0.00002"
            - paragraph [ref=e417]: Principal axes · Original analytical fixture, not a catalogue section
          - generic [ref=e418]:
            - heading "Support & loading" [level=3] [ref=e419]
            - generic [ref=e420]:
              - checkbox "Fixed at n1" [checked] [ref=e421]
              - text: Fixed at n1
            - generic [ref=e423]:
              - text: Vertical tip force [kN]
              - textbox "Vertical tip force [kN]" [ref=e424]: "-10"
            - paragraph [ref=e425]: Negative Fz acts downward, along global −Z. Unit suffixes such as “-13000 N” are accepted.
          - alert
          - generic [ref=e426]:
            - button "Apply changes" [ref=e427] [cursor=pointer]
            - button "Cancel changes" [ref=e428] [cursor=pointer]
          - paragraph [ref=e429]: Material and section edits affect every member using these definitions.
    - generic [ref=e431]:
      - button "Displacements" [ref=e432] [cursor=pointer]
      - button "Reactions" [ref=e433] [cursor=pointer]
      - button "Member forces" [ref=e434] [cursor=pointer]
      - button "End actions" [ref=e435] [cursor=pointer]
      - button "Elastic stress" [ref=e436] [cursor=pointer]
      - button "Equilibrium" [ref=e437] [cursor=pointer]
      - button "Design preview" [ref=e438] [cursor=pointer]
      - button "Steel design" [ref=e439] [cursor=pointer]
      - button "Model steel review" [ref=e440] [cursor=pointer]
      - generic [ref=e441]: Not analysed
      - button "CSV" [disabled] [ref=e442]
      - button "Expand results" [ref=e448] [cursor=pointer]
  - generic [ref=e449]:
    - generic [ref=e450]:
      - text: "Units:"
      - combobox "Display units" [ref=e451]:
        - option "m · kN · mm" [selected]
        - option "m · N · m"
    - generic [ref=e452]: ● Rust / WASM ready
    - generic "7f02a278abf09227248e85c8f7325dadcce24a0761ded9dac8889e93f8cc1097" [ref=e453]: Build 7f02a278abf0
    - generic [ref=e454]: Online
    - button "Analysis & design scope" [ref=e455] [cursor=pointer]
```

# Test source

```ts
  1   | import { menuCommand } from "../menu-helpers.js";
  2   | import { test, expect } from "@playwright/test";
  3   | 
  4   | // Worker fault injection must intercept fresh workers, including repeat analyses.
  5   | test.use({ serviceWorkers: "block" });
  6   | import { mkdir } from "node:fs/promises";
  7   | import { evidenceDir, record } from "../../tools/evidence.mjs";
  8   | 
  9   | process.env.WORKBENCH_EVIDENCE_DIR ||= "evidence/M03/gates";
  10  | process.env.WORKBENCH_TASK_ID ||= "M03-gaps";
  11  | process.env.WORKBENCH_MILESTONE ||= "M03";
  12  | 
  13  | const evidence = () => evidenceDir("evidence/M03/gates");
  14  | 
  15  | async function blockAnalyse(page, ms = 2500) {
  16  |   await page.route("**/worker.js", async (route) => {
  17  |     const response = await route.fetch();
  18  |     const body = (await response.text()).replace(
  19  |       "const response = JSON.parse(",
  20  |       `if(r.operation === "analyse"){const end=Date.now()+${ms};while(Date.now()<end){}} const response = JSON.parse(`,
  21  |     );
  22  |     await route.fulfill({ response, body });
  23  |   });
  24  | }
  25  | 
  26  | test("M03 cancel timing: cancelled ≤250ms and editing restored ≤1s", async ({
  27  |   page,
  28  | }) => {
  29  |   await blockAnalyse(page, 3000);
  30  |   await page.goto("/");
  31  |   await page.locator("#new-project").click();
  32  |   await expect(page.locator("#hash-status")).toContainText(/^[0-9a-f]{12}/i);
  33  |   const hash = await page.locator("#hash-status").textContent();
  34  |   await page.locator("#analyse").click();
  35  |   await expect(page.locator("#cancel")).toBeVisible();
  36  | 
  37  |   const timing = await page.evaluate(async () => {
  38  |     const t0 = performance.now();
  39  |     document.querySelector("#cancel").click();
  40  |     while (
  41  |       !(document.querySelector("#message")?.textContent || "").includes(
  42  |         "CANCELLED",
  43  |       )
  44  |     ) {
  45  |       if (performance.now() - t0 > 2000)
  46  |         return { error: "cancelled-timeout", t0 };
  47  |       await new Promise((r) => requestAnimationFrame(r));
  48  |     }
  49  |     const cancelledMs = performance.now() - t0;
  50  |     while (document.querySelector("#analyse")?.disabled) {
  51  |       if (performance.now() - t0 > 2000)
  52  |         return { cancelledMs, error: "editing-timeout" };
  53  |       await new Promise((r) => requestAnimationFrame(r));
  54  |     }
  55  |     return {
  56  |       cancelledMs,
  57  |       editingRestoredMs: performance.now() - t0,
  58  |     };
  59  |   });
  60  |   expect(timing.error).toBeUndefined();
  61  |   expect(timing.cancelledMs).toBeLessThanOrEqual(250);
  62  |   expect(timing.editingRestoredMs).toBeLessThanOrEqual(1000);
  63  |   await expect(page.locator("#hash-status")).toHaveText(hash);
  64  | 
  65  |   await mkdir(evidence(), { recursive: true });
  66  |   await record("cancel-timing", {
  67  |     status: "PASS",
  68  |     testCount: 1,
  69  |     testIds: ["m03-cancel-timing"],
  70  |     cancelledMs: timing.cancelledMs,
  71  |     editingRestoredMs: timing.editingRestoredMs,
  72  |   });
  73  | });
  74  | 
  75  | test("M03 analyse click keeps UI event-loop gaps ≤100ms", async ({ page }) => {
  76  |   await blockAnalyse(page, 1500);
  77  |   await page.goto("/");
  78  |   await page.locator("#new-project").click();
  79  |   await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  80  |   const gap = await page.evaluate(async () => {
  81  |     let maxGap = 0;
  82  |     let last = performance.now();
  83  |     const id = setInterval(() => {
  84  |       const now = performance.now();
  85  |       maxGap = Math.max(maxGap, now - last);
  86  |       last = now;
  87  |     }, 0);
  88  |     document.querySelector("#analyse").click();
  89  |     await new Promise((r) => setTimeout(r, 200));
  90  |     clearInterval(id);
  91  |     return maxGap;
  92  |   });
  93  |   expect(gap).toBeLessThanOrEqual(100);
> 94  |   await page.locator("#cancel").click();
      |                                 ^ Error: locator.click: Test timeout of 45000ms exceeded.
  95  |   await expect(page.locator("#message")).toContainText("CANCELLED");
  96  | 
  97  |   await mkdir(evidence(), { recursive: true });
  98  |   await record("ui-responsiveness", {
  99  |     status: "PASS",
  100 |     testCount: 1,
  101 |     testIds: ["m03-analyse-ui-gap"],
  102 |     maxEventLoopGapMs: gap,
  103 |   });
  104 | });
  105 | 
  106 | test("M03 GPU loss during blocked analysis preserves model hash", async ({
  107 |   page,
  108 | }) => {
  109 |   await blockAnalyse(page, 3000);
  110 |   await page.goto("/");
  111 |   await page.locator("#new-project").click();
  112 |   await expect(page.locator("#gpu-status")).toContainText("WEBGPU");
  113 |   await expect(page.locator("#hash-status")).toContainText(/^[0-9a-f]{12}/i);
  114 |   const hash = await page.locator("#hash-status").textContent();
  115 |   await expect(page.locator("#model-count")).toContainText("2 nodes");
  116 | 
  117 |   await page.locator("#analyse").click();
  118 |   await expect(page.locator("#cancel")).toBeVisible();
  119 |   await menuCommand(page, "View", "Recreate viewport");
  120 |   await expect(page.locator("#hash-status")).toHaveText(hash);
  121 |   await expect(page.locator("#model-count")).toContainText("2 nodes");
  122 |   await expect(page.locator("#viewport")).toHaveAttribute(
  123 |     "data-device-generation",
  124 |     /[2-9]|[1-9][0-9]+/,
  125 |   );
  126 | 
  127 |   await page.locator("#cancel").click();
  128 |   await expect(page.locator("#message")).toContainText("CANCELLED");
  129 |   await expect(page.locator("#hash-status")).toHaveText(hash);
  130 | 
  131 |   await mkdir(evidence(), { recursive: true });
  132 |   await record("gpu-during-analysis", {
  133 |     status: "PASS",
  134 |     testCount: 1,
  135 |     testIds: ["m03-gpu-loss-during-analysis"],
  136 |   });
  137 | });
  138 | 
```