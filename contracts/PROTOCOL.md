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
| analyse | {caseIds: string[], combinationIds: string[]} | jobId and accepted snapshot hash; completion arrives as an event |
| cancelAnalysis | {jobId: string} | job status cancelled or alreadyFinished |
| getSnapshot | {includeView: boolean} | ProjectV1 plus separate optional view state |
| queryGeometry | {kind: ray or snap or measure, query: object, viewRevision: integer} | entity IDs, f64 positions/distances and matching viewRevision |
| getResults | {resultId: string, caseId: string, entityIds: string[]} | header plus typed buffers described below |
| exportProject | {includeResults: boolean} | portable engineering JSON and optional separate result files with hashes |
| evaluateDesign | {profileId: string, memberIds: string[], resultId?: string, inputs: object} | DesignRun (overall, checks[], limitations). Inputs carry section/demand in SI; envelopes are refused by UI provenance rules. |
| runStudy | {study: object, baseProjectJson?: string} | Comparative study report (variant model/result hashes). Uses open project when baseProjectJson omitted. |
| computeSection | {shape: "solidRectangle", width: number, depth: number, customJ: number\|null} | A, Iy, Iz, J, cy, cz, provenance and jSource (SI). Does not mutate the project. width is along local y; depth along local z. Null customJ uses the Saint-Venant rectangle estimate. |

## 1.1 Declarative study files (native CLI)

`workbench-cli study <study.json>` runs a bounded parameter sweep. Study schemaVersion is `1.0.0`. Required fields: `id`, `baseProject` (path resolved from cwd, study directory or workspace root), `variants[]` with `id` and `set[]` of JSON-pointer `{path,value}` mutations. Optional `caseId` (default `LC1`) and `observe.{nodeId,dof}`. Each variant is re-parsed and validated through the Rust project model before analysis; `solverOverride` is refused. The report lists per-variant `modelHash`, `resultId`, `settingsHash` and observed DOF value. Distinct variants must produce distinct model hashes.
An analyse acknowledgement is not a completed result. Every asynchronous event contains eventType, jobId, requestId, sourceRevision, modelHash and event payload. Events are analysisProgress, analysisCompleted, analysisFailed or analysisCancelled. An accepted job emits exactly one terminal event, including after Worker termination/restart. Progress stages are validation, assembly, factorisation, solve, recovery and complete; progress is indeterminate when a meaningful percentage is unavailable. Do not simulate numerical progress with timers.

From M03 the browser hosts two Workers: a durable model Worker owns create/import/commands/undo/queryGeometry, and a disposable analysis Worker receives an exported snapshot then `analyse`. Cancel/timeout terminates only the analysis Worker. Completed results whose `modelHash` no longer matches the live model are stale and must not be labelled current.

## 2 Command vocabulary

CommandV1 is {id, type, args}. Supported types and args are AddNode(node), AddMember(member), SetNodePosition({id,position}), SetMaterial(material), SetSection(section), SetSupport(support), SetLoadCase(loadCase), SetLoad(load), SetCombination(combination), SetGravity({gravity}), SetAnalysisMode({mode}), MoveNodes({ids,delta}), CopySelection({ids,delta,connectToExisting:false}), CopyBay({ids,delta,count,includeSupports:true,tieUnsupportedNodes:true,setSpatial?,stabilizeBases?}), SplitMember({id,stations}), MergeNodes({sourceIds,targetId}), DeleteEntities({ids,cascade:false}) and Batch({commands}). Envelope names in parentheses are records, not executable functions.

Upsert-style Set operations must specify expected entity existence as create/update to detect accidental overwrites. Batch uses one model revision and one undo entry; nested Batch is rejected. Import commands do not bypass validation. Member splitting preserves member-load total and physical-parent provenance; IDs of new entities are deterministic from the command ID and ordinal. Undo stores sufficient inverse data to restore exact engineering values and IDs.

SetName/SetDisplayUnits/SetView are view/metadata changes in JavaScript persistence and may update a separate presentation revision. They do not create a new engineering hash or clear valid results. Engineering undo and presentation undo should not be mixed invisibly; report their scope in command history.

## 3 Binary result layout

ResultHeader includes resultId, modelHash, settingsHash, solverBuildHash, schemaVersion, analysisType, caseOrCombinationId, converged boolean, diagnostics[], numericalChecks and bufferDescriptors[]. Empty/failed results have no numerical response buffers, rather than zeros. All native/WASM/CSV adapters must agree on this layout.

nodeIds is a stable ordered array of IDs. nodeDisplacements is Float64Array length 6×nodeIds.length with stride [ux,uy,uz,rx,ry,rz]. reactionSupportIds is an ordered list; reactions has the same six-component force/moment stride. Generated planar constraints have separate identifiers and reaction buffers, preventing them from being mistaken for physical supports.

memberIds indexes Float64Array memberEndActions of length 12×memberIds.length, stride [fx_i,fy_i,fz_i,mx_i,my_i,mz_i,fx_j,fy_j,fz_j,mx_j,my_j,mz_j]. These are raw nodal actions applied to the element. Section-action functions and diagram points use the cut convention in the specification, not these raw signs.

Diagram output carries memberId, component, station fraction, side left/right/continuous, value and governing case ID. A bulk packet stores Uint32Array memberIndex, Float64Array station/value, Uint8Array side and Uint32Array governingCaseIndex. The lengths must match and every index must be in range. Interpolated deformations additionally state global/local frame and scale 1.0. The viewport's visual amplification is separate metadata.

Buffers are little-endian when serialised to files; in-memory typed arrays follow platform byte order through structured clone. JSON snapshots contain ordinary numbers, not binary blobs. No NaN/Infinity is permitted in a successful result. A zero result is valid only when the calculation established it.

## 4 Diagnostic registry

Minimum stable codes: INVALID_SCHEMA, UNSUPPORTED_SCHEMA, DUPLICATE_ID, DANGLING_REFERENCE, ZERO_LENGTH_MEMBER, INVALID_SECTION, INVALID_MATERIAL, INVALID_LOCAL_AXIS, INVALID_RESTRAINT, INVALID_LOAD, DUPLICATE_SELF_WEIGHT, UNSUPPORTED_FEATURE, REVISION_CONFLICT, UNSTABLE_MODEL, UNRESTRAINED_DOF, UNUSED_DOF, ILL_CONDITIONED, NONFINITE_RESULT, RESIDUAL_FAILURE, EQUILIBRIUM_FAILURE, MEMORY_LIMIT, TIMEOUT, CANCELLED, STALE_RESULT, STORAGE_QUOTA, GPU_UNAVAILABLE and GPU_DEVICE_LOST.

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
- `evaluateDesignPreview {draftId,modelHash,sourceMode,caseId?,resultId?}` uses the captured project on a disposable worker. `sourceMode` is explicit `synthetic|model`. Model actions require exact current converged case/result identity, re-solved in Rust. Slabs reject frame-model sources. Beam actions are actual member key stations; footing actions negate one simultaneous global support reaction vector. No orientation, contact or code capacities are inferred.
- Returned records have deterministic `previewRunId`, `inputHash`, model/revision identity, source provenance, null code profile, `mock:true`, `overall:unsupported`, unavailable check utilisations and explicit limitations. A model action source may have `mock:false`; the concrete workflow remains unverified. Footing contact is `indeterminate`, bearing pressure is external input, and `computedByWorkbench:false`.
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
