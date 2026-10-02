# EC2 pad footing dossier (M11)

Clause reading for the `ec2-uk-na` pad footing design (ADR 0028). These are formulas in our own notation; no standard prose is reproduced. Every row is `A1/A2: unreconciled` (see [dossier-beam.md](dossier-beam.md)). Implementation: `crates/design/src/profile/ec2uk/footing.rs`.

## Actions and contact

- **Actions.** The column actions are the bound support's reaction reversed, in global axes, for the one bound case or combination. A concentric column of c_x × c_y is assumed.
- **Contact.** The rigid base on tensionless ground ([formulations/footing.md](../../formulations/footing.md)) carries:
  - for structural design, the column actions alone (the base self-weight and overburden are uniform and carried by their own reaction, so they do not bend the base);
  - for the bearing check, the engineer's bearing case or combination, plus the base self-weight (25 kN/m³, EN 1991-1-1 Table A.1) and the overburden γ_soil (embedment − h)(A − c_x c_y).
- **Bearing.** q_max is compared with the allowable bearing input. The workbench never computes ground resistance (EN 1997 is not held).

## Structural checks

| Item | Clause | Rule | UK NA |
| --- | --- | --- | --- |
| Face bending | 6.1 | M = ∫q (u − a/2) beyond each column face over the full width; A_s from the 3.1.7(3) block (λ = 0.8, η = 1) with b = the base width | α_cc = 0.85 |
| Tie force | 9.8.2.2(2), (3), (9.13) | F_s(x) = R(x) z_e/z_i, with R the ground force within x of an edge, z_e from its centroid to N at e = 0.15a inside the face, z_i = 0.9d; A_s ≥ F_s,max/f_yd | — |
| Straight anchorage | 9.8.2.2(5), 8.4 | l_bd F_s(x_min)/(A_s f_yd) + c_nom ≤ x_min = h/2 (good bond, α2 from c_d) | α_ct = 1.0 |
| Minimum steel | 9.3.1.1(1) → 9.2.1.1(1) | max(0.26 f_ctm/f_yk, 0.0013) b d | recommended |
| Spacing | 9.3.1.1(3) | principal bars ≤ min(3h, 400 mm); clear gap 8.2(2) | UK NA 9.3.1.1(3) |
| Bar size | 9.8.2.1(1) | φ ≥ φ_min | 8 mm (recommended) |
| One-way shear | 6.2.2(1) | ground force beyond d from each face ≤ V_Rd,c with ρ_l of the designed bars | recommended C_Rd,c, v_min |
| Punching | 6.4.4(2), (6.48)–(6.51) | at a ∈ (0, 2d] (80 perimeters): V_Ed,red = N − ΔV with ΔV the ground force inside the perimeter; v_Ed = V_Ed,red/(u d) · [1 + Σ k M u/(V_Ed,red W)] in each direction, with W = c1²/2 + c1c2 + 2c2a + 4a² + π a c1 and k from Table 6.1; v_Rd = C_Rd,c k (100 ρ f_ck)^(1/3) 2d/a ≥ v_min 2d/a with ρ = √(ρ_x ρ_y) | recommended |
| Punching at the face | 6.4.5(3) | β N/(u0 d) ≤ 0.5 ν f_cd, ν = 0.6(1 − f_ck/250) | V_Rd,max = 0.5 ν f_cd |
| Cover | 4.4.1.2, 4.4.1.3(4) | c_nom as for beams, and ≥ 40 mm on blinding or 75 mm directly against the ground | k1 = 40 mm, k2 = 75 mm |

**Bar sizing per direction.** The bottom x bars are the lower layer; the y bars sit on them. The design takes the least A_s over Ø10–32 bars that:
- covers the largest of face bending, the tie force and A_s,min;
- stays within the spacing limits;
- anchors straight at h/2.

If no size does all three, the direction fails and the base must be deepened or enlarged.

## Verification

- The JRC89037 4.2.1 footing B-2 reconciles from the report's own σ'_Ed = 1418 kN/m² and z_i = 662 mm: F_s,max = 1457.9 kN, A_s = 3353 mm², F_s(h/2) = 1071.0 kN and l_b = 360 mm.
- Two discrepancies are documented:
  - The report deducts self-weight from a pressure that excludes it.
  - Its "400 mm ≤ 400 mm" anchorage is 400.3 mm unrounded.
- A concentric pad is hand-checked: face moment, tie force, shear at d, the punching v_Ed at the critical perimeter, and bearing with self-weight and overburden.

## Unsupported

- Eccentric columns on the base, stepped or sloped bases, and top reinforcement for uplift (9.8.2.1(3)).
- Punching shear reinforcement, and pile caps (9.8.1).
- Ground resistance and settlement (EN 1997).
- Combined footings.
