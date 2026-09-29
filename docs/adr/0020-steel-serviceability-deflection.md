# ADR 0020 — Steel member serviceability: deflection criteria separate from strength (M07-S)

## Status

Accepted with M07-S (2026-09-29).

## Context

Model-native steel design reports strength only and labels serviceability
"NOT CHECKED". AISC 360-22 Chapter L leaves serviceability limits to the
engineer. The design pack asks that service criteria and service combinations
produce a status distinct from strength utilisation, never one blended
PASS/FAIL.

## Decision

1. **Criteria are user inputs, not code rules.** A member's steel design may
   carry `serviceability: {combinationId, limitRatio, basis}`: the service
   load case or combination, the span-over-deflection ratio n of an L/n limit
   (for example 360), and the deflection basis.
2. **Two bases.** `chord` measures the transverse deflection relative to the
   line joining the deformed member ends (spans supported at both ends);
   `absolute` measures the transverse displacement from the undeformed
   position (cantilevers). Deflection is the magnitude of the local y and z
   components, sampled at the analysis stations of the physical member, with
   L its length.
3. **The kernel re-solves the service combination.** The strength run keeps its
   own case; the service result is solved in Rust from the same model, so
   nothing a caller supplies stands in for a displacement.
4. **A separate status.** The run carries `serviceability {status, demand,
   limit, ratio, station, combinationId, basis}` with `pass`, `fail` or
   `notChecked` (no criteria), and `overall` remains the strength verdict.
   Envelopes are not service inputs, and a combination whose purpose is
   `strength` is refused (`INVALID_LOAD`).
5. **Schema 1.4.0** gains the optional field. 1.4.0 had not been released
   when this was added, so no further version is introduced.

## Consequences

- The steel panel, overview and design record show strength and
  serviceability side by side, each with its own status.
- Vibration, drift and ponding criteria remain out of scope.
