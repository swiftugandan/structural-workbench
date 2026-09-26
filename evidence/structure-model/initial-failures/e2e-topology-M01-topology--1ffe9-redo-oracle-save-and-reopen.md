# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/topology.spec.js >> M01 topology: axes, loaded split preview, undo, redo, oracle, save and reopen
- Location: tests/e2e/topology.spec.js:31:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  -   1
+ Received  + 338

- Array []
+ Array [
+   Object {
+     "description": "Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds",
+     "help": "Elements must meet minimum color contrast ratio thresholds",
+     "helpUrl": "https://dequeuniversity.com/rules/axe/4.13/color-contrast?application=playwright",
+     "id": "color-contrast",
+     "impact": "serious",
+     "nodes": Array [
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "bgColor": "#ffffff",
+               "contrastRatio": 4.23,
+               "expectedContrastRatio": "4.5:1",
+               "fgColor": "#6b7d90",
+               "fontSize": "6.8pt (9px)",
+               "fontWeight": "normal",
+               "messageKey": null,
+             },
+             "id": "color-contrast",
+             "impact": "serious",
+             "message": "Element has insufficient color contrast of 4.23 (foreground color: #6b7d90, background color: #ffffff, font size: 6.8pt (9px), font weight: normal). Expected contrast ratio of 4.5:1",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<aside class=\"model-panel\">",
+                 "target": Array [
+                   ".model-panel",
+                 ],
+               },
+             ],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Element has insufficient color contrast of 4.23 (foreground color: #6b7d90, background color: #ffffff, font size: 6.8pt (9px), font weight: normal). Expected contrast ratio of 4.5:1",
+         "html": "<small>unassigned</small>",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           "button[data-structure-key=\"physicalMembers\"] > small",
+         ],
+       },
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "bgColor": "#ffffff",
+               "contrastRatio": 4.23,
+               "expectedContrastRatio": "4.5:1",
+               "fgColor": "#6b7d90",
+               "fontSize": "6.8pt (9px)",
+               "fontWeight": "normal",
+               "messageKey": null,
+             },
+             "id": "color-contrast",
+             "impact": "serious",
+             "message": "Element has insufficient color contrast of 4.23 (foreground color: #6b7d90, background color: #ffffff, font size: 6.8pt (9px), font weight: normal). Expected contrast ratio of 4.5:1",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<aside class=\"model-panel\">",
+                 "target": Array [
+                   ".model-panel",
+                 ],
+               },
+             ],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Element has insufficient color contrast of 4.23 (foreground color: #6b7d90, background color: #ffffff, font size: 6.8pt (9px), font weight: normal). Expected contrast ratio of 4.5:1",
+         "html": "<small>n1</small>",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           "button[data-entity-id=\"s1\"] > small",
+         ],
+       },
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "bgColor": "#ffffff",
+               "contrastRatio": 4.23,
+               "expectedContrastRatio": "4.5:1",
+               "fgColor": "#6b7d90",
+               "fontSize": "6.8pt (9px)",
+               "fontWeight": "normal",
+               "messageKey": null,
+             },
+             "id": "color-contrast",
+             "impact": "serious",
+             "message": "Element has insufficient color contrast of 4.23 (foreground color: #6b7d90, background color: #ffffff, font size: 6.8pt (9px), font weight: normal). Expected contrast ratio of 4.5:1",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<aside class=\"model-panel\">",
+                 "target": Array [
+                   ".model-panel",
+                 ],
+               },
+             ],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Element has insufficient color contrast of 4.23 (foreground color: #6b7d90, background color: #ffffff, font size: 6.8pt (9px), font weight: normal). Expected contrast ratio of 4.5:1",
+         "html": "<small>n2</small>",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           "button[data-entity-id=\"s2\"] > small",
+         ],
+       },
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "bgColor": "#ffffff",
+               "contrastRatio": 3.47,
+               "expectedContrastRatio": "4.5:1",
+               "fgColor": "#7e8b9a",
+               "fontSize": "7.5pt (10px)",
+               "fontWeight": "normal",
+               "messageKey": null,
+             },
+             "id": "color-contrast",
+             "impact": "serious",
+             "message": "Element has insufficient color contrast of 3.47 (foreground color: #7e8b9a, background color: #ffffff, font size: 7.5pt (10px), font weight: normal). Expected contrast ratio of 4.5:1",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<aside class=\"model-panel\">",
+                 "target": Array [
+                   ".model-panel",
+                 ],
+               },
+             ],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Element has insufficient color contrast of 3.47 (foreground color: #7e8b9a, background color: #ffffff, font size: 7.5pt (10px), font weight: normal). Expected contrast ratio of 4.5:1",
+         "html": "<p class=\"explorer-empty\">None in this model</p>",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           "details[data-branch=\"rcBeam\"] > .explorer-children > .explorer-empty",
+         ],
+       },
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "bgColor": "#ffffff",
+               "contrastRatio": 3.47,
+               "expectedContrastRatio": "4.5:1",
+               "fgColor": "#7e8b9a",
+               "fontSize": "7.5pt (10px)",
+               "fontWeight": "normal",
+               "messageKey": null,
+             },
+             "id": "color-contrast",
+             "impact": "serious",
+             "message": "Element has insufficient color contrast of 3.47 (foreground color: #7e8b9a, background color: #ffffff, font size: 7.5pt (10px), font weight: normal). Expected contrast ratio of 4.5:1",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<aside class=\"model-panel\">",
+                 "target": Array [
+                   ".model-panel",
+                 ],
+               },
+             ],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Element has insufficient color contrast of 3.47 (foreground color: #7e8b9a, background color: #ffffff, font size: 7.5pt (10px), font weight: normal). Expected contrast ratio of 4.5:1",
+         "html": "<p class=\"explorer-empty\">None in this model</p>",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           "details[data-branch=\"slab\"] > .explorer-children > .explorer-empty",
+         ],
+       },
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "bgColor": "#ffffff",
+               "contrastRatio": 3.47,
+               "expectedContrastRatio": "4.5:1",
+               "fgColor": "#7e8b9a",
+               "fontSize": "7.5pt (10px)",
+               "fontWeight": "normal",
+               "messageKey": null,
+             },
+             "id": "color-contrast",
+             "impact": "serious",
+             "message": "Element has insufficient color contrast of 3.47 (foreground color: #7e8b9a, background color: #ffffff, font size: 7.5pt (10px), font weight: normal). Expected contrast ratio of 4.5:1",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<aside class=\"model-panel\">",
+                 "target": Array [
+                   ".model-panel",
+                 ],
+               },
+             ],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Element has insufficient color contrast of 3.47 (foreground color: #7e8b9a, background color: #ffffff, font size: 7.5pt (10px), font weight: normal). Expected contrast ratio of 4.5:1",
+         "html": "<p class=\"explorer-empty\">None in this model</p>",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           "details[data-branch=\"padFooting\"] > .explorer-children > .explorer-empty",
+         ],
+       },
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "bgColor": "#ffffff",
+               "contrastRatio": 4.23,
+               "expectedContrastRatio": "4.5:1",
+               "fgColor": "#6b7d90",
+               "fontSize": "6.8pt (9px)",
+               "fontWeight": "normal",
+               "messageKey": null,
+             },
+             "id": "color-contrast",
+             "impact": "serious",
+             "message": "Element has insufficient color contrast of 4.23 (foreground color: #6b7d90, background color: #ffffff, font size: 6.8pt (9px), font weight: normal). Expected contrast ratio of 4.5:1",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<aside class=\"model-panel\">",
+                 "target": Array [
+                   ".model-panel",
+                 ],
+               },
+             ],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Element has insufficient color contrast of 4.23 (foreground color: #6b7d90, background color: #ffffff, font size: 6.8pt (9px), font weight: normal). Expected contrast ratio of 4.5:1",
+         "html": "<small>Reference load</small>",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           "button[data-entity-key=\"loadCases\"] > small",
+         ],
+       },
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "bgColor": "#ffffff",
+               "contrastRatio": 4.23,
+               "expectedContrastRatio": "4.5:1",
+               "fgColor": "#6b7d90",
+               "fontSize": "6.8pt (9px)",
+               "fontWeight": "normal",
+               "messageKey": null,
+             },
+             "id": "color-contrast",
+             "impact": "serious",
+             "message": "Element has insufficient color contrast of 4.23 (foreground color: #6b7d90, background color: #ffffff, font size: 6.8pt (9px), font weight: normal). Expected contrast ratio of 4.5:1",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<aside class=\"model-panel\">",
+                 "target": Array [
+                   ".model-panel",
+                 ],
+               },
+             ],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Element has insufficient color contrast of 4.23 (foreground color: #6b7d90, background color: #ffffff, font size: 6.8pt (9px), font weight: normal). Expected contrast ratio of 4.5:1",
+         "html": "<small>Synthetic isotropic material</small>",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           "button[data-entity-key=\"materials\"] > small",
+         ],
+       },
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "bgColor": "#ffffff",
+               "contrastRatio": 4.23,
+               "expectedContrastRatio": "4.5:1",
+               "fgColor": "#6b7d90",
+               "fontSize": "6.8pt (9px)",
+               "fontWeight": "normal",
+               "messageKey": null,
+             },
+             "id": "color-contrast",
+             "impact": "serious",
+             "message": "Element has insufficient color contrast of 4.23 (foreground color: #6b7d90, background color: #ffffff, font size: 6.8pt (9px), font weight: normal). Expected contrast ratio of 4.5:1",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<aside class=\"model-panel\">",
+                 "target": Array [
+                   ".model-panel",
+                 ],
+               },
+             ],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   Element has insufficient color contrast of 4.23 (foreground color: #6b7d90, background color: #ffffff, font size: 6.8pt (9px), font weight: normal). Expected contrast ratio of 4.5:1",
+         "html": "<small>Synthetic principal section</small>",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           "button[data-entity-key=\"sections\"] > small",
+         ],
+       },
+     ],
+     "tags": Array [
+       "cat.color",
+       "wcag2aa",
+       "wcag143",
+       "TTv5",
+       "TT13.c",
+       "EN-301-549",
+       "EN-9.1.4.3",
+       "ACT",
+       "RGAAv4",
+       "RGAA-3.2.1",
+     ],
+   },
+ ]
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - button "Projects home" [ref=e4] [cursor=pointer]
      - menubar "Application menu" [ref=e7]:
        - menuitem "File" [ref=e8] [cursor=pointer]
        - menuitem "Edit" [ref=e9] [cursor=pointer]
        - menuitem "View" [ref=e10] [cursor=pointer]
        - menuitem "Model" [ref=e11] [cursor=pointer]
        - menuitem "Analysis" [ref=e12] [cursor=pointer]
        - menuitem "Help" [ref=e13] [cursor=pointer]
      - generic [ref=e14]:
        - textbox "Project name" [ref=e15]: B07
        - generic [ref=e16]: Saved locally
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
    - generic [ref=e134]:
      - complementary [ref=e135]:
        - generic [ref=e136]:
          - text: Model explorer
          - generic [ref=e137]: r0
        - generic [ref=e143]:
          - strong [ref=e144]: Frame model
          - generic [ref=e145]: 2 nodes · 1 members
        - generic [ref=e146]:
          - searchbox "Search model" [ref=e147]
          - generic [ref=e148]:
            - button "Expand all" [ref=e149] [cursor=pointer]
            - button "Collapse all" [ref=e150] [cursor=pointer]
        - navigation "Model entities" [ref=e151]:
          - group [ref=e152]:
            - generic "Structure" [ref=e153] [cursor=pointer]
            - generic [ref=e154]:
              - group [ref=e155]:
                - generic "Storeys & physical members" [ref=e156] [cursor=pointer]
                - generic [ref=e157]:
                  - button "+ Add storey" [ref=e158] [cursor=pointer]
                  - group [ref=e159]:
                    - generic "Unassigned storey1" [ref=e160] [cursor=pointer]
                    - group [ref=e162]:
                      - generic "Unassigned role1" [ref=e163] [cursor=pointer]
                      - generic [ref=e165]:
                        - button "m1 unassigned" [ref=e166] [cursor=pointer]:
                          - generic [ref=e167]: m1
                          - generic [ref=e168]: unassigned
                        - button "m1 n1 → n2" [ref=e169] [cursor=pointer]:
                          - generic [ref=e170]: m1
                          - generic [ref=e171]: n1 → n2
              - button "Members 1" [ref=e172] [cursor=pointer]:
                - text: Members
                - generic [ref=e173]: "1"
                - generic [aria-hidden] [ref=e174]: ↗
              - group [ref=e175]:
                - generic "Grids0" [ref=e176] [cursor=pointer]
              - group [ref=e177]:
                - generic "Layers0" [ref=e178] [cursor=pointer]
              - group [ref=e179]:
                - generic "Groups0" [ref=e180] [cursor=pointer]
              - group [ref=e181]:
                - generic "Joints2" [ref=e182] [cursor=pointer]
              - group [ref=e183]:
                - generic "Support details2" [ref=e184] [cursor=pointer]
              - group [ref=e185]:
                - generic "Design object bindings0" [ref=e186] [cursor=pointer]
              - group [ref=e187]:
                - generic "Analytical nodes2" [ref=e188] [cursor=pointer]
                - generic [ref=e189]:
                  - button "Analytical nodes 2" [ref=e190] [cursor=pointer]:
                    - text: Analytical nodes
                    - generic [ref=e191]: "2"
                    - generic [aria-hidden] [ref=e192]: ↗
                  - button "n1" [ref=e193] [cursor=pointer]
                  - button "n2" [ref=e199] [cursor=pointer]
              - group [ref=e205]:
                - generic "Supports2" [ref=e206] [cursor=pointer]
                - generic [ref=e207]:
                  - button "Supports 2" [ref=e208] [cursor=pointer]:
                    - text: Supports
                    - generic [ref=e209]: "2"
                    - generic [aria-hidden] [ref=e210]: ↗
                  - button "s1 n1" [ref=e211] [cursor=pointer]:
                    - generic [ref=e216]: s1
                    - generic [ref=e217]: n1
                  - button "s2 n2" [ref=e218] [cursor=pointer]:
                    - generic [ref=e223]: s2
                    - generic [ref=e224]: n2
              - group [ref=e225]:
                - generic "Design objects · mock" [ref=e226] [cursor=pointer]
                - generic [ref=e227]:
                  - group [ref=e228]:
                    - generic "RC beams0" [ref=e229] [cursor=pointer]
                    - paragraph [ref=e231]: None in this model
                  - group [ref=e232]:
                    - generic "Slabs0" [ref=e233] [cursor=pointer]
                    - paragraph [ref=e235]: None in this model
                  - group [ref=e236]:
                    - generic "Foundations0" [ref=e237] [cursor=pointer]
                    - paragraph [ref=e239]: None in this model
          - group [ref=e240]:
            - generic "Load cases & combinations" [ref=e241] [cursor=pointer]
            - generic [ref=e242]:
              - group [ref=e243]:
                - generic "Load cases1" [ref=e244] [cursor=pointer]
                - generic [ref=e245]:
                  - button "Load cases 1" [ref=e246] [cursor=pointer]:
                    - text: Load cases
                    - generic [ref=e247]: "1"
                    - generic [aria-hidden] [ref=e248]: ↗
                  - button "lc1 Reference load" [ref=e249] [cursor=pointer]:
                    - generic [ref=e254]: lc1
                    - generic [ref=e255]: Reference load
              - group [ref=e256]:
                - generic "Loads1" [ref=e257] [cursor=pointer]
                - generic [ref=e258]:
                  - button "Loads 1" [ref=e259] [cursor=pointer]:
                    - text: Loads
                    - generic [ref=e260]: "1"
                    - generic [aria-hidden] [ref=e261]: ↗
                  - button "l1" [ref=e262] [cursor=pointer]
              - group [ref=e268]:
                - generic "Combinations0" [ref=e269] [cursor=pointer]
                - button "Combinations 0" [ref=e271] [cursor=pointer]:
                  - text: Combinations
                  - generic [ref=e272]: "0"
                  - generic [aria-hidden] [ref=e273]: ↗
          - group [ref=e274]:
            - generic "Materials1" [ref=e275] [cursor=pointer]
            - generic [ref=e276]:
              - button "Materials 1" [ref=e277] [cursor=pointer]:
                - text: Materials
                - generic [ref=e278]: "1"
                - generic [aria-hidden] [ref=e279]: ↗
              - button "mat1 Synthetic isotropic material" [ref=e280] [cursor=pointer]:
                - generic [ref=e285]: mat1
                - generic [ref=e286]: Synthetic isotropic material
          - group [ref=e287]:
            - generic "Sections1" [ref=e288] [cursor=pointer]
            - generic [ref=e289]:
              - button "Sections 1" [ref=e290] [cursor=pointer]:
                - text: Sections
                - generic [ref=e291]: "1"
                - generic [aria-hidden] [ref=e292]: ↗
              - button "sec1 Synthetic principal section" [ref=e293] [cursor=pointer]:
                - generic [ref=e297]: sec1
                - generic [ref=e298]: Synthetic principal section
        - generic [ref=e299]:
          - paragraph [ref=e300]: ANALYSIS MODEL
          - generic [ref=e301]:
            - text: Mode
            - combobox "Mode" [ref=e302]:
              - option "Spatial frame"
              - option "Planar XZ" [selected]
          - paragraph [ref=e303]: Linear elastic · Euler–BernoulliCustom synthetic sections
          - button "View capabilities ↗" [ref=e304] [cursor=pointer]
      - region "Structural viewport" [ref=e305]:
        - generic [ref=e306]:
          - generic [ref=e307]:
            - button "Plan" [ref=e308] [cursor=pointer]
            - button "Elevation" [ref=e309] [cursor=pointer]
            - button "3D" [ref=e310] [cursor=pointer]
          - group "Canvas navigation and overlays" [ref=e311]:
            - button "Pan" [ref=e312] [cursor=pointer]
            - button "Orbit" [ref=e319] [cursor=pointer]
            - button "Local axes" [pressed] [ref=e327] [cursor=pointer]
            - button "Dimensions" [pressed] [ref=e334] [cursor=pointer]
            - button "Fit" [ref=e342] [cursor=pointer]
          - button "Copy bay" [ref=e349] [cursor=pointer]
          - generic [ref=e350]:
            - text: Results
            - combobox "Result family" [ref=e351]:
              - option "Model & deformation" [selected]
              - option "Member forces"
              - option "Member moments"
          - generic [ref=e352]:
            - text: Component
            - combobox "Result component" [ref=e353]:
              - option "Model"
              - option "Deformation" [selected]
          - generic [ref=e354]:
            - text: Displacement ×
            - spinbutton "Deformation scale" [ref=e355]: "10"
        - generic [ref=e356]:
          - generic "Frame model. Click to select, Shift toggles. Drag a selection box; middle drag or Space pans. Wheel zooms at the cursor." [ref=e357]
          - generic:
            - generic: STRUCTURAL MODEL
            - strong: B07
            - generic: Global XZ · metres
          - generic:
            - generic "n1"
            - generic "n2"
            - generic "m1"
            - generic "m1 · True member length 6 m": 6 m
            - generic "x"
            - generic "y (normal to view)"
            - generic "z"
            - generic "m1 local axes · x [1, 0, 0] · y [0, 1, 0] · z [0, 0, 1]"
            - 'button "Properties for s1: Pinned · restrained X, Z" [ref=e358] [cursor=pointer]': s1 · Pinned
            - 'button "Properties for s2: Roller · restrained Z" [ref=e359] [cursor=pointer]': s2 · Roller
            - 'button "Properties for l1: l1 · 10 kN/m · global" [ref=e360] [cursor=pointer]': l1 · 10 kN/m · global
          - generic [ref=e361]:
            - generic [ref=e362]: Undeformed
            - generic [ref=e364]:
              - text: Deformed ×
              - status [ref=e366]: "10"
          - generic:
            - 'img "Global axes follow the camera: X red, Y green, Z blue"':
              - generic "Global Y (end-on)": "Y"
              - generic "Global X": X
              - generic "Global Z": Z
              - generic: GLOBAL AXES
          - generic [ref=e367]: WEBGPU · google
        - generic [ref=e368]:
          - generic [ref=e369]: Select · Plane XZ
          - status
          - generic [ref=e370]: Member m1 selected · n1 → n2
          - generic [ref=e371]: 2ae7cd8f5ce4 · f64
      - generic [ref=e372]:
        - generic [ref=e373]:
          - button "Displacements" [ref=e374] [cursor=pointer]
          - button "Reactions" [ref=e375] [cursor=pointer]
          - button "Member forces" [ref=e376] [cursor=pointer]
          - button "End actions" [ref=e377] [cursor=pointer]
          - button "Elastic stress" [ref=e378] [cursor=pointer]
          - button "Equilibrium" [ref=e379] [cursor=pointer]
          - button "Design preview" [ref=e380] [cursor=pointer]
          - button "Steel design" [ref=e381] [cursor=pointer]
          - generic [ref=e382]: ✓ Current
          - button "CSV" [ref=e383] [cursor=pointer]
          - button "Collapse results" [expanded] [ref=e389] [cursor=pointer]
        - region "Analysis results" [ref=e390]:
          - table [ref=e391]:
            - rowgroup [ref=e392]:
              - row [ref=e393]:
                - columnheader "Node" [ref=e394]
                - columnheader "ux [mm]" [ref=e395]
                - columnheader "uy [mm]" [ref=e396]
                - columnheader "uz [mm]" [ref=e397]
                - columnheader "rx [rad]" [ref=e398]
                - columnheader "ry [rad]" [ref=e399]
                - columnheader "rz [rad]" [ref=e400]
            - rowgroup [ref=e401]:
              - row [ref=e402]:
                - rowheader "n1" [ref=e403]
                - cell "0" [ref=e404]
                - cell "0" [ref=e405]
                - cell "0" [ref=e406]
                - cell "0" [ref=e407]
                - cell "0.005625" [ref=e408]
                - cell "0" [ref=e409]
              - row [ref=e410]:
                - rowheader "n2" [ref=e411]
                - cell "0" [ref=e412]
                - cell "0" [ref=e413]
                - cell "0" [ref=e414]
                - cell "0" [ref=e415]
                - cell "-0.005625" [ref=e416]
                - cell "0" [ref=e417]
    - generic [ref=e418]:
      - generic [ref=e419]:
        - text: "Units:"
        - combobox "Display units" [ref=e420]:
          - option "m · kN · mm" [selected]
          - option "m · N · m"
      - generic [ref=e421]: ● Rust / WASM ready
      - generic "eeedc6f3ad2aa017fb864a6b16582b6004a9a839f12cadc1042d3ecfb5b86497" [ref=e422]: Build eeedc6f3ad2a
      - generic [ref=e423]: Online
      - button "Analysis & design scope" [ref=e424] [cursor=pointer]
  - dialog [ref=e425]:
    - generic [ref=e426]:
      - heading "Edit topology" [level=2] [ref=e427]
      - button "Close dialog" [ref=e428] [cursor=pointer]: ×
    - generic [ref=e429]:
      - paragraph [ref=e430]: Preview the resulting nodes, members, supports and loads before committing. Split creates a separate node; Connect intersections explicitly joins selected crossing members. Merge is limited to nodes within 0.000001 m. Collinear overlaps are excluded from Connect.
      - generic [ref=e431]:
        - generic [ref=e432]:
          - text: Operation
          - combobox "Operation" [ref=e433]:
            - option "Split member" [selected]
            - option "Connect intersections"
            - option "Merge nodes"
        - generic [ref=e434]:
          - generic [ref=e435]:
            - text: Member to split
            - combobox "Member to split" [ref=e436]:
              - option "m1" [selected]
          - generic [ref=e437]:
            - text: Split fractions (comma separated)
            - textbox "Split fractions (comma separated)" [ref=e438]: 0.25, 0.75
        - button "Preview topology" [active] [ref=e439] [cursor=pointer]
      - alert
      - region "Topology changes" [ref=e440]:
        - paragraph [ref=e441]: Preview validated. No model changes yet. Commit applies one undo step.
        - heading "nodes · 2 → 4" [level=3] [ref=e442]
        - list [ref=e443]:
          - listitem [ref=e444]:
            - strong [ref=e445]: n3
            - text: · add
            - generic [ref=e446]: Position [1.5, 0, 0] m
          - listitem [ref=e447]:
            - strong [ref=e448]: n4
            - text: · add
            - generic [ref=e449]: Position [4.5, 0, 0] m
        - heading "members · 1 → 3" [level=3] [ref=e450]
        - list [ref=e451]:
          - listitem [ref=e452]:
            - strong [ref=e453]: m1
            - text: · remove
            - generic [ref=e454]: n1 → n2; material mat1; section sec1
          - listitem [ref=e455]:
            - strong [ref=e456]: m2
            - text: · add
            - generic [ref=e457]: n1 → n3; material mat1; section sec1; parent m1, stations 0–0.25
          - listitem [ref=e458]:
            - strong [ref=e459]: m3
            - text: · add
            - generic [ref=e460]: n3 → n4; material mat1; section sec1; parent m1, stations 0.25–0.75
          - listitem [ref=e461]:
            - strong [ref=e462]: m4
            - text: · add
            - generic [ref=e463]: n4 → n2; material mat1; section sec1; parent m1, stations 0.75–1
        - heading "supports · 2 → 2" [level=3] [ref=e464]
        - paragraph [ref=e465]: Unchanged
        - heading "loads · 1 → 3" [level=3] [ref=e466]
        - list [ref=e467]:
          - listitem [ref=e468]:
            - strong [ref=e469]: l1
            - text: · remove
            - generic [ref=e470]: Case lc1; member m1; global density [0, 0, -10000] N/m
          - listitem [ref=e471]:
            - strong [ref=e472]: l2
            - text: · add
            - generic [ref=e473]: Case lc1; member m2; global density [0, 0, -10000] N/m
          - listitem [ref=e474]:
            - strong [ref=e475]: l3
            - text: · add
            - generic [ref=e476]: Case lc1; member m3; global density [0, 0, -10000] N/m
          - listitem [ref=e477]:
            - strong [ref=e478]: l4
            - text: · add
            - generic [ref=e479]: Case lc1; member m4; global density [0, 0, -10000] N/m
      - button "Commit topology" [ref=e480] [cursor=pointer]
```

# Test source

```ts
  1   | import { menuCommand } from "../menu-helpers.js";
  2   | import { evidenceDir } from "../../tools/evidence.mjs";
  3   | import { test, expect } from "@playwright/test";
  4   | import AxeBuilder from "@axe-core/playwright";
  5   | import { readFile, writeFile, mkdir } from "node:fs/promises";
  6   | import { execFileSync } from "node:child_process";
  7   | const folder = evidenceDir("evidence/M01/topology");
  8   | async function exported(page) {
  9   |   const pending = page.waitForEvent("download");
  10  |   await menuCommand(page, "File", "Download project");
  11  |   return JSON.parse(await readFile(await (await pending).path(), "utf8"));
  12  | }
  13  | async function importProject(page, p) {
  14  |   await page.locator("#import-file").setInputFiles({
  15  |     name: "topology.json",
  16  |     mimeType: "application/json",
  17  |     buffer: Buffer.from(JSON.stringify(p)),
  18  |   });
  19  |   await expect(page.locator("#workspace")).toBeVisible();
  20  | }
  21  | async function preview(page) {
  22  |   await page
  23  |     .getByRole("button", { name: "Preview topology", exact: true })
  24  |     .click();
  25  |   await expect(page.locator("#topology-commit")).toBeVisible();
  26  | }
  27  | async function commit(page) {
  28  |   await page.locator("#topology-commit").click();
  29  |   await expect(page.locator("#modal")).not.toBeVisible();
  30  | }
  31  | test("M01 topology: axes, loaded split preview, undo, redo, oracle, save and reopen", async ({
  32  |   page,
  33  | }) => {
  34  |   await mkdir(folder, { recursive: true });
  35  |   await page.goto("/");
  36  |   const original = JSON.parse(
  37  |     await readFile("fixtures/models/B07.json", "utf8"),
  38  |   );
  39  |   await importProject(page, original);
  40  |   const initial = await exported(page),
  41  |     hash = await page.locator("#hash-status").textContent();
  42  |   await page.locator("#analyse").click();
  43  |   await expect(page.locator("#result-status")).toHaveText("✓ Current");
  44  |   await page.locator("#axes-toggle").click();
  45  |   await expect(page.locator(".axis-summary")).toContainText("m1 local axes");
  46  |   await page.screenshot({ path: `${folder}/axes.png`, fullPage: true });
  47  |   await expect(page.locator("#result-status")).toHaveText("✓ Current");
  48  |   await expect(page.locator("#hash-status")).toHaveText(hash);
  49  |   await page.locator("#topology").click();
  50  |   await page.locator("#split-stations").fill("0.25, 0.75");
  51  |   await preview(page);
  52  |   await expect(page.locator("#topology-preview")).toContainText(
  53  |     "members · 1 → 3",
  54  |   );
  55  |   await expect(page.locator("#hash-status")).toHaveText(hash);
  56  |   await page.locator("#split-stations").fill("0");
  57  |   await expect(page.locator("#topology-commit")).toBeHidden();
  58  |   await page
  59  |     .getByRole("button", { name: "Preview topology", exact: true })
  60  |     .click();
  61  |   await expect(page.locator("#topology-error")).toContainText("INVALID_SCHEMA");
  62  |   await page.locator("#split-stations").fill("0.25, 0.75");
  63  |   await preview(page);
  64  |   const scan = await new AxeBuilder({ page })
  65  |     .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
  66  |     .analyze();
> 67  |   expect(scan.violations).toEqual([]);
      |                           ^ Error: expect(received).toEqual(expected) // deep equality
  68  |   await page.screenshot({
  69  |     path: `${folder}/split-preview.png`,
  70  |     fullPage: true,
  71  |   });
  72  |   await commit(page);
  73  |   await expect(page.locator("#model-count")).toHaveText("4 nodes · 3 members");
  74  |   await expect(page.locator("#result-status")).toContainText("Stale");
  75  |   const split = await exported(page);
  76  |   expect(split.loads).toHaveLength(3);
  77  |   expect(split.members.map((x) => x.parentMemberId)).toEqual([
  78  |     "m1",
  79  |     "m1",
  80  |     "m1",
  81  |   ]);
  82  |   await page.locator("#undo").click();
  83  |   const undo = await exported(page);
  84  |   for (const key of ["nodes", "members", "loads", "supports"])
  85  |     expect(undo[key]).toEqual(initial[key]);
  86  |   await page.locator("#redo").click();
  87  |   const redo = await exported(page);
  88  |   for (const key of ["nodes", "members", "loads", "supports"])
  89  |     expect(redo[key]).toEqual(split[key]);
  90  |   await writeFile(
  91  |     `${folder}/split-project.json`,
  92  |     JSON.stringify(split, null, 2),
  93  |   );
  94  |   const oracle = JSON.parse(
  95  |     execFileSync(
  96  |       "tools/oracle-env/bin/python",
  97  |       ["tools/oracle.py", `${folder}/split-project.json`],
  98  |       { encoding: "utf8" },
  99  |     ),
  100 |   );
  101 |   await writeFile(
  102 |     `${folder}/split-opensees.json`,
  103 |     JSON.stringify(oracle, null, 2),
  104 |   );
  105 |   await page.locator("#analyse").click();
  106 |   await expect(page.locator("#result-status")).toHaveText("✓ Current");
  107 |   const rows = page.locator("#results-content tbody tr");
  108 |   for (const [i, n] of split.nodes.entries()) {
  109 |     const cells = await rows.nth(i).locator("td").allTextContents();
  110 |     for (let j = 0; j < 6; j++)
  111 |       expect(
  112 |         Math.abs(Number(cells[j]) - oracle.nodes[n.id][j] * (j < 3 ? 1000 : 1)),
  113 |       ).toBeLessThan(0.00000051);
  114 |   }
  115 |   const download = page.waitForEvent("download");
  116 |   await menuCommand(page, "File", "Export calculation report");
  117 |   await writeFile(
  118 |     `${folder}/split-report.html`,
  119 |     await readFile(await (await download).path()),
  120 |   );
  121 |   await expect(page.locator("#save-status")).toHaveText("Saved locally");
  122 |   await page.reload();
  123 |   await page.getByRole("button", { name: /B07.*4 nodes/ }).click();
  124 |   const reopened = await exported(page);
  125 |   expect(reopened.members).toEqual(split.members);
  126 |   expect(reopened.loads).toEqual(split.loads);
  127 |   // A portable JSON import must also accept optional member provenance.
  128 |   await importProject(page, split);
  129 |   await expect(page.locator("#model-count")).toHaveText("4 nodes · 3 members");
  130 | });
  131 | test("M01 topology: crossing stays disconnected, connect and merge are previewed and atomic", async ({
  132 |   page,
  133 | }) => {
  134 |   await page.goto("/");
  135 |   const p = JSON.parse(await readFile("fixtures/models/B02.json", "utf8"));
  136 |   p.analysisMode = "planarXZ";
  137 |   p.nodes.push(
  138 |     { id: "n3", position: [1.5, 0, -1] },
  139 |     { id: "n4", position: [1.5, 0, 1] },
  140 |     { id: "near", position: [0, 0, 0] },
  141 |   );
  142 |   p.members.push({ ...p.members[0], id: "m2", start: "n3", end: "n4" });
  143 |   await importProject(page, p);
  144 |   await expect(page.locator("#model-count")).toHaveText("5 nodes · 2 members");
  145 |   const original = await exported(page);
  146 |   await page.locator("#topology").click();
  147 |   await page.locator("#topology-kind").selectOption("ConnectIntersections");
  148 |   await preview(page);
  149 |   await expect(page.locator("#model-count")).toHaveText("5 nodes · 2 members");
  150 |   await page.locator("#close-modal").click();
  151 |   expect((await exported(page)).members).toEqual(original.members);
  152 |   await page.locator("#topology").click();
  153 |   await page.locator("#topology-kind").selectOption("ConnectIntersections");
  154 |   await preview(page);
  155 |   await commit(page);
  156 |   await expect(page.locator("#model-count")).toHaveText("6 nodes · 4 members");
  157 |   const connected = await exported(page);
  158 |   const joint = connected.nodes.find(
  159 |     (n) => n.position[0] === 1.5 && n.position[2] === 0,
  160 |   );
  161 |   expect(
  162 |     connected.members.filter((m) => m.start === joint.id || m.end === joint.id),
  163 |   ).toHaveLength(4);
  164 |   await page.locator("#undo").click();
  165 |   await expect(page.locator("#model-count")).toHaveText("5 nodes · 2 members");
  166 |   await page.locator("#topology").click();
  167 |   await page.locator("#topology-kind").selectOption("MergeNodes");
```