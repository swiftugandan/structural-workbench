# UKR01 — four-storey concrete residential reference

**Latest: v2 return-stair landing correction.** See `stair-landing-audit.md` and `evidence/stair-landings/`. Earlier v1 evidence below is historical and does not validate the revised model.

## Open and inspect

Worked examples → **UK residential · four storeys**. The existing Explorer, viewport, Inspector and Results drawer remain the workflow. **Solid model** switches between assigned physical envelopes and analytical lines; **Assumptions** exposes the model's durable basis. Floors, beams, columns, slab panels, stair flights, landings and foundation drafts are saved entities, not an image. Expand a physical panel/beam to see its actual analytical discretisation. Pad envelopes follow their bound support nodes, including in focused design views.

This is a **preliminary reference analysis**, not a completed British concrete design. User specified “British”; the intended basis is UK Eurocodes (BS EN 1990/1991/1992/1997 and applicable UK National Annexes). Exact editions, site, project use categories and a validated concrete profile remain unconfirmed. Public [Concrete Centre structural-design guidance](https://www.concretecentre.com/Structural-design.aspx) identifies the relevant code families; it is not a acquired/pinned resistance-validation resource. No compliance claim follows from this reference.

## Geometry and assumptions

- Plan: 12 × 12 m; three 4 m bays by two 6 m bays. Twelve columns.
- Four occupied storeys: ground 0 m, upper floors 3/6/9 m; flat roof 12 m. Fixed foundation reaction planes at -1 m.
- Trial columns 400 × 400 mm; beams 300 × 600 mm; one-way slabs 200 mm.
- Ground slab is **suspended** in this reference, not a ground-bearing slab or Winkler plate.
- Suspended levels each have a 4 × 3.9 m opening in the first bay. Four returning flight pairs climb to the roof, with 4 × 1.5 m floor landings and 4 × 1.5 m intermediate turning landings. Each flight is 1.2 m wide, 2.4 m horizontal run and 1.5 m rise, nine illustrative risers. Intermediate landings have their own concrete beams terminating at column nodes. No stair accessibility, fire, guard, headroom or approved-document compliance is claimed.
- Twelve trial 2.4 × 2.4 × 0.6 m pads; their tops coincide with support planes. Fixed restraints do **not** model footing rotation, soil/contact or settlement.
- Concrete E 30 GPa, ν 0.2, density 2500 kg/m³; provisional strengths 30 MPa and 500 MPa in foundation drafts only.
- “Firm ground” is user intent. 200 kPa allowable bearing, 18 kN/m³ soil and 1.6 m embedment are synthetic starter assumptions, not site data.

## Analytical formulation and load path

The established Rust 3D Euler–Bernoulli formulation, six DOFs per node, SI/f64, linear small-displacement, isotropic gross uncracked sections. Rust computes section properties and all reference coordinates, loads, analysis and demand summaries. Nodes at shared endpoints are one persisted identity. Intermediate beam discretisation is grouped under physical beams; adjacent one-metre strips are grouped into physical slab panels.

Slab strips span 6 m to actual subdivided frame beams. They have axial/torsional/frame flexural stiffness; **no two-way plate action, transverse slab compatibility, rigid diaphragm or plate result is asserted**. These are a preliminary one-way frame/grillage idealisation. Monolithic joints are rigid; no release shortcut/artificial stiffness is used. Gross member and slab volumes include intersecting joint/slab-beam regions in the gravity take-off, a disclosed conservative centreline allowance; this is not a net concrete quantity schedule. Refined offsets, cracked stiffness and mesh studies remain necessary for real design.

Global Z is vertical. Gravity is -9.80665 m/s². Rectangles use width along local y and depth along local z. The generator assigns a horizontal transverse local-y hint, including inclined stairs. Each flight carries waist-slab self weight along its actual inclined length. Step wedges contribute density × g × half-riser × width × horizontal run; finishes/imposed load use horizontal projected area, converted to load per actual length in Rust. Landing/floor holes are omitted from area loading. Ground is a full suspended floor; four elevated panels each lose 15.6 m². Total horizontal floor/roof slab area including floor landings is 657.6 m². Five 6 m² floor landings carry 3 kPa imposed load, replacing (not adding to) the floor/roof imposed load on their area; four intermediate 6 m² landings carry 3 kPa imposed and 1 kPa finishes.

Provisional actions:

| Case | Definition |
|---|---|
| G | Gross self weight + 2 kPa slab finishes/partition allowance + 1 kPa stair/landing finishes + step wedges |
| Q | 2 kPa occupied floor, 3 kPa stairs/landings, 0.75 kPa roof |
| WX/WY | 0.5 kPa × 12 m facade × 3 m storey, four levels; equal column distribution, sensitivity only |
| SLS | G + Q |
| ULS | 1.35G + 1.5Q |
| LX/LY | G + Q + nominal lateral case |

Loads and combinations are demonstration assumptions, **not** a complete EN 1990/1991/UK NA implementation. Pattern loading, concentrated imposed loads, actual partition/cladding layout, snow, site wind, adverse/favourable permanent action, accidental/robustness, seismic applicability, imperfections and second-order checks remain to be established.

## Analysis versus design

`workbench-cli reference-residential` emits the reproducible project. `workbench-cli residential-review <project.json>` runs every actual case/combination and emits an SI demand review. Each physical member's scalar governing demand retains analytical member ID, station, one-sided value when relevant and the actual simultaneous six-component vector. Independent extrema are never assembled into a fictitious design vector. Reactions retain exact support/case/result/model/settings/build provenance.

Concrete flexure/shear/torsion, column biaxial/slenderness, punching, cracking, long-term deflection, anchorage/fire/robustness and footing resistance remain **UNSUPPORTED**. Contact remains **INDETERMINATE**. No reinforcement schedule or PASS is manufactured. The existing foundation Inspector can run a workflow review from a current real model reaction; changing inputs makes its stored review STALE. Trial foundation sizes are not sized by a soil solver.

R-CODE-CONCRETE is still not acquired in `resources.required.json`; site ground data and validated examples are also missing. These block construction design, not the implemented elastic analysis. Acquire the agreed British code package and benchmarks, then validate resistance families and complete missing load/stability/soil checks before calling this structure designed.

## Validation

Native reference regression independently calculates permanent/imposed quantities, checks six load cases and combinations against support reaction sums, checks force/moment equilibrium and verifies inverse-E displacement scaling. Save/reopen hash invariance is tested with exact f64 JSON round-tripping enabled; this fixes a real provenance drift exposed by inclined-flight values.

Final run evidence, numerical comparisons, visible browser images and build hashes are recorded in `evidence/residential-reference/`. Tests prove the stated strip/frame model, not plate behaviour, soil response or code compliance. See the gate record for final outcomes.

### Historical v1 verified local outcome (superseded for geometry)

Final build `d877aa70d28c66d5c96d19c4d8b6bde8da895b11f7dbdcfe33948303a049a3af`, source `266da972257e255742a3edecae2b0ced3a3dcba3005d0da6cca787200d2ea1f1`: 85 native tests; 3 contract tests; 33 native and 33 native/WASM analytical regression checks; eight browser journeys; 102,048 reference comparisons across eight cases (native/WASM/OpenSees). Visible Chrome/macOS AMD WebGPU confirmed the actual solid building, stairs, hierarchy and real-reaction footing workflow. The reference contains 423 nodes, 628 analytical members and 207 physical objects. This is local correctness evidence, not Windows/Linux hardware acceptance or British design compliance.

The SLS maximum **nodal translation magnitude** is 2.367 mm at n372. This does not bound interior slab/beam displacement and is not a serviceability PASS. The demand report labels that limitation explicitly. All foundation and concrete resistance states remain fail-closed.
