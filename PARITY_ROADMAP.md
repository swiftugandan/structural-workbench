# Reference-suite parity roadmap and capability ledger

This is the proposed target ledger, not a statement of delivered functionality. Every implementation status starts PLANNED, every measured numerical comparison starts NOT_RUN and reference-suite numerical equivalence starts UNKNOWN. Baseline is the official product information inspected on 19 September 2026. Each row must acquire versioned evidence before it changes status.

## Immediate delivery priority

Analysis MVP (M00–M06) and bounded AISC S2 steel check (M07 parent + M07-UX) are accepted. M08 remains blocked on concrete code/example resources.

Next delivery focus is the **integrated design workspace** (ADR 0008): exclusive steel slices **M07-E → M07-F → M07-G**, with deferred **M07-S** / **M07-LTB**, then shell reuse for concrete modules after their engineering parents. Design packs under [`docs/design/M0*-WORKFLOW/`](docs/design/M07-WORKFLOW/README.md) are **layout refs only** — code pins remain SPEC/`SOURCES.md`. Earliest ready slice: [M07-E](agent-tasks/M07-E.md). Scheduling: `roadmap.json` `designExperienceProgram` / `subMilestones`, `delivery/state.json`. Parent M07 acceptance is not reopened.

## 1 Acceptance levels

L0 catalogued: authoritative scope identified. L1 usable: end-to-end workflow implemented with export/reopen. L2 verified: independent numerical, domain and failure-path gates pass. L3 compared: settings-matched reference-suite comparisons pass or differences are explained and bounded. L4 parity for a named scope: L1–L3 plus code/exchange/platform coverage and limitations match the explicit baseline row. No row reaches L4 merely because its UI exists.

Comparison scope key is product version, module, operation, formulation, code edition/amendment/annex, section/material range, load/restraint domain, exchange format and platform. Evidence records the exact key. A row may contain several independently accepted keys; one does not imply the rest.

## 2 Analysis and modelling

The analysis baseline below is derived from the reference suite's official analysis-module product page (S02). More detailed proposed acceptance subdivisions are our implementation plan.

| Capability | First usable slice | Final evidence needed | Initial parity status |
| --- | --- | --- | --- |
| Graphical node/member modelling | M00–M03 | Author/modify/save/reopen real structures with topology diagnostics | Planned |
| Physical to analytical mapping | M02–M03 | Deterministic child elements, stations and load conservation | Planned |
| Linear frame analysis | M00–M06 | Analytical, independent oracle and matched commercial corpus | Planned |
| Load cases, combinations and envelopes | M02 | Exact provenance and code-specific generator separately verified | Planned subset |
| Model-derived design actions | M07–M08 / M07-E | Same model/result hash, simultaneous action vectors, units, and model-native section provenance | Planned |
| Static second-order analysis | M09 | Convergence, geometric stiffness, imperfections and load-path comparisons; required before unrestricted steel beam-column design beyond declared effective-length workflows | Planned |
| Elastic buckling | M09 | Analytical critical loads, refinement, eigenmode pairing | Planned |
| Shells and automated meshing | M10 | Patch/locking/distortion/convergence and commercial mesh equivalence | Planned |
| Solid finite elements | M23 sub-slice | New solid-element dossier, patch/distortion/convergence and useful solid-analysis workflow | Inventory and formulation gate |
| Modal dynamics | M14 | Mass source, frequencies, shapes and participation | Planned |
| Seismic response | M15 | Pinned spectrum/loading code plus modal combination | Planned |
| Harmonic response | M15 | Frequency response, damping and independent benchmark | Planned |
| Large-displacement nonlinear response | M23 sub-slice | Defined corotational/total-Lagrangian formulation, paths and convergence | Beyond M09 |
| Material nonlinear response | M23 sub-slice | Constitutive integration, history, unloading and independent tests | Scope to verify |
| Load generation from wind/seismic codes | M15 and M23 | Each exact code edition and parameter source validated | No MVP generation |
| Tabular/graphical results and reports | M00–M06 | Numerical/table/plot agreement and reproducible report | Planned |
| Scripting and automation | M22 | Declarative study replay; Python compatibility separately scoped | Functional alternative |
| IDEA StatiCa integration | M23 exchange sub-slice | Exact supported interface and lawful test environment | External dependency |

## 3 Steel and connections

Module names are grounded in the reference suite's official steel product page (S03). Initial implementation may share check libraries, but each user workflow has its own acceptance record.

| Module or workflow | Planned slice | Specific parity condition |
| --- | --- | --- |
| Strut/compression member | M07 / M07-E | Section classification, member buckling and code-specific resistance with declared stability method |
| Beam column/combined forces | M07 / M09 | Simultaneous actions and interactions; unrestricted beam-column design waits on M09 or an explicitly restricted effective-length workflow |
| Standalone member check | M07 | Same functions and outputs as model-derived checks |
| Model-native W catalogue binding | M07-E | Named model section resolves to versioned design properties; no silent seed overlay |
| Design inputs and bracing | M07-E | Ky/Kz/Lb/Cb (and bracing segments) with visible provenance: catalogue / project default / derived / user / not provided |
| Integrated steel design shell | M07-F then M07-G | F = selected member + calc details (mockups 01–02); G = overview / catalogue / study (03–05). ADR 0008. |
| Whole-model steel review | M07-G | Bulk assign, design groups, batch progress/cancel, status tree, revision-addressable results (consumes readiness from M07-E) |
| Catalogue check/evaluate/optimise | M05 / M07-G | Provenance, valid candidate search and reanalysis after stiffness changes |
| Fin plate | M13 initial family | Complete connection failure modes, drawing and report |
| End plate | M13 extension | Full selected end-plate family including supported moment-transfer behaviour |
| Base plate | M13 extension | Plate/anchor/concrete/support assumptions and coupled failure modes |
| Bolt group | M13 extension | Defined load distribution, eccentricity and applicable bolt checks |
| Weld group | M13 extension | Defined weld stress method and supported geometry |
| Anchor bolt | M13 extension | Named anchor type, substrate assumptions and all required failure modes |
| Column splice | M13 extension | Transfer of axial/shear/moment with detail and all component checks |
| Cleat | M13 extension | Named connection configuration and component checks |
| Apex connection | M13 extension | Supported geometry, moment/force transfer and drawings |
| Hollow section connection | M23 sub-slice | Supported joint types and geometric/code validity ranges |
| Plate girder | M23 sub-slice | Web/flange/stiffener behaviour and applicable buckling checks |
| Crane beam | M23 sub-slice | Moving/eccentric actions, serviceability and code-specific checks |
| Combine named module | M23 inventory | Verify exact vendor scope before declaring coverage |

### 3.1 Integrated design workspace (post-M07 experience target)

Binding: [ADR 0008](docs/adr/0008-integrated-design-workspace.md). Steel pack §31 phases map 1:1 onto exclusive slices (no double-booking). Mockups guide panel content inside the live shell; they do not authorize Eurocode pins, new chrome, or silent PASS for deferred phases.

Target product loop (not yet fully delivered):

`model setup → design basis → design readiness → member/group assignment → batch check → graphical review → failure investigation → alternatives → apply change → reanalyse → compare → report/review`

Shell invariant for all material-design modules: **top menu/status; left Model Explorer; central WebGPU viewport + existing toolbar; right Selection inspector; bottom Results drawer; footer status**. Do not invent a parallel design navigation shell.

| Experience capability | Owning slice | Notes |
| --- | --- | --- |
| Model-native section → design props | M07-E | Close analysis `Section` ↔ `WSectionProps`; pack phases 1–3 |
| DesignValue provenance + Ky/Kz/Lb/Cb + bracing | M07-E | Catalogue / project default / derived / user / not provided |
| Member design readiness | M07-E | Incomplete → READY-incomplete, never PASS |
| Model-native demand path (no silent seed overlay) | M07-E | Demands from current analysis; seed path negative-tested |
| Declared first-order / effective-length basis | M07-E then M09 | No silent second-order claim until M09 |
| Selected-member inspector + calc drawer | M07-F | Mockups 01–02 only; pack phases 4–5 |
| Why navigation (strength path) | M07-F | Governing combination → station → clause |
| Strength status semantics | M07-F | PASS/FAIL/UNSUPPORTED/…; serviceability shown as not checked until M07-S |
| Whole-model overview / batch / status tree | M07-G | Mockup 03; pack phase 7 |
| Bulk assignment and design groups | M07-G | Preview/undo; family consistency |
| Catalogue browser + section study + what-changed | M07-G | Mockups 04–05; pack phase 9; Apply triggers reanalysis |
| Hierarchical multi-member reports | M07-G | Revision/hash-addressable results |
| Strength vs serviceability separation | M07-S | Deferred; pack phase 8 — F/G must not invent service utilisations |
| LTB / expanded W flexure beyond S2 | M07-LTB | Deferred; pack phase 6 — needs new fixtures |
| Second-order / DAM workflows | M09 | Pack phase 10 |
| Concrete beam shell screens | M08-SHELL | After M08 engineering; ACI pin per SPEC, not mockup Eurocode |
| Slab surface design screens | M10-SHELL | After M10 + `R-SHELL-BENCHMARKS` |
| Pad footing screens | M11-SHELL | After M11 engineering |

## 4 Concrete and detailing

Module names and broad features below are grounded in the reference suite's official concrete product page (S04). The roadmap subdivisions are proposed product increments. UI for each module must reuse the approved design shell (§3.1), not a separate calculator chrome.

| Module or workflow | Planned slice | Specific parity condition |
| --- | --- | --- |
| Continuous beam | M08 extension | Patterned loading, support/span reinforcement and full code scope |
| Beam section | M08 | Supported section/action domain and reinforcement checks |
| RC beam design shell | M08-SHELL | Setup, reinforcement proposal, schedule, calculation details, readiness — same shell as steel |
| Rectangular slab | M10 | Analysis-to-design mapping and supported reinforcement method |
| Slab design shell | M10-SHELL | Contours with display-vs-design action distinction; Top/Bottom X/Y maps; openings/regions |
| Rectangular column | M12 first | Interaction, slenderness and reinforcement layout |
| Circular column | M12 extension | Independently validated section integration |
| General column | M12 extension | Arbitrary supported geometry, bars and integration convergence |
| Pad footing | M11 | Eccentric pressure/contact domain and structural checks |
| Foundation design shell | M11-SHELL | Setup, soil/contact, structural checks, reinforcement, foundation study/overview |
| Pile cap | M16 sub-slice | Selected strut-and-tie/other method, equilibrium and reinforcement |
| Retaining wall | M16 sub-slice | Soil/water actions, stability and structural design |
| Punching shear | M11/M16 | Code-specific perimeters, openings and reinforcement applicability |
| Crack width | M08/M16 | Exact service combination, material and tension-stiffening assumptions |
| Long-term deflection | M16 | Creep/shrinkage/cracking assumptions and independent references |
| Prestressing/Captain workflow | M18 | Verify exact named-module scope and stages/losses/profile support |
| Harped/parabolic tendon profiles | M18 extension | Geometry, equivalent loads and stage effects |
| Reinforcement schedules and CAD export | M08/M16 | Persistent bar data and pinned detailing standard |
| Model-derived and standalone checks | Each module | Shared rule engine; reliable action transfer and reports |

## 5 Other confirmed product families and unresolved scope

Family presence is confirmed by the reference suite's official product overview (S01). Detailed acceptance subdomains are proposed until their inventories are verified.

| Family | Planned slice | Scope decision and dependency |
| --- | --- | --- |
| Composite | M17 | One staged member workflow first; inventory remaining elements |
| Masonry | M19 | Choose and verify reinforced/unreinforced element domain |
| Geotechnical | M20 | Bearing/slope workflow selected after inventory; methods independently verified |
| Reinforcement detailing | M16 | Browser detailing/schedules are a functional alternative; host CAD integration is separate |
| Revit exchange | M21 | IFC/file workflow first; native Revit bidirectional adapter conflicts with a strictly browser-only runtime |
| Timber | M23 discovery | Not confirmed in the current retrieved catalogue; do not claim absence or inclusion |
| General utilities and legacy Frame | M23 discovery | Enumerate current/legacy modules and user demand before scheduling |
| Native reference-suite files | M23 discovery | No format specification supplied; open exchange does not imply native compatibility |
| DWG exchange | M21 extension | Requires a lawful reader/converter; DXF does not count as DWG parity |
| Multilingual output | M22 extension | Stable numerical/check IDs and verified translation of report meaning |

## 6 Code coverage expands separately from module coverage

A module has a matrix of exact code editions, not one generic compliant flag. Proposed ordering: AISC 360-22 LRFD restricted steel; ACI 318-19 restricted RC beam; additional concrete/connection scopes under those profiles; then user-prioritised Eurocode, South African, British legacy and other regional profiles only after exact resource bundles exist. This is a planning choice, not a recommendation of governing standards for a real structure.

For Eurocodes, an annex/default-parameter policy is part of each scope key. For legacy editions, label legacy and preserve all required amendments. New editions are new packages with differential benchmarks, not an in-place silent switch. SANS, AS/NZS, Canadian, Hong Kong and other vendor-listed support cannot be inferred across all modules from one code list.

## 7 Reporting parity without misleading percentages

For a fixed inventory of N scope keys, report counts at L0/L1/L2/L3/L4, blocked-resource count and excluded-by-browser-only count. Do not weight an entire concrete suite as equal to one small utility. If a weighted management score is desired, freeze weights before development and show the raw counts alongside it. Missing inventory keeps suite completeness UNKNOWN.

Each comparison record includes status, raw outputs, normalised outputs, conventions, tolerance, discrepancy explanation and reference version. If the reference suite and the independent analytical oracle disagree, investigate both; do not imitate a suspected commercial error merely to obtain equality.

## 8 Changes that require explicit scope expansion

A Revit desktop adapter, cloud collaboration backend, paid native-format SDK, code-licensed private resource service or general solid CAD modeller is a new deployment/licensing boundary. Agents may prepare designs and resource requests, but the baseline browser product must remain functional without them. Full breadth parity may therefore require either accepting such extensions or retaining clearly named functional alternatives. The roadmap makes that tradeoff visible instead of promising impossible browser-only integration equivalence.
