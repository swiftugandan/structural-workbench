# Single-plate connection formulation (connection-v1, M13)

Implementation: `crates/design/src/profile/aisc36022/connection/` (ADR 0030). SI throughout; the bolt tables are stored as published (inches or millimetres) and converted once.

## Geometry and axes

The connection lies in the beam's web plane: the local x of the beam is horizontal (toward the beam), and the local y is "up". The origin is the support face at the beam top, with y measured downward.

| Symbol | Meaning |
| --- | --- |
| n, n_c | bolt rows per line, bolt lines (1 or 2) |
| s, g | pitch, gauge between lines |
| l | plate length 2 l_ev + (n − 1) s |
| a | support face to the bolt line nearest it |
| l_ev, l_eh,p | plate vertical edge distance, plate edge beyond the outer line |
| l_eh,b | beam end to the bolt line nearest the support, less the underrun |
| d_h, d_h′ | standard hole (J3.3), and the hole plus 1/16 in. (2 mm) for net areas (B4.3b) |

## Actions

From the beam's end actions [N, V_y, V_z, T, M_y, M_z] (node on element, local axes):
- V = V_y at the end (positive when the beam bears down);
- N = −N_i at the start, or +N_j at the end (tension positive);
- M = M_z at the end (strong axis).

M, V_z, M_y, T and N < 0 make the connection unsupported (ADR 0030 item 5). The tolerance is 10⁻⁶ of V·l for moment, and of max(V, N) for the others.

## Instantaneous centre

For bolts b_i about a trial centre c:

- r_i = |b_i − c|;
- Δ_i = 0.34 in. × r_i / max r;
- R_i = (1 − e^(−10 Δ_i/in.))^0.55;
- each R_i acts along the counter-clockwise tangent t_i.

The load is a unit vector u whose line passes through the support face at the bolt group's mid-height, p = (−a − g/2, 0) from the centroid, with u ∥ (N, −V). With σ = sign((p − c) × u):

  σ Σ R_i t_i = P u,  P = Σ R_i r_i / |(p − c) × u|

Two equations in c, solved by damped Newton with a finite-difference Jacobian from the elastic centre r₀ = Σr²/(n e). Multiples 0.5, 2, 0.25, 4, 0.1 and 10 of r₀ are tried until one converges. Centres beyond 1000 spans are rejected: there, all bolts approach Δ_max and the residual tends to zero without a solution (the translation asymptote, C → n R(Δ_max) = 0.9815 n). A concentric load returns that limit, so C is continuous as e → 0.

Reported: C = P, the equilibrium residuals along and across the load and of moment about c (all ≤ 10⁻¹³ at convergence), the centre and the bolt forces. C′ (pure moment) = Σ R_i r_i about the centroid.

## Limit states (LRFD φ)

| Check id | Clause | Demand | Resistance |
| --- | --- | --- | --- |
| boltGroup | J3.7, J3.11a | √(V² + N₊²) | (C/n) Σ min(φF_nv A_b, φk_b d t F_u, φk_t l_c t F_u over plate and web), φ = 0.75 |
| plate.shearYield | J4-3 | V | 1.00 × 0.6 F_y l t_p |
| plate.shearRupture | J4-4 | V | 0.75 × 0.6 F_u (l − n d_h′) t_p |
| plate.blockShear | J4-5 | V | 0.75 [min(0.6 F_u A_nv, 0.6 F_y A_gv) + U_bs F_u A_nt] |
| plate.flexure | F11 | V a | 0.90 min(F_y Z ≤ 1.5 F_y S, LTB with L_b = a, C_b = 1.84) |
| plate.flexuralRupture | Eq. 9-8 | V a | 0.75 F_u Z_net |
| plate.interactionYield | Eqs. 10-8/12-2/12-3 | (N/2P_c + M/M_c)² + (V/V_c)², or (N/P_c + 8/9 M/M_c)² + (V/V_c)² | 1 |
| plate.ductility | Eqs. 10-6/10-7 | t_p | 6 (F_nv/0.9) A_b C′/(F_y l²) |
| weld.size | J2.2b, Table J2.4 | max(5/8 t_p, w_min) | w (and l ≥ 4w) |
| weld.strength | J2.4 | √(V² + N₊²) | 0.75 × 0.6 F_EXX × 2 (w/√2) l, k_ds = 1 |
| support.shearRupture | J4-4 | V | 0.75 × 0.6 F_u × 2 l t_s |
| support.thickness | Eq. 9-6 | 3.09 D/F_u | t_s |
| beam.shearYield | J4-3 | V | 1.00 × 0.6 F_y d t_w |
| spacing, edgeDistance, fit | J3.4–J3.6, detailing | — | — |

Under tension (N > 0) the following are added: plate tension yield and rupture (J4-1, J4-2, U = 1); block shear interaction (V/φR_v)² + (N/φR_t)², with φR_t the lesser of the L- and U-shaped blocks; the rupture interaction; beam tension yield; rupture with U = (d − 2t_f) t_w / A_g; and U-shaped beam block shear.

**Block shear for V** runs along the bolt line nearest the support (A_gv = (l − l_ev) t_p, A_nv = A_gv − (n − ½) d_h′ t_p), with tension across to the free edge (A_nt = (g + l_eh,p − (n_c − ½) d_h′) t_p).

**Z_net** is exact for one line of holes symmetric about mid-depth: t l²/4 − Σ t d_h′ |y_i|, with t (½d_h′ ± y)²/2 terms for a hole across the axis.

**Tearout l_c.** Within a line, l_c = s − d_h between holes; at the edge row it is l_ev − d_h/2, in the direction of the beam reaction for the plate and opposite for the web. In the web there is no edge toward a flange. Under tension, l_c is the lesser of the vertical value and the horizontal one (l_eh,p − d_h/2 in the plate, l_eh,b − d_h/2 in the web, or g − d_h between lines).

## Verification

| Gate | Reference | Criterion | Test |
| --- | --- | --- | --- |
| C1 | Published C values (II.A-17A, K.1, II.A-20, II.A-30, II.A-17B, II.A-19A) | solver values on the table grid, rounded and interpolated, within 0.01; exact solution within 0.02 | `icr_reproduces_the_published_c_values` |
| C2 | Equilibrium | residuals ≤ 10⁻⁹ for single and double lines, 0–89° | `icr_is_in_equilibrium` |
| C3 | II.A-17A/17B/19A limit states | each published value within its rounding chain (fixture `basis`) | `ii_a_*_limit_states` |
| C4 | Independent oracle | every limit state of six cases (US and metric, tension, uplift, two lines) to 10⁻⁸ | `matches_the_independent_oracle` |
| C5 | Protocol | the beam's exact end actions, statuses identical to the kernel, unsupported moment transfer, refusals and persistence | `crates/wasm-api/tests/single_plate.rs` |
| C6 | Browser | journey, drawing dimensions equal to the run record, report and save | `tests/e2e/steel-connection.spec.js` |
