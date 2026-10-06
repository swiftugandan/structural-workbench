# AISC 360-22 composite beam dossier (M17)

Clause reading for the composite beam (ADR 0031), in our own notation, from the held ANSI/AISC 360-22 Chapter I and Commentary (R-CODE-STEEL) and the Design Examples v16 Chapter I (R-STEEL-EXAMPLES). Implementation: `crates/design/src/profile/aisc36022/composite/`.

| Item | Source | Rule as implemented |
| --- | --- | --- |
| Loads by stage | I1; Commentary I3.1b | the steel alone before the concrete reaches 75 % f'c; the total on the composite section after |
| Materials | I1.3 | f'c 3–10 ksi (21–69 MPa) normal weight, 3–6 ksi lightweight; F_y ≤ 75 ksi (525 MPa) |
| Effective width | I3.1a | each side min(L/8, half the distance to the next beam, the edge distance) |
| Construction strength | I3.1b → F2, F3 | M_n = min(M_p, LTB with the engineer's L_b and C_b, FLB for noncompact flanges); slender flanges unsupported |
| Positive flexure | I3.2a(a); Commentary C-I3-6 to C-I3-10 | plastic stress distribution when h/t_w ≤ 3.76√(E/F_y); else unsupported |
| Deck | I3.2c.1(a)–(c) | h_r ≤ 3 in.; w_r ≥ 2 in.; studs ≥ 1½ in. above the deck; ≥ ½ in. cover; ≥ 2 in. of slab above the deck |
| Concrete counted | I3.2c.2, I3.2c.3 | perpendicular: above the deck only; parallel: ribs included |
| Horizontal shear | I3.2d.1 (I3-1a/b/c) | V′ = min(0.85 f'c A_c, F_y A_s, ΣQ_n) |
| Slip capacity | I3.2d.1; Commentary I3.2d.1 | prescriptive: span ≤ 30 ft, ≥ 50 % composite, or ≥ 16 kip/ft, for uniform or equally spaced point loads; otherwise indeterminate |
| Shear | I4.3 → G2.1(a) | the steel section alone |
| Stud diameter | I8.1 | ≤ ¾ in. (≤ 1 in. in a solid slab), ≤ 2.5 t_f unless over the web |
| Stud length | I8.2 | ≥ 4 d_sa |
| Stud strength | I8.2a (I8-1) and table | Q_n = 0.5 A_sa √(f'c E_c) ≤ R_g R_p A_sa F_u |
| Required studs | I8.2c | to develop the moment at the maximum and at each concentrated load, counted to the nearer support |
| Stud spacing | I8.2d(d), (e) | ≥ 4d any direction (6d along the beam unless perpendicular deck); ≤ min(8t, 36 in.) |
| Lower-bound inertia | Commentary C-I3-1, C-I3-2 | as written; ΣQ_n capped at C_f |
| Equivalent inertia | Commentary C-I3-3 | for information only |
| Shrinkage | Commentary I3.2(c), Figure C-I3.2 | Δ_sh = ε_sh E_c A_c e L²/(8 E I_tr); ε_sh 0.02 % when unknown (the engineer's entry) |
| Creep | Commentary I3.2(c) | no method; the engineer's recorded judgement |

## Reconciliation

`fixtures/design/aisc-360-22-lrfd/composite-beam.published.json` records every compared value and the basis of each tolerance.

**I.2:** the example rounds d/2 = 11.95 in. to 12.0 in. and E_c = 3,492 ksi to 3,490 ksi, and prints M_n as "17,000 kip-in." Fed those rounded inputs, the formulas reproduce I_LB = 4,730, Y_ENA = 18.3, I_tr = 6,790 and I_equiv = 5,480. With exact inputs the values differ by those roundings only. Its stud layout (pairs at the ends) is not the uniform layout modelled, so the stud-force comparisons use its ΣQ_n directly.

**I.1:** Q_n (17.2 and 14.6 kips), φM_n (769 kip-ft at ΣQ_n = 386 kips), I_LB (2,520 in.⁴) and the deflections (2.59 in. wet, 1.26 in. live) reproduce the Manual-table values within their rounding.

## Unsupported

- Continuous or cantilevered composite beams (negative flexure).
- Shored construction.
- Slender webs.
- Steel channel anchors.
- The analytical slip-capacity procedures.
- Creep by calculation.
- Composite columns, encased and filled members, collector beams.
