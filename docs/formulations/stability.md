# Elastic stability and second-order frame analysis, stability-v1 (M09)

Extends mechanics-v1 (`frame.md`). Same domain: straight prismatic isotropic
Euler–Bernoulli members, principal axes, Saint Venant torsion, SI f64, global
Z up, element DOFs ux uy uz rx ry rz at i then j.

Two analysis types are added. They are separate from `linearStatic` and from
each other, and never superpose results.

| analysisType | Question answered | Result |
| --- | --- | --- |
| `elasticBuckling` | By what factor λ must one reference case/combination be scaled for the elastic structure to lose stiffness? | Critical factors λ₁ ≤ λ₂ ≤ …, normalised mode shapes |
| `secondOrder` | What is the elastic P-Δ-δ response of the structure under one real case/combination? | Displacements, actions and reactions in the deformed state, convergence record |

A critical factor is an elastic bifurcation load multiplier of the idealised
model. It is not a member resistance, an effective length for a code check or a
code stability verdict. Every result carries that disclosure.

## Scope and exclusions

- Flexural instability only, in both principal planes and in sway.
  Torsional, flexural-torsional and lateral-torsional instability are excluded:
  there is no warping DOF, and the Saint Venant-only Wagner term would report
  spurious low torsional modes for open sections. The torsional geometric term
  is therefore zero, and results disclose `FLEXURAL_ONLY`.
- Small rotations. Second-order effects are linearised about the undeformed
  geometry through the geometric stiffness (P-Δ at chord level, P-δ within
  members through the consistent interpolation and mesh refinement). Large
  displacement (corotational/total Lagrangian) response remains M23.
- Axial force is taken constant on each element: N = (q₆ − q₀)/2 from the
  element end actions of the governing state (tension positive). A uniform
  axial load density is thus averaged per element; refinement converges it.
- My/Mz member end releases are independent hinge DOFs in `elasticBuckling`:
  each released end rotation gets its own free DOF a, and the element's end
  rotation is the node's plus a along the released local axis, so K and K_G
  are assembled without condensation and the eigenproblem stays linear in λ.
  A node whose rotation every connected member releases has no stiffness and
  is `UNSTABLE_MODEL`, as in linear analysis. `secondOrder` carries the hinge
  DOFs through its iteration and recovery, so released ends report no moment
  about the released axis.
- Supports, prescribed displacements and planar-mode DOF constraints are
  partitioned exactly as in mechanics-v1. No stabilising springs.
- Envelopes are not valid inputs. Each analysis uses one real load case or
  combination, formed on loads before solving.

## Geometric stiffness

Cubic Hermite interpolation of the transverse displacement with constant N gives
the consistent geometric stiffness. For the local-y bending block
[v_i, rz_i, v_j, rz_j]:

    K_G,y = N/L · [[ 6/5,   L/10,   -6/5,   L/10  ],
                   [ L/10,  2L²/15, -L/10,  -L²/30 ],
                   [-6/5,  -L/10,    6/5,  -L/10  ],
                   [ L/10, -L²/30,  -L/10,  2L²/15 ]]

The local-z block [w_i, ry_i, w_j, ry_j] is the same matrix with the
translation–rotation coupling terms negated, because w′ = −ry (as for the
elastic block in `frame.md`). Axial and torsional rows and columns are zero.
All other entries of the 12×12 matrix are zero. K_G,global = Tᵗ K_G,local T.

Axial forces of the reference state below 1e-9 of the largest are rounding
(for example a beam between identical columns) and are set to zero, so that
numerical noise is neither treated as compression nor reported as a critical
factor near 1e15.

Checks carried by unit tests: symmetry; rigid-body translation produces zero
force; rigid chord rotation θ produces transverse end shears ∓Nθ (the P-Δ
couple N·Lθ); a compressed member (N < 0) lowers the stiffness.

## Mesh refinement

Stability analyses subdivide every analytical member into `subdivisions`
equal elements (setting, integer 1–32, default 8, part of the settings hash).
Interior nodes are analysis-only, like the M02-P point-load split nodes, and
results map back onto the physical member. With consistent K_G the pinned
Euler strut converges from above: 1 element 12EI/L² (+21.6 %), 2 elements
+0.75 %, 4 elements +0.05 %, 8 elements about +0.003 %.

## Elastic buckling

Solve the linear reference state under the chosen case/combination, form
N₀ per element, then find the smallest positive λ with

    (K + λ K_G(N₀)) φ = 0     on the free DOFs.

K_ff is symmetric positive definite (mechanics-v1 already rejects a singular
free stiffness), so the pencil is solved as μ = −1/λ of K⁻¹K_G by block
subspace iteration reusing the sparse LDLᵗ factor of K_ff:

1. Block size p = min(n_free, max(2q, q + 8)) for q requested modes
   (default q = 5). Deterministic start block (unit load patterns plus a fixed
   seed), K-orthonormalised.
2. Iterate X ← K⁻¹(−K_G X); Rayleigh–Ritz on the p-dimensional pencil
   (Xᵗ(−K_G)X, XᵗKX): Cholesky-reduce the SPD projected K, then cyclic Jacobi.
3. Convergence: the leading q positive and q negative values change by less
   than 1e-10 relative between iterations, and every reported mode has
   residual ‖Kφ + λK_Gφ‖∞ / ‖Kφ‖∞ ≤ 1e-8 (values settle faster than vectors,
   so both are required). At most 200 iterations; else `NONCONVERGED` and no
   critical factor is reported.
4. Sturm check: factor K + σK_G with σ = λ_q(1 − 1e-6), just below the
   highest reported factor. Its negative pivot count must equal the number of
   reported positive factors below σ. A shift above λ_q would also count
   repeats of λ_q beyond the q requested, which are not missed modes. On a
   mismatch the block size doubles and the solve repeats; if the block already
   spans the free DOFs the result is withheld (`STURM_MISMATCH`).
5. `NO_POSITIVE_CRITICAL_FACTOR` is reported only when proven: no element is
   in compression (K_G is then positive semidefinite), or the block has grown
   to span every free DOF and still holds no positive λ. It is reported with
   the smallest |λ| of the negative factors (buckling would need the reference
   load reversed). A negative value is never reported as a critical factor.

Mode shapes are normalised so the largest absolute translation is 1 and that
component is positive. Mode comparison never depends on sign or scale:
validation pairs modes by λ and by the modal assurance criterion
MAC = (φ_aᵗφ_b)² / ((φ_aᵗφ_a)(φ_bᵗφ_b)), and repeated factors (relative
spacing below 1e-6) compare subspaces.

## Second-order (P-Δ-δ) analysis

For one real case/combination with load vector F:

    u₀ from K u₀ = F;   N_k from u_k;   (K + K_G(N_k)) u_{k+1} = F.

Axial forces are updated by successive substitution (Picard iteration) with
proportional loading: every load of the combination is applied together.
There is no construction staging in stability-v1; that is disclosed as
`PROPORTIONAL_LOADING`.

Convergence requires both ‖u_{k+1} − u_k‖∞ ≤ 1e-10 · max(‖u_{k+1}‖∞, 1e-12 m)
on translations (rotations with a 1e-12 rad floor) and max relative change of
element N ≤ 1e-10 (1e-6 N floor), within 100 iterations. Each iteration's
norms are recorded. The analysis stops with `NONCONVERGED` and no response
buffers when:

- the LDLᵗ factor of K + K_G(N_k) has a non-positive pivot, meaning the load
  is at or beyond the elastic critical state (`TANGENT_NOT_POSITIVE_DEFINITE`,
  with the iteration and pivot reported);
- the iteration limit is reached, or the increment grows for five consecutive
  iterations (`DIVERGING`).

Element end actions are q = (K + K_G(N)) d − f_eq, so reported actions include
second-order moments. Interior section actions follow from equilibrium of the
deformed left segment: the mechanics-v1 statics plus N·(v(x) − v_i) on Mz and
−N·(w(x) − w_i) on My, with v and w the Hermite (plus uniform-load) shape.
With the transverse end shears of K + K_G this makes the section moment at the
element's far end equal its end action, so moments are continuous across
unloaded mesh nodes. Results state `analysisType: secondOrder` with the
converged N field.

Global balance is checked in the deformed geometry (moments of the applied
loads and reactions about the origin at x + u). The consistent K_G contributes
q₅ + q₁₁ + L·q₇ = N(v_j − v_i), which cancels the moment of the axial end force
at its offset, so the balance is exact for nodal loads up to the iteration
tolerance; axial member loads are averaged per element and leave a small
residual that is reported, not hidden.

## Imperfections

Imperfections are never implicit. A second-order request states either
`none` or `sway`: equivalent horizontal nodal forces H = r · V at every node,
where V is the vertical (−Z) component of that node's applied load in the
combination (member loads are lumped to their end nodes as the equivalent nodal
forces), r is the stated ratio and the direction is a stated global horizontal
unit vector. The equivalent forces are listed in the result. The request does
not interpret any design code's imperfection rules.

## Validation and tolerances (stability-v1)

Independent expected values are produced by `tools/oracles/stability_oracle.py`
(closed forms, the beam-column differential equation, and OpenSees cross-checks)
into `fixtures/stability/stability-oracle.json`; it never imports the Rust
kernel. Tolerances below are fixed before any kernel
result exists.

| ID | Case | Reference | Acceptance |
| --- | --- | --- | --- |
| S-EUL-1..4 | Pinned–pinned, fixed–free, fixed–fixed, fixed–pinned struts | π²EI/(KL)² closed form | 16 elements: \|λ/λ_ref − 1\| ≤ 1e-4; refinement 1→2→4→8→16 (from 2 for fixed–fixed, whose single element has no free transverse DOF and correctly reports no factor) decreases monotonically from above, with an 8→16 error ratio ≥ 8 |
| S-EUL-PLANE | Strut with Iy ≠ Iz | Two closed forms | First two λ equal the two plane loads (≤ 1e-4), mode MAC ≥ 0.999 against the analytical plane shapes |
| S-POR-BUCK | Fixed-base portal, sway mode | Beam-column characteristic equation EI k cos kh + k_b sin kh = 0, k_b = 6EI_b/b | ≤ 1e-4 at 8 elements per member |
| S-POR-PD | Fixed-base portal, gravity + lateral at 0.2, 0.5, 0.8 λ_cr | Exact small-rotation beam-column solution (antisymmetric half-portal, axially rigid beam) | Sway and base moment ≤ 1e-3 relative |
| S-REV | Strut in tension | — | `NO_POSITIVE_CRITICAL_FACTOR`; reversed load reproduces S-EUL-1 |
| S-SIGN | Any case with the reference load sign flipped | Same model | λ(−F) spectrum is the negated λ(F) spectrum |
| S-NEAR | Portal at 0.99 λ_cr | Exact beam-column solution | Converges; sway and base moment ≤ 1e-2 relative; amplification ≥ 10× first-order sway |
| S-OVER | Portal at 1.01 λ_cr | — | `NONCONVERGED` with `TANGENT_NOT_POSITIVE_DEFINITE`; no numerical buffers |

Eigenvector sign and scale are irrelevant to every comparison (MAC pairing).

Why the strut tolerance is stated per half-wave (amended in M09-B before any
kernel result was compared): the consistent K_G converges about as h⁴ (1, 2, 4
and 8 elements per half-wave give +21.6 %, +0.75 %, +0.05 % and +0.003 %).
A fixed–fixed strut buckles in a full wave, so 8 elements over L are only 4 per
half-wave (about 5e-4). All four struts are therefore held to 1e-4 at 16
elements (at least 8 per half-wave), and the refinement ratio confirms the
order. The portal sway shape is about one half-wave per column, so 8 elements
per member keep S-POR-BUCK at 1e-4.

Why the portal references and tolerances are what they are:

- The exact solution is the same linearised theory stability-v1 discretises, so
  only discretisation and the finite column area separate them. It assumes an
  axially rigid frame; the fixture columns have A = 1 m², which moves the
  first-order sway by about I/(A h²) ≈ 1e-5 (the oracle checks its P → 0
  limit against the OpenSees first-order frame within 1e-4).
- The derivation is checked independently: OpenSees `PDelta` with 32 and 64
  elements per member, Richardson-extrapolated, reproduces it within 1e-3 up
  to 0.8 λ_cr and 1e-2 at 0.99 λ_cr (observed 2e-4 and 3e-3). Unextrapolated,
  chord-only P-Δ converges as O(1/n²) and is 5 % low at 0.99 λ_cr.
- Near critical any relative error δ in λ_cr is magnified in the response by
  about r/(1 − r), 99× at r = 0.99. At 8 elements the consistent K_G error is
  a few 1e-5, so S-NEAR is held to 1e-2 and the other ratios to 1e-3.
- OpenSees `Corotational` (large rotation) is recorded as a cross-check only:
  it is a different theory and differs by 0.2 % at 0.8 λ_cr and 6 % at
  0.99 λ_cr.
