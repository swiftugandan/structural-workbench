# 0006: OpenSees adapter scope for releases and prescribed motion

## Status

Accepted for M03 oracle packaging.

## Context

VALIDATION requires a pre-M03 OpenSees pack covering skewed frames, asymmetric
portals, released beams, prescribed support motion and distributed loading.
`tools/oracle.py` already compares S01, S02 and B07 against OpenSeesPy 3.4.0.

## Decision

Keep `elasticBeamColumn` + `Plain` constraints for the supported subset. Do
**not** claim OpenSees numerical parity for My/Mz end releases (R01) or
prescribed-support motion (B09) until an independent adapter path is proven:

- Releases need a verified OpenSees release-code / hinge idealisation that
  matches our static-condensation contract; exploratory `-release` codes on
  3.4.0 did not produce a stable BandSPD solve for R01.
- Prescribed motion needs a verified `sp` + constraint handler path that
  reproduces the partitioned `uc` treatment; Penalty under-shot B09 and
  Transformation failed fatally in the lab environment.

R01 and B09 remain **native analytical / browser gates** (M02 evidence). The
M03 oracle pack must record them as `NATIVE_CROSSCHECK` (CLI vs analytical
fixtures) rather than silent omissions, and must not mark them OpenSees PASS.

## Consequences

- Parent M03 may accept with an explicit OpenSees-scope limitation.
- Extending the adapter later requires a new evidence run and this ADR update.
- Do not average OpenSees and native outputs to paper over disagreement.
