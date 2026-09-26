# Bounded catalogue study contract

This is the next increment, not an implemented capability.

## Scope

Single selected member, current actual case/combination, user-confirmed existing design assumptions and finite selected set from the five-record AISC catalogue. Objective is the selected member mass (kg), computed in Rust as density × section area × member length. It is not system cost, whole-frame optimality or a multi-case design envelope.

## Evaluation

For each selected shape, clone the exact baseline project, apply the normal catalogue assignment in Rust, parse/validate/canonicalise, then analyse the entire candidate model. Recover simultaneous station actions and use the existing bounded profile. Preserve FAIL, UNSUPPORTED and INDETERMINATE candidates with full evidence; do not rank missing resistance as feasible. A PASS remains conditional on the original S2 scope.

Candidate records must retain baseline hash/result, candidate hash/result, source/build/settings, assigned refs, mass, reanalysis marker, exact DesignRun and diagnostics. Finite search completion means all requested records were evaluated, not that a global optimum was proved.

## Apply

Explicit user Apply performs the ordinary catalogue command on the live model only if the baseline hash/result remains current and no form edits are pending. Candidate records never replace live analysis; require reanalysis. Undo restores the baseline engineering state through existing history.

## Independent mechanics checks

For a three-metre fixed cantilever under self weight in its strong bending plane, independently calculate w = rho A g, fixed-end shear wL and moment wL²/2 using published input dimensions and unit conversions outside candidate implementation. Different candidate areas must change these demands. Compare native and actual WASM results, preserve exact baseline project, verify explicit apply/undo in the UI. Existing published AISC resistance tests remain applicable; no new design clause is introduced.
