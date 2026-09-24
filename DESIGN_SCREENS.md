# Product screen designs

These high-fidelity concepts translate the specification into a consistent desktop product. They guide layout, hierarchy, workflows and visual language. They are not pixel-perfect acceptance references: implemented controls must use real data, accessible DOM elements and the behaviour defined by the specification.

## Shared visual system

- Dark navy application bar, warm white work surfaces and graphite engineering geometry.
- Engineering blue for selection and primary actions, amber for warnings and scope limits, green only for verified or current states, and coral for force diagrams.
- Compact system typography with tabular numerals. Minimum control text is 14 CSS px at the target desktop layout.
- Stable left navigation or model tree, central work surface, contextual right inspector and a resizable results drawer where needed.
- Icons always have labels or accessible names. Colour never carries status alone.
- Dense data remain readable through alignment, grouping and whitespace rather than decorative cards.

## Screen 01 Projects

![Projects screen](design-screens/01-projects.png)

Supports first session, recovery and project discovery. The three primary actions map to new model, portable project import and validated examples. Capability states distinguish available modules from planned work. Recent projects expose analysis state and local persistence without implying cloud storage.

Implementation notes: populate recent projects from IndexedDB; keep Open project available after storage failure; show exact build and offline state; never hard-code capability status in display-only markup.

## Screen 02 Model workspace

![Model workspace](design-screens/02-model-workspace.png)

The model tree, WebGPU viewport and property inspector remain synchronised by stable entity ID. The selected member shows section, material, local axis and releases. The viewport emphasises topology and structural meaning; editable properties remain standard accessible controls.

Implementation notes: preserve the specification's panel dimensions as initial targets; use authoritative Rust geometry for commit and picking; expose keyboard/table alternatives; distinguish selected, hovered and invalid entities; keep units and snap state visible.

## Screen 03 Analysis results

![Analysis results](design-screens/03-analysis-results.png)

The viewport overlays deformed geometry and a signed bending-moment diagram while the probe gives entity, station, combination, value and governing source. The results drawer provides exact tabular values. Current/stale state and equilibrium checks are always visible.

Implementation notes: derive plots and tables from the same immutable result buffers; retain discontinuity sides and exact extrema; do not mix envelope maxima into a simultaneous force vector; a failed analysis shows structured diagnostics instead of a result screen with zeros.

## Screen 04 Steel member check

![Steel member check](design-screens/04-steel-member-check.png)

The design screen combines input provenance, a mandatory-check tree, governing utilisation and calculation report. The verified-profile badge is scoped by the adjacent edition and limitation notice. Users can inspect each check rather than accepting a single traffic-light result.

Implementation notes: render this screen only for an enabled, verified code profile; an unsupported mandatory check changes overall status to unsupported; link demand to one real model hash, result set, station and combination; preserve exact clause and intermediate-value traceability in the export.

**Post-M07 target:** Screen 04’s information architecture remains valid, but the primary product path moves into the existing application shell. Ownership is exclusive per ADR 0008: **M07-F** = inspector + calc drawer (mockups 01–02); **M07-G** = overview / catalogue / study (mockups 03–05). See `PARITY_ROADMAP.md` §3.1 and [`docs/design/M07-WORKFLOW/`](docs/design/M07-WORKFLOW/README.md).

### Approved steel shell mockups (from design conversation)

![Selected member steel design](docs/design/M07-WORKFLOW/screens/approved/01-member-design.png)

![Calculation details](docs/design/M07-WORKFLOW/screens/approved/02-calculation-details.png)

![Whole-model overview](docs/design/M07-WORKFLOW/screens/approved/03-overview.png)

![Section catalogue](docs/design/M07-WORKFLOW/screens/approved/04-section-catalogue.png)

![Section study](docs/design/M07-WORKFLOW/screens/approved/05-section-study.png)

Full specification with §36 screen contracts: [`docs/design/M07-WORKFLOW/structural-workbench-steel-design-spec.md`](docs/design/M07-WORKFLOW/structural-workbench-steel-design-spec.md). Layout only — code pins and S2 breadth remain SPEC. Serviceability PASS/FAIL waits for **M07-S**; until then show not checked.

## Planned design-shell screens (retrieved mockups)

These reuse Screen 02’s shell regions. Mockups and briefs live under `docs/design/M0*-WORKFLOW/`.

| Screen family | Owning slice | Design pack |
| --- | --- | --- |
| Selected-member steel design + calculation details | M07-F | [`docs/design/M07-WORKFLOW/`](docs/design/M07-WORKFLOW/README.md) |
| Whole-model steel overview / catalogue / section study | M07-G | same |
| RC beam reinforcement + schedule | M08-SHELL | [`docs/design/M08-WORKFLOW/`](docs/design/M08-WORKFLOW/README.md) |
| Slab mesh / contours / rebar maps | M10-SHELL | [`docs/design/M10-WORKFLOW/`](docs/design/M10-WORKFLOW/README.md) (captions; PNGs pending) |
| Pad footing contact / structural / study | M11-SHELL | [`docs/design/M11-WORKFLOW/`](docs/design/M11-WORKFLOW/README.md) |

## Responsive and degraded behaviour

The full CAD workspace targets 1280 by 720 or larger. At narrower widths, the tree and inspector become mutually exclusive overlays while save, analysis state, results tables and export remain accessible. If WebGPU is unavailable, retain modelling forms, tables, calculation results and portable project export with a clear viewport capability message.

## Relationship to milestones

| Screen | Primary milestones |
| --- | --- |
| Projects | M00, M04, M05 |
| Model workspace | M00–M03 |
| Analysis results | M00–M06 |
| Steel member check (modal/harness) | M07 |
| Integrated steel design shell | M07-E (inputs), M07-F (01–02), M07-G (03–05); M07-S/LTB deferred |
| RC beam / slab / footing shells | M08-SHELL, M10-SHELL, M11-SHELL |

The images contain illustrative project names and values. Acceptance comes from the contracts and validation corpus, not from reproducing those values or pixels.
