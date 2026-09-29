# Plate analysis of slab panels, plate-v1 (M10)

A new numerical family for flat, horizontal slab panels in the global XY
plane, loaded by uniform pressure. SI f64, global Z up.

## Scope

- Flat Reissner–Mindlin plate of constant thickness t, isotropic linear
  elastic (E, ν), shear correction κ = 5/6. In-plane (membrane) action is
  carried by the same element but is decoupled from bending for a flat plate
  and unloaded by pressure.
- Rectangular panel Lx × Ly with at most one rectangular opening. Each outer
  edge is `free`, `simple` (hard simple support: w = 0 and the rotation giving
  the slope along the edge held) or `clamped` (w and both rotations held).
  Opening edges are free. In-plane displacements are held on supported edges.
- Uniform pressure q > 0 acting downward (−Z).
- No connection to frame members, no column point supports, no nonlinear
  material or cracking. These are later slices.

## Element: flat shell = Q4 membrane + MITC4 plate

Nodes carry five DOFs [u, v, w, rx, ry] (rotations right-handed about global
X and Y). The normal rotations are βx = ry, βy = −rx, so the displacements
through the thickness are u(z) = z βx, v(z) = z βy.

- **Membrane:** isoparametric bilinear quadrilateral, plane stress,
  A = E t / (1 − ν²) [[1, ν, 0], [ν, 1, 0], [0, 0, (1 − ν)/2]], 2 × 2 Gauss.
- **Bending:** curvatures κx = ∂βx/∂x, κy = ∂βy/∂y, κxy = ∂βx/∂y + ∂βy/∂x,
  Db = D [[1, ν, 0], [ν, 1, 0], [0, 0, (1 − ν)/2]], D = E t³ / (12(1 − ν²)),
  2 × 2 Gauss.
- **Transverse shear (MITC4, Dvorkin–Bathe 1984):** the covariant shear
  strains e_r = ∂w/∂r + g_r·β and e_s = ∂w/∂s + g_s·β are sampled at the edge
  midpoints (r, s) = (0, ±1) and (±1, 0) and interpolated linearly across the
  element; Cartesian γ = J⁻¹ [e_r, e_s]. Shear rigidity κ G t, 2 × 2 Gauss.
  This removes shear locking as t/L → 0 and passes the patch tests.

## Mesh

A structured quadrilateral grid whose lines include the panel edges and the
opening edges; each interval is divided uniformly into cells no larger than
the target size. Cells inside the opening are removed. Quality measures
reported: element count, largest cell aspect ratio, smallest cell size.
Limits: at most 40 000 elements; a cell aspect ratio above 5 is reported as a
warning (`MESH_ASPECT`).

## Loads and solution

Consistent pressure load f_w = −∫ N_i q dA (2 × 2 Gauss). K is assembled
sparse on the free DOFs (upper triangle accumulated once and mirrored, so the
matrix is exactly symmetric) and solved with the kernel's LDLᵀ factor.

Support sufficiency is decided from the edge topology before assembly: the
plate rigid modes w = a + b x + c y are held by one clamped edge or by any two
supported edges; a single simple edge leaves rotation about its own line free
and is `UNSTABLE_MODEL`, as is a panel with only free edges. Supported edges
hold u and v, which removes the membrane rigid modes.

Reactions R = K u − f are recovered at every restrained DOF and checked
against the applied load; a relative imbalance above 1e-8 is
`RESIDUAL_FAILURE` (the validation gate is 1e-9).

## Results and sign conventions

- Nodal w (m, positive up) and rotations.
- **Unsmoothed element actions** at element centres (r = s = 0): moments
  mx, my, mxy (N m/m, positive sagging: bottom face in tension; so
  mx = −D(κx + ν κy), my = −D(κy + ν κx), mxy = −D(1 − ν)/2 κxy) and shear
  forces qx, qy (N/m) from the MITC shear field. These are the design and
  validation values.
- **Clamped-edge line moments:** at each node of a clamped edge, the
  reaction moment about the edge line divided by the node's tributary edge
  length: mx = R_ry / L on x = 0, −R_ry / L on x = Lx, my = −R_rx / L on
  y = 0, R_rx / L on y = Ly. By virtual work on the edge strip this includes
  the shear term that carries the moment from the first element to the
  support, so it is the edge value rather than the value h/2 inside it. These
  are the support (hogging) design values along clamped edges.
- **Smoothed nodal actions:** the average of the adjacent element-centre
  values. Display only; never used for design or validation.
- **Mesh convergence indicator:** the panel is also solved at twice the target
  size, and the relative change of max |w|, max mx, max my, min mx and min my
  is reported (moments relative to the fine solution's largest moment). This
  is an indicator, not a proof of convergence. A free-edged opening has
  re-entrant corners where the plate moments are singular; the extremes there
  grow with refinement and the indicator stays high, which is the correct
  report: peak moments at re-entrant corners are mesh-dependent.
  The run labels the change `withinLimit` at 5 % or less. This is a display
  classification, not an acceptance gate.
- **Design actions (Wood–Armer, mechanics):** from the unsmoothed moments, per
  element, bottom mx* = mx + |mxy|, my* = my + |mxy|, with the standard
  corrections when one is negative (mx* = 0, my* = my + |mxy²/mx|, and the
  converse), negatives clipped to 0; top analogously for hogging. These are
  moments to be resisted, not reinforcement. Converting them to bar areas
  needs a code profile, which M10 does not enable until the concrete
  resources for M08 are held.

## Validation (plate-v1 oracle)

`fixtures/plate/plate-oracle.json`, from `tools/oracles/plate_oracle.py`.

| ID | Case | Reference | Gate |
| --- | --- | --- | --- |
| P-PATCH | MacNeal–Harder distorted patch | exact constant membrane strain and constant curvature fields | interior DOFs and element actions to 1e-10 |
| P-RIGID | Single rectangular and distorted element | six rigid-body modes | exactly six zero eigenvalues of the 20 × 20 stiffness |
| P-SS-THIN | 6 × 6 m, t = 0.2, hard simple | Mindlin Navier series | 32 × 32: centre w ≤ 2e-3, element-centre mx ≤ 5e-3; errors fall with refinement 8 → 16 → 32 |
| P-SS-THICK | t = 1.0 | Mindlin Navier | as above |
| P-SS-RECT | 6 × 4 m | Mindlin Navier | as above |
| P-SS-THINLIMIT | t = 0.02 (a/t = 300) | Navier (≈ Kirchhoff 0.00406 qa⁴/D) | no locking: 16 × 16 w ≤ 2e-2 |
| P-CL-TIM | Clamped square, ν = 0.3 | Timoshenko & Woinowsky-Krieger Table 35 | 32 × 32 w, centre element mx and edge-mid line moment (from reactions) ≤ 2 % |
| P-CL-OS | Clamped, 16 × 16 | OpenSees ShellMITC4, identical mesh | nodal w and element-centre moments ≤ 1e-6 |
| P-OPEN-OS | 6 × 5 m with a 1 × 1 m opening, 24 × 20 | OpenSees ShellMITC4, identical mesh | ≤ 1e-6 |
| P-BALANCE | Any panel | applied pressure resultant | reactions to 1e-9 relative |
