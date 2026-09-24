# Structural Workbench — Steel Design Product Specification

> **Planning status (repo binding):** This document is a **product / layout proposal** retrieved from a design conversation. It is **not** the schedule owner and does **not** change pinned codes or accepted M07 S2 breadth.
>
> Implement against **[ADR 0008](../../adr/0008-integrated-design-workspace.md)** and `agent-tasks/DESIGN-WORKFLOW.md`:
> | Pack §31 | Repo slice | Notes |
> | --- | --- | --- |
> | Phases 1–3 | **M07-E** (next) | Identity, settings/provenance/readiness, model-native demand |
> | Phases 4–5 | **M07-F** | Selected-member inspector + calc drawer only (mockups 01–02) |
> | Phases 7 + 9 | **M07-G** | Whole-model, catalogue, section study (mockups 03–05) |
> | Phase 8 | **M07-S** (deferred) | Serviceability — do not invent PASS/FAIL in F/G |
> | Phase 6 | **M07-LTB** (deferred) | Evidence-backed strength expansion |
> | Phase 10 | **M09** | Second-order / stability |
>
> Approved mockups: `screens/approved/`. Code pin remains SPEC / `SOURCES.md` (`aisc-360-22-lrfd`).

**Status:** Proposal (layout / IA)  
**Target repository:** Structural Workbench  
**Primary design profile:** `aisc-360-22-lrfd`  
**Scope:** Model-native steel member design, review, reporting, and section studies  
**Audience:** Structural Workbench maintainers, implementation agents, reviewers, and structural-engineering contributors

---

## 1. Purpose

This specification defines a proposed evolution of Structural Workbench from its current M07 steel-check capability into a model-native steel design workflow.

The goal is not to replace the existing finite-element analysis architecture or the current pluggable `CodeProfile` design system. The proposal extends those systems so that a user can:

1. create or import a structural frame,
2. assign recognised steel sections and material grades,
3. define explicit design assumptions such as restraint and effective-length data,
4. analyse the structural model,
5. run code checks directly against real model members,
6. inspect governing combinations, stations, clauses, assumptions, and intermediate calculations,
7. review whole-model steel design status,
8. compare alternative catalogue sections,
9. apply a selected candidate back to the structural model,
10. reanalyse and redesign when stiffness or self-weight changes,
11. export a reproducible calculation record.

The workflow must remain fail-closed: unsupported or incomplete mandatory checks must never be displayed as an overall pass.

---

## 2. Current repository baseline

Structural Workbench already contains a useful foundation for steel design.

### 2.1 Existing architecture

The repository includes:

- a Rust/WebAssembly analysis kernel,
- a `workbench-design` crate,
- a code-agnostic `CodeProfile` trait,
- a `ProfileRegistry`,
- a registered `aisc-360-22-lrfd` profile,
- design result types including `DesignDemand`, `MemberContext`, `CheckOutcome`, and `DesignRun`,
- an `evaluateDesign` WASM operation,
- capability metadata exposing enabled design profiles,
- a steel-check UI,
- AISC S2 fixtures and acceptance evidence,
- standalone HTML calculation-report integration.

### 2.2 Existing AISC scope

The current AISC profile is intentionally narrow:

- ANSI/AISC 360-22
- LRFD
- prismatic, doubly symmetric W shapes
- classification
- tension
- compression
- major-axis flexure on the currently validated continuous-brace path
- shear
- H1 axial/flexural interaction

Current known exclusions include:

- lateral-torsional buckling for `Lb > 0`,
- HSS and other non-W families,
- torsion,
- non-prismatic members,
- general connection design,
- general automatic code-generated load combinations,
- second-order structural response.

### 2.3 Current product limitation

The current steel UI is primarily a validation/demo harness.

Model actions can be overlaid onto a published/reference steel seed, but the selected model member does not yet supply all of its own steel-design properties. The current model `Section` type contains analysis properties such as `A`, `Iy`, `Iz`, `J`, `cy`, and `cz`, but not the full code-design data required for real catalogue W-shape checking.

The production workflow therefore needs a model-native bridge between:

- structural member,
- recognised section catalogue record,
- design material,
- design assumptions,
- current analysis result,
- code profile.

---

## 3. Product goals

### 3.1 Primary goals

The steel design workflow should:

- use the selected model member directly;
- use one pinned and fully identified code profile;
- preserve all demand provenance;
- preserve all assumption provenance;
- support whole-model review;
- distinguish PASS, FAIL, UNSUPPORTED, INDETERMINATE, STALE, and NOT CHECKED;
- make design state visible in the main workspace;
- provide calculation traceability down to clause and intermediate values;
- remain deterministic and reproducible;
- support explicit catalogue-based section studies;
- rerun analysis when stiffness or self-weight changes can alter demand;
- remain extensible to future code profiles without rewriting the UI architecture.

### 3.2 Non-goals for the first production steel-design release

The first production release should not claim:

- full AISC 360 coverage,
- full steel-building design,
- automatic connection design,
- automatic frame bracing inference from geometry alone,
- automatic effective-length determination unless separately implemented and validated,
- second-order/direct-analysis-method compliance unless that analysis capability exists and is validated,
- automatic wind/seismic load generation,
- HSS design unless explicitly added,
- plate girders,
- non-prismatic members,
- torsional member design,
- full commercial-product parity,
- engineering approval or certification.

Unsupported conditions must be explicit in capability metadata, UI status, and reports.

---

## 4. Engineering principles

### 4.1 Analysis and design remain separate systems

The analysis model computes structural response.

The design system consumes:

- validated actions,
- section design properties,
- material design properties,
- member restraint/effective-length data,
- code-profile metadata.

Design must not silently modify the analysis model.

### 4.2 Design demand must be simultaneous

A design demand must come from:

- one real case or combination,
- one member,
- one station,
- one side of a discontinuity where applicable.

Envelope maxima must never be assembled into a synthetic six-component demand vector.

### 4.3 Unsupported means unsupported

If a mandatory check cannot be performed, the member cannot receive an overall PASS.

Example:

```text
Compression       PASS    0.42
Flexure           PASS    0.71
LTB               UNSUPPORTED
Interaction       UNSUPPORTED

Overall           UNSUPPORTED
```

### 4.4 User-supplied assumptions are not derived facts

Values such as:

- `Ky`,
- `Kz`,
- unbraced length,
- brace points,
- `Cb`,
- connection-hole information,

must retain provenance.

The system must distinguish:

- catalogue,
- derived,
- project default,
- group default,
- user entered,
- imported,
- not provided.

### 4.5 Design results are immutable records

A design result must be tied to:

- model hash,
- analysis result ID,
- design profile ID and version,
- member ID,
- section record/version,
- material record/version,
- design-assumption hash,
- case/combination ID,
- station,
- solver/design build IDs.

Changes to any relevant input must make the result stale.

---

## 5. Target architecture

```text
                     STRUCTURAL WORKBENCH
                              │
          ┌───────────────────┴───────────────────┐
          │                                       │
      ANALYSIS MODEL                         DESIGN MODEL
          │                                       │
 nodes / members /                        catalogue refs
 loads / combinations                    material refs
 analysis sections                       design assumptions
          │                                       │
          └───────────────┬───────────────────────┘
                          │
                    Rust analysis
                          │
                 immutable result set
                          │
                 section-action queries
                          │
                          ▼
                  DesignDemand builder
                          │
                          ▼
                    CodeProfile
          ┌───────────────┼──────────────────────┐
          │               │                      │
    AISC 360-22        Eurocode 3           future profiles
          │
          ▼
       DesignRun
          │
   ┌──────┼────────────┬───────────────┐
   │      │            │               │
 member  overview   calculation      section
 view    table       report           studies
```

The design-code implementation remains in Rust.

JavaScript may:

- render forms,
- format values,
- navigate result data,
- request design operations,

but must not independently calculate structural resistance or utilisation.

---

## 6. Data model changes

## 6.1 Analysis section remains code-neutral

The generic analysis `Section` should continue to represent the mechanical properties needed by the frame solver.

Do not turn the base section type into an AISC-specific structure.

A proposed extension is to add an optional catalogue/design reference:

```rust
pub struct Section {
    pub id: String,
    pub name: String,
    pub a: f64,
    pub iy: f64,
    pub iz: f64,
    pub j: f64,
    pub cy: f64,
    pub cz: f64,
    pub provenance: String,

    pub design_ref: Option<SectionDesignRef>,
}
```

Example:

```rust
pub struct SectionDesignRef {
    pub catalogue_id: String,
    pub record_id: String,
    pub record_version: String,
}
```

The authoritative steel-design properties are then resolved from the pinned catalogue record.

## 6.2 Steel section catalogue

Introduce a versioned section catalogue abstraction.

Example:

```rust
pub struct SteelSectionRecord {
    pub id: String,
    pub designation: String,
    pub family: String,

    // Analysis properties
    pub area: f64,
    pub iy: f64,
    pub iz: f64,
    pub j: f64,

    // Design geometry/properties
    pub d: f64,
    pub bf: f64,
    pub tf: f64,
    pub tw: f64,
    pub rx: f64,
    pub ry: f64,
    pub sx: f64,
    pub sy: f64,
    pub zx: f64,
    pub zy: f64,

    // Optional later properties
    pub cw: Option<f64>,
    pub ho: Option<f64>,
    pub rts: Option<f64>,

    pub mass_per_length: Option<f64>,
    pub source_id: String,
    pub source_version: String,
}
```

The exact property set should be driven by the validated profile requirements.

### Catalogue requirements

A catalogue must provide:

- stable record IDs,
- explicit edition/version,
- source provenance,
- unit normalisation,
- aliases/designations,
- property validation,
- rights status,
- reproducible import/build tooling.

Projects must not silently reinterpret an existing section against a different catalogue revision.

## 6.3 Material design data

Separate elastic analysis material properties from design-grade metadata.

Example:

```rust
pub struct DesignMaterialRef {
    pub profile_family: String,
    pub grade_id: String,
    pub grade_version: String,
}
```

A resolved steel grade may include:

```rust
pub struct SteelGrade {
    pub id: String,
    pub name: String,
    pub fy: f64,
    pub fu: f64,
    pub e: f64,
    pub source_id: String,
    pub source_version: String,
}
```

Where the design standard has thickness-dependent strengths or other applicability rules, the grade resolver must implement those explicitly.

## 6.4 Member design settings

Add an optional design configuration associated with a physical member.

Example:

```rust
pub struct SteelMemberDesign {
    pub profile_id: String,
    pub enabled: bool,

    pub effective_length: EffectiveLengthSettings,
    pub bracing: Vec<BracingSegment>,
    pub connection_end_data: Option<TensionEndData>,

    pub overrides: Vec<DesignOverride>,
}
```

### Effective-length settings

Initial restricted form:

```rust
pub struct EffectiveLengthSettings {
    pub ky: DesignValue,
    pub kz: DesignValue,
}
```

A `DesignValue` should record both value and provenance:

```rust
pub struct DesignValue {
    pub value: f64,
    pub source: DesignValueSource,
}
```

### Bracing segments

Do not model `Lb` as only one global scalar forever.

Use a segment model:

```rust
pub struct BracingSegment {
    pub start_station: f64,
    pub end_station: f64,
    pub lateral_restraint: bool,
    pub torsional_restraint: bool,
    pub lb: Option<DesignValue>,
    pub cb: Option<DesignValue>,
}
```

The first implementation may allow one segment equal to the full physical member, but the schema should not prevent multiple segments later.

---

## 7. Design readiness

Before running a member check, the application should compute a design-readiness state.

Example:

```text
Analysis current             ✓
Section catalogue recognised ✓
Material grade recognised    ✓
Strength combinations found  ✓
Effective length data        ✓
Lateral restraint data       ✗
Connection detail required   —
```

Possible readiness states:

- READY
- INCOMPLETE
- UNSUPPORTED
- STALE

A calculation should not start when required inputs are missing unless the design engine itself is intentionally returning a structured `INDETERMINATE` result for that state.

---

## 8. Design-demand generation

## 8.1 Authoritative demand source

Design demand should be generated from authoritative solver result functions, not merely from a rendering sample grid.

Critical stations should include:

- member ends,
- load discontinuities,
- analytical child boundaries,
- exact force extrema,
- exact moment extrema,
- brace-segment boundaries,
- additional profile-required stations.

Where an action is discontinuous, the side must be explicit.

## 8.2 Demand identity

Every demand record should contain a reference similar to:

```rust
pub struct GoverningActionRef {
    pub model_hash: String,
    pub result_id: String,
    pub member_id: String,
    pub combination_id: String,
    pub station: f64,
    pub side: Option<String>,
}
```

This should be included in `DesignRun`.

## 8.3 Strength and service combinations

The current project supports user-defined combinations with no implicit code meaning.

The first model-native steel design release should therefore explicitly state:

- strength combinations are supplied by the project,
- service combinations are supplied by the project,
- the design module does not automatically certify that the combination set is complete.

A future code-combination generator should be a separate, validated capability.

---

## 9. Stability and second-order effects

This is a major boundary.

The current analysis MVP is first-order linear.

AISC member checks must not imply that second-order/stability requirements have been automatically handled when they have not.

The steel-design UI and report must therefore display the declared analysis/design basis.

Example:

```text
Analysis basis
First-order linear elastic

Effective-length treatment
User-specified Ky/Kz

Second-order frame effects
Not generated by the current analysis module
```

Future implementation paths may include:

1. restricted effective-length workflow with explicit user inputs;
2. validated second-order analysis;
3. a future validated direct-analysis-method workflow.

Until such features exist, capability metadata must remain narrow.

---

## 10. Code-profile expansion

The existing `CodeProfile` interface should remain the core abstraction.

The first production steel profile should expand only through evidence-backed slices.

### Suggested AISC progression

#### S2A — Model-native currently validated checks

- recognised W catalogue sections,
- steel material grades,
- classification,
- tension where required end-detail data exist,
- compression with explicit effective-length assumptions,
- current validated continuous-brace flexure,
- supported shear,
- H1 where all required resistances are available,
- complete provenance/reporting.

#### S2B — Full validated W-shape flexure within selected scope

Add lateral-torsional buckling for validated AISC F2 regions.

This likely requires additional section properties and bracing-segment data.

#### S2C — Weak-axis resistance and interaction completion

Do not rely on externally supplied weak-axis capacity where it can be calculated from the pinned profile.

#### S2D — Expanded shear and combined-action applicability

Correctly distinguish shear axes and applicability.

Do not collapse `Vy` and `Vz` into one maximum and apply a single web-shear resistance unless that is explicitly valid.

### Later profiles

Future code packages may include:

- Eurocode 3,
- SANS,
- other approved profiles.

Each is a separate pinned profile with its own resource bundle, edition, national annex/jurisdiction where applicable, tests, and capability metadata.

---

## 11. UI information architecture

Steel design should become a first-class workspace capability, not a standalone calculator modal.

Use four levels:

1. **Member properties**
2. **Selected-member design**
3. **Whole-model design overview**
4. **Section study**

---

## 12. Selected-member workflow

The existing right inspector should gain a Steel Design tab.

Example:

```text
MEMBER B24
──────────────────────────────

Properties
Results
Steel design   ←

Section        W18×50
Material       ASTM A992
Profile        AISC 360-22 LRFD

Analysis       Current ✓
Inputs         Complete ✓

Governing      0.83 PASS
H1-1a
LC07 · x/L 0.370

[Open detailed results]
```

### Design setup

The setup should expose:

- profile,
- section catalogue record,
- material grade,
- effective-length assumptions,
- bracing/unbraced segments,
- optional tension-end detail,
- assumption provenance.

Defaults must be visible.

Example:

```text
Ky     1.00     Project default
Kz     1.00     User entered
Cb     1.00     User entered
Lb     3.20 m   Derived from brace segment
```

A user should be able to:

- override a derived/default value,
- see that it has been overridden,
- restore the derived/default value.

---

## 13. Detailed design result

The detailed result should not be a single utilisation traffic light.

Example:

```text
STEEL DESIGN — B24

AISC 360-22 LRFD
W18×50 · ASTM A992

OVERALL
PASS

Governing utilisation
0.83

H1 interaction · H1-1a
LC07 · x/L = 0.370

Check                    Status        Util.
────────────────────────────────────────────
Section classification   PASS          —
Compression              PASS          0.42
Major-axis flexure       PASS          0.71
Shear                    PASS          0.18
H1 interaction           PASS          0.83
```

Each row should expand to show:

- clause,
- formula identifier,
- applicability,
- demand,
- resistance,
- assumptions,
- warnings,
- intermediate values,
- governing action reference.

---

## 14. Status semantics

The UI must distinguish:

### PASS

All applicable mandatory checks completed and passed.

### FAIL

At least one applicable mandatory check failed.

### UNSUPPORTED

At least one mandatory calculation is outside the implemented profile scope.

### INDETERMINATE

Required information or a valid result is missing.

### STALE

The calculation belongs to an older model/design state.

### NOT CHECKED

No design result exists.

These states must not rely on colour alone.

---

## 15. Unsupported-state UX

Unsupported results must explain the engineering consequence.

Example:

```text
Lateral-torsional buckling

UNSUPPORTED

Detected unbraced length:
4.20 m

The current AISC profile supports the validated
continuously restrained flexure path only.

Flexural design is therefore incomplete.
Overall member status cannot be PASS.
```

The user should see:

- what triggered the unsupported condition,
- which check is missing,
- what information or future capability is needed.

---

## 16. Viewport integration

Design must remain visually connected to structural behaviour.

Selecting a governing check should:

- select the member,
- show the governing combination,
- move the result probe to the governing station,
- display the relevant action diagrams,
- place a visible marker on the member.

Example:

```text
●────────────────────────●
          ▲
        x/L .37
        H1 = 0.83
```

The viewport should be able to display design status overlays.

Suggested overlay categories:

- pass,
- fail,
- unsupported,
- stale,
- not checked.

Colour must not be the only indicator.

---

## 17. Whole-model design overview

Add a persistent design review table.

Example:

```text
Member   Section   Status        Governing      Util.
─────────────────────────────────────────────────────
C01      W14×90    PASS          H1-1a          0.78
C02      W14×90    FAIL          E3             1.08
B01      W18×50    PASS          F2             0.83
B02      W18×50    UNSUPPORTED   LTB              —
B03      W21×44    PASS          G2.1           0.41
```

Selecting a row selects the member in the model.

### Filters

Support:

- All
- Failing
- Unsupported
- Stale
- Not checked
- utilisation above a threshold
- member group
- section
- material

### Model tree

The model/navigation tree may include:

```text
Design
  Steel
    Passing (84)
    Failing (7)
    Unsupported (3)
    Stale (5)
    Not checked (12)
```

---

## 18. Bulk editing and design groups

Production steel design needs multi-member workflows.

Users should be able to:

- multi-select members,
- assign a material grade,
- assign a section,
- assign design profile,
- set effective-length assumptions,
- assign a bracing pattern,
- enable/disable steel design.

All bulk operations must:

- preview the affected member count,
- show which values will be overridden,
- commit as one undoable command.

### Design groups

Allow optional groups such as:

- Ground floor beams
- Roof beams
- Interior columns
- Edge columns

Groups may provide defaults, but member overrides remain possible.

The UI should identify inconsistent members within a group.

---

## 19. Section browser

A production catalogue cannot use a simple large `<select>`.

Provide a searchable section browser.

Example:

```text
SECTION CATALOGUE

Search
[ W18________________ ]

Family
☑ W
☐ C
☐ HSS

Filters
Depth      ≤ 500 mm
Mass       ≤ 75 kg/m

Designation   Depth      Mass       Status
──────────────────────────────────────────
W18×35        ...        ...        supported
W18×40        ...        ...        supported
W18×46        ...        ...        supported
W18×50        ...        ...        supported
```

The browser should expose:

- catalogue source,
- edition/version,
- supported/unsupported state for the active profile,
- relevant engineering properties.

Unsupported families should be identifiable before assignment.

---

## 20. Stale-state workflow

Design staleness must be first-class.

Changes that may make design stale include:

- geometry,
- member section,
- material,
- loads,
- combinations,
- analysis settings,
- design assumptions,
- profile version,
- section catalogue version.

Example:

```text
STEEL DESIGN — B12

STALE

The section changed after this design result was calculated.

Previous result:
W18×35
0.94 PASS
revision 18

Current section:
W18×40
revision 19

[Reanalyse and redesign]
```

Historical design results may remain viewable, but must be clearly labelled stale.

---

## 21. Serviceability

Strength and serviceability must remain separate.

A member summary may show:

```text
Strength
PASS · 0.83

Serviceability
FAIL · 24 mm > 17 mm allowed
```

Each may govern under a different combination.

The first implementation should use explicit user/project serviceability criteria.

Do not imply that service limits are automatically code-generated unless that capability is separately validated.

---

## 22. Section studies and sizing

Automatic section sizing should be introduced only after model-native checking is robust.

### 22.1 Design principle

The system proposes candidates; it does not silently change the structural model.

### 22.2 Candidate study

Example:

```text
SECTION STUDY — B12

Objective
Minimum mass

Constraints
Depth ≤ 500 mm
Family = W

Current
W18×50        74 kg/m       0.83 PASS

Candidate
W18×46        68 kg/m       0.91 PASS

Candidate
W18×40        60 kg/m       1.03 FAIL

[Apply W18×46]
```

### 22.3 Required reanalysis

A candidate that changes stiffness or self-weight must be evaluated through:

```text
apply candidate to study model
→ regenerate self-weight if relevant
→ rerun structural analysis
→ regenerate simultaneous design demands
→ run mandatory design checks
→ run required serviceability checks
→ record candidate result
```

Do not reuse original member actions when structural redistribution can occur.

### 22.4 Search semantics

A section study must record:

- catalogue/version,
- candidate filters,
- objective,
- maximum candidate count,
- deterministic ordering,
- excluded candidates,
- complete/incomplete search state.

If search stops early, report:

```text
Search incomplete
```

not:

```text
Optimal section
```

---

## 23. Comparison UX

When a candidate is applied or compared, show useful engineering deltas.

Example:

```text
B12

                 Before       Candidate
Section          W18×35       W18×46
Mass             52 kg/m      68 kg/m
Strength util.   1.08         0.82
Deflection       24 mm        19 mm
Governing check  F2           H1
Governing combo  LC04         LC07
```

The model changes only after explicit user action.

Applying the candidate must be a normal undoable model edit.

---

## 24. Batch design

Whole-model steel design should support:

- progress,
- cancellation,
- partial result retention,
- deterministic member ordering,
- explicit error reporting.

Example:

```text
Steel design
137 / 214 members checked

84 pass
7 fail
3 unsupported
43 remaining

[Cancel]
```

Cancellation must not convert unchecked members into passing or valid results.

---

## 25. Accessibility

Steel design must preserve the accessibility goals of the main application.

Requirements:

- minimum readable control sizes,
- full keyboard operation,
- semantic tables,
- labelled controls,
- accessible status text,
- visible focus states,
- no colour-only status communication,
- expandable calculation trees that work with assistive technology,
- accessible table alternative to viewport-only interactions.

Users should be able to review and operate steel design without using the graphical viewport.

---

## 26. Responsive behaviour

The desktop layout remains the primary engineering workspace.

At narrow widths:

- full modelling may be reduced,
- design-review tables remain usable,
- detailed calculation reading remains available,
- member navigation remains available,
- important PASS/FAIL/UNSUPPORTED/STALE state remains visible.

Responsive acceptance should test realistic workflows, not only whether the modal technically fits on the screen.

---

## 27. Result/report contract

The implementation should reconcile `DesignRun` with the richer design result contract described in `contracts/PROTOCOL.md`.

A production design check should expose fields equivalent to:

```text
checkId
profileId
profileVersion
status
applicability
demand
resistance
utilisation
units
clause
formulaId
intermediateValues
governingActionRef
warnings
childChecks
```

No required field should be dropped merely because the current UI does not display it.

---

## 28. Calculation report

The steel-design section of a calculation report should mirror the product hierarchy.

Suggested structure:

```text
Steel design

1. Design basis
   - profile
   - edition
   - method
   - catalogue version
   - material sources
   - analysis basis
   - combination basis
   - limitations

2. Project summary
   - members checked
   - pass/fail/unsupported/stale totals

3. Exceptions
   - all failing members
   - all unsupported members
   - missing-input members

4. Member detail
   - member
   - section
   - material
   - assumptions
   - governing combination/station
   - check tree
   - clause/formula
   - demand/resistance/utilisation
   - intermediates
   - warnings

5. Reproducibility
   - model hash
   - result IDs
   - build IDs
   - profile version
   - catalogue version
```

Raw intermediate JSON may be available in a technical appendix, but should not be the primary human-readable report format.

---

## 29. Validation strategy

Steel design must be validated in layers.

### 29.1 Unit tests

For each code function:

- published example reproduction,
- boundary conditions,
- invalid input,
- missing properties,
- sign handling,
- unit invariance.

### 29.2 Applicability tests

Verify rejection of:

- unsupported section families,
- torsion,
- non-prismatic members,
- unsupported bracing conditions,
- missing mandatory properties.

### 29.3 Axis tests

Test:

- strong/weak-axis mapping,
- member local-axis rotation,
- section orientation,
- `My`/`Mz` mapping,
- shear-axis mapping.

### 29.4 Demand-provenance tests

Verify that:

- all actions come from one real combination,
- station is preserved,
- discontinuity side is preserved,
- stale results are rejected,
- envelopes are never used as simultaneous demands.

### 29.5 Model-native end-to-end tests

Example journey:

```text
import model
→ assign recognised W section
→ assign steel grade
→ set design assumptions
→ analyse
→ select member
→ run design
→ inspect governing check
→ export report
→ change section
→ observe stale state
→ reanalyse
→ redesign
```

### 29.6 Whole-model tests

Verify:

- batch design,
- filtering,
- member selection synchronisation,
- failing/unsupported counts,
- cancellation,
- report summary.

### 29.7 Section-study tests

Verify:

- candidate ordering,
- full reanalysis,
- self-weight updates,
- deterministic results,
- incomplete-search semantics,
- undoable candidate application.

---

## 30. Acceptance rules

A model-native steel member may be shown as PASS only when:

1. analysis result is current,
2. section catalogue record is valid,
3. design material is valid,
4. design profile is enabled,
5. member lies within profile applicability,
6. required design assumptions are complete,
7. all mandatory checks have run,
8. no mandatory check is unsupported,
9. no mandatory check is indeterminate,
10. all applicable mandatory checks pass.

A design overview must never hide unsupported members through average utilisation or summary colour.

---

## 31. Implementation sequence

> **Repo mapping:** phases below are capability order from the design pack. Exclusive owning slices and deferred markers are in the banner above and ADR 0008 — do **not** implement phases 6 and 8 inside M07-F/G, and do **not** treat this list as permission to ship all ten phases in one milestone.

### Phase 1 — Model-native steel identity → **M07-E**

- add section catalogue abstraction,
- add section design references,
- add design material references,
- show recognised section/material in selected-member UI.

### Phase 2 — Design settings and provenance → **M07-E**

- add member design settings,
- add `DesignValue` provenance,
- implement effective-length inputs,
- introduce initial bracing-segment representation,
- implement readiness state.

### Phase 3 — Exact model-derived demand path → **M07-E**

- replace reference-seed overlay workflow,
- derive demands directly from current results,
- preserve governing action references,
- support critical station extraction.

### Phase 4 — Result-contract cleanup → **M07-F**

- reconcile `DesignRun` and protocol contract,
- add applicability,
- formula IDs,
- profile version,
- warnings,
- governing action reference,
- child checks.

### Phase 5 — Selected-member production UX → **M07-F** (mockups 01–02 only)

- move design into inspector/results workspace,
- add explicit statuses,
- add detailed check tree,
- add viewport governing marker,
- remove example-seed workflow from normal design.

### Phase 6 — Complete validated W-shape check scope → **M07-LTB (deferred)**

- expand flexure/LTB only with verified code evidence,
- complete weak-axis resistance needed by interaction,
- correct shear-axis handling,
- expand boundary validation.

### Phase 7 — Whole-model design → **M07-G** (mockup 03)

- batch design,
- overview table,
- model-tree design states,
- filters,
- utilisation/status overlay.

### Phase 8 — Serviceability → **M07-S (deferred)**

- project/member criteria,
- service-combination evaluation,
- separate serviceability result status.

### Phase 9 — Section studies → **M07-G** (mockups 04–05)

- catalogue search filters,
- deterministic candidate loop,
- full reanalysis where required,
- candidate comparison,
- explicit apply action,
- undo/redo.

### Phase 10 — Stability expansion → **M09**

- validated second-order or other explicitly chosen stability workflow,
- updated code-profile applicability and design basis,
- corresponding UI/report changes.

---

## 32. Recommended first production slice

> **Repo note:** The bullet list below historically blended M07-E and M07-F outcomes. **Ship M07-E first** (catalogue identity, design inputs, readiness, model-native demand, declared first-order basis). Selected-member inspector/drawer UX and calculation report UI are **M07-F**.

The highest-value next vertical slice is:

**Model-native W-section member checking without optimisation.**

It should deliver:

- real catalogue W section assigned to the model,
- real design material assigned to the model,
- current selected-member actions,
- explicit `Ky/Kz` and restrained/unrestrained flexure assumptions,
- one pinned AISC profile,
- direct `evaluateDesign` call without loading a reference seed,
- full provenance,
- PASS/FAIL/UNSUPPORTED/INDETERMINATE/STALE UI,
- detailed calculation report,
- exact stale-state behaviour.

This slice should be accepted before implementing automatic section sizing.

---

## 33. Key risks

### Engineering risk

The largest risk is presenting sophisticated resistance calculations against demands whose stability basis or provenance is incomplete.

Mitigation:

- explicit design basis,
- fail-closed applicability,
- separate stability milestone,
- strong provenance.

### UX risk

The largest UX risk is turning steel design into a dense calculator panel disconnected from the model.

Mitigation:

- selected-member integration,
- viewport linking,
- whole-model overview,
- progressive disclosure.

### Data risk

Catalogue and standard resources may have rights/version constraints.

Mitigation:

- resource manifests,
- pinned versions,
- reproducible imports,
- no silent redistribution.

### Optimisation risk

Naive candidate checking can be invalid when stiffness/self-weight changes demand.

Mitigation:

- reanalysis per candidate when required,
- deterministic bounded search,
- incomplete-search status.

### Scope risk

The product may appear to support more AISC design than the validated profile actually covers.

Mitigation:

- precise capability metadata,
- strong unsupported-state UI,
- profile-scoped reports,
- no generic “AISC compliant” claim.

---

## 34. Product principles summary

The steel-design product should follow these rules:

1. **Model-native, not example-seed-driven.**
2. **One real combination and station per demand.**
3. **No PASS with an unsupported mandatory check.**
4. **Assumptions always show provenance.**
5. **Analysis and design state both become stale when relevant inputs change.**
6. **The viewport and calculation report refer to the same governing result.**
7. **Whole-model review is as important as single-member detail.**
8. **Section studies reanalyse when structural response can change.**
9. **Optimisation proposes; users explicitly apply changes.**
10. **Every code profile is pinned, versioned, tested, and narrow.**
11. **Engineering calculations remain in Rust.**
12. **UI status must communicate engineering meaning, not just colour.**

---

## 35. Definition of success

The proposal is successful when a user can perform this complete workflow:

```text
Open a structural frame
→ assign recognised steel sections and grades
→ define member design assumptions
→ analyse the model
→ see which members are ready for design
→ design all supported steel members
→ identify failures and unsupported members
→ select a failing member from the overview
→ see its governing station and combination in the viewport
→ inspect exact clause calculations
→ compare a permitted alternative section
→ apply that section explicitly
→ observe analysis/design becoming stale
→ reanalyse
→ redesign
→ export a reproducible calculation report
```

At every point the application must make clear:

- what was calculated,
- what was assumed,
- what was derived,
- what was supplied by the user,
- what remains unsupported,
- what result is current,
- what model/design state the result belongs to.

That is the proposed transition from the current M07 steel-check proof into a dependable model-to-analysis-to-design-to-review steel workflow.

---

## 36. Approved UI screen concepts

The steel-design UI must extend the **current Structural Workbench application shell** rather than introduce a separate navigation model.

The approved screen concepts retain these existing regions:

- top application/menu/status bar,
- left **Model Explorer**,
- central WebGPU structural viewport and existing viewport toolbar,
- right **Selection Inspector**,
- bottom **Results** drawer,
- bottom application status bar.

Steel design is integrated into those existing surfaces.

### 36.1 Screen 1 — Selected member steel design

**Reference:** `screens/approved/01-member-design.png`

Purpose:

- configure and review steel design for the currently selected model member,
- retain the member in full structural context,
- show design readiness before calculation,
- expose section/material/catalogue provenance,
- expose effective-length and bracing assumptions,
- show current member design status in the bottom results drawer.

Required behaviour:

- selecting a member in the Model Explorer or viewport updates the Steel Design inspector;
- section and material are model-native, not loaded from a reference example;
- design inputs show provenance such as `User specified`, `Project default`, or `From brace layout`;
- `Run design` is enabled only when the profile is available and required inputs are sufficiently complete;
- running a check writes a persistent design result tied to the current model hash and analysis result;
- the bottom drawer shows the mandatory check matrix and governing utilisation;
- unsupported mandatory checks override any partial low utilisation and prevent overall PASS.

### 36.2 Screen 2 — Calculation details

**Reference:** `screens/approved/02-calculation-details.png`

Purpose:

- provide a traceable engineering calculation view without losing model context,
- connect code clauses directly to the selected member and governing location,
- show assumptions, actions, resistances, equations, and warnings.

Required behaviour:

- the selected member remains highlighted in the central viewport;
- the right Selection Inspector remains available for member/design inputs;
- the bottom Results drawer expands into the detailed calculation workspace;
- the mandatory-check tree is shown at left within the drawer;
- selecting a check shows:
  - applicability,
  - clause,
  - formula identifier,
  - simultaneous demand components,
  - resistance components,
  - utilisation,
  - assumptions,
  - warnings,
  - intermediate values;
- the governing action must reference one real model result, member, case/combination, station, and side where applicable;
- clause detail must never be reconstructed independently in JavaScript.

### 36.3 Screen 3 — Whole-model steel design overview

**Reference:** `screens/approved/03-overview.png`

Purpose:

- review the design state of the whole structural model,
- locate failing, unsupported, stale, and unchecked members quickly,
- preserve direct navigation from design status to the structural model.

Required behaviour:

- the viewport remains central and may display a design-status overlay;
- the right Selection Inspector continues to show only the selected member;
- the bottom Results drawer becomes the whole-model review table;
- required filters include:
  - All,
  - Failing,
  - Unsupported,
  - Stale,
  - Not checked,
  - utilisation threshold;
- selecting a row selects/highlights the same member in the model;
- the model tree may expose design-status counts under `Design > Steel`;
- FAIL, UNSUPPORTED, STALE, and NOT CHECKED must remain visually and semantically distinct;
- unsupported members must never be rendered as low-utilisation passing members.

### 36.4 Screen 4 — Section catalogue browser

**Reference:** `screens/approved/04-section-catalogue.png`

Purpose:

- choose a recognised catalogue section while preserving model context,
- expose catalogue version and active-profile support before assignment.

Required behaviour:

- the model and selected member remain visible;
- the right inspector continues to show the selected member's design configuration;
- the bottom drawer hosts the searchable catalogue browser;
- catalogue filters may include:
  - designation search,
  - section family,
  - depth,
  - mass,
  - active-profile support;
- unsupported section families are identified before assignment;
- the selected catalogue record shows source/version/provenance;
- assigning a section is a normal model edit with undo/redo support;
- assignment immediately marks analysis/design stale when the section change affects analysis properties.

### 36.5 Screen 5 — Section study / candidate comparison

**Reference:** `screens/approved/05-section-study.png`

Purpose:

- compare permitted catalogue alternatives for the selected member,
- make optimisation transparent and explicitly user-controlled.

Required behaviour:

- the selected member remains visible in the viewport;
- the right inspector keeps current design assumptions visible;
- the bottom drawer contains:
  - study objective,
  - candidate filters,
  - candidate results,
  - current-versus-proposed comparison;
- each candidate records whether structural reanalysis was performed;
- candidate evaluation must rerun analysis when stiffness and/or self-weight changes can redistribute actions;
- the application must never silently apply the proposed section;
- `Apply <section>` is an explicit model edit;
- after applying a candidate:
  - current analysis becomes stale,
  - current design becomes stale,
  - prior results remain inspectable but clearly marked historical/stale;
- truncated candidate searches must be reported as incomplete, not optimal.

### 36.6 Shared layout rules

All five approved concepts follow these layout constraints:

1. **Do not replace the current shell.**
   Steel design extends the existing explorer/viewport/inspector/results architecture.

2. **Keep model context visible.**
   Member design should not normally move into a detached full-screen calculator or modal.

3. **Use the right inspector for configuration.**
   Section, material, design profile, bracing, effective length, and provenance belong beside the selected member.

4. **Use the bottom results drawer for engineering output.**
   Member checks, detailed calculations, whole-model review, catalogue tables, and section-study results belong in the existing results workspace.

5. **Synchronise all selections.**
   Model Explorer, viewport, Selection Inspector, and Results drawer must refer to the same stable member ID.

6. **Preserve stale-state visibility.**
   A model edit never leaves an old PASS looking current.

7. **Progressive disclosure.**
   Common inputs/results stay visible; clause equations and intermediate calculations expand on demand.

8. **Keyboard/table workflow remains complete.**
   Every design action must have a non-viewport interaction path.

9. **Colour is supplemental.**
   PASS, FAIL, UNSUPPORTED, STALE, and NOT CHECKED always include textual status and accessible semantics.

10. **Do not expose implementation fixtures in production UX.**
    Published AISC example seeds remain verification assets, not part of the normal member-design workflow.

### 36.7 Interaction-state model

A selected member's steel-design UI should move through the following explicit states:

```text
NOT CONFIGURED
    ↓
DESIGN INPUTS INCOMPLETE
    ↓
READY FOR ANALYSIS / ANALYSIS STALE
    ↓
ANALYSIS CURRENT
    ↓
READY FOR DESIGN
    ↓
DESIGN RUNNING
    ↓
PASS / FAIL / UNSUPPORTED / INDETERMINATE
    ↓
MODEL OR DESIGN INPUT CHANGES
    ↓
STALE
```

The UI must never skip directly from stale or incomplete input to a current PASS display.

### 36.8 Design-result navigation

From any governing result, the user must be able to navigate directly to:

- selected member,
- governing case/combination,
- governing station,
- relevant result diagram,
- code check,
- clause/formula,
- assumption set,
- report entry.

This navigation should work in both directions:

```text
model member → design result
design result → governing model location
```

### 36.9 Approved visual direction

The corrected screen concepts establish the intended visual direction:

- retain the current light CAD workspace,
- retain the dark navy application bar,
- preserve current panel proportions and hierarchy,
- use engineering blue for selection/actions,
- use green only for verified/current passing states,
- use amber for unsupported/warning states,
- use red for failure,
- use neutral gray for stale/not checked,
- keep dense engineering information table-oriented rather than card-heavy.

The mockups are interaction/layout references rather than pixel-perfect acceptance artifacts. Final acceptance remains based on contracts, accessibility, behaviour, and engineering correctness.

