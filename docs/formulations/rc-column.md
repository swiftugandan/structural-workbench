# Biaxial RC column section mechanics (M12, mechanics-only)

Code-agnostic, like `rc-section.md` (ADR 0012). Every material parameter and strain limit is an explicit input. No partial factor, strain value or stress-block coefficient comes from a standard. Results are mechanics: a resistance moment and a utilisation, never a code PASS/FAIL (ADR 0022). Kernel: `workbench-design::rc_column`.

## Domain

- Solid rectangle, width `b` along local `y` and depth `h` along local `z`, origin at the centre.
- Bars `{y, z, A}`: points for the steel force, each a disc of its own area `A` (radius `r = √(A/π)`) that lies inside the concrete (`|y| + r ≤ b/2`, `|z| + r ≤ h/2`). At least one bar.
- Plane sections, perfect bond, no concrete tension. Bars in compression displace concrete (below).
- Strain and stress are compression positive, as in `rc-section.md`. A strain plane is `ε(y, z) = e0 + ky y + kz z`.
- **Resultants about the centre:** `N = ∫σ dA + Σ F_i` (compression positive, so `N = −N_frame`), `My = −(∫σ z dA + Σ F_i z_i)`, `Mz = ∫σ y dA + Σ F_i y_i`. These are the frame's local moments, so frame `My`, `Mz` pass through unchanged: a negative `My` compresses the `+z` face and a positive `Mz` the `+y` face (for an rcBeam draft, sagging `My < 0` compresses the top face; ADR 0014).
- Demand direction `θ = atan2(Mz, My)`.

## Materials (explicit inputs)

- Steel: elastic–perfectly plastic, `σ_s = clamp(E_s ε, −f_y, f_y)` (the `rc_section::SteelLaw`).
- Concrete (the `rc_section::ConcreteLaw`), as a function of strain:
  - `parabolaRectangle {f, ε_c2, ε_cu, n}`: `σ = f [1 − (1 − ε/ε_c2)^n]` for `0 < ε < ε_c2` and `σ = f` for `ε ≥ ε_c2`.
  - `rectangularBlock {intensity, λ, ε_cu}`: `σ = intensity` for `ε > (1 − λ) ε_cu`, else 0. On any plane with the most compressed fibre at `ε_cu`, this is the block of depth `λx` from that fibre measured along the strain gradient, which is the rc-section block. As a strain law it also covers full compression without a further parameter.
- The laws are applied as given. The domain below keeps strains within the limits.

## Displaced concrete

A bar's net force is `F_i = A_i σ_s(ε_i) − C_i`:

- Parabola-rectangle (continuous stress): `C_i = A_i σ_c(ε_i)` at the bar centre, as in `rc-section.md`.
- Rectangular block: the block's stress jumps at its edge. A point bar would make `N` jump by `A_i · intensity` as the edge swept over it, and `N` along the strain domain would stop being continuous. The displaced concrete is the block over the part of the bar's disc inside the block. With `δ = ((1 − λ) ε_cu − ε_i)/κ` the signed distance from the bar centre to the block edge along the gradient `n`:
  - `δ ≥ r`: `C_i = 0`.
  - `δ ≤ −r`: `C_i = intensity · A_i`.
  - Otherwise `C_i = intensity · (r² acos(δ/r) − δ √(r² − δ²))`, acting at `(2/3)(r² − δ²)^{3/2} / segment` beyond the centre along `n`.

  This equals the rc-section point rule whenever no disc straddles the block edge.

## Ultimate strain domain (Figure 6.1 shape)

The shape follows EN 1992-1-1:2004, 6.1 and Figure 6.1 (the held base text). The strain values are the caller's:

- Pivot A: the extreme tension bar at `−ε_ud`, only when a steel strain limit `ε_ud` is given. With no limit, the pure tension resistance `−Σ A_i f_y` is only approached.
- Pivot B: the most compressed fibre at `ε_cu` (from the concrete law).
- Pivot C: full compression, `full_compression_strain = ε_c` (input, `0 < ε_c ≤ ε_cu`). Planes pass through strain `ε_c` at depth `s_C = (1 − ε_c/ε_cu) H` from the most compressed fibre.

For a neutral-axis direction `α` (compression increasing along `n = (cos α, sin α)`), `H` is the section extent along `n`, `s` is the depth below the most compressed fibre, `d` is the depth of the deepest bar and `ε(s) = ε_top − κ s`. One parameter `τ` spans the ultimate planes continuously:

| τ | Pivot | Plane |
| --- | --- | --- |
| [0, 1] (with `ε_ud`) | A | `ε(d) = −ε_ud`, `ε_top = −ε_ud + τ (ε_cu + ε_ud)` |
| (1, 2] | B | `ε_top = ε_cu`, `x = x_AB + (τ − 1)(H − x_AB)`, `x_AB = ε_cu d/(ε_cu + ε_ud)` or 0 |
| [2, 3] | C | `ε(s_C) = ε_c`, `ε(H) = (τ − 2) ε_c` |

- Squash `N_c` is the uniform plane `ε = ε_c`. Tension `N_t` is `ε = −ε_ud`, or `−Σ A f_y` when `ε_ud` is absent (not attained).
- With unequal reinforcement on the two faces, a slightly eccentric plane in pivot C can carry more than `N_c`. Such states do not surround the section centre. The kernel's axial range is the uniform planes', and `N_Ed` above `N_c` is reported as beyond it.

## Exact concrete integration

`σ` depends only on `s`. The rectangle is cut at its corner depths, at the neutral axis (`ε = 0`) and at the law's switch strain (`ε_c2`, or the block edge). On each piece the chord of the rectangle at depth `s` has a length `w(s)` that is linear in `s` and first moments `W(s)` that are quadratic. They are recovered exactly from three interior samples. The integrals `∫σ w ds` and `∫σ W ds` are then exact:

- For a constant stress, polynomial integration.
- For the parabola, with `u = 1 − ε/ε_c2` linear in `s`, `∫ f (1 − u^n) q(s) ds`. Here `∫ u^n (A + B u + C u²) du` is integrated analytically for any real `n`. When `u` varies by less than a tenth of its size, the analytic difference loses digits. There, 8-point Gauss–Legendre is used instead. The singularity of `u^n` then lies over ten interval lengths away, so the error is below 1e-25 relative. The two branches agree to 1e-12 at the switch (unit test).

No fibre discretisation and no table interpolation are used.

## Capacity along a direction

`M_Rd(N_Ed, θ)`:

1. The range check `N_t ≤ N_Ed ≤ N_c` (`N_Ed = N_t` only when attained); otherwise `INVALID_LOAD`. At `N_Ed = N_c`, or the attained `N_t`, the plane is uniform: `M_Rd = 0` if its moment about the centre vanishes, otherwise `UNSUPPORTED_FEATURE`.
2. **Depth, at each angle α:** `N(τ) − N_Ed` is sampled over 16 points per pivot branch. Each sign change is solved by bisection until the bracket stops shrinking in f64 (floor 3ε). The plane with the largest moment is kept (the outermost ultimate state at that angle). `N(τ)` is continuous but need not be monotone (pivot C, unequal faces). A root pair closer than one sample spacing can be missed, which only understates the resistance.
3. **Angle:** the moment direction `φ(α)` is sampled at 72 angles. The contour must wind once around the section centre (`Σ Δφ = 2π`); otherwise `UNSUPPORTED_FEATURE`. This happens with eccentric reinforcement near the axial limits, where a ray from the centre does not measure the demand. Every bracket where `φ − θ` changes sign upward is bisected in α to f64 resolution (floor 4ε). A bracket that closes on a jump of `φ` rather than a crossing is discarded. The discard threshold is a direction error above `1e-9 + 1e-12 · N_scale · max(b, h)/M_Rd`, where the second term is the roundoff limit of the moment direction. The smallest `M_Rd` over the genuine crossings is returned.
4. The capacity reports the plane, pivot, neutral-axis angle and depth, the iterations, the direction error and the relative axial residual `|N − N_Ed| / max(|N_c|, |N_t|)`.

**Check:** `utilisation = |M_Ed| / M_Rd(N_Ed, θ_Ed)`. It is 0 when `M_Ed = 0`, after confirming that the centre lies inside the contour. It is absent when `N_Ed` is outside the axial range. `axial_ratio = N_Ed/N_c` in compression and `N_Ed/N_t` in tension.

**Contour:** `interaction_contour(N_Ed, count)` returns one ultimate point per neutral-axis angle, for display.

## Oracle and tolerances

`tools/oracles/column_oracle.py` (pure Python, no numerical libraries, no import of the kernel) writes `fixtures/column/column-oracle.json` with `failures: []` self-checks:

- **Reference resultants.** The block zone and the parabola plateau are convex polygons: the rectangle clipped by strain half-planes, integrated exactly by the shoelace formulas. The parabolic zone uses composite Gauss–Legendre across the gradient on rectangle chords, graded towards `ε_c2`. Its refinement is checked (2 vs 6 sub-panels, 1e-12). Bar-disc segments are integrated by Gauss–Legendre in `t = r sin φ`, not the closed form.
- **Fibre model.** A 400² and 800² midpoint grid with the same laws. The 800² error bound for the continuous parabola law is `|f800 − f400|`, from the observed O(h²) convergence (factor ~4 per halving). For the block, whose stress jumps, the bound is the cut-cell bound `intensity · (L(dy + dz) + dy dz)`, times the half-diagonal for moments, where `L` is the block-edge chord length. Both bounds include a 1e-12 summation-roundoff allowance.
- **Closed forms.** The uniform squash and tension resistances, and the uniaxial rectangular-block balanced point by hand algebra (no bar straddles the block edge there).
- **Capacities.** The same domain written out independently, Brent's method in τ and in α, and a 10° scan of angles for the brackets. Square sections are checked for symmetry.

Kernel tests (`crates/design/tests/rc_column.rs`, unit tests in `rc_column.rs`):

| Check | Gate | Measured |
| --- | --- | --- |
| Resultants vs reference, 3 configurations, 23 planes over pivots A/B/C | 1e-9 of N_scale (and N_scale · max(b, h) for moments) | 7.5e-15 |
| Resultants vs 800² fibre | within the oracle's bound above | 6.2e-7 of scale |
| Squash / tension / balanced point | 1e-12 / 1e-12 / 1e-9 | passes |
| M_Rd(N, θ), 48 cases (4 N × 4 θ × 3 configurations) | 1e-9 relative | 4.4e-14 |
| Axial residual; direction error | ≤ 1e-12; ≤ 1e-12 rad | passes |
| Bisection | ≤ 64 iterations each | ≤ 47 depth, ≤ 47 angle |
| Uniaxial (N = 0, θ = π and π/2) vs `rc_section::ultimate`, three laws | 1e-9 on M and x | passes |
| Square symmetry (quarter turns, y↔z reflection) | 1e-9 | passes |
| Contour points are capacities in their own direction | 1e-9 | passes |
| Parabola law: N non-decreasing along the domain; continuity across the pivots | 3000 samples × 36 angles | passes |

## Unsupported (reported, never approximated)

Code partial factors and design strengths; slenderness and second-order effects; minimum eccentricity (EN 1992-1-1 6.1(4), 5.8); detailing rules; creep; confinement; strain hardening; non-rectangular sections. These wait for the M08 code profile resources (EN 1992-1-1 A1:2014 and the UK NA + A2:2014).
