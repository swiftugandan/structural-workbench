# PROKON parity roadmap and capability ledger

This is the proposed target ledger, not a statement of delivered functionality. Every implementation status starts PLANNED, every measured numerical comparison starts NOT_RUN and PROKON numerical equivalence starts UNKNOWN. Baseline is the official product information inspected on 19 September 2026. Each row must acquire versioned evidence before it changes status.

## Immediate delivery priority

[M01-UX](agent-tasks/M01-UX.md) is the next sub-milestone within M01: improve and verify the existing UI/UX before final M01 acceptance and M02 implementation. It is planned, not accepted. Existing engineering scope and parent acceptance gates remain in force. Machine-readable scheduling is recorded in roadmap.json under subMilestones and delivery/state.json.

## 1 Acceptance levels

L0 catalogued: authoritative scope identified. L1 usable: end-to-end workflow implemented with export/reopen. L2 verified: independent numerical, domain and failure-path gates pass. L3 compared: settings-matched PROKON comparisons pass or differences are explained and bounded. L4 parity for a named scope: L1–L3 plus code/exchange/platform coverage and limitations match the explicit baseline row. No row reaches L4 merely because its UI exists.

Comparison scope key is product version, module, operation, formulation, code edition/amendment/annex, section/material range, load/restraint domain, exchange format and platform. Evidence records the exact key. A row may contain several independently accepted keys; one does not imply the rest.

## 2 Analysis and modelling

The analysis baseline below is derived from the official [Sumo product page](https://prokon.com/sumo/). More detailed proposed acceptance subdivisions are our implementation plan.

| Capability | First usable slice | Final evidence needed | Initial parity status |
| --- | --- | --- | --- |
| Graphical node/member modelling | M00–M03 | Author/modify/save/reopen real structures with topology diagnostics | Planned |
| Physical to analytical mapping | M02–M03 | Deterministic child elements, stations and load conservation | Planned |
| Linear frame analysis | M00–M06 | Analytical, independent oracle and matched commercial corpus | Planned |
| Load cases, combinations and envelopes | M02 | Exact provenance and code-specific generator separately verified | Planned subset |
| Model-derived design actions | M07–M08 | Same model/result hash, simultaneous action vectors and units | Planned |
| Static second-order analysis | M09 | Convergence, geometric stiffness, imperfections and load-path comparisons | Planned |
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

Module names are grounded in the official [Steel product page](https://prokon.com/steel/). Initial implementation may share check libraries, but each user workflow has its own acceptance record.

| Module or workflow | Planned slice | Specific parity condition |
| --- | --- | --- |
| Strut/compression member | M07 | Section classification, member buckling and code-specific resistance |
| Beam column/combined forces | M07 | Stability, simultaneous actions and applicable interactions |
| Standalone member check | M07 | Same functions and outputs as model-derived checks |
| Catalogue check/evaluate/optimise | M05/M07 | Provenance, valid candidate search and reanalysis after stiffness changes |
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

## 4 Concrete and detailing

Module names and broad features below are grounded in the official [Concrete product page](https://prokon.com/concrete/). The roadmap subdivisions are proposed product increments.

| Module or workflow | Planned slice | Specific parity condition |
| --- | --- | --- |
| Continuous beam | M08 extension | Patterned loading, support/span reinforcement and full code scope |
| Beam section | M08 | Supported section/action domain and reinforcement checks |
| Rectangular slab | M10 | Analysis-to-design mapping and supported reinforcement method |
| Rectangular column | M12 first | Interaction, slenderness and reinforcement layout |
| Circular column | M12 extension | Independently validated section integration |
| General column | M12 extension | Arbitrary supported geometry, bars and integration convergence |
| Pad footing | M11 | Eccentric pressure/contact domain and structural checks |
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

Family presence is confirmed by the official [product overview](https://prokon.com/). Detailed acceptance subdomains are proposed until their inventories are verified.

| Family | Planned slice | Scope decision and dependency |
| --- | --- | --- |
| Composite | M17 | One staged member workflow first; inventory remaining elements |
| Masonry | M19 | Choose and verify reinforced/unreinforced element domain |
| Geotechnical | M20 | Bearing/slope workflow selected after inventory; methods independently verified |
| Probar | M16 | Browser detailing/schedules are a functional alternative; host CAD integration is separate |
| Prodesk/Revit exchange | M21 | IFC/file workflow first; native Revit bidirectional adapter conflicts with a strictly browser-only runtime |
| Timber | M23 discovery | Not confirmed in the current retrieved catalogue; do not claim absence or inclusion |
| General utilities and legacy Frame | M23 discovery | Enumerate current/legacy modules and user demand before scheduling |
| Native PROKON files | M23 discovery | No format specification supplied; open exchange does not imply native compatibility |
| DWG exchange | M21 extension | Requires a lawful reader/converter; DXF does not count as DWG parity |
| Multilingual output | M22 extension | Stable numerical/check IDs and verified translation of report meaning |

## 6 Code coverage expands separately from module coverage

A module has a matrix of exact code editions, not one generic compliant flag. Proposed ordering: AISC 360-22 LRFD restricted steel; ACI 318-19 restricted RC beam; additional concrete/connection scopes under those profiles; then user-prioritised Eurocode, South African, British legacy and other regional profiles only after exact resource bundles exist. This is a planning choice, not a recommendation of governing standards for a real structure.

For Eurocodes, an annex/default-parameter policy is part of each scope key. For legacy editions, label legacy and preserve all required amendments. New editions are new packages with differential benchmarks, not an in-place silent switch. SANS, AS/NZS, Canadian, Hong Kong and other vendor-listed support cannot be inferred across all modules from one code list.

## 7 Reporting parity without misleading percentages

For a fixed inventory of N scope keys, report counts at L0/L1/L2/L3/L4, blocked-resource count and excluded-by-browser-only count. Do not weight an entire concrete suite as equal to one small utility. If a weighted management score is desired, freeze weights before development and show the raw counts alongside it. Missing inventory keeps suite completeness UNKNOWN.

Each comparison record includes status, raw outputs, normalised outputs, conventions, tolerance, discrepancy explanation and reference version. If PROKON and the independent analytical oracle disagree, investigate both; do not imitate a suspected commercial error merely to obtain equality.

## 8 Changes that require explicit scope expansion

A Revit desktop adapter, cloud collaboration backend, paid native-format SDK, code-licensed private resource service or general solid CAD modeller is a new deployment/licensing boundary. Agents may prepare designs and resource requests, but the baseline browser product must remain functional without them. Full breadth parity may therefore require either accepting such extensions or retaining clearly named functional alternatives. The roadmap makes that tradeoff visible instead of promising impossible browser-only integration equivalence.
