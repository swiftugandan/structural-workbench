# Ground contact under a rigid rectangular base (M11, footing kernel)

Code-agnostic mechanics (`workbench-design::footing`, ADR 0028). Every input is explicit, and no standard value is used.

## Domain

- A rigid base of L × B centred at the origin, with x along L (global X) and y along B (global Y).
- A downward resultant N > 0 at (e_x, e_y). For column actions on the top of the base:
  - the base moments are M_x,b = M_x − h H_y and M_y,b = M_y + h H_x (the horizontal forces act at the base thickness h above the underside);
  - e_x = M_y,b/N and e_y = −M_x,b/N.
- The ground is linear and tensionless: q(x, y) = max(0, p0 + p_x x + p_y y).
- **Refusals:**
  - N ≤ 0: no downward force, so no contact (`UNSUPPORTED_FEATURE`).
  - A resultant on or outside the base edge: no equilibrium (`UNSTABLE_MODEL`).
  - Tension is never treated as contact.

## Solution

- **Full contact** (every corner of the closed form non-negative): q = N/A + 12 N e_x x/(B L³) + 12 N e_y y/(L B³).
- **Partial contact.** Find (p0, p_x, p_y) such that ∫q [1, x, y] dA = N [1, e_x, e_y] over the contact region Ω (q > 0).
  - Ω is the base clipped by the half-plane p0 + p_x x + p_y y ≥ 0 (Sutherland–Hodgman).
  - The integrals of [1, x, y, x², xy, y²] over the polygon are exact (Green's theorem).
  - Because q = 0 on the moving boundary, the Jacobian is J = ∫_Ω φ φᵀ with φ = [1, x, y].
  - Newton's method with step halving starts from the full-contact plane and stops when the resultant error is ≤ 1e-13 N(1 + max(L, B)).
- **Outputs:** the plane; the state (full or partial); the contact area and fraction; the clipped corner pressures; q_max and q_min; the contact polygon; the iteration count; and the residual.

## Loads within regions

- For a polygon inside the base, ∫q [1, x, y] is the polygon clipped by the contact half-plane and integrated exactly. Footing design uses this for strips (face moments, the tie force and one-way shear) and for control perimeters (punching).
- A rounded control perimeter is a polygon of 48 segments per quarter circle. Under full contact the region is symmetric about the column centre, so the force inside is exactly p0 times its exact area.

## Verification

`tools/oracles/footing_oracle.py` uses a different method:
- closed forms for full contact and for the uniaxial triangle (q_max = 2N/(3Bc), contact length 3c, c = L/2 − e);
- for biaxial partial contact, strip integration that is exact in y, with bisection on the neutral axis offset and its angle.

The Rust tests reproduce the closed forms to 1e-12 and the biaxial search to 1e-5 of q_max, with the solved plane in equilibrium to 1e-12.
