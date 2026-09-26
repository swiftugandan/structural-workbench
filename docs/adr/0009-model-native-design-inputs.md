# ADR 0009 — Model-native design inputs and explicit workflow previews

Status: implementing, 2026-09-26. User-authorized continuation of the steel design proposals.

## Steel binding

`Member.steelDesign` is an additive optional schema-1.0 field. Older projects remain unchanged. It contains versioned section/material references, profile identity, stability basis, whole-member bracing, and nullable Ky/Kz/Lb/Cb values with source labels. Missing values remain missing; assignment does not infer continuous bracing or effective lengths.

`AssignSteelCatalogue` creates dedicated section/material definitions and updates one member atomically. `SetSteelDesign` changes only design inputs. Both participate in history, persistence, and the engineering hash. Names/display units remain presentation metadata. Explicit topology splitting requires renewed bracing/stability confirmation.

The first catalogue is five W rows from AISC Shapes Database v16.0, US customary columns. The source workbook SHA-256 is recorded in the committed subset. Conversion and axis mapping happen in Rust: AISC Ix → local Iz, Iy → local Iy, depth → local cy; major bending Mz pairs with Vy. Elastic modulus is 29,000 ksi; nu=0.3 and density=7850 kg/m³ are declared elastic-analysis defaults. Material design strengths follow the existing A992 S2 resource dossier. This is a bounded catalogue subset, not the whole AISC database.

Readiness verifies the current elastic properties still match the binding. The identity comparison permits four f64 epsilons relative solely for JSON round-trip representation. It does not round engineering inputs or modify numerical acceptance tolerances.

## Direct design

`evaluateModelDesign` accepts identifiers and a captured model hash, never caller-supplied forces or capacities. A disposable worker imports the captured project, re-solves the selected real case/combination in Rust, checks result identity, and evaluates recovered samples plus all key stations and one-sided discontinuities. Cancellation terminates the disposable worker. The durable model worker remains responsive.

Each check retains the actual six-component action vector, station/side, case/combination, clause and intermediate quantities. Summary rows select the governing actual check per check ID. Overall precedence is FAIL > UNSUPPORTED > INDETERMINATE > PASS. A model with no nonzero design actions is INDETERMINATE. Result identity includes model, revision, solver build, profile version, settings, catalogue source, and immutable full station records. Presentation marks the record STALE when its model/result no longer matches, including unapplied edits. Stale design is excluded from current analysis reports.

## Applicability of the model-native bridge

This path adds conservative applicability gates around the accepted S2 kernel without expanding its resistance formulas:

- Tension requires connection/net-area inputs not yet exposed: UNSUPPORTED.
- Weak-axis bending/shear and torsion: UNSUPPORTED.
- Compact flexure requires Table B4.1b cases 10 and 15, respectively bf/(2tf) ≤ 0.38√(E/Fy), h/tw ≤ 3.76√(E/Fy). Noncompact/slender results do not receive an F2 resistance.
- G2.1(a) shear requires h/tw ≤ 2.24√(E/Fy). Other shear paths remain UNSUPPORTED.
- Lb > 0 and H1 missing companion capacities remain UNSUPPORTED.

Source read locally: locked AISC 360-22 PDF, PDF pages 90–91 (printed 16.1-22–23), 123 (16.1-55, W14X99 noncompact example), and 144 (16.1-76). No standard prose is redistributed. These predicates constrain existing S2 formulas; they do not imply whole-building stability, serviceability, connection or full-code acceptance.

## Concrete previews

The current user request explicitly authorizes RC beam/slab/foundation UI and data scaffolding with clearly marked synthetic upstream data. This permits independent workflow previews before the engineering-parent gates in ADR 0008. It does not accept M08/M10/M11 or their production SHELL milestones. Preview records must be marked mock, remain UNSUPPORTED or INDETERMINATE, and carry no compliance verdict or invented reinforcement capacity. Production code profiles remain gated on locked resources and numerical validation.
