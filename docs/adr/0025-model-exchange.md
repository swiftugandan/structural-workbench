# ADR 0025 — Model exchange with IFC4 and DXF (M21, exchange-v1)

## Status

Accepted (2026-09-30). Contract: `docs/formulations/exchange.md`.

## Context

M21 asks for import of an explicitly supported IFC/DXF model, conversion
choices made through deterministic forms, an explicit mapping manifest for
batch use, analysis of the result, and export of a loss-accounted file.
Acceptance needs semantic round trips, units and orientation fixtures, a
ledger of missing objects, and a reference corpus. A native Revit round trip
needs a separately scoped adapter, and browser-only file exchange is not equivalent
to a commercial BIM-exchange tool.

R-EXCHANGE-CORPUS asked for exact schemas, lawful reference files and the
expected mappings and losses. The IFC4 ADD2 TC1 EXPRESS schema and property
set definitions are published by buildingSMART for use in software
development with attribution. IfcOpenShell (LGPL-3.0) and ezdxf (MIT) are
independent readers and writers. Used only as oracle tools, they make the
corpus lawful and project-generated, the same way OpenSees serves the solver.

## Decision

1. **Two formats, one analysis model.**
   - IFC4 (ISO 16739-1:2018) `IfcStructuralAnalysisModel` is read and
     written.
   - IFC2X3 and IFC4X3 are refused by name. Their structural-analysis
     entities differ (IFC2X3 profile properties, no curve-member `Axis`),
     and a guessed mapping would be silently wrong.
   - An ASCII DXF wireframe is read from LINE, LWPOLYLINE and POLYLINE (DXF
     arbitrary-axis OCS applied), and written as R12 LINEs.
   - Physical elements (IfcBeam and so on), surface members, curved or
     varying members and eccentric connections are never converted into
     frame members. Each is refused or skipped with an explicit decision,
     and is listed in the ledger.
2. **Read, then commit: pure functions of the file.**
   - `read` states what the file holds, the units it defines, the ledger of
     what cannot be represented, content that blocks the import, and every
     decision the import needs.
   - `commit` takes the same file plus a mapping and returns a validated
     project and its conversion record.
   - The browser's conversion review and the CLI's mapping manifest are the
     same JSON document (`workbench-exchange-mapping-v1`). It is bound to
     the file's SHA-256, answers exactly the stated decisions, and has no
     defaults. The UI preselects nothing; batch refuses unanswered
     decisions.
3. **Nothing undefined is assumed.** Each of these is a decision:
   - a unit the file leaves unassigned, where SI and derivation from its
     base units differ (IFC4 defines no default);
   - elastic supports and connections;
   - unset condition values;
   - combination purposes the workbench does not know;
   - skipping unrepresentable loads or surfaces;
   - DXF layer properties, merge tolerance and supports.

   Only IFC's own rules apply without asking:
   - an absent support condition means no support;
   - an absent member-end condition coordinate system means member axes;
   - an unset load-group coefficient is 1.
4. **Orientation follows IFC4 exactly.**
   - Member local x runs from the start to the end vertex. Local z lies in
     the plane of x and `Axis`, directed like `Axis`, and y = z × x. This is
     the workbench frame's convention (z = x × y).
   - Profile axes xp, yp align with local y, z. The section analysis axes
     are ys = −xp and zs = −yp (profile-resource convention), so
     `MomentOfInertiaY/Z` and `TorsionalConstantX` map to Iy, Iz and J.
   - Placements compose to world coordinates; global loads and self-weight
     vectors are rotated with them.
5. **Identity is carried, not invented.**
   - An imported object's GUID becomes its entity ID (`g` + GUID, `$`
     written as `-`), and is written back on export.
   - Workbench objects get GUIDs derived from SHA-256 of the project and
     entity IDs, so exports are reproducible.
   - `Workbench_Identity`, `Workbench_Project` and `Workbench_Section`
     property sets carry entity IDs, labels, the authored localY, member
     provenance, the self-weight load's identity, extreme-fibre distances
     and runtime budgets. The workbench's own exports therefore re-import
     losslessly.
   - Other tools see standard IFC; the workbench sets never override
     standard data. For example, the authored localY is used only while it
     still defines the frame `Axis` gives.
6. **The ledger is part of the result.**
   - Imports list what was not imported, converted or skipped, with counts
     and examples.
   - Exports list what the file cannot carry:
     - settlements, which apply unfactored in every case here but are
       factored load-case actions in IFC;
     - design data, mass sources and response spectra;
     - analysis results;
     - self weight on only some members;
     - for DXF, everything except geometry.
7. **Canonical self weight.** A self-weight load's member list is a set.
   `Project::canonicalise` now sorts it, so order never changes the model
   hash; an import therefore reproduces the hash of the exported model.

## Consequences

- **Round trips:**
  - Every fixture model, X-FRAME and UKR01 round-trip through IFC to the
    same analysis model (reals within 1e-12). The re-exported file is
    byte-identical.
  - Foreign GUIDs survive a round trip.
- **Independent checks:**
  - IfcOpenShell validates the workbench's IFC exports (schema and EXPRESS
    rules) and reads them back in SI.
  - ezdxf audits the DXF exports.
  - Both are hash-bound, so any change to a writer re-runs the oracle.
- **Corpus:** IfcOpenShell-authored IFC files (mm/kN with derived units and
  a rotated placement; feet/kips with undefined derived units; blocking and
  planar cases) and ezdxf-authored DXF files (mirrored and arbitrary OCS)
  import to the oracle's SI models within 1e-9.
- **Limitations:**
  - No Revit, Tekla, ETABS or other native adapter; `Revit plugins` stay
    excluded.
  - DXF export is R12 with `$INSUNITS`, which strict R12 readers may
    ignore.
  - A member-end release at a support that leaves the rotation free gives
    that rotation no stiffness. The solver refuses such a model (unused-DOF
    exclusion is not implemented), whether it was imported or drawn.
