# EC2 slab dossier (M10)

Clause reading for the `ec2-uk-na` slab design (ADR 0029). These are formulas in our own notation; every row is `A1/A2: unreconciled`. Implementation: `crates/design/src/profile/ec2uk/slab.rs`.

| Item | Clause | Rule | UK NA |
| --- | --- | --- | --- |
| Design actions | 5.1 (plate-v1, ADR 0021) | element-centre Wood–Armer moments and shears, unsmoothed | — |
| Flexure per metre | 6.1, 3.1.7(3) | M = A f_yd (d − 0.4x), x = A f_yd/(0.8 f_cd) | α_cc = 0.85 |
| Minimum steel | 9.3.1.1(1) → 9.2.1.1(1) | max(0.26 f_ctm/f_yk, 0.0013) d per metre | recommended |
| Maximum spacing | 9.3.1.1(3) | min(3h, 400 mm) for both directions (the principal value, conservative for secondary) | as recommended |
| Clear spacing | 8.2(2) | ≥ max(φ, d_g + 5 mm, 20 mm) | k1 = 1, k2 = 5 mm |
| Shear | 6.2.2(1) | v_Ed per element ≤ V_Rd,c per metre, ρ_l from the weaker face | recommended |
| Span/depth | 7.4.2 | (7.16) with K, × min((500/f_yk) A_s,prov/A_s,req, 1.5) (310/σ_s, (7.17)), × 7/l (flat slab 8.5/l) for sensitive partitions, ≤ 40K | Table NA.5: K = 1.0 simply supported, 1.3 end span, 1.5 interior, 1.2 flat slab, 0.4 cantilever |
| Punching force | 6.4.3 | the column's plate reaction F_z (up); a column in uplift is unsupported, never punched with abs(V) | — |
| Punching β | 6.4.3(6) | approximate β | 1.15 internal, 1.4 edge, 1.5 corner |
| Punching resistance | 6.4.4(1), (6.47) | v_Rd,c = C_Rd,c k (100 ρ f_ck)^(1/3) ≥ v_min, ρ = √(ρ_x ρ_y) of the top meshes | k1 = 0.1 |
| Punching at the face | 6.4.5(3) | β V/(u0 d) ≤ 0.5 ν f_cd | 0.5 ν f_cd |
| Punching limit | UK NA 6.4.5(3) | v_Ed ≤ 2 v_Rd,c at u1 | UK addition |
| Punching reinforcement | 6.4.5(1), (6.52) | A_sw = (v_Ed − 0.75 v_Rd,c) u1 s_r/(1.5 f_ywd,ef), s_r = 0.75d, f_ywd,ef = 250 + 0.25d ≤ f_ywd; u_out,ef = β V/(v_Rd,c d), outer perimeter 1.5d inside | k = 1.5 |
| Cover | 4.4.1 | as for beams | Δc_dev = 10 mm |

## Verification

- JRC89037 3.2.2.3 (column B2) reconciles: d, u1, v_Ed (u1), v_Rd,c, v_min, v_Ed (u0), f_ywd,ef, s_r, A_sw, u_out and a_out.
- Two discrepancies are documented:
  - the report's 0.4 ν f_cd face limit;
  - A_sw and u_out computed from its rounded stresses.
- The mesh choice, span/depth and shear are hand-checked in `slab_tests.rs`. The plate results are from the accepted plate-v1 family (`plate_oracle.py`).

## Unsupported

- Edge and corner columns, and the reduced perimeters near openings (6.4.2(3), Figures 6.14/6.15/6.20).
- Crack control by calculation, and curtailment of top steel.
- Trimming bars at the opening, and flat slab column strips.
