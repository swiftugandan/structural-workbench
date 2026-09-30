# Model exchange, exchange-v1

IFC4 structural analysis models and DXF wireframes, read into and written
from the workbench frame model. Decisions: ADR 0025. Code:
`crates/exchange`. Corpus and independent checks:
`tools/oracles/exchange_oracle.py` → `fixtures/exchange/exchange-oracle.json`.

## Sources

- **IFC4 ADD2 TC1** (ISO 16739-1:2018):
  - buildingSMART `IFC4_ADD2_TC1.exp`;
  - PSD `Pset_ProfileMechanical`, `Pset_MaterialMechanical` and
    `Pset_MaterialCommon`;
  - entity documentation for IfcStructuralItem, IfcStructuralActivity,
    IfcStructuralCurveMember, IfcStructuralPointConnection,
    IfcRelConnectsStructuralMember, IfcBoundaryNodeCondition,
    IfcStructuralLoadCase, IfcRelAssignsToGroupByFactor and
    IfcGloballyUniqueId;
  - the IfcProfileResource axis convention.

  All from the buildingSMART IFC4.3.x-development repository, which allows
  use in software development with attribution. They are not redistributed
  here; see `resources.lock.json#R-EXCHANGE-CORPUS`.
- **ISO 10303-21** clear-text encoding.
- **AutoCAD DXF reference:** group codes, `$INSUNITS`, and the arbitrary
  axis algorithm.

## Workflow

1. `exchangeRead {format, fileName, text}` returns the read report:
   - `source`: format, file name, SHA-256 of the text, size, schema;
   - `units`, `counts`, `ledger`;
   - `blocking`: content that cannot be imported in any form;
   - `decisions`.
2. `exchangeImport {format, fileName, text, mapping}` checks the mapping and
   builds the project:
   - blocking content is refused first;
   - then the mapping must be for this file (`MAPPING_MISMATCH`);
   - then every stated decision must be answered, and only those
     (`DECISION_REQUIRED`, `INVALID_MAPPING`);
   - finally the project is built and validated.

   The result replaces the session atomically, with a `conversionRecord`:
   source, units, mapping, ledger and project hash. A refusal leaves the
   session unchanged.
3. `exchangeExport {format, timestamp}` returns the file (`fileName`,
   `mediaType`, `text`, `sha256`) and the export ledger. It exports a
   canonicalised copy, so the file depends only on the model; the IFC
   header's timestamp is the caller's.
4. The CLI runs the same core:
   - `workbench-cli exchange read <file>`
   - `exchange import <file> <mapping.json> <project.json> [record.json]`
   - `exchange export <project.json> <out.ifc|out.dxf>`

   `SOURCE_DATE_EPOCH` sets the IFC timestamp.

Text is UTF-8 when valid, otherwise ISO 8859-1 (older DXF). The SHA-256 is
of that text in UTF-8, identical in the browser and the CLI. Files are
limited to 64 MiB and 2 000 000 STEP instances.

## Mapping manifest

```json
{"format": "workbench-exchange-mapping-v1",
 "sourceSha256": "<64 hex>",
 "answers": {"<decision id>": {"choice": "<value>", "values": {"<field>": 1.0}}}}
```

`values` is required exactly when the choice is `values`, with exactly the
decision's fields. Every field is SI and must pass its rule: positive,
non-negative, or −1 < ν < 0.5.

| Decision id | When | Choices |
|---|---|---|
| `model` | several IfcStructuralAnalysisModels | each model's GUID |
| `units:<quantity>` | a used quantity has no assigned unit, and SI ≠ derivation from the assigned base units | base quantities: m, mm, cm, ft, in / N, kN, lbf, kip / kg, t, lb; others: `derived`, `si` |
| `planar` | a 2D model outside the XZ plane, or out-of-plane loading | `spatial` |
| `skip:surfaces` | surface members, curve or surface connections | `skip` |
| `skip:loads` | loads that cannot be represented | `skip` |
| `supports:elastic` | a support stiffness other than 0 | `fixed`, `free` |
| `supports:unset` | a support condition with unset values | `fixed`, `free` |
| `connections:unset` | a member end with no relationship, no condition or unset values | `rigid`, `pinned` |
| `connections:elastic` | a semi-rigid member end | `rigid`, `pinned` |
| `material:#<id>` / `material:none` | E, ν or ρ missing / no material | `values` (E, nu, density) |
| `section:#<id>` / `section:none` | properties not stated or implied / no profile | `values` (A, Iy, Iz, J, cy, cz) |
| `purpose:<text>` | a combination purpose other than analysis, service, strength | `strength`, `service`, `analysis` |
| `layer:<name>` (DXF) | each layer with segments | `values` (E, nu, density, A, Iy, Iz, J, cy, cz), `skip` |
| `units:length` (DXF) | `$INSUNITS` absent, 0 or unsupported | m, mm, cm, ft, in |
| `nodes:tolerance` (DXF) | always | `values` (tolerance ≤ 0.1 m) |
| `supports` (DXF) | always | `none`, `pinnedLowest`, `fixedLowest` |

## IFC4 reading rules

- **Scope:**
  - `FILE_SCHEMA(('IFC4'))` only: IFC2X3 and IFC4X3 are refused by name.
  - Complex (multi-leaf) instances are refused.
  - Items grouped into the analysis model by IfcRelAssignsToGroup are read.
  - A non-identity world coordinate system is refused.
- **Units:**
  - `IfcSIUnit` (prefix applied per power, so mm² = 1e-6 m²),
    `IfcConversionBasedUnit` (value × its unit) and `IfcDerivedUnit`
    (product of element factors) give each quantity's SI factor.
  - A property value's own unit overrides the project unit.
  - Dimensions (length, force, mass) define the `derived` choice. For
    example, the modulus is F·L⁻² and rotational stiffness is F·L per
    radian.
- **Geometry:**
  - Local placements compose to world frames.
  - Coordinates, including placement origins, scale by the length factor.
  - A point connection's position is its `Reference`/`Vertex` topology.
  - A curve member is the single edge of its `Reference` topology: IfcEdge,
    IfcOrientedEdge (orientation applied) or IfcEdgeCurve on a line or
    two-point polyline. Curved members are refused.
  - Coincident point connections (within 1e-6 m) are refused. Member ends
    without a connection become nodes, merged by position.
- **Orientation:**
  - x = unit(end − start).
  - z = unit(Axis − (Axis·x)x), with Axis rotated to world.
  - y = z × x, and it becomes `localY`. If `Workbench_Identity` carries
    `LocalYX/Y/Z` and that vector defines the same y within 1e-9, it is kept
    as authored.
  - A member without Axis (Axis is mandatory in IFC4) takes the workbench
    default: y = global Y, or −X for members along Y. This is recorded as a
    conversion.
- **Supports** come from the point connection's IfcBoundaryNodeCondition:
  - `TRUE` → fixed; `FALSE` or 0 → free;
  - a stiffness → decision; `$` → decision.
  - A skewed ConditionCoordinateSystem is refused unless the condition is
    isotropic.
  - Warping is ignored and recorded.
- **Member ends** come from IfcRelConnectsStructuralMember, matched to the
  end at the connection's position (member axes; a rotated condition system
  is refused):
  - RotationalStiffnessY/Z `FALSE` → release My/Mz.
  - A free translation or torsion is refused.
  - A connection strictly between the ends is refused: split the member at
    the connection.
  - IfcRelConnectsWithEccentricity is refused.
- **Sections:**
  - `Pset_ProfileMechanical` gives A, Iy (`MomentOfInertiaY`), Iz and J
    (`TorsionalConstantX`).
  - Extreme fibres, in order of preference:
    - `Workbench_Section` `ExtremeFibreY/Z`;
    - cz = Iy / `MaximumSectionModulusY`, cy = Iz / `MaximumSectionModulusZ`;
    - the parametric shape.
  - Otherwise a centred parametric shape gives everything:
    - rectangle (XDim along y), using the workbench's Saint-Venant J
      approximation;
    - circle, hollow circle (exact J = 2I).
  - A quarter-turned position swaps rectangle dimensions.
  - Cardinal points other than 10 are recorded as converted to centroidal
    insertion. A non-zero IYZ is recorded as ignored.
  - Composite and tapered profile sets are refused.
- **Materials:**
  - `Pset_MaterialMechanical` gives YoungModulus and PoissonRatio (else
    ν = E/2G − 1 from ShearModulus).
  - `Pset_MaterialCommon` gives MassDensity.
- **Load groups:**
  - LOAD_CASE groups become cases. ActionSource DEAD_LOAD_G, LIVE_LOAD_Q and
    WIND_W map to dead, live and wind; everything else maps to other.
  - A case's actions are its own plus those of nested LOAD_GROUPs, each
    multiplied by the case and group coefficients and the assignment
    factors.
  - LOAD_COMBINATION terms are the ByFactor factor × the combination
    coefficient. Only load cases may be combined.
  - SelfWeightCoefficients (0, 0, −f) in world coordinates give a
    self-weight load of factor f on every member. Other directions are
    refused.
- **Actions:**
  - A single force on a point connection becomes a nodal load in global
    directions.
  - A CONST IfcStructuralLinearForce on a member becomes a uniform load,
    local or global. For PROJECTED_LENGTH in global directions, each
    component along axis k is multiplied by √(1 − x_k²).
  - A single force at a vertex on a member, or DISCRETE items at local
    distances, become point loads at station d/L, or nodal loads at an end
    (local values rotated to global). A point more than 1e-6 m off the
    member is refused.
  - Linear moments, other distributions, temperatures, displacements and
    surface loads need `skip:loads`.
  - Reactions and results are not imported.
- **Identity:**
  - IDs are `Workbench_Identity.EntityId` when valid and unused, else `g` +
    GUID (`$` → `-`).
  - Labels are `Workbench_Identity.Label`, else a Name already in label
    form.
  - Project ID, runtime budgets and display units come from
    `Workbench_Project`, else the defaults.

## IFC4 writing rules

- **File:** SI units with every derived unit stated, and one shared identity
  placement. The model is LOADING_3D, or IN_PLANE_LOADING_2D (XZ,
  OrientationOf2DPlane Axis (0, −1, 0)) for planarXZ projects. It is
  aggregated under IfcProject; LoadedBy holds the combinations, or else the
  cases.
- **Nodes and members:**
  - Every node is a point connection with one shared vertex; supports are
    boolean conditions.
  - Every member is a RIGID_JOINED_MEMBER edge with Axis = x × y.
  - Explicit end conditions give RotationalStiffnessY/Z = ¬release.
  - Members share an IfcMaterialProfileSetUsage (cardinal point 10) of an
    IfcMaterial (mechanical and common psets) and a property-only
    IfcProfileDef (Pset_ProfileMechanical with A, I, J and section moduli).
- **Load cases and loads:**
  - ActionType/ActionSource come from the category, and SelfWeightCoefficients
    from all-member self weight.
  - Nodal and point loads become IfcStructuralPointAction; point loads carry
    a vertex at their station. Uniform loads become CONST IfcStructuralLinearAction.
  - Combinations are LOAD_COMBINATION groups with IfcRelAssignsToGroupByFactor.
- **GUIDs:** imported ones are written back; others are derived.
- **Ledger** (notExported): settlements, steel design, design previews, mass
  sources, response spectra, results, the physical hierarchy, and
  partial-member self weight.

## DXF rules

- **Reading:**
  - Model space only; paper space and blocks are recorded, not exploded.
  - LINE is WCS. LWPOLYLINE (elevation 38) and 2D POLYLINE (elevation in
    30) are OCS through the arbitrary axis algorithm:
    - Ax = Wy × N if |Nx|, |Ny| < 1/64, else Wz × N;
    - Ay = N × Ax.
  - 3D POLYLINE is WCS. Closed polylines add the closing segment.
  - Bulged (arc) segments, meshes and all other entity types are recorded.
  - Zero-length, duplicate and merged-away segments are recorded as
    skipped.
  - Nodes merge within the chosen tolerance. Members use the workbench
    default orientation, rigid ends, one material and section per layer,
    one empty load case, and the chosen supports.
- **Writing:** R12 (AC1009), `$INSUNITS` = 6, one LINE per member on a layer
  named after its section. Everything else is in the ledger.

## Verification

| Check | Evidence |
|---|---|
| STEP reals and strings, GUID encoding (buildingSMART example) | `crates/exchange/src/{step,guid}.rs` tests |
| Every fixture model, X-FRAME and UKR01 round-trip IFC → project (1e-12), byte-identical re-export; declared losses only | `tests/round_trip.rs` |
| IfcOpenShell-authored corpus imports to the oracle's SI model within 1e-9: units, placements, orientation, loads, groups, decisions, ledger, blocking | `tests/corpus.rs` |
| ezdxf-authored DXF (mirrored and arbitrary OCS, R12 without units) | `tests/corpus.rs` |
| Workbench IFC exports pass IfcOpenShell validation (schema + EXPRESS rules) and IfcOpenShell read-back; DXF exports pass the ezdxf audit and read-back (hash-bound) | `exchange-oracle.json#exportChecks`, `tests/corpus.rs` |
| Protocol: atomic refusals, analysis of every imported corpus model, export → re-import reproduces the hash | `crates/wasm-api/tests/exchange.rs` |
| Batch import needs a manifest; record and exports | `crates/cli` tests |
| Browser journeys | `tests/e2e/exchange.spec.js` |
