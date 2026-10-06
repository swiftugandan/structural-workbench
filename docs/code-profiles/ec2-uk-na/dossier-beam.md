# EC2 beam dossier: flexure, shear, reinforcement limits (M08-B1)

Code-rule dossier for the `ec2-uk-na` concrete profile (ADR 0012, M08-B). Since ADR 0026 the profile is **enabled as an edition-labelled demonstration** of the held texts, and every run says "Demonstration, not a certified design". This file gives clause references, formulas in our own notation, parameters and their provenance. No standard prose is reproduced.

## Sources and amendment state

| Resource | Content | SHA-256 |
| --- | --- | --- |
| `R-EC2-EN-1992-1-1-2004` | EN 1992-1-1:2004 incorporating AC:2008 and AC:2010 | `c490fc60…` |
| `R-EC2-UK-NA-2009` | NA to BS EN 1992-1-1:2004 incorporating NA Amendment No. 1 (2009); Table NA.1 relates to the text incorporating Corrigendum No. 1 | `11ced864…` |
| `R-EC2-JRC-EXAMPLES` | JRC89037 (2014) worked examples; uses EU recommended NDPs, not the UK NA | `06f61063…` |

**Not held:** EN 1992-1-1:2004/**A1:2014** and the UK **NA+A2:2014**. Every row below is marked `A1/A2: unreconciled`. Until those texts are read, it is unknown whether any of these clauses or NDPs changed. A current-UK or certified claim cannot be made until each row is reconciled (blocker `UKR01-EC-resources`). The demonstration profile names both amendments as unreconciled on every run (ADR 0026).

## Units and conventions

- SI inside the kernel (N, m, Pa). Expressions whose code form uses MPa or mm are shown in those units and marked as such.
- Sagging and hogging, face convention and moment signs follow ADR 0014. The compression face and the tension layers are mapped per state as in `preview_workspace::section_mechanics`.
- `d` is the depth of the tension steel centroid from the compression face. `b` is the compression-zone width for flexure. `b_w` is the minimum web width in the tension area for shear.

## Materials (3.1, 3.2, 2.4.2.4)

| Item | Clause | Rule | EU recommended | UK NA 2009 |
| --- | --- | --- | --- | --- |
| γc, γs (persistent/transient) | 2.4.2.4(1), Table 2.1N | material partial factors | 1.5, 1.15 | recommended values |
| γc, γs (accidental) | 2.4.2.4(1), Table 2.1N | | 1.2, 1.0 | recommended values |
| Strength classes | 3.1.2, Table 3.1 | fck, fctm, fctk,0.05, Ecm, εc2, εcu2, n, εc3, εcu3 by class. Analytical relations for fck > 50 MPa are given in the table | — | Cmax = C90/105. **Shear strength of classes above C50/60 limited to C50/60** unless justified by tests or past performance |
| fcd | 3.1.6(1)P, (3.15) | αcc·fck/γc | αcc = 1.0 | **αcc = 0.85 for compression in flexure and axial load, 1.0 for other phenomena.** 0.85 may be used for all |
| fctd | 3.1.6(2)P, (3.16) | αct·fctk,0.05/γc | αct = 1.0 | recommended value |
| Parabola-rectangle | 3.1.7(1), (3.17)/(3.18) | σc = fcd[1 − (1 − εc/εc2)^n] for 0 ≤ εc ≤ εc2, else fcd up to εcu2 | — | — |
| Rectangular block | 3.1.7(3), (3.19)–(3.22), Fig. 3.5 | depth λx, stress η·fcd, strain limit εcu3. λ = 0.8 and η = 1.0 for fck ≤ 50. λ = 0.8 − (fck − 50)/400 and η = 1.0 − (fck − 50)/200 for 50 < fck ≤ 90. Reduce η·fcd by 10 % if the compression width decreases towards the extreme fibre | — | — |
| Steel design law | 3.2.7(2) | (a) inclined top branch to εud, or (b) horizontal top branch at fyd = fyk/γs with no strain check | εud = 0.9εuk | recommended value; fyk ≤ 600 MPa (3.2.2(3)P) |
| Es | 3.2.7(4) | 200 GPa | — | — |

## Flexure (6.1)

- **Assumptions, 6.1(2)P:** plane sections, perfect bond, concrete tension ignored, concrete law per 3.1.7, steel per 3.2.7. **Strain limit, 6.1(3)P:** εcu2 or εcu3 to match the concrete law, and εud for steel where applicable.
- **Kernel mapping (no mechanics change, ADR 0012):**
  - `ConcreteLaw::ParabolaRectangle{peak: fcd, strainAtPeak: εc2, ultimateStrain: εcu2, exponent: n}`
  - `ConcreteLaw::RectangularBlock{intensity: η·fcd, depthRatio: λ, ultimateStrain: εcu3}`
  - `SteelLaw{yield_strength: fyk/γs, modulus: 200 GPa}`. This is 3.2.7(2)(b), which needs no strain check. Option (a) is **unsupported**.
  - M_Rd is `rc_section::ultimate(...).moment` for the state's compression face.
- **Verified:** `crates/design/tests/ec2_jrc_kernel.rs`. With the example's own parameters, the kernel returns the JRC M_Ed at the JRC A_s,req for the midspan (89.3 kN·m) and support B (132.9 kN·m) sections, with yielding tension steel.
- **Applicability predicates the profile must check and report:**
  - N = 0. Axial load is unsupported, so the 6.1(4) minimum eccentricity does not arise.
  - The section is rectangular. A flanged section may be treated as a rectangle of the flange width only while λx ≤ h_f, and it must be reported when used.
  - fck ≤ 50 MPa is the only range reconciled against an example. The high-strength branches are transcribed but have no example yet.
- **Not in 6.1 but required nearby:** 5.6.3 limits on x/d for plastic rotation are not needed for a linear-elastic analysis without redistribution, which is the only kind the workbench performs. Redistribution (5.5) is **unsupported**.

## Shear (6.2)

- **6.2.1(3)–(8):**
  - No calculated shear reinforcement is needed where V_Ed ≤ V_Rd,c, but the 9.2.2 minimum still applies (6.2.1(4)).
  - For predominantly uniformly distributed load, V_Ed may be taken at d from the support face, but V_Rd,max must be satisfied at the support (6.2.1(8)).
  - The shift rule and the additional tensile force follow 6.2.2(5), 6.2.3(7) and 9.2.1.3(2).
- **6.2.2(1), members without design shear reinforcement:**
  - V_Rd,c = [C_Rd,c·k·(100·ρl·fck)^(1/3) + k1·σcp]·bw·d (6.2.a), with a minimum of (v_min + k1·σcp)·bw·d (6.2.b). This is in MPa and mm units.
  - k = 1 + √(200/d) ≤ 2.0, with d in mm.
  - ρl = Asl/(bw·d) ≤ 0.02. Asl counts only if it extends at least l_bd + d beyond the section (Fig. 6.3).
  - σcp = N_Ed/A_c < 0.2·fcd, compression positive.
  - NDPs: C_Rd,c = 0.18/γc, v_min = 0.035·k^(3/2)·fck^(1/2), k1 = 0.15. These are the EU recommended values, adopted by the UK. For classes above C50/60, the UK Cmax note applies.
- **6.2.2(6):** for loads applied on the upper side between 0.5d and 2d from a support, β = a_v/(2d) may reduce the shear used in (6.2.a), provided the longitudinal steel is fully anchored. Unreduced V_Ed ≤ 0.5·bw·d·ν·fcd (6.5), with ν = 0.6(1 − fck/250) (6.6N) in both the EU and UK sets.
- **6.2.3, members with shear reinforcement (vertical links, α = 90°):**
  - V_Rd,s = (Asw/s)·z·fywd·cot θ (6.8).
  - V_Rd,max = αcw·bw·z·ν1·fcd/(cot θ + tan θ) (6.9).
  - z ≈ 0.9d for reinforced concrete without axial force (6.2.3(1)).
  - cot θ limits (6.2.3(2)): 1 ≤ cot θ ≤ 2.5 (EU, UK). The UK uses cot θ = 1.25 where shear coexists with externally applied tension (NA amendment 1).
  - ν1 (6.2.3(3)): EU uses ν1 = ν. The UK uses ν1 = ν(1 − 0.5 cos α), which equals ν for vertical links. Where the link design stress is below 0.8·fyk, the UK allows ν1 = 0.54(1 − 0.5 cos α) for fck ≤ 60, and (0.84 − fck/200)(1 − 0.5 cos α) > 0.5 for fck ≥ 60. The EU Note 2 gives 0.6 and 0.9 − fck/200 > 0.5. If (6.10) is used, fywd is reduced to 0.8·fywk in (6.8).
  - αcw = 1 for non-prestressed members (EU and UK).
  - Asw,max for cot θ = 1: Asw,max·fywd/(bw·s) ≤ ½·αcw·ν1·fcd (6.12).
  - Inclined links (6.13)–(6.15) are **unsupported** in the first profile.
- **Verified:** `tools/oracles/ec2_beam_oracle.py` reproduces every JRC support-A shear figure within published rounding: V_Ed,red, C_Rd,c, k, ρl, V_Rd,c, required a_sw, a_sw,min, s_l,max, ν and V_Rd,max. The published provided link area (339 mm²/m) is a publication error: 2 × 6 mm at 175 mm gives 323.1 mm²/m.

## Detailing companions (9.2)

| Item | Clause | EU recommended | UK NA 2009 |
| --- | --- | --- | --- |
| As,min (beams) | 9.2.1.1(1) | 0.26·(fctm/fyk)·bt·d ≥ 0.0013·bt·d. bt is the mean tension-zone width (web only for a T-beam with the flange in compression) | recommended value |
| Below As,min | 9.2.1.1(2) | the section is treated as unreinforced (Section 12, **unsupported**) | — |
| As,max | 9.2.1.1(3) | 0.04·Ac, tension or compression, outside laps | recommended value |
| Support partial fixity | 9.2.1.2(1) | β1 = 0.15 | **β1 = 0.25** |
| Compression bars in resistance | 9.2.1.2(3) | held by links at ≤ 15φ | — |
| Links share of shear steel | 9.2.2(4) | β3 = 0.5 | recommended value |
| ρw,min | 9.2.2(5), (9.4)/(9.5N) | ρw = Asw/(s·bw·sin α) ≥ 0.08·√fck/fyk | recommended value |
| s_l,max | 9.2.2(6), (9.6N) | 0.75d(1 + cot α) | recommended value |
| s_t,max | 9.2.2(8), (9.8N) | 0.75d ≤ 600 mm | recommended value |
| Link angle | 9.2.2(1) | 45° to 90° | — |

## Mandatory companion checks for an overall beam result

A beam design must not report an overall pass unless all of these are evaluated for the governing real action sets. Otherwise the result is incomplete, per the numerical skill:

1. Flexure M_Ed ≤ M_Rd for sagging and hogging, including the shift rule effect on longitudinal steel (6.2.2(5) / 6.2.3(7)).
2. As,min ≤ As ≤ As,max for each tension face (9.2.1.1).
3. Shear: V_Ed ≤ V_Rd,c, or the link design with V_Ed ≤ V_Rd,s and V_Ed ≤ V_Rd,max, plus V_Rd,max at the support (6.2.1(8)).
4. Link minimum ratio and spacing limits (9.2.2(5), (6), (8)).
5. Anchorage of Asl beyond the section for ρl (6.2.2(1), Fig. 6.3) and at supports (9.2.1.4, 9.2.1.5). The profile computes l_bd (8.4, below). It passes only when the engineer confirms the bars extend that far; otherwise it is indeterminate.
6. Serviceability: minimum crack steel (7.3.2), crack control without direct calculation (7.3.3) and span/depth deflection (7.4.2), below. Stress limits (7.2) are not checked.
7. Cover and bar spacing (4.4.1, 8.2), below.

A complete-design PASS needs every item evaluated. Missing engineer inputs leave the run INDETERMINATE.

## Detailing and serviceability (ADR 0026)

All rows are `A1/A2: unreconciled`. Verification is in `crates/design/src/profile/ec2uk/detailing_tests.rs` against `fixtures/design/ec2-uk-na/jrc-detailing.published.json`.

| Item | Clause | Rule used | UK NA value | Verified against |
| --- | --- | --- | --- | --- |
| Cover | 4.4.1.1–4.4.1.3 | c_nom = max(c_min,b, c_min,dur, 10 mm) + Δc_dev, for the links and for the main bars; c_min,b = φ, +5 mm when the aggregate exceeds 32 mm (Table 4.2); c_min,dur is the engineer's (BS 8500) | Δc_dev = 10 mm; Δc_dur,γ = Δc_dur,st = Δc_dur,add = 0 | hand values |
| Bar spacing | 8.2(2) | clear gap ≥ max(k1 φ, d_g + k2, 20 mm) | k1 = 1, k2 = 5 mm | hand values |
| Anchorage | 8.4.2–8.4.4 | f_bd = 2.25 η1 η2 f_ctd; l_b,rqd = (φ/4) σ_sd/f_bd with σ_sd = f_yd; α2 = 1 − 0.15(c_d − φ)/φ in [0.7, 1]; l_bd ≥ l_b,min; bottom bars good bond, top bars good only when h ≤ 250 mm | α_ct = 1.0 | JRC Tables 4.1.2–4.1.4, 84 values within 1 mm |
| Minimum crack steel | 7.3.2 (7.1) | A_s,min = k_c k f_ct,eff A_ct/σ_s with k_c = 0.4, k = 1.0 (h ≤ 300 mm) to 0.65 (h ≥ 800 mm), f_ct,eff = f_ctm, A_ct = b h/2, σ_s = f_yk | recommended | closed form |
| Crack control | 7.3.3, Tables 7.2N/7.3N | steel stress from the cracked transformed section (α_e = E_s/E_cm) under the quasi-permanent moment; pass if either the bar-size or the spacing table is met, reading the next higher stress row | w_max = 0.3 mm for RC in every exposure class (Table NA.4) | tables, closed-form cracked section |
| Deflection | 7.4.2, (7.16a/b), (7.17) | basic l/d from ρ and ρ′ with ρ0 = √f_ck·10⁻³; × min(500/(f_yk A_s,req/A_s,prov), 1.5); × 7/l_eff for sensitive partitions over 7 m; ≤ 40K | K: simply supported 1.0, end span 1.3, interior 1.5, cantilever 0.4 (Table NA.5) | JRC worked values 26.4, 33.9, 49.6 |

The UK NA 6.2.3(3) note caps V_Rd,max at 200 b_w² beyond d from a support. The NA states no units. It is read as N with b_w in mm, because kN with b_w in m would forbid ordinary beams. The profile applies it at every section, which is conservative.

## Examples and independence

- `fixtures/design/ec2-uk-na/jrc-axis2-beam.published.json` holds the published JRC inputs and figures, cited by page, with three documented publication discrepancies.
- `tools/oracles/ec2_beam_oracle.py` is a pure-Python recomputation from this dossier. It writes `jrc-axis2-beam.reconciliation.json` and fails on any disagreement. Five deliberate misreadings (αcc, the k cap, ν, the V_Rd,max strut term, the V_Rd,c exponent) all fail it.
- The UK NA variant values in the reconciliation file are **oracle-only**; no independent UK example is held. A UK-specific published example is still needed before profile acceptance (R-CONCRETE-EXAMPLES).

## Open questions (resolve before a current-UK claim)

1. **A1:2014 / NA+A2:2014.** Which of the rows above changed? The texts are not held.
2. ~~**UK V_Rd,max cap.**~~ Resolved by ADR 0026. It is applied as 200·b_w² N with b_w in mm at every section, and the interpretation is recorded in each shear check. Confirm it against NA+A2:2014 when that text is held.
3. ~~**αcc for shear under the UK NA.**~~ Resolved by ADR 0015: the profile uses the permitted 0.85 for all phenomena (one parameter, `alpha_cc_shear`).
4. **UK Cmax shear note.** Limiting shear strength of classes above C50/60 to C50/60 needs a decision on how fck enters (6.2.a), (6.2.b) and ν.

## Unsupported in the first profile

Axial force (σcp ≠ 0), prestress, inclined links and bent-up bars, the 6.2.2(6)/6.2.3(8) β reduction, flanged sections beyond the "block in flange" rectangle, web-flange shear (6.2.4), torsion (6.3), steel option 3.2.7(2)(a), redistribution (5.5), members below As,min (Section 12), fck > 50 MPa until an example is reconciled, stress limits (7.2), direct crack-width and deflection calculation (7.3.4, 7.4.3), laps (8.7), curtailment (9.2.1.3) and bent bars.

## Detailing rules (M16-RULES)

| Item | Clause | Rule | Verification |
| --- | --- | --- | --- |
| Mandrel diameter | 8.3, Table 8.1N(a) | 4φ for φ ≤ 16 mm, 7φ above; (8.1) is the engineer's when 8.3(3) does not hold | JRC Table 4.1.1 (8 values) |
| Link extension | 8.5, Figure 8.5 | hook: 5φ ≥ 50 mm; bend: 10φ ≥ 70 mm | JRC Table 4.1.5 (8 values) |
| Lap length | 8.7.3 (8.10), (8.11), Table 8.3 | l0 = α2 α6 l_b,rqd ≥ max(0.3 α6 l_b,rqd, 15φ, 200 mm); α1 = α3 = α5 = 1; α2 from c_d in tension, 1 in compression; α6 1 / 1.15 / 1.4 / 1.5 at ≤ 25 / 33 / 50 / > 50 % lapped, interpolated | JRC Tables 4.1.6–4.1.9 (224 values within 1 mm) |

The beam's anchorage check records the mandrel for its bars, the link extensions and the lap lengths at 25, 50 and 100 % lapped. Where to lap and curtail stays the engineer's.
