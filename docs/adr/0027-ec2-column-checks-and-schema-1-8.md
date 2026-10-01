# ADR 0027 — EC2 column checks, column reinforcement proposal and code inputs for every RC kind (schema 1.8.0)

## Status

Accepted for M12 (2026-10-01). Follows ADR 0026: the column checks are part of the same edition-labelled `ec2-uk-na` demonstration profile.

## Context

M12-COLUMN (ADR 0022) gave rcColumn drafts an exact biaxial section kernel. Its results were mechanics only, with no partial factors, slenderness, imperfections, second-order moments or minimum eccentricity. The M12 parent needs:
- a code check on model forces;
- slenderness and minimum-eccentricity boundaries;
- a reinforcement revision with a traceable report.

The slab and pad footing profiles (M10, M11) need the same exposure, cover and aggregate inputs.

## Decision

1. **Column checks** (`ec2uk/column.rs`, `dossier-column.md`). They run at the bound member for the one bound combination, with N as the largest compression along the member and the end and peak moments from the key stations.
   - **Slenderness:** effective length (5.15)/(5.16) from the engineer's k1, k2 per direction (minimum 0.1), and λ_lim (5.13N) with r_m from the end moments (1 for unbraced members or loads along the member).
   - **Second order:** the imperfection θ_i l0/2 (5.2), nominal curvature (5.8.8), and the minimum eccentricity (6.1(4)).
   - **Biaxial bending:** the imperfection is applied in one direction at a time (5.8.9(2)). Both design moment vectors are checked against the exact M_Rd(N, θ) of the kernel, with the EC2 parabola-rectangle at f_cd, f_yd and the 6.1(5) limit ε_c2. The (5.39) interpolation is never used, so no interpolated surface overstates the verified resistance.
   - **Shear** with σ_cp, and α_cw = 1 per the UK NA.
   - **Detailing:** 9.5.2 (φ_min 12 mm UK, A_s,min, A_s,max), 9.5.3 (link diameter, s_cl,tmax, and the 150 mm restraint rule with only the corner bars restrained by one perimeter link), 8.2 spacing and 4.4.1 cover.
2. **Engineer inputs, never assumed.**
   - Braced or unbraced, k1, k2 per direction, and φ_ef.
   - A missing input leaves the bending checks indeterminate and names it.
   - Without φ_ef, λ_lim uses the code's A = 0.7, but a slender column stays indeterminate because K_φ needs φ_ef.
3. **Run results.** For a bound column on model actions, the run's `checks` become five rows: Axial and biaxial bending; Shear; Longitudinal reinforcement; Links and bar restraint; Cover and spacing. `overall` is the worst status, `codeProfile` is set, and the record and report carry the demonstration label. The section-mechanics pane is unchanged and stays mechanics.
4. **Column proposal.** `evaluateDesignPreview {propose: true}` returns the least longitudinal steel area over:
   - bars: Ø12–40, 2–6 along each face;
   - links: the smallest 8, 10 or 12 mm link meeting 9.5.3(1), at the largest 25 mm multiple within s_cl,tmax;
   - acceptance: no check fails.
   It needs the bending checks evaluated first. Applying it is one undoable command.
5. **Schema 1.8.0.**
   - `codeInputs` is one object for every RC kind. Each field is validated for its kind:
     - exposure, cover and aggregate apply to all kinds;
     - structural system and partitions to beams and slabs, with `flatSlab` for slabs only;
     - the quasi-permanent case to beams;
     - braced, `restraintY`, `restraintZ` and `effectiveCreepRatio` to columns.
   - rcColumn inputs gain `linkSpacing`. 1.7.0 column drafts migrate to 200 mm with synthetic provenance.
   - A 1.7.0 file whose column, slab or footing already carries code inputs, or whose column has a link spacing, is refused.

## Consequences

- The JRC column example is reconciled only where it is self-consistent. Its four publication discrepancies are documented and checked to disagree, never fitted.
- Columns with loads along them and unbraced columns take r_m = 1, which is conservative and the code's instruction.
- The clear height is the node-to-node member length. That is conservative where beams frame in, and is stated in the dossier.
