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
