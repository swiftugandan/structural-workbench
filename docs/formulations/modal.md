# Modal (free vibration) frame analysis, dynamics-v1 (M14)

Extends mechanics-v1 (`frame.md`) and reuses the stability-v1 mesh and
eigen-solver (`stability.md`). Same domain: straight prismatic isotropic
Euler–Bernoulli members, principal axes, Saint Venant torsion, SI f64, global Z
up, element DOFs ux uy uz rx ry rz at i then j.

One analysis type is added, `modal`. It answers: *what are the undamped natural
frequencies and mode shapes of the elastic structure with the declared mass,
and how much of that mass does each mode engage in each global direction?* It
takes no load case: mass comes only from the project's declared mass sources.
Response spectra, time history and harmonic response are M15.

## Scope and exclusions

- Small-displacement undamped free vibration about the undeformed, unstressed
  geometry. No geometric stiffness (a modal analysis about a loaded P-Δ state
  is not provided), no damping, no soil–structure interaction.
- Euler–Bernoulli members: rotary inertia of the cross-section in bending and
  shear deformation are neglected. Torsional (polar) mass is included in the
  consistent matrix.
- Member end moment releases are rejected (`MODAL_RELEASES_UNSUPPORTED`), as in
  stability-v1: static condensation of K − ω²M makes the eigenproblem
  frequency-dependent. Released rotations as independent hinge DOFs are a later
  slice shared with stability.
- Supports and planar-mode constraints are partitioned exactly as in
  mechanics-v1. Prescribed support displacements are irrelevant to free
  vibration and ignored. No stabilising springs.
- **Rigid modes.** K must be positive definite on the free DOFs. A model with a
  mechanism or rigid-body freedom is refused with `UNSTABLE_MODEL`; zero
  frequencies are never computed or reported. (A free-floating structure is not
  a frame model in this application.)
- Participation is reported for global translations X, Y and Z. Rotational
  participation (for example torsion about Z) is not reported.

## Mass sources

Mass is declared explicitly in the project (schema 1.4.0, `massSources`). There
is no implied self mass. Each source has an id and one kind:

| kind | fields | contributes |
| --- | --- | --- |
| `selfMass` | `factor` > 0 | ρ·A per unit length of every member, × factor |
| `loadCase` | `case`, `factor` > 0 | loads of that case converted to mass (below), × factor |
| `nodalMass` | `node`, `mass` > 0 (kg) | a translational point mass at the node |

Load-case conversion. With ĝ the unit gravity vector and g = |gravity|, each
load's force is resolved in global axes (local loads through the member's
axes) and only its component along ĝ becomes mass:

- nodal load F → point mass (F·ĝ)/g at the node;
- uniform member load w (N/m) → line mass (w·ĝ)/g kg/m on the member;
- point load P at a station → point mass (P·ĝ)/g at that station (the mesh has
  a node there, M02-P expansion);
- self-weight load with factor f → self mass f·ρA on its listed members.

Moments and force components perpendicular to gravity carry no mass; their
presence is reported (`NON_GRAVITY_COMPONENTS_IGNORED`). A component opposing
gravity would be negative mass and is refused (`NEGATIVE_MASS`). Mass is
isotropic: every point and line mass acts in X, Y and Z.

Deduplication. Self mass is counted once:

- at most one `selfMass` source;
- when a `selfMass` source exists, self-weight loads inside `loadCase` sources
  are skipped and each skip is reported (`SELF_MASS_DEDUPLICATED`);
- a load case appears in at most one `loadCase` source;
- two `nodalMass` sources on one node are refused (declare one total).

Duplicates are `INVALID_MASS_SOURCE`; a reference to a missing case or node is
`DANGLING_REFERENCE`. A model whose sources produce no mass is `NO_MASS`.

The result records the mass of every source in kg (after deduplication) and
their total.

## Element mass matrices

`massMatrix` selects the element formulation; the default is `consistent`.

Consistent (interpolation of the stiffness element, μ = ρA + line mass,
μ_p = ρ(Iy + Iz), the polar mass moment per length):

- axial [u_i, u_j]: μL/6 · [[2, 1], [1, 2]];
- torsion [rx_i, rx_j]: μ_p L/6 · [[2, 1], [1, 2]] (self mass only; added
  line mass has no stated polar inertia and contributes none);
- local-y bending [v_i, rz_i, v_j, rz_j]:

      μL/420 · [[ 156,   22L,   54,  -13L ],
                [ 22L,   4L²,  13L,  -3L² ],
                [  54,   13L,  156,  -22L ],
                [-13L,  -3L², -22L,   4L² ]]

- local-z bending [w_i, ry_i, w_j, ry_j]: the same with the
  translation–rotation coupling terms negated (w′ = −ry, as for stiffness).

Lumped: μL/2 on each end translation, no rotational or torsional mass.

Point masses are added to the three translational DOFs of their node. Element
mass matrices are rotated to global axes by the same `transform` as the
stiffness and assembled on the free DOFs.

Every analytical member is split into `subdivisions` equal elements (1–32,
default 8), after M02-P point-load expansion. Consistent-mass frequencies
converge from above with refinement (Rayleigh–Ritz); lumped-mass frequencies
are not bounded in general and are compared on the same mesh only.

## Eigenproblem

K φ = ω² M φ on the free DOFs, K positive definite, M positive semidefinite
(lumped mass leaves rotations massless). It is solved as
(K + λ(−M)) φ = 0 with the stability-v1 block subspace iteration
(`workbench_solver::eigen`), so λ = ω². Massless directions have μ = 1/λ = 0
and are never reported. A Sturm count of K − σM just below the highest
reported ω² proves that no mode below it was missed; a mismatch withholds the
result (`STURM_MISMATCH`).

Modes are M-normalised (φᵀMφ = 1). For display and sign, each shape is also
scaled so that its largest translation over the mesh is +1; the participation
factor takes the sign of that displayed shape, so results are deterministic.
Repeated frequencies have no unique basis: comparisons use frequencies, sums of
effective mass and MAC over the repeated subspace, never individual vectors.

Controls: `modes` requested (1–50, default 12), `massMatrix`, `subdivisions`,
and `participationTarget` (0 < t ≤ 1, default 0.9).

## Participation and mass accounting

For a direction d ∈ {X, Y, Z}, the influence vector r_d has 1 at every free
translational DOF along d and 0 elsewhere (a rigid unit translation of the
free DOFs). With M-normalised φ_n:

- participation factor Γ_n,d = φ_nᵀ M r_d;
- effective modal mass M*_n,d = Γ_n,d²;
- participating mass M_d = r_dᵀ M r_d (mass on free DOFs along d);
- ratio M*_n,d / M_d and its cumulative sum over the reported modes.

Over all modes Σ M*_n,d = M_d exactly. The remainder 1 − Σ over the reported
modes is the mass in omitted (higher) modes and is reported per direction.
Mass on restrained DOFs does not participate: the total isotropic mass minus
M_d is reported as mass at supports. A direction with M_d = 0 (for example Y in
planar XZ mode) is reported as not applicable.

The target is achieved in direction d when the cumulative ratio reaches
`participationTarget`; otherwise the result carries
`PARTICIPATION_TARGET_NOT_MET` with the reported count and the omitted ratio.
More modes are never extracted silently.

## Numerical checks recorded

- iterations, block size, Sturm shift and negative-pivot count;
- per-mode residual ‖Kφ − ω²Mφ‖∞ / ‖Kφ‖∞ ≤ 1e-8;
- orthogonality max|ΦᵀMΦ − I| and max|ΦᵀKΦ − Ω²| / ω²_max, both ≤ 1e-8;
- total mass by source, participating mass, mass at supports.

## Validation (dynamics-v1 oracle)

`fixtures/dynamics/modal-oracle.json`, generated by
`tools/oracles/modal_oracle.py` from closed-form solutions, cross-checked with
OpenSeesPy 3.4.0 for the frame case.

| ID | Case | Reference | Gate |
| --- | --- | --- | --- |
| D-SDOF | Massless cantilever with a tip point mass | ω = √(3EI/(mL³)) per plane, √(EA/(mL)) axial | 1e-9 relative, consistent and lumped |
| D-CANT | Cantilever, distributed mass | ω_n = (β_nL)²√(EI/(μL⁴)), β_nL = 1.8751, 4.6941, 7.8548 | 16 elements: ≤ 1e-4 (modes 1–3); consistent refinement 2→4→8→16 decreases from above |
| D-SS | Simply supported beam | ω_n = (nπ)²√(EI/(μL⁴)) | 16 elements: ≤ 1e-4 (modes 1–3) |
| D-AXIAL | Fixed–free bar, axial | ω_n = (2n−1)π/(2L)·√(E/ρ) | 16 elements: ≤ 1e-3 (modes 1–2) |
| D-TORSION | Fixed–free shaft, torsion | ω_n = (2n−1)π/(2L)·√(GJ/(ρ(Iy+Iz))) | 16 elements: ≤ 1e-3 (mode 1) |
| D-SCALE | Every mass × 4 | every ω halves | 1e-12 relative |
| D-SHEAR2 | Two-storey shear frame: rigid beams, massless fixed–fixed columns, storey masses | 2-DOF closed form | ≤ 1e-5 (finite beam stiffness) |
| D-FRAME-OS | Two-storey spatial frame, lumped mass | OpenSees `eigen` (-lMass) | ≤ 1e-6 relative, 6 modes |
| D-EFFMASS | All modes of a small frame | Σ M* = M_d per direction | 1e-10 relative |
| D-ORTH | Any result | ΦᵀMΦ = I, ΦᵀKΦ = Ω² | 1e-8 |
