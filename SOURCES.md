# Research sources and implementation resource registry

Research date 19 September 2026. Only primary vendor/project/standards-body documentation is used for technical claims. URLs are references, not vendored copies. Retrieved product descriptions establish advertised scope; they do not establish measured correctness. This specification's architecture, budgets, milestones and numerical seeds are original proposals.

## 1 Verified sources

| ID | Primary resource | What was established | Agent use |
| --- | --- | --- | --- |
| S01 | [PROKON home](https://prokon.com/) | Current 5.3 branding and product-family overview | Pin product inventory baseline |
| S02 | [PROKON Sumo](https://prokon.com/sumo/) | Analysis/modelling capabilities, integrations, code listings and reporting | Analysis parity mapping; not solver formulation |
| S03 | [PROKON Steel](https://prokon.com/steel/) | Member/connection modules and module-specific code options | Steel scope and exact future comparison profile |
| S04 | [PROKON Concrete](https://prokon.com/concrete/) | Concrete modules, detailing and code options | Concrete scope and future comparison profile |
| S05 | [MDN WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API) | Secure context, adapter/device model and device-loss/error interfaces | Capability detection and recovery |
| S06 | [W3C WGSL](https://www.w3.org/TR/WGSL/) | Shader types, layout and floating-point behaviour | Render buffer/shader contract |
| S07 | [Rust wasm32 target](https://doc.rust-lang.org/rustc/platform-support/wasm32-unknown-unknown.html) | Target limitations and compilation model | Portable kernel boundary |
| S08 | [wasm-bindgen guide](https://rustwasm.github.io/docs/wasm-bindgen/) | Rust/JavaScript binding approach | Worker/WASM interface |
| S09 | [nalgebra](https://docs.rs/nalgebra/latest/nalgebra/) | Rust linear algebra API | Candidate small-matrix implementation |
| S10 | [sprs](https://docs.rs/sprs/latest/sprs/) | Rust sparse matrices | Candidate sparse assembly |
| S11 | [sprs-ldl](https://docs.rs/sprs-ldl/latest/sprs_ldl/) | Symbolic/numeric sparse LDL factorisation API | Candidate solver; WASM fit still to prove |
| S12 | [faer](https://docs.rs/faer/latest/faer/) | Dense/sparse modules and feature/parallelism options | Alternative behind solver trait |
| S13 | [OpenSees elasticBeamColumn](https://opensees.github.io/OpenSeesDocumentation/user/manual/model/elements/elasticBeamColumn.html) | Independent frame-element inputs and release options | Native CI oracle with matched assumptions |
| S14 | [MDN storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) | Browser persistence limits and eviction risks | Save/recovery design |
| S15 | [Playwright test server](https://playwright.dev/docs/test-webserver) | Managed local-server test setup | Static browser integration tests |
| S16 | [JRC Eurocode transition](https://eurocodes.jrc.ec.europa.eu/second-generation-eurocodes) | Second-generation programme and national implementation considerations | Exact edition/annex pinning; not project-specific legal advice |

The complete W3C WebGPU document exceeded the retrieval size limit; use S05 for the retrieved API behaviour and consult the normative document during implementation. No broad browser-version availability claim was inferred from search results. Library versions in latest documentation are not pinned implementation selections.

## 2 Partially verified product areas

[Composite](https://prokon.com/composite/), [Masonry](https://prokon.com/masonry/), [Geotechnical](https://prokon.com/geotechnical/), [Probar](https://prokon.com/probar/) and [Prodesk](https://prokon.com/prodesk/) were reached as official product links, but full page contents could not be reliably reread due to fetch errors. Their family-level identity is confirmed by S01. Proposed detailed use cases in the roadmap are design choices until matched to a verified module inventory. Legacy Frame, timber, general utilities and any network-analysis product need fresh primary-source verification before inclusion in a current suite-parity denominator.

No standards text or detailed licensed NAFEMS benchmark corpus was acquired. Attempts to access AISC standards resources did not produce usable authoritative text in this research. Therefore M07 specifies a proposed AISC 360-22 LRFD package but supplies no invented clause-level implementation or claimed code verification. Product code lists do not substitute for the actual standard.

## 3 Resource gates

Each gate is satisfied by a local resource record containing exact identifier/edition, authoritative origin, content hash, rights status, validated extraction/formulation and independent expected values. A URL alone is insufficient. Downloading a standard does not imply redistribution rights. Agents must obtain resources using already authorised access and may not purchase/accept terms on the user's behalf without authority.

| Gate IDs | Required resource bundle | Default if unavailable |
| --- | --- | --- |
| R-CODE-STEEL, R-STEEL-EXAMPLES | Exact AISC 360-22 LRFD source, corrections, applicable material/section data, authoritative worked examples with unrounded or rounding-aware outputs | M07 blocked; mechanics-v1 stays usable |
| R-CODE-CONCRETE, R-CONCRETE-EXAMPLES | Proposed initial ACI 318-19 profile or explicitly selected alternative; exact amendments, mandatory checks and independent beam examples | M08 blocked; no substituted uncited formulas |
| R-DETAILING | Chosen reinforcement detailing standard, shape/length/bend/anchorage rules and schedule examples | No claimed compliant detailing |
| R-STABILITY-ORACLE | Documented geometric-stiffness formulation, Euler benchmark, independent second-order portal cases | M09 blocked |
| R-SHELL-BENCHMARKS | Documented element formulation, patch tests, smooth analytical plate case, distorted-mesh and independent shell corpus; licensed benchmarks only if accessible | M10 blocked |
| R-FOUNDATION-EXAMPLES | Exact concrete and geotechnical design scope; centred/eccentric pressure and structural/punching examples | M11 blocked |
| R-COLUMN-EXAMPLES | Strain compatibility integration references and independently solved axial/biaxial/slenderness cases | M12 blocked |
| R-CONNECTION-CODE, R-CONNECTION-EXAMPLES | Exact connection provisions and complete examples covering every applicable failure mode of the selected family | M13 blocked |
| R-DYNAMIC-ORACLE | Independent mass/modal models, analytical SDOF/cantilever references, eigenmode and mass-participation outputs | M14/M15 blocked |
| R-SEISMIC-CODE | Exact seismic loading standard/edition, hazard inputs and validated spectrum/combination examples | Seismic code generation disabled |
| R-COMPOSITE-CODE | Exact composite design code, staged-construction and connector examples | M17 blocked |
| R-PRESTRESS-CODE | Exact prestress provisions, loss/staging formulations and independent examples | M18 blocked |
| R-MASONRY-INVENTORY, R-MASONRY-CODE | Verified current module list and selected reinforced/unreinforced design standard and examples | M19 limited to inventory work |
| R-GEOTECH-INVENTORY, R-GEOTECH-BENCHMARKS | Verified family scope, selected method source and published numerical problems | M20 limited to inventory work |
| R-EXCHANGE-CORPUS | Exact IFC/DXF schemas, lawful reference files, mapping/loss expectations and native adapter requirements if requested | Export/import scope remains JSON/CSV |
| R-PROKON-LICENSED-CORPUS | Lawfully available exact-version inputs/settings and numerical/report outputs | Commercial numerical parity UNKNOWN |
| R-FULL-INVENTORY | Finite current module/code/operation catalogue with authoritative sources | No full-suite parity percentage |

These are external dependencies, not completed deliverables. Minimal human involvement is supported by explicit blocking, continuable DAG branches and release scopes; it cannot remove rights/access or independent-evidence requirements.

## 4 Reproducibility record to create in M00

Record exact Rust toolchain; target features; Cargo.lock; wasm-bindgen CLI/library matching versions; native/wasm test commands; JS package lock; browser build; GPU adapter features/limits; external-oracle environment; source URLs and retrieval hashes; licence scan; CPU/memory measurement method. The package deliberately avoids guessed future dependency versions. Resolve and pin once, then build with locked dependencies.

## 5 Retrieval and evidence limitations

No hands-on PROKON session occurred. Product marketing is not proof of implementation details. Independent numerical fixtures included here were derived from elementary elastic theory, not copied from PROKON or from a proprietary benchmark. All performance budgets and delivery estimates are proposed targets. Advanced materials and code modules need the resource bundles above before an AI agent can responsibly claim successful final delivery.
