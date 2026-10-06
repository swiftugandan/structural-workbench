# ADR 0030 — Single-plate shear connection under AISC 360-22 LRFD (M13)

## Status

Accepted for M13 (2026-10-06). It follows ADR 0026: the connection is part of the edition-labelled `aisc-360-22-lrfd` demonstration, enabled because its locked resources verify.

## Context

M13 asks for one finite, named connection family. A user transfers beam and column actions to the connection, checks plates, bolts and welds, and exports a dimensioned drawing and a bill of materials. The specification also requires:

- force equilibrium of the connection;
- every applicable failure mode;
- unsupported moment-transfer conditions stated clearly;
- independent worked examples;
- exact drawing and report dimensions.

The held texts are ANSI/AISC 360-22 (R-CODE-STEEL) and the AISC Companion Design Examples v16 (R-STEEL-EXAMPLES), whose Part II.A works single-plate connections. The Steel Construction Manual itself is not held: neither the Table 10-9 conventional configuration, the Table 7-6/7-7 coefficients nor Part 9's coped-beam procedure. R-CONNECTION-CODE and R-CONNECTION-EXAMPLES therefore resolve to these two held documents, scoped to Chapter J and Part II.A.

## Decision

1. **Family.** A single plate (shear tab, fin plate) shop-welded with two fillet welds to a column flange, column web or girder web, field-bolted to an **uncoped** W beam web.
   - One or two vertical bolt lines, 2–12 rows, standard holes, bearing-type, snug-tight.
   - Group 120 or 150 bolts in the US customary sizes of Tables J3.3/J3.4, or the metric sizes of Tables J3.3M/J3.4M.
   - LRFD only, as the rest of the profile.
2. **General method everywhere.** The conventional configuration of Manual Table 10-9 is not held, so every connection is checked by the general (extended-configuration) procedure that Design Examples II.A-17B and II.A-19A apply:
   - the bolt group carries V at e = a + (gauge/2 for two lines), measured from the support;
   - the plate is checked in flexure at the bolt line nearest the support for V·a.

   The consequence is conservative and stated: II.A-17A, which the Manual's conventional rules accept with e = a/2, fails the bolt group here (φR_n = 46.4 kips < 49.6 kips). II.A-17B fails the plate ductility limit, which its Part 12 procedure never evaluates.
3. **Bolt group.** The instantaneous centre of rotation with the Crawford–Kulak relation R = R_ult(1 − e^(−10Δ))^0.55, Δ_max = 0.34 in. The Specification's User Notes to J2.4 and J3.7 name the method; the tables built from it are not held.
   - The solver uses signed vector equilibrium about a trial centre: damped Newton from the elastic centre, then multiples of it.
   - A centre running off to infinity is rejected. That is the pure-translation asymptote, whose residual also tends to zero.
   - If no centre is found, the bolt group is reported unsupported, never estimated.
   - Each bolt's effective strength is the least of bolt shear (J3.7), and bearing and tearout (J3.11a) in the plate and the beam web. The group strength is φR_n = (C/n) Σ φr_n,i (Design Example II.A-17A).
   - Tearout runs in the direction of the beam reaction (for uplift, the edges reverse). Toward a flange of the uncoped web there is no free edge (II.A-19A). Under tension the shorter of the vertical and horizontal clear distances is taken (II.A-17B), and the beam edge is reduced by the entered length underrun.
4. **Limit states.**
   - **Plate:** shear yielding and rupture (J4.2); block shear (J4.3, U_bs = 0.5 across two lines); flexural yielding and lateral-torsional buckling (F11 with L_b = a, C_b = 1.84); flexural rupture on Z_net computed from the hole geometry (Manual Eq. 9-8); and the shear–flexure(–axial) interaction (Manual Eqs. 10-8, 12-2, 12-3).
   - **Plate ductility:** t_p ≤ t_max = 6 M_max/(F_y l²) with M_max = (F_nv/0.90) A_b C′ (Manual Eqs. 10-6, 10-7), C′ from the same solver.
   - **Under tension:** plate yielding and rupture (J4.1); L- and U-shaped block shear with the shear–tension interaction (Manual Eq. 12-1); the rupture interaction; beam yielding, rupture with U from D3, and block shear.
   - **Welds:** two fillets of at least 5/8 t_p, which develop the plate (Manual Part 10); Table J2.4 minimum; length ≥ 4w; strength by J2.4 with k_ds = 1.0, because the group is not loaded through its centroid.
   - **Support:** shear rupture along both weld lines (J4.2(b)), and the matching thickness of Manual Eq. 9-6.
   - **Beam web:** shear yielding (J4.2(a)).
   - **Detailing:**
     - spacing (J3.4, J3.6(a));
     - edge distances (Table J3.4; footnote (a) permits lesser edges down to d because J3.11 and J4 are checked with the actual distances);
     - maximum edges of 12t ≤ 6 in. (J3.6);
     - the plate within the beam's flat web (k_des);
     - the beam end clearing the support, or a column web's flange tips.
5. **Unsupported, never passed:**
   - a major-axis moment carried through the end (the analysis must release it);
   - axial compression (J4.4 needs an effective length the held texts do not give for single plates);
   - minor-axis shear or moment, and torsion;
   - a beam not confirmed braced against rotation, whose interactions are indeterminate, or unsupported when it is declared free.
6. **Model link and schema 1.9.0.**
   - A `singlePlate` draft binds to a member (the beam). Its `connection` block names:
     - the end;
     - the supporting member, which must meet the beam at that end;
     - the support kind, bolt, group and thread condition;
     - the bearing-deformation choice;
     - the rotation-bracing confirmation.
   - The numeric geometry is in `inputs`.
   - The demand is the member's exact end actions for the chosen case or combination. V (along local y) is positive when the beam bears down on the support, and N is positive in tension. The beam and support sections come from their catalogue W sections; the catalogue subset now carries k_des and T (regenerated from the held Shapes Database by `tools/extract-aisc-shapes.py`).
7. **Outputs.** Rust emits:
   - the limit states;
   - the free body (bolt group, bolt line, support face, reaction);
   - the drawing geometry with every dimension value;
   - the bill of materials (plate, bolts and welds; bolt lengths are the fabricator's).

   The browser only draws and formats them. The calculation record carries the drawing, the checks and the bill.

## Consequences

- The general method rejects some connections the Manual's conventional configuration would accept. Holding Manual Part 10 (Table 10-9) would allow that configuration as a separate, verified path.
- Coped beams, slotted or oversized holes, slip-critical bolts, double angles, end plates and base plates are separate families, each with its own gate (SPECIFICATION M13).
- Verification:
  - published C values from six examples, reproduced by interpolating the solver on the table grid;
  - II.A-17A, II.A-17B and II.A-19A limit-state values, with each rounding chain and discrepancy recorded in `fixtures/design/aisc-360-22-lrfd/connection-single-plate.published.json`;
  - an independent oracle (`tools/oracles/connection_oracle.py`: grid seed plus Nelder–Mead centre, every limit state recoded), to 1e-8.
