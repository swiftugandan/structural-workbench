# ADR 0015 — EC2 UK beam profile: parameters, scope and disabled registration

## Status

Accepted for M08-B2 (2026-09-28).

## Context

M08-B1 produced `docs/code-profiles/ec2-uk-na/dossier-beam.md`. It covers EN 1992-1-1:2004 (+AC:2008/AC:2010) flexure, shear and beam reinforcement limits with the 2009 UK NA, reconciled against the JRC89037 example by an independent oracle. The dossier left several choices open, and A1:2014 and NA+A2:2014 are still not held.

## Decision

1. **One registry, optional RC context.** The profile implements the existing `CodeProfile` trait (ADR 0007). `MemberContext` gains an optional code-agnostic `rc_beam` description (section, bar rows, links, material strengths, anchorage predicate), following the pattern of its optional steel fields. The profile is registered in `default_registry` with `enabled: false`, so capabilities advertise it honestly and `evaluate` returns only the resource gate.
2. **Parameters are an explicit set.** `Ec2Ndp::uk_na_2009()` is the profile default. `Ec2Ndp::eu_recommended()` exists so tests reproduce the JRC example exactly. No coefficient is hidden in the check functions.
3. **α_cc = 0.85 for shear as well as flexure.** The UK NA allows 1.0 for phenomena other than compression in flexure and axial load, and explicitly permits 0.85 for all. The profile takes the permitted conservative value. This is a one-field change (`alpha_cc_shear`) if a later decision prefers 1.0.
4. **Flexure** uses the 3.1.7(3) rectangular block (λ = 0.8, η = 1.0, ε_cu3 = 0.0035) with 3.2.7(2)(b) steel through the unchanged `rc_section` kernel (ADR 0012). The face follows ADR 0014: My < 0 compresses the top face. A tension face without steel has M_Rd = 0, because 6.1(2)P ignores concrete tension.
5. **Shear** uses V_Rd,c (6.2.2(1)). Asl counts only when the input confirms anchorage beyond the section (Fig. 6.3); otherwise ρl = 0. That is the code-conformant exclusion, not a guess. With vertical links, cot θ is chosen in [1, 2.5] to maximise min(V_Rd,s, V_Rd,max), with z = 0.9d, ν1 = ν and αcw = 1. V_Ed is used at the station without the 6.2.1(8) or 6.2.2(6) reductions. The UK NA "200·bw²" cap on V_Rd,max is **not applied**, because the NA states no units. This is recorded in every shear result.
6. **Scope.** Rectangular sections, fck ≤ 50 MPa (the only range reconciled against an example), fyk ≤ 600 MPa. Actions are My with Vz only: any N, T, Vy or Mz returns an unsupported `ec2.actions` check. No tolerance is invented to ignore small axial forces.
7. **Never an overall pass yet.** Every run appends unsupported companions for anchorage (8, 9.2.1.3–9.2.1.5), serviceability (7), cover and bar spacing (4.4, 8.2), and amendment reconciliation (A1:2014, NA+A2:2014). A definite failure still reports fail.

## Consequences

- Expected values come from the JRC publication and the pure-Python oracle (`designCheckTargets` in the reconciliation file), never from Rust output. Both θ branches, both NDP sets and the reinforcement limits are covered. Sign mapping, missing links, unconfirmed anchorage, out-of-scope actions and companion checks have semantic tests. Six deliberate implementation errors each fail the suite.
- Enabling the profile requires A1:2014 and NA+A2:2014 reconciliation, a UK-published example, and the companion checks. Wiring it into the RC beam preview is a separate slice.
