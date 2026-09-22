---
name: prokon-collab
description: >
  Multi-agent roles, ownership boundaries and integration for Structural Workbench.
  Use when multiple agents are authorised, or when sequentially playing coordinator/implementer/verifier/integrator alone.
---

# Collaboration and integration

## Roles

Use these roles whether one agent or many execute them:

- Coordinator
- Implementer
- Numerical verifier
- Browser/UX verifier
- Release integrator

A numerical verifier must derive or obtain expected outputs independently of the implementation. Role labels alone do not remove correlated errors.

If separate agents are available and authorised: isolated branches/worktrees and non-overlapping file ownership. Otherwise execute roles sequentially with independent tools/formulations.

## Bounded work

Give each agent: bounded objective, input paths, editable paths, acceptance IDs, required evidence. Assign an owner to shared contracts, fixture baselines and integration. Do not let agents silently overwrite each other's changes.

No agent edits shared schemas, migrations or golden expected outputs concurrently without integrator ownership. An implementation ticket must not edit its own benchmark expected outputs to match observed output.

## Integration

Keep numerical verification independent from implementation derivation. The integrator resolves contract changes explicitly, reviews diffs and reruns affected tests after merging.

Protect numerical fixture baselines through a verification gate. Keep contracts backwards compatible inside a major schema version. An intentional break requires migration fixtures and original-file preservation. Rebase/merge conflicts: owning agent resolves and reverifies — do not discard the other branch.

The release integrator checks dist hashes against tested artifacts, confirms no dirty source tree, reproduces the clean build, runs accumulated milestone gates and emits `release-manifest.json` plus `capabilities.json`. Keep the previous working release available. An automatically staged preview can be replaced only after the candidate passes its gates and the environment permits deployment.

Multi-agent execution is a delivery option, not a prerequisite or evidence of correctness. If working alone, perform the same roles sequentially and use an independent reference implementation or analytical derivation.

## Summary discipline

A summary says exactly what was implemented, what was tested, which platforms ran and what remains blocked. Do not say full PROKON clone, certified, production engineering approved or numerically equivalent unless the corresponding evidence exists.
