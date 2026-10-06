# AISC 360-22 connection dossier (M13)

Clause reading for the single-plate shear connection (ADR 0030). Formulas are in our own notation, read from the held ANSI/AISC 360-22 (R-CODE-STEEL) and the AISC Companion Design Examples v16 (R-STEEL-EXAMPLES, Part II.A). Implementation: `crates/design/src/profile/aisc36022/connection/`.

| Item | Source | Rule as implemented |
| --- | --- | --- |
| Hole size | Table J3.3 / J3.3M | standard holes: 9/16 … 1-1/8 in., d + 1/8 in. from 1-1/8 in.; M12–M30 tabulated, d + 3 mm from M36 |
| Net hole | B4.3b | hole + 1/16 in. (2 mm) for tension and shear net areas |
| Minimum spacing | J3.4 | centres ≥ 2⅔ d and clear distance ≥ d |
| Minimum edge | J3.5, Table J3.4 / J3.4M, footnote (a) | below the table value only down to d, with J3.11 and J4 checked on the actual distances |
| Maximum edge, spacing | J3.6 | edge ≤ 12 t ≤ 6 in. (150 mm); pitch ≤ 24 t_thinner ≤ 12 in. (300 mm) |
| Bolt shear | J3.7, Table J3.2 | φ = 0.75, R_n = F_nv A_b; F_nv 54/68 ksi (Group 120 N/X), 68/84 ksi (Group 150); 370/470 and 470/580 MPa metric |
| Bearing and tearout | J3.11a(1) | φ = 0.75; 2.4 d t F_u and 1.2 l_c t F_u when hole deformation at service load is a design consideration, else 3.0 and 1.5 |
| Group strength | J3.7 User Note; Design Example II.A-17A | sum of the effective bolt strengths, scaled by C/n for eccentricity |
| Eccentric bolt group | Crawford & Kulak (1971); method named in the J2.4 and J3.7 User Notes | ICR, R = R_ult(1 − e^(−10Δ))^0.55, Δ_max = 0.34 in. |
| Fillet weld strength | J2.4 (J2-4), Table J2.5 | φ = 0.75, F_nw = 0.60 F_EXX, A_we = 0.707 w l per fillet, k_ds = 1.0 (eccentric group: J2.4(a)(3)) |
| Fillet minimum size | J2.2b(a), Table J2.4 | by the thinner part: 1/8, 3/16, 1/4, 5/16 in. (3, 5, 6, 8 mm) |
| Fillet minimum length | J2.2b(c) | l ≥ 4 w |
| Weld develops plate | Manual Part 10 as in Design Examples II.A-17B, II.A-19A | w ≥ 5/8 t_p, both sides |
| Support thickness | Manual Eq. 9-6 as in II.A-17A, II.A-18, II.A-19A | t_min = 3.09 D/F_u (D in sixteenths, F_u in ksi), plate on one side |
| Tension yielding / rupture | J4.1 (J4-1, J4-2), D3 | φ = 0.90 / 0.75; plate U = 1 (Table D3.1 case 1); beam U = connected web area / A_g (II.A-17B) |
| Shear yielding / rupture | J4.2 (J4-3, J4-4) | φ = 1.00 / 0.75 |
| Block shear | J4.3 (J4-5) | U_bs = 1, or 0.5 for nonuniform tension across two lines (II.A-19A) |
| Plate flexure | J4.5 → F11.1, F11.2 | M_n = F_y Z ≤ 1.5 F_y S; LTB by (F11-3)/(F11-4) with L_b = a and C_b = 1.84 (Manual Part 10 as in II.A-17B, II.A-19A) |
| Flexural rupture | Manual Eq. 9-8 as in II.A-17B | M_n = F_u Z_net, φ = 0.75 |
| Plate interactions | Manual Eqs. 10-8, 12-1, 12-2, 12-3 as in II.A-17B, II.A-19A | see `docs/formulations/connection.md` |
| Plate ductility | Manual Eqs. 10-6, 10-7 as in II.A-19A | t_p ≤ 6 M_max/(F_y l²), M_max = (F_nv/0.90) A_b C′ |

## Reconciliation

`fixtures/design/aisc-360-22-lrfd/connection-single-plate.published.json` records every compared value, its tolerance and the basis of each tolerance wider than half a unit of the last published digit. The basis is always a published value computed from intermediates the example rounded first.

**II.A-17A** reconciles per bolt (17.9, 12.4, 22.0, 33.4 kips), in plate shear (86.4, 58.5 kips), in block shear areas and strength, in t_min, and with C = 3.54 at e = 1.5 in. Two differences:
- the example truncates the block shear A_nv (1.797 → 1.79 in.²);
- by the general method (e = a = 3 in., C = 2.81) the bolt group gives 46.4 kips < 49.6 kips, where the conventional configuration passes.

**II.A-17B** reconciles every published limit state: bolt shear and web tearout and bearing; support rupture; plate shear, tension, flexure (Z, S, M_n, L_b d/t²), rupture and both interactions; block shear in both directions with its interaction; and the beam checks. Two differences:
- C at the actual 38.7° (4.0596) is 0.05 % below the example's "conservative" 30° value (4.0618; C has a shallow minimum near 40° for this group);
- the plate ductility limit, which the example does not evaluate, fails (t_max = 0.37 in.).

**II.A-19A** (two lines, column web) reconciles per bolt, in M_max and t_max, in plate shear, block shear, flexure (with LTB), the interaction (0.200), Z_net and t_min, and with C = 2.33. One difference: Z_net from the hole geometry is 12.75 in.³, against the 12.8 in.³ the example reads from Manual Table 15-2.

## Unsupported

- Coped beams (Manual Part 9 coped-section flexure and local buckling are not held).
- Slotted and oversized holes, and slip-critical bolts.
- The Manual Table 10-9 conventional configuration.
- Moment through the end, axial compression, minor-axis actions and torsion.
- Other connection families.
