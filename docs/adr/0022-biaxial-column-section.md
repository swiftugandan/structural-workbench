# ADR 0022 — Biaxial RC column section mechanics before a column code profile (M12)

## Status

Accepted for the M12 numerical core (2026-09-29). Formulation: `docs/formulations/rc-column.md`.

## Context

M12 asks for RC columns: a biaxial interaction check at the model's station actions, plus slenderness and minimum eccentricity under a code profile. Like M10, M12 depends on M08. M08's concrete code profile is blocked until EN 1992-1-1 A1:2014 and the UK NA + A2:2014 are held (ADR 0012). The EN 1992-1-1:2004 base text is held. Section 6.1 fixes the shape of the ultimate strain domain (Figure 6.1: pivots A, B and C) but none of its values. Those values, and the design strengths, belong to the code profile.

## Decision

1. **Mechanics first, gated on its own.** `workbench-design::rc_column` computes the section's resultants, its axial range, `M_Rd(N_Ed, θ)` along the demand direction, a utilisation and an interaction contour. Every strain limit (`ε_cu`, the full-compression strain `ε_c`, the optional steel limit `ε_ud`) and every stress (block intensity, parabola peak, `f_y`, `E_s`) is a caller input with provenance. The kernel holds no code value.
2. **Exact integration, no fibres or tables.** The concrete is integrated across the strain gradient on chords of the rectangle. The chord length is piecewise linear, its moments piecewise quadratic, and the stress is constant or `f(1 − u^n)` with `u` linear. The integral is analytic for any real `n`, with a Gauss branch only where the analytic difference would lose digits.
3. **Figure 6.1 domain, parameterised continuously.** One parameter spans pivot A (with `ε_ud`), pivot B and pivot C at each neutral-axis angle. Without `ε_ud` the pure tension resistance is only approached, and `N_Ed = N_t` is refused.
4. **The block as a strain law; bars as discs for the block.** The rectangular block is `σ = intensity` for `ε > (1 − λ)ε_cu`. That is the rc-section block on every pivot-B plane, and it extends to full compression. The block's displaced concrete is taken over the bar's disc, so `N` stays continuous as the block edge crosses a bar. A point rule would add a jump of `A · intensity`. The parabola law keeps the rc-section point rule. Both agree with `rc_section::ultimate` whenever no bar disc straddles the block edge.
5. **Capacity at fixed `N_Ed` along the demand direction.** The solve uses nested bisection: `N`-equilibrium in the domain parameter at each angle, and the angle whose moment points along `θ = atan2(Mz, My)`. Where `N` is not monotone (pivot C, unequal faces), the outermost equal-`N` plane is kept. Where several angles match `θ`, the smallest resistance is returned. `utilisation = |M_Ed| / M_Rd`.
6. **Ray utilisation only where it is defined.** The utilisation is measured from the section centre. When the resistance contour at `N_Ed` does not surround the centre (eccentric reinforcement near the axial limits), the kernel refuses with `UNSUPPORTED_FEATURE` rather than report a misleading ratio. The axial range is the uniform planes'. Eccentric states above the uniform squash load are reported as beyond it.
7. **What stays UNSUPPORTED:** design strengths and partial factors, slenderness and second-order moments, minimum eccentricity, detailing rules and any PASS/FAIL. The M12 parent stays blocked on the M08 resources. The rcColumn draft kind (schema, station actions, UI) is integrated separately and consumes this kernel's mechanics.

8. **Integration (M12-C).** Schema 1.5.0 adds the `rcColumn` draft kind. It
   binds to a member, uses a perimeter bar layout (bars per face along width
   and depth), and carries the rcBeam mechanics law plus `fullCompressionStrain`.
   In model mode, every key station of the bound member for the bound case or
   combination is checked, with `N_Ed = −N_frame` and the frame's `My` and
   `Mz`. The run reports each station's utilisation and the contour at the
   governing `N_Ed`. Stations beyond the axial range are reported, never
   rated. The result is `columnMechanics`, and it never changes the check
   list or `overall`.

## Consequences

- Column previews can show a converged, validated interaction surface and a mechanics utilisation at model actions, while every code check stays UNSUPPORTED.
- When the code profile arrives, it maps its values (`f_cd`, `f_yd`, `ε_cu2`, `ε_c2`, `ε_ud`, `λ`, `η`) into these inputs and adds the slenderness and eccentricity clauses. The mechanics do not change.
- Risk: a user may read the mechanics utilisation as a code check. The mitigations are labelling, no code defaults and a disabled overall status (as ADR 0012).
