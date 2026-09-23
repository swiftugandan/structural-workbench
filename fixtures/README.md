# Fixture interpretation

`fixtures/design/aisc-360-22-lrfd/` holds M07 S2 steel-design seeds reconstituted from locked AISC Design Examples (numeric I/O only; see `docs/code-profiles/aisc-360-22-lrfd/dossier-S2.md`). They are not proof that clause code exists yet.

benchmarks.json contains twelve independently derived analytical acceptance seeds. Eleven reference complete project JSON files under models. B12 is a pure section-stress function case; its signed point probes use y=0,z=+cz and y=+cy,z=0 in addition to the four-corner extrema. These files are inputs and expected outputs; they are not evidence that a solver has passed.

Every engineering value is SI. selectors are adapter assertions: node.n2.uz means the global displacement uz of node n2; reaction.s1.my means global reaction moment about Y at support s1; member.m1.station0_5 means station x/L=0.5 on the physical member; station1 is its end. A trailing .abs requests magnitude because opposite diagram sign conventions must first be normalised to the stated cut convention. All displacement selectors retain their signed global direction. Other force/moment selectors are signed. No selector uses screen coordinates.

The included checker independently recomputes formulas with a restricted arithmetic AST and validates the JSON project contracts. Implementation agents must connect selectors to actual kernel output and compare using VALIDATION.md. They must also create the additional independent oracle/release/continuous-beam cases called for there. Seed coverage is intentionally distinguishable from the full release corpus.

Fixtures use fixed supports or explicit planar kinematics. B09 has no free DOFs: the kernel still recovers reactions from prescribed displacement. B08 tests load-dependent internal displacement recovery. B05 has two elements split at the central point load. B07 has one uniformly loaded member, so the recovered midspan deflection must include the load solution rather than simply interpolate endpoint translations. S01 is a strongly skewed spatial portal with out-of-plane eaves and combined nodal/UDL loading. S02 is an asymmetric 3D portal with unequal column heights and strongly asymmetric section inertias. Both are OpenSees-compared in `evidence/M03/oracle-pack`.

LEGACY09-B02.json is a schema 0.9.0 cantilever (units instead of displayUnits; My/Mz releases omitted). Import must migrate it to 1.0.0, retain the original bytes, and match the B02 engineering hash. Unknown future majors remain UNSUPPORTED_SCHEMA.

negative-cases.json contains specified mutations and exact expected error classes. They are test definitions, not executable patches. Build each from the unmodified baseline. Schema and semantic validation must both leave the current model untouched after an invalid import. Parse-phase cases N01–N05 and N07–N21 exercise load/release/combination rejects added for M02; N06 (unstable) and N22 (envelope arity) run at analyse/envelope time.
