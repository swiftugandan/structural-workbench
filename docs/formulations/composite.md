# Composite beam formulation (composite-v1, M17)

Implementation: `crates/design/src/profile/aisc36022/composite/` (ADR 0031). SI throughout.

## Section

- b_eff = Σ_sides min(L/8, s/2 to the next beam, or the edge distance) (I3.1a).
- Concrete layers below the slab top:
  - a solid slab is one layer of thickness t;
  - a perpendicular deck keeps only the topping t − h_r;
  - a parallel deck adds the rib zone h_r at width b_eff·w_r/pitch.
- A_c = Σ width × thickness.
- C_f = min(0.85 f'c A_c, F_y A_s). C = min(C_f, ΣQ_n).
- Block depth a: the depth of the layers filled at 0.85 f'c to carry C. d1 = t − (block centroid depth).
- Steel compression C_s = (F_y A_s − C)/2:
  - nothing (PNA in the slab), then
  - the top flange (x = C_s/(b_f F_y), d2 = x/2), then
  - the web (x = t_f + (C_s − b_f t_f F_y)/(t_w F_y), d2 the compression centroid).
- M_n = C(d1 + d2) + F_y A_s (d/2 − d2) (C-I3-10). φ = 0.90.

## Studs

- Q_n = min(0.5 A_sa √(f'c E_c), R_g R_p A_sa F_u) (I8-1).
- E_c = w_c^1.5 √f'c (US form: lb/ft³ and ksi, converted).
- Rows at x_k = first row + k × spacing.
- ΣQ_n(x) = per_row × Q_n × min(rows strictly left of x, rows strictly right of x).

## Stiffness

- I_LB = I_s + A_s(Y_ENA − d3)² + (ΣQ_n/F_y)(2 d3 + d1 − Y_ENA)², with Y_ENA = (A_s d3 + (ΣQ_n/F_y)(2 d3 + d1))/(A_s + ΣQ_n/F_y) and d3 = d/2 (C-I3-1, C-I3-2).
- I_tr: n = E_s/E_c. The elastic neutral axis is found by bisection; concrete below it is neglected.
- I_equiv = I_s + √(ΣQ_n/C_f)(I_tr − I_s) (C-I3-3), for information.

## Deflection

Δ(x) = ∫₀ᴸ M(ξ) m(x, ξ) dξ / EI, where m(x, ξ) = ξ(L − x)/L for ξ ≤ x and x(L − ξ)/L for ξ > x. M is linear between stations and each interval is integrated exactly (Simpson on the quadratic product). This is exact for point loads, and within 2e-5 for uniform loads on 361 stations.

Shrinkage: Δ_sh = ε_sh E_c A_c e L²/(8 E_s I_tr), with e the distance from the slab centroid to the transformed section's elastic neutral axis.

## Verification

| Gate | Reference | Criterion | Test |
| --- | --- | --- | --- |
| K1 | Design Example I.2 (direct) | every value within its rounding chain | `example_i_2_direct_calculation` |
| K2 | I.2 with its rounded inputs | I_LB, Y_ENA, I_tr, I_equiv, M_n to the printed digits | `example_i_2_with_its_rounded_inputs` |
| K3 | Design Example I.1 (Manual tables) | Q_n, φM_n, I_LB, deflections and stage moments within the table rounding | `example_i_1_against_the_manual_tables` |
| K4 | Independent oracle, five cases | b_eff, A_c, E_c, Q_n, I_tr, ENA, M_n, PNA and I_LB at each slab force to 1e-8; deflections against closed forms | `matches_the_independent_oracle` |
| K5 | Closed forms | wL⁴ and PL³ deflections | `deflection_integration_matches_closed_forms` |
| K6 | Stage separation | each stage's case is used only where it belongs (protocol) | `stage_cases_are_kept_separate` |
