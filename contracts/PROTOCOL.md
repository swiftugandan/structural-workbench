# Worker protocol and semantic contracts

Protocol version 1. The JSON schemas validate envelope shape. This document defines operation payloads and cross-field invariants; implementation must generate/test operation-specific serializers before advertising the corresponding capability. Binary typed-array payloads use structured clone/transfer and are not represented as JSON in request.schema.json.

## 1 Request rules

requestId is unique for the session. expectedRevision is null only for capabilities/createProject/importProject in an empty session. Import replacing a current project requires its current revision. All other operations use the acknowledged revision; read operations may explicitly target a stored immutable hash. An operation rejected for a revision mismatch returns REVISION_CONFLICT with current revision and does not mutate.

| Operation | Request payload | Successful payload |
| --- | --- | --- |
| capabilities | {} | protocolVersion, schemaVersions[], analysisTypes[], limits (nodes/members/cases/combinations/activeDofs/memoryMiB), gpu status, designProfiles[] (each: id, standard, edition, designMethod, enabled, resourceGate, supportedSectionFamilies, supportedChecks, limitations), comparisonStatus (`UNKNOWN` until licensed commercial comparisons exist), supportedDomains[], excludedDomains[], domainDisclosure, limitations[] |
| createProject | {project: ProjectV1} | snapshot header and render delta |
| importProject | {jsonUtf8: string, replaceCurrent: boolean} | validated snapshot header, migration report and render delta |
| applyCommand | {command: CommandV1} | new revision, modelHash, affected IDs, undo availability and render delta |
| undo / redo | {} | same shape as command acknowledgement |
| validateModel | {} | diagnostics[], canAnalyse and estimated memory |
| analyse | {caseIds: string[], combinationIds: string[], analysisType?: "linearStatic" \| "elasticBuckling" \| "secondOrder" \| "modal" \| "harmonic" \| "responseSpectrum", stability?: {…}, modal?: {…}, harmonic?: {…}, responseSpectrum?: {…}} | jobId and accepted snapshot hash; completion arrives as an event. Stability types: see "Stability analyses (stability-v1)"; modal: see "Modal analysis (dynamics-v1)"; harmonic and responseSpectrum: see "Dynamic response (response-v1)" |
| cancelAnalysis | {jobId: string} | job status cancelled or alreadyFinished |
| getSnapshot | {includeView: boolean} | ProjectV1 plus separate optional view state |
| queryGeometry | {kind: ray or snap or measure, query: object, viewRevision: integer} | entity IDs, f64 positions/distances and matching viewRevision |
| getResults | {resultId: string, caseId: string, entityIds: string[]} | header plus typed buffers described below |
| exportProject | {includeResults: boolean} | portable engineering JSON and optional separate result files with hashes |
| evaluateDesign | {profileId: string, memberIds: string[], resultId?: string, inputs: object} | DesignRun (overall, checks[], limitations). Inputs carry section/demand in SI; envelopes are refused by UI provenance rules. |
| evaluateModelDesign | {memberId, modelHash, caseId, resultId} | Model-native DesignRun re-solved in Rust. Also carries `serviceability`: `{status: "notChecked"}` or, when the member's `steelDesign.serviceability {combinationId, limitRatio, basis: chord|absolute}` is set, `{status: pass|fail, combinationId, basis, limitRatio, length, demand, limit, ratio, station, localDeflection, resultId}` from a fresh solution of that service case. It never changes `overall` (ADR 0020). When `steelDesign.cb` is `{value: null, source: "derived"}`, the run carries `cbDerivation {source, equation, Cb, Mmax, MA, MB, MC, combinationId}` (Spec F1-1, or Cb = 1.0 for a free cantilever end; ADR 0019). |
| runStudy | {study: object, baseProjectJson?: string} | Comparative study report (variant model/result hashes). Uses open project when baseProjectJson omitted. |
| computeSection | {shape: "solidRectangle", width: number, depth: number, customJ: number\|null} | A, Iy, Iz, J, cy, cz, provenance and jSource (SI). Does not mutate the project. width is along local y; depth along local z. Null customJ uses the Saint-Venant rectangle estimate. |

## 1.1 Declarative study files (native CLI)

`workbench-cli study <study.json>` and the `runStudy` operation run a bounded parameter sweep through the same Rust core. Study schemaVersion is `1.0.0`. Fields: `id`, `name`, optional `description`, `baseProject` (CLI only; path resolved from cwd, study directory or workspace root; the browser uses the open project), optional `caseId` (default `LC1`), optional `observe.{nodeId,dof}` and `variants[]` of `{id, description?, set[]}` with `set` steps `{path, value}` (JSON pointers into the base project in the current schema). Unknown fields at any level are `INVALID_SCHEMA`; variant ids are unique. Budgets, checked before any analysis: at most 50 variants, 100 steps per variant and 1000 steps per study (`STUDY_BUDGET`); the whole run shares the project's `analysisSettings.timeoutMs` and is cancellable like an analysis job. Steps may not target `/schemaVersion`, `/id`, `/metadata` or `/solverOverride` (`UNSUPPORTED_FEATURE`). Each variant is re-parsed and validated through the Rust project model and analysed exactly as a manual edit; no step bypasses validation or unsupported-feature guards. A failure stops the study with no partial report; its diagnostic message names the variant and step, and `details.studyLocation` carries `{variantIndex, variantId, stepIndex?, path?, stage: set|validate|analyse|observe}`. The report lists per-variant `steps`, `modelHash`, `resultId`, `settingsHash` and observed DOF value, plus `studyDigest` (SHA-256 of the study document), `baseModelHash` and `solverBuildHash`: the same study on a model with the same base hash and solver build reproduces the report exactly. Distinct variants must produce distinct model hashes.
An analyse acknowledgement is not a completed result. Every asynchronous event contains eventType, jobId, requestId, sourceRevision, modelHash and event payload. Events are analysisProgress, analysisCompleted, analysisFailed or analysisCancelled. An accepted job emits exactly one terminal event, including after Worker termination/restart. Progress stages are validation, assembly, factorisation, solve, recovery and complete; progress is indeterminate when a meaningful percentage is unavailable. Do not simulate numerical progress with timers.

From M03 the browser hosts two Workers: a durable model Worker owns create/import/commands/undo/queryGeometry, and a disposable analysis Worker receives an exported snapshot then `analyse`. Cancel/timeout terminates only the analysis Worker. Completed results whose `modelHash` no longer matches the live model are stale and must not be labelled current.

## 2 Command vocabulary

CommandV1 is {id, type, args}. Supported types and args are AddNode(node), AddMember(member), SetNodePosition({id,position}), SetMaterial(material), SetSection(section), SetSupport(support), SetLoadCase(loadCase), SetLoad(load), SetCombination(combination), SetMassSource(massSource), SetResponseSpectrum(responseSpectrum), SetGravity({gravity}), SetAnalysisMode({mode}), MoveNodes({ids,delta}), CopySelection({ids,delta,connectToExisting:false}), CopyBay({ids,delta,count,includeSupports:true,tieUnsupportedNodes:true,setSpatial?,stabilizeBases?}), SplitMember({id,stations}), MergeNodes({sourceIds,targetId}), DeleteEntities({ids,cascade:false}) (including mass sources and response spectra) and Batch({commands}). Envelope names in parentheses are records, not executable functions.

Upsert-style Set operations must specify expected entity existence as create/update to detect accidental overwrites. Batch uses one model revision and one undo entry; nested Batch is rejected. Import commands do not bypass validation. Member splitting preserves member-load total and physical-parent provenance; IDs of new entities are deterministic from the command ID and ordinal. Undo stores sufficient inverse data to restore exact engineering values and IDs.

SetName/SetDisplayUnits/SetView are view/metadata changes in JavaScript persistence and may update a separate presentation revision. They do not create a new engineering hash or clear valid results. Engineering undo and presentation undo should not be mixed invisibly; report their scope in command history.

## 3 Binary result layout

ResultHeader includes resultId, modelHash, settingsHash, solverBuildHash, schemaVersion, analysisType, caseOrCombinationId, converged boolean, diagnostics[], numericalChecks and bufferDescriptors[]. Empty/failed results have no numerical response buffers, rather than zeros. All native/WASM/CSV adapters must agree on this layout.

nodeIds is a stable ordered array of IDs. nodeDisplacements is Float64Array length 6×nodeIds.length with stride [ux,uy,uz,rx,ry,rz]. reactionSupportIds is an ordered list; reactions has the same six-component force/moment stride. Generated planar constraints have separate identifiers and reaction buffers, preventing them from being mistaken for physical supports.

memberIds indexes Float64Array memberEndActions of length 12×memberIds.length, stride [fx_i,fy_i,fz_i,mx_i,my_i,mz_i,fx_j,fy_j,fz_j,mx_j,my_j,mz_j]. These are raw nodal actions applied to the element. Section-action functions and diagram points use the cut convention in the specification, not these raw signs.

Diagram output carries memberId, component, station fraction, side left/right/continuous, value and governing case ID. A bulk packet stores Uint32Array memberIndex, Float64Array station/value, Uint8Array side and Uint32Array governingCaseIndex. The lengths must match and every index must be in range. Interpolated deformations additionally state global/local frame and scale 1.0. The viewport's visual amplification is separate metadata.

Buffers are little-endian when serialised to files; in-memory typed arrays follow platform byte order through structured clone. JSON snapshots contain ordinary numbers, not binary blobs. No NaN/Infinity is permitted in a successful result. A zero result is valid only when the calculation established it.

## 4 Diagnostic registry

Minimum stable codes: INVALID_SCHEMA, UNSUPPORTED_SCHEMA, DUPLICATE_ID, DANGLING_REFERENCE, ZERO_LENGTH_MEMBER, INVALID_SECTION, INVALID_MATERIAL, INVALID_LOCAL_AXIS, INVALID_RESTRAINT, INVALID_LOAD, DUPLICATE_SELF_WEIGHT, UNSUPPORTED_FEATURE, REVISION_CONFLICT, UNSTABLE_MODEL, UNRESTRAINED_DOF, UNUSED_DOF, ILL_CONDITIONED, NONFINITE_RESULT, RESIDUAL_FAILURE, EQUILIBRIUM_FAILURE, MEMORY_LIMIT, TIMEOUT, CANCELLED, STALE_RESULT, STORAGE_QUOTA, STUDY_BUDGET, GPU_UNAVAILABLE and GPU_DEVICE_LOST.

Schema-level failures may use INVALID_SCHEMA and include a semantic subcode from the registry when available; negative-case tests accept the named semantic code in diagnostics or its nested cause. Diagnostic messages are human readable, but tests assert codes/entity IDs instead of brittle prose. Localise messages later without changing identifiers.

## 5 Design check result

A check is {checkId, profileId, profileVersion, status, applicability, demand, resistance, utilisation, units, clause, formulaId, intermediateValues, governingActionRef, warnings, childChecks}. Numerical fields may be null only for unsupported/indeterminate checks and must never be serialised as 0 to imply safety. applicability records the tested predicate and required inputs. governingActionRef contains modelHash, resultId, memberId, station, side and one real case/combination ID.

Overall status is fail if any applicable mandatory check fails; otherwise unsupported if any mandatory check is unsupported; otherwise indeterminate if a required input/convergence/result is missing; otherwise pass. Preserve the most severe warnings. The report must display both failure and unsupported checks if both occur. No average utilisation is used to hide a governing failure.

## 6 Bounded M01 topology and axes queries

`queryGeometry` additionally accepts `axes` with `{}` and `topologyPreview` with
`{command: CommandV1}`. Axes returns members with ID, f64 midpoint `origin`, length
and the three right-handed unit vectors used by the Rust frame formulation.
Topology preview applies the exact command to a disposable candidate and validates
it, returning `{project, viewRevision}` without changing revision/hash/history.
Commit uses the same command ID/arguments and the preview's model revision. Editing
inputs or changing the model invalidates the UI preview.

`ConnectIntersections({memberIds})` explicitly connects nonparallel intersections
among 2–200 selected Planar XZ members. It groups intersections within the model's
1e-6 m merge tolerance, reuses participating endpoint nodes, and splits interiors
at a shared node. It does not process collinear overlaps. `SplitMember` stations
are distinct interior fractions; it creates separate nodes and never silently
connects other geometry. `MergeNodes` requires sources within 1e-6 m of the target.
Multiple supports or nodal loads from different merged nodes in the same case are
rejected for explicit resolution. Full candidate validation rejects collapsed
members atomically.

Split children carry optional paired `parentMemberId` and `stationRange` fields.
Unsplit 1.0.0 projects remain readable unchanged; projects exporting these fields
require this extended reader (older strict readers reject them). The root physical
ID is retained as provenance even after the original member is replaced. Repeated
splits compose parent station intervals. Child and cloned uniform-load IDs are
stable from command-ID digest and ordinal; uniform densities and local axes stay
unchanged and explicit self-weight selections expand to all children. Unsupported
point loads/releases remain rejected. These fields record lineage; they do not
claim the later physical/analytical hierarchy UI or automatic remeshing.

## 7 M01 selection, working planes and edit previews

`queryGeometry` accepts `screenPick({camera,point})`, `boxSelect({camera,rect})`
and `viewGeometry({camera})`. Camera contains f64 `origin`, orthonormal `basis`,
positive pixels-per-metre `factor`, and CSS-pixel `center`. Queries carry the
caller view revision; the UI discards results after camera/model changes. The
kernel caches the projected spatial index by model revision and camera. Node
selection takes priority within eight CSS pixels, then depth/distance/stable ID.
Box selection includes nodes and members wholly inside the rectangle.
`viewGeometry` reports unconnected, nonparallel finite member centreline
intersections in world space, within the project merge tolerance (metres).
Screen overlap alone is not an intersection. Each marker includes projected
`point`, `memberIds`, `depthSeparation`, world-space `separation` and `tolerance`.
Shared endpoint IDs are already connected and excluded; collinear overlaps are
outside this diagnostic. Camera changes never change intersection eligibility,
including edge-on views. These are display markers, never a topology command.
See ADR 0011 for the correction from the former projection-only diagnostic.

`snap` accepts XZ, XY or YZ `plane`, length-valued `position`, model-space
`tolerance`, `features` and positive `grid`. Only candidates on the working plane
are eligible. The UI converts eight CSS pixels to model units for pointer entry;
numeric entry uses the separate 1e-6 m geometry tolerance. The result distinguishes
node `entityId` from midpoint/intersection `featureId`. New crossings remain
separate unless the user explicitly connects them.

`commandPreview({command})` applies the same validation as commit to a disposable
candidate. `MoveNodes({ids,delta})` includes selected member endpoints;
`CopySelection({ids,delta,connectToExisting:false})` creates geometry with stable
command-derived IDs, without copying restraints or loads. `CopyBay({ids,delta,
count,includeSupports:true,tieUnsupportedNodes:true})` duplicates selected portal
geometry along `delta` for `count` additional bays (1–50), copies supports for
selected nodes, and adds longitudinal members between consecutive unsupported
node pairs so eaves/roof lines connect. Default `setSpatial:true` switches the
project to spatial analysis; default `stabilizeBases:true` sets full six-DOF
fixity on selected bases so a planar portal remains stable after the switch.
Loads are not copied. `DeleteGeometry({ids, cascade:true})` removes selected
geometry and its dependent members/restraints/loads; the UI presents the full
dependency preview first. It does not change the existing `DeleteEntities`
non-cascading contract. All candidates satisfy the current project schema, which
requires at least one node and member. Failed commands preserve the model and
history. `measure({start,end})` takes node IDs and returns f64 distance and
global delta in metres. `axes` also returns up to 100 near-coincident node-pair
warnings, without changing connectivity.

## Model-native steel workspace (M07-E/F)

- `steelCatalogue {}` returns the versioned five-shape AISC v16 subset in source units, source workbook digest, and A992 identity. JS uses catalogue labels only; Rust converts properties.
- `steelReadiness {memberId}` returns `ready|incomplete|unsupported`, exact input records and missing/unsupported reasons. READY is input readiness, never a strength PASS.
- `AssignSteelCatalogue {id,sectionRef,materialRef}` and `SetSteelDesign {id,design}` are atomic `applyCommand` types. The latter uses the `steelDesign` schema record. Undo restores the prior binding and inputs.
- `evaluateModelDesign {memberId,caseId,resultId,modelHash}` runs only for complete inputs and an exact current real case/combination. It re-solves the immutable capture in Rust on the disposable worker. Envelopes/caller-supplied demands/capacities are not an input path. It returns contractVersion, designRunId, profileId/version, overall, summary checks, full stationChecks, governingAction, result/model/build/settings/catalogue identities, explicit input provenance, warnings and limitations.
- A check's `station`, `side`, `combinationId` and `actions` always describe one actual simultaneous recovered action set. `checks` summarizes each rule's governing record; it is not a synthetic action envelope.
- `STALE` is a presentation state of an immutable record whose model/result identity is no longer current. Its historical numerical result remains available in the downloadable record but cannot be attached as current design to a new analysis report.

See ADR 0009 for input identity, axis mapping and bounded applicability.

## Concrete workflow previews (no numerical acceptance)

- Optional `Project.designPreviews` contains up to 100 Rust-validated draft records. `CreateDesignPreview {kind,targetId?}`, `SetDesignPreview {id,inputs,targetId?,soilReference}` and `DeleteDesignPreview {id}` are atomic revision-aware commands. Kinds: `rcBeam`, `slab`, `padFooting`. Inputs are complete positive SI maps in storage; edit commands accept dimensioned strings (soil unit weight is numeric N/m³). Input changes conservatively change the model hash. Draft dimensions do not modify frame stiffness.
- `designPreviewTemplates {}` returns field metadata and conspicuously synthetic default inputs.
- rcBeam drafts carry optional `mechanics {law, inputs, inputSources}` (ADR 0012). `SetDesignPreview` accepts `mechanics {law, inputs}` with dimensioned strings; provenance becomes `user` only for changed values. Schema 1.2.0 rcBeam inputs carry separate `top*`/`bottom*` bar diameter and count (ADR 0013; 1.1.0 drafts migrate to equal rows). `evaluateDesignPreview` adds `sectionMechanics` for rcBeam: `rowFits {top,bottom}`, plus `sagging` (top in compression) and `hogging` (bottom in compression) states. Each state has an ultimate strain-compatibility result and cracked/uncracked elastic properties. It is labelled `basis: mechanics`, `codeProfile: null`, and never changes check statuses or `overall`. Drafts saved without `mechanics` report `status: notConfigured`. rcBeam runs also carry `flexuralDemand` (ADR 0014). In `model` mode it gives the governing `sagging` and `hogging` key stations of the bound member for the one bound case or combination. Each entry holds `moment` (the magnitude compressing that face), `station`, `kind`, `side` and the simultaneous `actions` [N,Vy,Vz,T,My,Mz]; an entry is `null` when no station has My of that sign. The draft's width runs along local y and its depth along local z. Its top face is local +z, so My < 0 is sagging. `topFaceDirection` and `topFaceOrientation` (`up|down|horizontal`) report the orientation, which is never inferred. `utilisation` is always null. In synthetic mode the status is `unavailable`. When the demand is evaluated, each evaluated mechanics state also carries `serviceMoment {moment, combinationId, station, side, stressBasis: crackedSection, belowCrackingMoment}`, and its `elastic` result adds `serviceConcreteStress` and `serviceSteelStress` (cracked transformed section, compression positive) under that moment. The bound combination is not classified as serviceability, and no stress limits are applied. Otherwise `serviceMoment` is null and the stresses are omitted (M08-A5). The exported HTML calculation record includes, for each rcBeam preview run whose `modelHash` and model-sourced `resultId` match the reported result, a mechanics-only section. It gives the section and bar rows, per-state capacity, governing moment and location, service stresses (exact SI in `data-si`), material-law inputs with provenance, limitations and the complete run record. It includes an orientation warning when the top face is not `up`. Synthetic and stale runs are never included (M08-A6). `capabilities.designProfiles[]` also lists `ec2-uk-na` (EN 1992-1-1 with UK NA, rectangular RC beams) with `enabled: false` (ADR 0015). Evaluating it returns only the `profile.resources` gate until A1:2014 and NA+A2:2014 are reconciled. Schema 1.3.0 (ADR 0016) adds rcBeam input `linkLegs` (integer 2–8; 1.2.0 drafts migrate to 2, synthetic) and optional `tensionAnchorageConfirmed`, which `SetDesignPreview` records only for an explicit `true`. In model mode, rcBeam runs add `codeProfilePreview` (`basis: disabledProfilePreview`, `profileEnabled: false`). It carries `governing[]` entries, one per distinct key station, each with its `roles` (sagging, hogging, shear), `station`, `side`, full `actions`, the ec2-uk-na `checks` and that station's `overall`. It states how draft strengths are interpreted and never changes `checks` or `overall`. The calculation record reproduces `codeProfilePreview` for each included rcBeam run under a "DISABLED PROFILE PREVIEW" banner. Each check shows its clause, status, demand and resistance (exact SI in `data-si`), utilisation and note, with the station's actions and roles. The mechanics banner states that these checks are review-only (M08-B4).
- `evaluateDesignPreview {draftId,modelHash,sourceMode,caseId?,resultId?}` uses the captured project on a disposable worker. `sourceMode` is explicit `synthetic|model`, or `plate` for slabs. Model actions require exact current converged case/result identity, re-solved in Rust. Slabs reject frame-model sources. Beam actions are actual member key stations; footing actions negate one simultaneous global support reaction vector. No orientation, contact or code capacities are inferred.
- Returned records have deterministic `previewRunId`, `inputHash`, model/revision identity, source provenance, null code profile, `mock:true`, `overall:unsupported`, unavailable check utilisations and explicit limitations. A model action source may have `mock:false`; the concrete workflow remains unverified. Footing contact is `indeterminate`, bearing pressure is external input, and `computedByWorkbench:false`.
- Schema 1.5.0 (ADR 0021) gives slab drafts an optional `plate {edges, includeOpening, inputs, inputSources}`: `edges` lists the conditions at x = 0, x = Lx, y = 0 and y = Ly (`free|simple|clamped`); `inputs` holds `pressure` (Pa, uniform, downward, > 0), `elasticModulus` (Pa), `poissonRatio` (0 ≤ ν < 0.5) and `openingX`/`openingY` (m, the opening corner nearest the origin; the analysed opening must lie strictly inside the panel); `inputSources` covers every input plus `edges` and `includeOpening`. New slab drafts carry synthetic defaults (all edges simple, 10 kPa, 30 GPa, ν = 0.2, opening at (2.5, 2)). 1.4.0 projects migrate by version only, and their slab drafts stay unconfigured. `SetDesignPreview` accepts `plate {edges, includeOpening, inputs}` with dimensioned strings; provenance becomes `user` only for changed values. `plate` on any other kind is `INVALID_SCHEMA`. `designPreviewTemplates` lists the slab `plate` fields, `edgeLabels`, `edgeConditions` and defaults.
- For slabs, `evaluateDesignPreview` also accepts `sourceMode: "plate"`. It solves the draft panel with plate-v1 (`docs/formulations/plate.md`): length × width, thickness, target `meshSize`, and the opening when included. The source is `{kind: plateAnalysis, mock: false, family: plate-v1}`. The run adds `plateAnalysis` (`basis: mechanics`, `codeProfile: null`), with: `panel`, `load`, `material`; `mesh {elements, nodes, freeDofs, maxAspect, smallestCell, xs, ys, warnings[]}` (a `MESH_ASPECT` warning above aspect 5); `equilibrium {applied, reactions, relativeImbalance, solverResidual}`; `extremes`; `convergence {coarseMeshSize, coarseElements, change, indicatorLimit: 0.05, withinLimit, note}` from a re-solve at twice the mesh size; `designMoments` (Wood–Armer `bottomX|bottomY|topX|topY`, each `{value, element, cell, at}`); `edgeMoments[] {edge, position, moment}` along clamped edges (from reactions); and `fields {recovery: elementCentre, cells, mx, my, mxy, qx, qy, bottomX, bottomY, topX, topY, nodes, w}`. Units are N m/m, N/m, m and Pa. Moments are sagging positive, and Wood–Armer values are magnitudes to resist. Without plate inputs the result is `DESIGN_INPUT_INCOMPLETE`. A single simple edge, or free edges only, is `UNSTABLE_MODEL`. More than 40 000 cells is `MEMORY_LIMIT`. Other slab sources report `plateAnalysis.status: notRun`. The plate result never changes `checks` or `overall`. Slab `checks` are the code checks (top and bottom reinforcement, minimum/maximum reinforcement, punching, deflection), which stay `unsupported` until a slab code profile exists.
- Schema 1.5.0 also adds the `rcColumn` kind (ADR 0022). Its inputs are `width` (along local y), `depth` (along local z), `cover`, `barDiameter`, `barsAlongWidth` and `barsAlongDepth` (bars per face, integers 2–20, corners shared, centres inset by cover + link + half a bar), `linkDiameter`, `concreteStrength` and `rebarStrength`. The draft binds to a member like rcBeam and carries the rcBeam `mechanics` law plus `fullCompressionStrain` (pivot C, at most `ultimateStrain`). 1.4.0 files cannot contain rcColumn drafts. Runs add `columnMechanics` (`basis: mechanics`, `codeProfile: null`), with: `section {width, depth, bars[{y, z, area}], barCount, steelArea}`, `law`, `materialInputs`, `materialSources`, `axialRange {squash, tension, tensionAttained}` (N compression positive); `demand`; `stations[]` (model mode: every key station of the bound member for the bound case or combination, with `nEd = −N_frame`, `myEd`, `mzEd`, `mEd`, `status: evaluated|beyondAxialRange|refused`, `utilisation = M_Ed/M_Rd(N_Ed, θ_Ed)`, `axialRatio` and `capacity {mRd, my, mz, n, neutralAxisAngle, neutralAxisDepth, plane, pivot, iterations, directionError, axialResidual}`); `governing {index, station, utilisation, nEd, mEd, mRd}`; `beyondAxialRange`; and `contour {nEd, points[[My, Mz]] × 72}` at the governing N (or N = 0 without model actions). The utilisation is mechanics and never changes `checks` or `overall`. The column `checks` (axial and biaxial bending, slenderness and second order, minimum eccentricity, shear, detailing) stay `unsupported`. The HTML calculation record reproduces current model-sourced column runs and current slab plate runs, with exact SI values in `data-si`.
- `SetDesignPreview` provenance compares numeric inputs by value: an untouched integer (`3`) equals its stored `3.0` and keeps its source.
- Preview reinforcement pictures/RC CSV rows are illustrative preferences, with unverified fit/quantities/anchorage and null cut lengths. Export adds current/stale presentation state; it never upgrades the recorded design status. See `docs/design/concrete-workflow-previews.md`.

## Structure graph (project schema 1.1)

Snapshots include `structureHash`, the canonical hash of the saved `structure` graph.
`modelHash` excludes organization metadata; storey, role, group, layer and reference-grid
edits leave an unchanged analysis current. Model-native steel runs include the structure
hash and exact physical-member ID alongside their analytical member and result provenance.

`SetStructureEntity {collection, existence: "create"|"update", entity}` edits a typed
record in `storeys`, `physicalMembers`, `grids`, `layers`, `groups`, `joints`,
`supportDetails` or `designObjects`. `DeleteStructureEntity {collection,id}` deletes
an unbound storey, grid, layer or group. These use ordinary expectedRevision, atomic
validation and undo/redo. Names and classification are editable; analytical ownership,
node/support/draft bindings and engineering status are controlled by their source
commands. Storey elevations and grid endpoints accept Rust length quantities.

Every analytical member has exactly one saved physical owner, every node one joint,
every restraint one support detail, and every concrete preview one design object.
Collections contain typed references, with no recursive collections. References,
duplicate ownership and claims of unsupported connection/design acceptance fail closed.
A geometry deletion prunes its memberships; a split preserves its physical owner;
a copy inherits classification and collection membership under a distinct physical ID.
Removed analytical targets unbind preview actions; a split retains the physical object
binding without arbitrarily choosing one child as the new action source.

Migration 0.9 → 1.0 → 1.1 preserves original import bytes in host storage and creates
deterministic bindings. Legacy roles are `unassigned`; no storey/role is guessed from
orientation. Current 1.1 imports must contain a complete valid graph. Legacy files
containing an unknown `structure` extension are rejected rather than overwritten.

### Stair strip display outline

The `axes` query includes `stripOutline` on each member frame: four world-space
points for members explicitly owned by a `stair` or `landing` physical object,
or an empty array otherwise. The rectangle uses the actual section half-width
along local y at the analytical reference plane. It is supplementary display
geometry, not new analytical members/nodes, a stringer design or finished-level
geometry. The analytical line view draws these edges thinly with an explanatory
legend; solid view retains the existing section envelopes and treads.

### View-only exclusion set

`screenPick`, `boxSelect` and `snap` accept optional `excludedIds: string[]`.
Exclusions are applied in Rust before hit priority/feature selection, so an
invisible foreground item cannot mask a visible item behind it. The set is a
transient view constraint, never a project mutation or analysis exclusion.
Malformed sets fail with INVALID_SCHEMA. The UI rejects in-flight view queries
after visibility changes as well as camera/model changes. View filters do not
remove any elements from the solver or exported engineering model.

### `evaluateSteelOverview`

Takes `{modelHash, resultId, caseId}` for one actual case/combination. Runs in the disposable analysis worker. Rust reanalyses the captured project once and rejects mismatched model/result identities or nonconvergence. Every analytical member has a row: `memberId`, `status`, nullable `utilisation`, `readiness`, nullable exact model-native `run`. Missing inputs yield `notChecked`; unsupported applicability yields `unsupported`. No whole-building PASS is returned. Envelope actions are rejected.

Review contract v1 includes `reviewId`, `modelHash`, `sourceRevision`, `resultId`, `caseId`, `solverBuildHash`, `analysisSettingsHash`, `source:modelNative`, `mock:false` and scope. Hash/result/dirty changes make the UI review stale. View filtering does not alter review membership. Downloads retain the original record plus presentation `currentState`.

### `studySteelCatalogue`

Extends exact model-native input `{memberId,modelHash,resultId,caseId}` with one to five unique `sectionRefs` from the verified subset. Rust rejects missing readiness/stale/envelope inputs, clones each candidate through normal catalogue assignment and project validation, reanalyses the full model and returns exact DesignRuns, masses in kg, candidate model/result IDs and baseline record. `complete:true` means the requested finite set completed, never global optimality. Any analysis failure rejects the study without a partial optimum. Explicit Apply is a separate ordinary `AssignSteelCatalogue` command; candidate results never replace live analysis.

## Stability analyses (stability-v1, M09)

Formulation: `docs/formulations/stability.md`; decisions: ADR 0017. Both types
use the `analyse` job lifecycle unchanged (disposable analysis Worker,
revision check, progress, exactly one terminal event, cancel and timeout).

Request. `analysisType` defaults to `linearStatic`, which refuses a `stability`
object. The stability types take exactly one id in `caseIds` ∪
`combinationIds` (`INVALID_LOAD` otherwise; envelopes are not inputs).

- `elasticBuckling`: `stability` is optional, `{subdivisions?: 1–32 (default
  8), modes?: 1–20 (default 5)}`.
- `secondOrder`: `stability` is required, `{subdivisions?: 1–32 (default 8),
  imperfection: {kind: "none"} | {kind: "sway", ratio: (0, 0.1], direction:
  [x, y]}}`. The imperfection is never implied.

Unknown fields or types are `INVALID_SCHEMA`; out-of-range values are
`INVALID_SETTINGS`. My/Mz member end releases are independent hinge DOFs in
both stability types.

`elasticBuckling` result: ResultHeader fields plus `subdivisions`,
`requestedModes`, `modes[]` (`factor`, `residual`, `nodeIds`,
`nodeDisplacements` normalised so the largest translation over the analysis
mesh is +1, `members[].stations[]` of `{station, position, displacement}`),
`negativeFactors[]`, `referenceAxialForces[]` per physical member segment, and
`disclosures` (`FLEXURAL_ONLY`, `NOT_A_RESISTANCE_CHECK`,
`LINEAR_REFERENCE_STATE`). No mode is not a failure: it carries the
`NO_POSITIVE_CRITICAL_FACTOR` diagnostic, and negative factors are never
critical factors. It has no response buffers, so `bufferDescriptors` is absent.

`secondOrder` result: the linear result layout with `analysisType:
"secondOrder"`, actions and reactions including second-order effects, and
`numericalChecks` carrying `iterations`, per-iteration `history`,
`globalBalanceDeformed`, `axialForces` and the `imperfection` with its listed
equivalent nodal forces. A second-order analysis that does not converge ends
in `analysisFailed` with diagnostic `NONCONVERGED` whose `details.reason` is
`TANGENT_NOT_POSITIVE_DEFINITE`, `DIVERGING` or `ITERATION_LIMIT`, with the
iteration and history, and no numerical payload.

A critical factor or a second-order response is never a member resistance or a
code stability verdict, and it never changes a design record's declared
first-order basis.

## Modal analysis (dynamics-v1, M14)

Formulation: `docs/formulations/modal.md`; decisions: ADR 0018. `analysisType:
"modal"` uses the `analyse` job lifecycle unchanged. It takes no load case:
`caseIds` and `combinationIds` must be empty (`INVALID_LOAD` otherwise). The
optional `modal` object is `{modes?: 1–50 (default 12), massMatrix?:
"consistent" | "lumped" (default consistent), subdivisions?: 1–32 (default 8),
participationTarget?: (0, 1] (default 0.9)}`. `modal` settings with another
analysis type, unknown fields or wrong types are `INVALID_SCHEMA`; ranges are
`INVALID_SETTINGS`.

Mass comes only from the project's `massSources` (schema 1.4.0): `{id, kind:
"selfMass", factor}`, `{id, kind: "loadCase", case, factor}` or `{id, kind:
"nodalMass", node, mass}` (kg). `SetMassSource` creates or updates one source
with the usual `existence` rule; `factor` and `mass` accept dimensioned
strings (`"2.5 t"`, `"300 kg"`). Validation enforces the ADR 0018
deduplication rules (`INVALID_MASS_SOURCE`, `DANGLING_REFERENCE`). Schema 1.3.0
projects migrate to 1.4.0 with no mass sources.

Result: `analysisType: "modal"`, the ResultHeader identity fields,
`subdivisions`, `massMatrix`, `requestedModes`, `modes[]` (`mode`, `omega`
rad/s, `frequency` Hz, `period` s, `residual`, `participationFactor[3]`,
`effectiveMass[3]` kg, `effectiveMassRatio[3]` and `cumulativeRatio[3]` —
`null` where nothing participates — `nodeIds`, `nodeDisplacements` normalised
to a unit positive peak translation, and `members[].stations[]` as for
buckling), `mass` (`sources[] {id, kind, mass}`, `total`), `participation[]`
for X, Y, Z (`participatingMass`, `nonParticipatingMass`, `cumulativeRatio`,
`omittedRatio`, `target`, `achieved`), `numericalChecks` (iterations, Sturm
shift and count, residuals, mass and stiffness orthogonality), `disclosures`
and `diagnostics` (`SELF_MASS_DEDUPLICATED`, `NON_GRAVITY_COMPONENTS_IGNORED`,
`FEWER_MODES_THAN_REQUESTED`, `PARTICIPATION_TARGET_NOT_MET`). There are no
response buffers. Failures (`NO_MASS`, `NEGATIVE_MASS`,
`UNSTABLE_MODEL`, `STURM_MISMATCH`) end in
`analysisFailed` with no payload. A frequency or participation ratio is never
a floor-vibration or code serviceability verdict.

## Dynamic response (response-v1, M15)

Formulation: `docs/formulations/response.md`; decisions: ADR 0023. Both
types use the `analyse` job lifecycle and the dynamics-v1 mass (declared
`massSources`; `NO_MASS` otherwise).

**Harmonic.** `analysisType: "harmonic"` takes exactly one case or
combination: the load amplitude F, applied as F cos(Ωt). `harmonic` is
`{frequencies: [Hz…] | sweep: {from, to, count: 2–200, spacing?:
"linear" | "log"}, damping: {ratio, frequencies: [f₁, f₂]} | {a0, a1},
massMatrix?, subdivisions?}`. A sweep is expanded in Rust. Up to 200
frequencies, each > 0, and at most 200 000 node-frequency pairs. The ratio
form needs 0 < ζ < 1 and 0 < f₁ < f₂; the coefficient form needs a0 ≥ 0 and
a1 > 0. Each frequency is solved directly (complex LDLᵀ) with a residual
check (`RESIDUAL_FAILURE` above 1e-8). The result has `analysisType:
"harmonic"`, the ResultHeader identity fields, `caseId`, `subdivisions`,
`massMatrix`, `damping {a0, a1, ratio, frequencies}`, `nodeIds`,
`supportIds`, `frequencies[] {frequency, omega, dampingRatio, residual,
displacementRe[6n], displacementIm[6n], reactionRe[6s], reactionIm[6s]}`
(u(t) = Re(U e^{iΩt})), `numericalChecks`, `disclosures` and `diagnostics`.
Member actions are not reported.

**Response spectrum.** `analysisType: "responseSpectrum"` takes no case.
`responseSpectrum` is `{spectrumId, direction: "X" | "Y" | "Z", scale?: > 0
(default 1), combination?: "srss" | "cqc" (default cqc), modes?,
massMatrix?, subdivisions?, participationTarget?}`. A mode whose period
exceeds the spectrum is `SPECTRUM_RANGE`. No mass in the direction is
`NO_MASS`, and an unknown spectrum is `DANGLING_REFERENCE`. The result has
`analysisType: "responseSpectrum"`, identity fields, `spectrumId`,
`direction`, `scale`, `combination`, `dampingRatio`, `modes[] {mode, omega,
frequency, period, sa, participationFactor, effectiveMass,
effectiveMassRatio, baseShear}`, `participation` (as modal, one direction),
`nodeIds`, `nodeDisplacements[6n]`, `supportIds`, `reactions[6s]`,
`baseReaction[3]`, `members[] {id, stations[] {station, side?, actions[6]}}`
(`|N|, |Vy|, |Vz|, |T|, |My|, |Mz|`), `numericalChecks`, `disclosures` and
`diagnostics`. Every combined value is a non-negative peak magnitude.

**Spectra (schema 1.6.0).** A project `responseSpectra[]` entry is `{id,
name, points: [[T, Sa]…], dampingRatio, reference}`. It has 2–200 points,
T strictly increasing from 0 s, Sa ≥ 0 in m/s², 0 < ζ < 1, and a label
prefix `rs`. `SetResponseSpectrum` follows the `existence` rule and accepts
`saUnit: "m/s2" | "g"`; Rust converts the value and stores SI only. Invalid
tables are `INVALID_SPECTRUM`. 1.5.0 projects migrate with no spectra. A
spectrum is the engineer's input and never a code spectrum.
