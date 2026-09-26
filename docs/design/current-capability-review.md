# Review implementation checkpoint — 2026-09-26

| Area | Current implementation/evidence | Limit |
|---|---|---|
| Selection identity | Physical object, analytical binding and concrete draft selection agree; unrelated selection clears old draft; cached builds update with matching assets | Concrete draft geometry is independent of analysis stiffness |
| Explorer and visibility | Authored storeys/layers, isolate/hide/show/fit, side view, grouped annotation controls; Rust excludes hidden entities before picking/snapping | View scopes are transient; they do not filter the analysis model |
| Residential stairs | Both return flights and landings can be inspected by saved storey/layer in plan, side and 3D; fit includes physical display bounds | No extra stringer was invented. Finished levels, beam/slab offsets, junctions, headroom and guarding remain unverified |
| Steel review | All members retained, exact Rust runs for ready members, missing/unsupported rows retained, selected-case filtering and row navigation | Existing bounded AISC S2; no whole-building PASS |
| Catalogue/study | Five source-locked records, search/assignment, full candidate reanalysis, finite selected-member mass comparison, explicit Apply/Undo | No full catalogue or global optimality; serviceability/LTB/second-order checks remain unsupported |
| Status colours | Recorded model review states, stale propagation, physical surface tint and analytical strokes with a text legend | Independent candidate study results never colour the live model as checked |
| British concrete | User confirmed Eurocodes with UK NAs; JRC example document acquired and hashed; exact standards request recorded | Authoritative edition-specific standards/UK NAs and reconciled independent examples must precede profile enablement |

## Remaining acceptance work

- Resolve physical geometry datums and stair junction/headroom/detailing independently of the analytical line model. Current illustrations are not construction details.
- Complete the British concrete profile resource dossiers and numerical/code checks. Existing beam, slab and footing previews remain explicitly limited; no mocked PASS is enabled.
- Broader full-product, cross-platform and code-profile acceptance is separate from the local task journeys recorded here.

Use `docs/design/review-execution.md` for the slice ledger and each evidence gate for the actual build and test scope. This checkpoint does not grant new numerical or code compliance beyond those gates.
