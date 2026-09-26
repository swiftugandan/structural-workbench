# Support label visibility

The viewport **Support labels** button toggles support badges only. Support
restraints, solid/symbol geometry, model hash and current analysis are unchanged.
Labels start visible; the setting remains in effect across camera changes during
the session. It is a presentation preference, not saved engineering project data.

Reproduce: `npm run build`, then
`WORKBENCH_EVIDENCE_DIR=evidence/support-labels npx playwright test tests/e2e/support-symbols.spec.js`.
The focused test checks hide/show, keyboard operation, all camera presets and
current-result/hash preservation. Existing support restraint editing is also
regressed. Visible Chrome checks use UKR01 with labels on/off and inspect the
remaining support solids. No numerical kernel change or expanded engineering
acceptance is involved.

Member labels have an independent Auto / Show all / Hide selector. Auto preserves
the existing large-model rule (only selected members labelled above 100 members).
Show all overrides that rule, while Hide removes even the selected member badge.
Neither choice affects node IDs, result annotations or support labels.

Initial regression run passed restraint editing and support-toggle checks. The
large-model test read its initial label count before the first frame was drawn;
it now waits for the selected-member label before comparing Auto restoration.
The application itself required no repair for that test timing issue.
