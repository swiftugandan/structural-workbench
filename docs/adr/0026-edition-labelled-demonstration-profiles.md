# ADR 0026 — Edition-labelled demonstration code profiles, EC2 beam design and reinforcement proposal (schema 1.7.0)

## Status

Accepted for M08 (2026-09-30). This ADR replaces the enablement condition of ADR 0015 and the "never a design result" rule of ADR 0016. ADR 0012's rule that section mechanics are not a code resistance still stands.

## Context

The `ec2-uk-na` beam profile (ADR 0015) was registered disabled. It was built and reconciled against the held texts: EN 1992-1-1:2004 including AC:2008/AC:2010, the UK NA with Amendment 1 (2009), and the JRC worked examples. Enablement waited on A1:2014 and NA+A2:2014, which are not held.

The product owner ruled on 2026-09-30 that a code the workbench does not hold under licence must not block the software. The reasoning is that code providers license more readily once the software is shown to work. Two decisions followed:

- **Texts:** where a code is not held, use Public.Resource.Org copies on the same terms as the EC2 base text. They are local reference only, never redistributed, with rights recorded as contested in `resources.lock.json`.
- **Labels:** every run and report names the exact edition used, lists the amendments not reconciled, and says "Demonstration, not a certified design". Checks still run and give pass or fail.

M08 also requires more than the preview had:

- a validated reinforcement proposal from discrete enumeration;
- serviceability and detailing checks;
- a schedule whose counts and lengths match the geometry;
- unsupported anchorage or serviceability conditions that prevent a complete-design pass.

## Decision

1. **Edition-labelled demonstration profiles.** A profile is enabled when its locked resources verify. For EC2 these are the three `resources.lock.json` ids with SHA-256 hashes, the fixture manifest, and an empty reconciliation failure list, checked at compile time by `verify.rs`. Enablement no longer waits for amendments the project does not hold.
   - `ProfileMetadata` carries `certification` ("Demonstration, not a certified design") and `unreconciledAmendments` for every profile, including `aisc-360-22-lrfd`.
   - The edition is stated exactly: "EN 1992-1-1:2004 incl. AC:2008/AC:2010, UK NA incl. Amd 1 (2009)". The unreconciled amendments are listed as "EN 1992-1-1:2004/A1:2014" and "UK NA + A2:2014".
2. **Detailing and serviceability checks** (`crates/design/src/profile/ec2uk/detailing.rs`). Each check is cited to the held text and verified against JRC89037 or a closed form:
   - 4.4.1 cover, with Δc_dev = 10 mm (UK NA) and Table 4.2 bond cover (+5 mm above 32 mm aggregate).
   - 8.2 clear spacing, with k1 = 1 and k2 = 5 mm (UK NA).
   - 8.4 anchorage length: α2 from c_d, good/poor bond by bar position, and l_b,min. It reproduces JRC Tables 4.1.2–4.1.4 (84 values) to within 1 mm. Anchorage is `pass` only when the engineer confirms the bars extend l_bd; it then carries l_bd as demand, with no resistance or ratio.
   - 7.3.2 minimum crack steel, with kc = 0.4 and k interpolated on h.
   - 7.3.3 crack control without direct calculation. It uses Tables 7.2N/7.3N with the conservative next row, the cracked-section steel stress under the quasi-permanent moment, and UK Table NA.4 w_max = 0.3 mm for RC in every exposure class.
   - 7.4.2 span/depth, from (7.16a/b) with UK Table NA.5 K, the (7.17) 310/σs factor capped at 1.5, the 7/l_eff factor for sensitive partitions over 7 m, and the 40K cap. It reproduces the JRC worked values within the report's truncation (0.1).
   - A check whose input is missing is `indeterminate` and names the input. Nothing is assumed.
3. **Schema 1.7.0.** rcBeam drafts gain optional `codeInputs`: exposure class, c_min,dur (from BS 8500, the engineer's), maximum aggregate size, structural system, sensitive partitions, and the quasi-permanent case or combination.
   - Migration 1.6.0 → 1.7.0 changes the version only. A 1.6.0 file that carries `codeInputs` is refused.
   - `SetDesignPreview` replaces the inputs when sent, clears them on null, and keeps them when omitted.
   - The quasi-permanent My is re-solved at each governing station, on the same side as the station.
4. **The run is a design result.** For an rcBeam in model mode with the profile enabled, the preview's `checks` are the profile's six rows and `overall` is their worst status (fail > unsupported > indeterminate > pass).
   - Every run carries `codeProfile` with the edition, amendments and certification label.
   - The UI and the calculation record show a DEMONSTRATION banner with the same three facts.
   - A run without code inputs or anchorage confirmation is INDETERMINATE, never PASS.
   - Synthetic-source runs keep the unsupported rows, because no model actions means no code result.
5. **Reinforcement proposal.** `evaluateDesignPreview {propose: true}` enumerates discrete arrangements:
   - **Search space:** Ø10–32 bars (BS 8666 preferred sizes), 2–8 per face, and Ø8–12 links at 75–300 mm in 25 mm steps.
   - **Held fixed:** the draft's width, depth, cover, link legs, materials, code inputs and anchorage confirmation.
   - **Selection:** the least steel mass per metre such that no check fails at any governing station.
   - **Search order:** with vertical links, V_Rd = V_Rd,s (6.2.3), which does not depend on the longitudinal bars. So for each link size the lightest longitudinal pair is found at the densest spacing, and the spacing is then opened to the widest that still passes.
   - **Explicit request:** the search evaluates about a hundred to a few thousand arrangements, so it runs only on request, never on every run.
   - **Indeterminate checks:** they do not block a proposal and are listed with it.
   - **Applying it:** one undoable `SetDesignPreview`, after which the run is stale until analysed and rerun.
6. **Indicative schedule.** It lists straight top and bottom bars over the member length less (cover + link) at each end, and closed links with 135° hooks, cut length 2(A + B) + 2 max(5φ, 50 mm) (Figure 8.5), one per two legs. Links start 50 mm from each end at the draft spacing. An odd leg count adds an open link. Mass is at 7850 kg/m³. An unbound draft gives quantities only. BS 8666 shape codes are not held, so the schedule is labelled "Not a fabrication schedule". Curtailment and laps remain the engineer's.

## Consequences

- Files written by this build need a 1.7.0-aware reader.
- Every surface that shows an EC2 result shows the edition, the unreconciled amendments and "Demonstration, not a certified design". A current-UK or certified claim still requires A1:2014 and NA+A2:2014 to be reconciled, and that remains recorded as not done.
- The same pattern applies to later profiles, including slabs, footings, columns, detailing, prestress and AISC connections. Each is enabled from the text held and labelled with it, never from memory.
- Out of scope, reported as limitations: redistribution (5.5), direct crack-width calculation (7.3.4), deflection by calculation (7.4.3), torsion, flanged sections, curtailment, and laps.
