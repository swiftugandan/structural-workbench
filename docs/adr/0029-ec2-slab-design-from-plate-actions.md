# ADR 0029 — EC2 slab design from plate-v1 element actions

## Status

Accepted for M10 (2026-10-02). It is part of the edition-labelled `ec2-uk-na` demonstration (ADR 0026), on top of the accepted plate-v1 family (ADR 0021).

## Context

M10 needs a restricted reinforcement map under one code profile, and that map must distinguish averaged display values from design actions. The plate-v1 kernel already returns:
- unsmoothed element-centre moments and shears;
- Wood–Armer design moments;
- column reactions.

## Decision

1. **Design actions.** The design actions are the element-centre values: Wood–Armer moments for the four faces, and q_x, q_y. They are never averaged or smoothed. The A_s,req map is the per-element design value, and the contour shows exactly those values.
2. **Meshes.** One uniform mesh per layer: bottom X outer, bottom Y inner, top X outer, top Y inner. Each is the least-area Ø10–25 mesh at 75–400 mm that:
   - covers the largest element A_s,req (3.1.7(3) block per metre width);
   - meets A_s,min (9.3.1.1 → 9.2.1.1);
   - stays within the spacing limits (UK NA 9.3.1.1(3): min(3h, 400 mm), and 8.2).
   A layer with no moment anywhere is not provided.
3. **One-way shear** (6.2.2) uses the element shears, with ρ_l the smaller of the two faces' meshes, which is conservative.
4. **Span/depth** (7.4.2, UK Table NA.5) uses the engineer's structural system, with the (7.17) factor (500/f_yk)(A_s,prov/A_s,req) ≤ 1.5. Flat slabs (K = 1.2) take the longer span, and all others the shorter. The bottom mesh in that direction gives ρ and the (7.17) factor. Sensitive partitions apply 7/l (8.5/l for flat slabs).
5. **Punching** (6.4) at each internal column, from its plate reaction:
   - β from UK NA 6.4.3(6) (1.15, 1.4, 1.5);
   - u1 = 2(c_x + c_y) + 4πd, with the engineer's column size;
   - v_Rd,c from the top meshes (6.47);
   - the face check at 0.5 ν f_cd and the UK limit 2 v_Rd,c at u1;
   - where v_Ed > v_Rd,c, the (6.52) reinforcement per perimeter at s_r = 0.75d up to u_out,ef, with the outer perimeter at 1.5d inside it.

   Edge and corner columns, columns in uplift, and columns within 6d of the opening, report unsupported: the reduced perimeters of Figures 6.14/6.15/6.20 are not implemented.
6. **Schema.** The slab `codeInputs` gain `columnSize`, and `structuralSystem` gains `flatSlab` (still 1.8.0, unreleased).
7. **Run results.**
   - The slab run's `checks` become six rows: Bottom X/Y reinforcement, Top X/Y reinforcement, Shear, Punching, Deflection, Cover.
   - The schedule lists the uniform meshes; the opening is not deducted, and the schedule is indicative.
   - The report adds the meshes and the checks.

## Consequences

- The JRC 3.2.2.3 punching example reconciles. Its v_Rd,max of 0.4 ν f_cd and its rounded stresses are documented.
- Smoothed (nodal-average) moments are offered as a display option on mx, my and mxy only (ADR 0021 item 3); the steel maps and every design value stay element-centre.
- Uniform meshes are conservative where demand is local, such as hogging over columns. The map shows where top steel is needed, so the engineer can curtail it; the schedule does not.
