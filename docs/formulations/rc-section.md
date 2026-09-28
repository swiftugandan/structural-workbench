# Rectangular RC section mechanics (M08-A, mechanics-only)

Code-agnostic. No coefficient here comes from a design standard; every material parameter is an explicit input (ADR 0012).

## Domain

- Solid rectangle, width `b`, depth `h` (m). Uniaxial bending about the width axis. Axial force `N = 0` (beam flexure).
- Reinforcement is given as layers `{d_i, A_i}`. `d_i` is the depth of the layer centroid from the **compression face** (m), with `0 < d_i < h`. `A_i > 0` is the area (m²). The caller maps sagging or hogging to the compression face.
- The compression zone is plane sections, perfect bond and ignored concrete tension (ultimate and cracked states). Bars in compression displace concrete: net layer force `A_i (σ_s,i − σ_c(ε_i))` when `ε_i > 0`.
- Strain sign: compression positive. Units: SI (N, m, Pa). Moments are positive when they compress the compression face.

## Materials (explicit inputs)

- Steel: elastic–perfectly plastic, `σ_s = clamp(E_s ε, −f_y, f_y)`, with `ε_y = f_y / E_s`.
- Concrete compression law for the ultimate state, one of:
  - `rectangularBlock {intensity, depthRatio λ, ultimateStrain ε_cu}`. Uniform stress `intensity` over depth `λ x`. `0 < λ ≤ 1`. A bar lies in the block when `d_i < λ x`.
  - `parabolaRectangle {peak f, strainAtPeak ε_c2, ultimateStrain ε_cu, exponent n}`. `σ = f [1 − (1 − ε/ε_c2)^n]` for `0 ≤ ε ≤ ε_c2`, and `σ = f` for `ε_c2 < ε ≤ ε_cu`. Requires `0 < ε_c2 ≤ ε_cu` and `n > 0`.
- Elastic states: concrete modulus `E_c`, modular ratio `m = E_s / E_c`, optional tensile strength `f_ct` for the cracking moment.

## Ultimate state (strain compatibility)

The top strain is `ε_cu`, the neutral-axis depth is `x`, and `ε(y) = ε_cu (1 − y/x)`. The layer strain is `ε_i = ε_cu (1 − d_i / x)`.

The concrete resultant is taken over `0 ≤ y ≤ x`. With the substitution `dy = −(x/ε_cu) dε`:

- `C_c = b (x/ε_cu) ∫₀^{ε_cu} σ dε`
- `M_c(top) = b (x/ε_cu) ∫₀^{ε_cu} σ(ε) · x (1 − ε/ε_cu) dε`

Closed forms used by the kernel:

- Parabola: `∫₀^{ε_c2} σ dε = f ε_c2 · n/(n+1)`, `∫₀^{ε_c2} ε σ dε = f ε_c2² [1/2 − 1/((n+1)(n+2))]`
- Plateau: `f (ε_cu − ε_c2)` and `f (ε_cu² − ε_c2²)/2`
- Rectangular block: `C_c = intensity · b · λ x`, acting at `λ x / 2`

Equilibrium is `F(x) = C_c(x) + Σ_i A_i (σ_s,i − [ε_i>0] σ_c(ε_i)) = 0`. The root is bracketed on `(0, h]` and found by bisection until the bracket stops shrinking in `f64`. The kernel reports `NO_EQUILIBRIUM` (unsupported) when `F(h) < 0`, meaning the neutral axis would leave the section, or when `F` has no sign change. The residual `|F| / max(C_c, Σ|A σ|)` is reported.

- **Capacity:** with layer forces `F_i` (compression positive) and the concrete moment `M_c(top) = C_c ȳ_c` about the compression face, `M_u = −Σ_i F_i d_i − M_c(top)`. Because `N = 0`, the same value holds about any point, and `M_u > 0`.
- **Classification (mechanics only):** `tensionYielded` when the extreme (deepest) layer has `−ε ≥ ε_y`, otherwise `tensionElastic`. A shallow layer just below the neutral axis does not decide it. Each layer also reports `yielded` (`|ε_i| ≥ ε_y`). The kernel reports `x / d_max`, where `d_max` is the deepest layer. These are not code ductility limits.

## Elastic uncracked (transformed)

- `A_t = b h + (m − 1) Σ A_i`
- `ȳ = [b h²/2 + (m − 1) Σ A_i d_i] / A_t`
- `I_u = b h³/12 + b h (h/2 − ȳ)² + (m − 1) Σ A_i (d_i − ȳ)²`
- `M_cr = f_ct I_u / (h − ȳ)` when `f_ct` is given (tension at the face opposite the compression face).

## Elastic cracked (transformed, concrete tension ignored)

The neutral axis `x` solves `S(x) = b x²/2 + Σ_i k_i A_i (x − d_i) = 0`. Here `k_i = m − 1` when `d_i < x` (compression bar displaces concrete) and `k_i = m` otherwise. `S` is continuous and strictly increasing, so the root is unique. It is found by bisection on `(0, h)`.

- `I_cr = b x³/3 + Σ_i k_i A_i (x − d_i)²`
- **Service stresses for moment M:** `σ_c,top = M x / I_cr`, `σ_s,i = m M (x − d_i) / I_cr` (compression positive)

## Bar-row geometry (fit only, no code spacing rule)

For a single row across width `b` with side cover to the link `c`, link diameter `φ_l`, bar diameter `φ` and count `n ≥ 1`:

- Clear spacing `s = (b − 2(c + φ_l) − n φ)/(n − 1)` for `n ≥ 2`. For `n = 1`, `s` is not applicable.
- Depth from the face the row sits against: `c + φ_l + φ/2`.
- Area: `n π φ²/4`.
- The row fits when `b − 2(c + φ_l) − n φ ≥ 0` and, for `n ≥ 2`, `s ≥ s_min`. `s_min` is a required caller input with recorded provenance. The kernel invents no default.

## Oracle and tolerances

`tools/oracles/rc_section_oracle.py` recomputes each fixture independently:

- It integrates the concrete stress over `y` with composite 8-point Gauss–Legendre quadrature, split at the parabola/plateau boundary. Panels are geometrically graded towards that boundary, where a non-integer exponent is not smooth. The nodes are computed in pure Python by Newton iteration, with no numerical libraries.
- It solves equilibrium by the Illinois (modified regula falsi) method on its own residual.
- It solves the cracked neutral axis as a quadratic per interval.
- It does not import the Rust kernel or reuse its closed forms.

Fixture tolerance: relative `1e-9` on `x`, `M_u`, `I_u`, `I_cr`, `ȳ` and `M_cr`, and absolute `1e-12` on strains. This covers bisection and quadrature error; values are not rounded before comparison.

## Unsupported (reported, never approximated)

Axial force, biaxial bending, flanged or non-rectangular sections, strain hardening, concrete tension at ultimate, creep/long-term modular ratio, shear, torsion, anchorage and any code check. A neutral axis outside the section is also unsupported at ultimate.
