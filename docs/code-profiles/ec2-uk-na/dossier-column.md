# EC2 column dossier: slenderness, second order, biaxial bending, detailing (M12)

Clause reading for the `ec2-uk-na` column checks (ADR 0027). These are formulas in our own notation, with their parameters and provenance; no standard prose is reproduced. Sources and amendment state are as in [dossier-beam.md](dossier-beam.md): every row below is `A1/A2: unreconciled`. Implementation: `crates/design/src/profile/ec2uk/column.rs`.

## Section and conventions

- Rectangle with width b along local y and depth h along local z (ADR 0022). Bars sit evenly on each face, inset by cover + link + φ/2, with one perimeter link.
- N is compression positive. My is the frame's moment about local y, which works across h; Mz is about local z and works across b.
- End moments are the frame's internal My, Mz at stations 0 and 1. Equal signs mean tension on the same side.
- Resistance comes from the exact biaxial kernel (`rc_column`, ADR 0022), with:
  - the 3.1.7(1) parabola-rectangle at f_cd = α_cc f_ck/γ_c (UK α_cc = 0.85), ε_c2 = 0.002, ε_cu2 = 0.0035, n = 2 (f_ck ≤ 50 MPa);
  - steel with a horizontal top branch at f_yd (3.2.7(2)b);
  - the 6.1(5) limit ε_c2 for uniform compression.

## Effective length and slenderness (5.8.3)

| Item | Clause | Rule | UK NA |
| --- | --- | --- | --- |
| Effective length, braced | 5.8.3.2(3), (5.15) | l0 = 0.5 l √[(1 + k1/(0.45 + k1))(1 + k2/(0.45 + k2))] | — |
| Effective length, unbraced | (5.16) | l0 = l · max(√(1 + 10 k1 k2/(k1 + k2)), (1 + k1/(1 + k1))(1 + k2/(1 + k2))) | — |
| k | 5.8.3.2(3) note | k = (θ/M)(EI/l), the engineer's input per end and per direction; the recommended minimum 0.1 is applied | — |
| Clear height l | 5.8.3.2(3) | the bound member's node-to-node length (conservative) | — |
| Slenderness | 5.8.3.2(1), (5.14) | λ = l0/i with i = h/√12 across the bending direction | — |
| Limit | 5.8.3.1(1), (5.13N) | λ_lim = 20 A B C/√n; A = 1/(1 + 0.2 φ_ef) (0.7 if φ_ef not entered); B = √(1 + 2ω); C = 1.7 − r_m; n = N_Ed/(A_c f_cd); ω = A_s f_yd/(A_c f_cd) | recommended value |
| r_m | 5.8.3.1(1) note | M01/M02 with sign; 1.0 for unbraced members and for members with loads along them | — |
| Second order needed | 5.8.3.1(1), (2) | λ ≥ λ_lim, checked in each direction separately | — |

## Imperfections and minimum eccentricity

| Item | Clause | Rule | UK NA |
| --- | --- | --- | --- |
| Inclination | 5.2(5), (5.1) | θ_i = θ0 α_h α_m with α_h = 2/√l in [2/3, 1] and α_m = 1 (isolated member, m = 1) | θ0 = 1/200 (recommended) |
| Eccentricity | 5.2(7)a, (5.2) | e_i = θ_i l0/2, added to the first order end moments | — |
| Minimum eccentricity | 6.1(4) | M_Ed ≥ N_Ed e0 with e0 = h/30, not less than 20 mm | — |
| Direction | 5.8.9(2) | the imperfection, and with it the minimum eccentricity, is applied in one direction at a time | — |

## Nominal curvature (5.8.8)

| Item | Clause | Rule |
| --- | --- | --- |
| Curvature | 5.8.8.3(1), (5.34) | 1/r = K_r K_φ ε_yd/(0.45 d), ε_yd = f_yd/E_s |
| d | 5.8.8.3(2) | d = h/2 + i_s, with i_s the radius of gyration of all the bars about the bending axis |
| K_r | 5.8.8.3(3), (5.36) | (n_u − n)/(n_u − n_bal) ≤ 1, n_u = 1 + ω, n_bal = 0.4 |
| K_φ | 5.8.8.3(4), (5.37) | 1 + β φ_ef ≥ 1, β = 0.35 + f_ck/200 − λ/150. φ_ef is the engineer's input; a slender column without it is indeterminate |
| Deflection | 5.8.8.2(3), (5.33) | e2 = (1/r) l0²/c with c = 10 |
| M2 | (5.33) | N_Ed e2 |

**Design moment per direction (5.8.8.2).** The end moments include the imperfection: M02 = |M02,first| + N e_i, and M01 = M01,first·sign(M02) + N e_i.

- Braced, no load along the member: M_Ed = max(M0e + M2, M01 + M2/2, M02, N e0), with M0e = max(0.6 M02 + 0.4 M01, 0.4 M02) (5.32). The M01 + M2/2 term follows the practice that the second order moment is parabolic over l0.
- Braced, with load along the member: M_Ed = max(M_max + N e_i + M2, M02, N e0).
- Unbraced: M_Ed = max(M02 + M2, N e0). The first and second order maxima coincide at the end.

Without the imperfection direction, e_i = 0 and N e0 is not applied.

## Biaxial bending (5.8.9)

Two design moment vectors are checked:
- (M_Edy with imperfection, M_Edz without);
- (M_Edy without, M_Edz with).

Each is checked against the exact resistance M_Rd(N_Ed, θ) along its own direction. This is the "accurate cross section design" that 5.8.9(4) allows instead of the (5.39) interpolation. An N_Ed outside the section's axial resistance fails.

## Shear (6.2)

| Item | Clause | Rule | UK NA |
| --- | --- | --- | --- |
| V_Rd,c | 6.2.2(1), (6.2) | [C_Rd,c k (100 ρ_l f_ck)^(1/3) + k1 σ_cp] b_w d ≥ (v_min + k1 σ_cp) b_w d, with σ_cp = N_Ed/A_c ≤ 0.2 f_cd, k1 = 0.15 | recommended C_Rd,c, v_min, k1 |
| ρ_l | — | the bars on the tension face (continuous through the column), ≤ 0.02 | — |
| Links | 6.2.3 | two legs of the perimeter link; V_Rd = min(V_Rd,s, V_Rd,max) at the optimum cot θ in [1, 2.5]; ν1 = 0.6(1 − f_ck/250) | α_cw = 1 for non-prestressed members; V_Rd,max ≤ 200 b_w² (N, mm), as for beams |
| Directions | — | V_z across b with d over h, V_y across h with d over b | — |

## Detailing (9.5, 8.2, 4.4.1)

| Item | Clause | Rule | UK NA |
| --- | --- | --- | --- |
| Bar diameter | 9.5.2(1) | φ ≥ φ_min | φ_min = 12 mm |
| A_s,min | 9.5.2(2), (9.12N) | max(0.10 N_Ed/f_yd, 0.002 A_c) | recommended |
| A_s,max | 9.5.2(3) | 0.04 A_c outside laps (0.08 at laps) | recommended |
| Link diameter | 9.5.3(1) | ≥ max(6 mm, φ_max/4) | — |
| Link spacing | 9.5.3(3) | s ≤ s_cl,tmax = min(20 φ_min, min(b, h), 400 mm); 9.5.3(4) reduces it by 0.6 near beams, slabs and laps (reported, not checked) | recommended for ≤ C50/60 |
| Restraint | 9.5.3(6) | every compression bar within 150 mm of a restrained bar; with one perimeter link only the corner bars are restrained | — |
| Spacing | 8.2(2) | clear gap ≥ max(k1 φ, d_g + k2, 20 mm) | k1 = 1, k2 = 5 mm |
| Cover | 4.4.1 | as for beams | Δc_dev = 10 mm |

## Verification

- `tools/oracles/ec2_column_oracle.py` recomputes the design moments from this dossier for seven cases: braced single and double curvature, short and slender; unbraced; a load along the member; minimum eccentricity governing; and a rectangle slender about one axis only. It writes `fixtures/design/ec2-uk-na/column.reconciliation.json`, and the Rust tests agree within 1e-9.
- JRC89037 3.2.2.4 Column B2 (`jrc-column-b2.published.json`): l0, n, λ_lim, K_r, A_s,min, A_s,max and M_tot from the stated eccentricities reconcile within the printed rounding. Four publication discrepancies are documented and confirmed to disagree with the code text:
  - λ printed as 22.5 instead of 21.5;
  - e_i computed from l instead of l0;
  - 0.25d instead of 0.45d in (5.34);
  - e0 taken as b/20.

## Unsupported

- Circular and non-rectangular sections.
- Columns in unbraced frames analysed as part of global second order (5.8.3.3).
- The nominal stiffness method (5.8.7).
- Members with varying normal force or section.
- f_ck > 50 MPa.
- Walls (9.6).
- Laps, and bars bent at changes of section.
