# British residential reference: design basis gate

## Separate scopes

The current steel package is bounded AISC 360-22 S2. It is not a British steel profile.
The product roadmap's ACI-oriented M08 resource request is separate from the user's British residential concrete reference. Neither enables the other.

UKR01 currently records an intended BS EN 1990/1991/1992/1997 + UK National Annex route. The user confirmed **Eurocodes with UK National Annexes** on 2026-09-26. Legacy BS 8110 is not the selected basis. Exact editions/amendments remain to be pinned against the acquired resources and project requirements.

## Before concrete resistance can be enabled

- Confirm standard family, exact editions/amendments and applicable UK National Annexes.
- Obtain authoritative standard text with documented local-use rights; pin hashes in the private resource lock. No purchased/licensed text goes into the public repository.
- Obtain independent worked examples covering each enabled branch, sign convention, applicability boundary and required companion check.
- Write the bounded profile/formulation dossier, then implement Rust native/WASM tests and browser stale/provenance paths.
- Separately establish project/site inputs, loading, complete combination sets, stability, ground/contact assumptions and required design checks.

Until those gates pass, the reference has a preliminary elastic analysis and action provenance. Concrete resistance is UNSUPPORTED and footing contact INDETERMINATE. Mock geometry/strengths/ground inputs never become a code-compliance claim.

This resource gate does not block selection, hierarchy, visibility, catalogue workflows or independent mechanics with their own validated scope.

## Resource research, 2026-09-26

The first-generation candidate is BS EN 1992-1-1:2004+A1:2014 with NA+A2:2014. [BSI lists that National Annex](https://knowledge.bsigroup.com/products/uk-national-annex-to-eurocode-2-design-of-concrete-structures-general-rules-and-rules-for-buildings). [The Concrete Centre describes the coexistence of the two generations](https://www.concretecentre.com/Structural-design/Eurocode-2-concrete/Using-2nd%C2%A0generation-Eurocode-2.aspx) and explains why the generation must be explicit. This is a proposed development resource basis, not an enabled profile or a decision to mix generations.

Acquired the [JRC 2014 worked-examples report](https://eurocodes.jrc.ec.europa.eu/publications/eurocode-2-background-appications-design-concrete-buildings-worked-examples) from its official PDF endpoint into the ignored private resource directory. R-EC2-JRC-EXAMPLES records its SHA-256. Individual examples still need extraction, national-parameter reconciliation and independent expected outputs. It does not replace the standard/UK NA text. R-EC2-UK-STANDARDS remains not acquired; the existing ACI resource entries remain separate.

## Open-access resource check, 2026-09-28

The user approved Public.Resource.Org postings as local reference only. The results were:

- **UK National Annex, locked.** R-EC2-UK-NA-2009 is the NA to BS EN 1992-1-1:2004, first edition December 2005, incorporating AMD 1 (December 2009). The downloaded file matches the Internet Archive SHA-1/MD5. It does not include NA+A2:2014.
- **EN 1992-1-1 clause text, not acquired.** The Public.Resource.Org item `en.1992.1.1.2004` is withdrawn (dark) on the Internet Archive. The only other copy found (`bs_en_1992-1-1-2004_eurocode_2`) carries a per-page institutional licensed-copy watermark. It was deleted and not recorded, because it is not a lawful open posting.

R-EC2-UK-STANDARDS is therefore partially acquired. The clause text, A1:2014 and NA+A2:2014 still need a lawful source, such as a purchase, an institutional BSOL subscription, or read-only BSOL access at a British Library Business & IP Centre for reconciling the amendments. No profile is enabled.
