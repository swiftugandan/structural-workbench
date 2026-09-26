# Integrated steel task journey

Synthetic 3 m cantilever with a 300 kN tip force. The independent fixed-end strong-axis moment is 900 kN m. This is an interface and bounded AISC S2 workflow example, not construction design.

Journey: assign W18X50 and explicit assumptions → analyse → review all → find FAIL → inspect governing F2-1 → compare actual reanalysed catalogue candidates → choose W14X132 → Apply → old review/colours STALE → analyse → fresh review PASS → download exact design record and standalone report. Colour states come from recorded Rust rows; view toggles do not mutate engineering state. The selected member retains its selection highlight above the wider status line.

Expected colour states are asserted against the actual renderer's visible-member status map and labelled legend; final screenshots must also be inspected. Native numerical regression from the catalogue slice remains applicable because this increment changes presentation/orchestration only.

Visual correction before final acceptance: centreline status strokes were depth-occluded by solid member surfaces. Live Chrome inspection caught this despite the correct status map/legend. Status colours now tint the physical member faces using the existing face shading; selection remains a blue outline. Final evidence must show the coloured surface, not just legend text.

Final regression exposed a test synchronization gap: after clearing catalogue search, the script enumerated candidate checkboxes before the asynchronous full list appeared, leaving all five selected. The actual study correctly evaluated those five. The test now waits for the five visible catalogue rows before selecting exactly two; numerical assertions and expected candidate count are unchanged.
