# Compact command ribbon

Removed the All tools / Model / Modify / View / Results category tab row at the user's request. All command groups remain directly available in the horizontally scrollable ribbon; the Ribbon visibility toggle still hides the whole ribbon. Removed obsolete category handlers, tab semantics and styling. Updated the existing workspace journey to use the directly available commands.

Verification results are recorded alongside this file. This is a bounded UI refinement, not full M01-UX or parent milestone acceptance.

Office-style sizing follow-up: two 28px desktop rows of small icon/label commands, 16px small icons, 26px primary icons on full-height Draw member and Select buttons, compact group captions and separators. Coarse-pointer devices use 44px command rows. Existing 14px desktop button labels remain readable. Horizontal scrolling retains access on narrow displays.

Final verification: build PASS; four Playwright checks PASS (workspace keyboard/drafts, responsive panels, layout/focus/persistence, axe accessibility). Live CUA screenshot confirms compact groups and absent category row. DOM measurement: ribbon 88px high; primary buttons 58px, small commands 28px. Final build 2926be4e49c8ba3c3c5bd8dee635ba82b4f6ba123bc95ceef1d9148ee2c5a2c1; source 57690d7893e6bc6af6df14e83a32d249ac86d903b9ccf3f2519269c93b09b571. Tests used the same port-4175 override described in evidence/M01/layout-panels/README.md.
