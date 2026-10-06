# M16-JOINTS acceptance record

Source hash: `8ee52723ff988eae6587fbf4e638d72ed32a83eda2516b69ce480003a04ed9b2`
Build hash: `48556717daa8146cd689491adaa48f0fde9542c91a7fde636a1fd232432163dc`
Observed: 2026-10-06T04:15:45.942Z
Status: **PASS**

| ID | Title | Evidence | Status | Observation |
| --- | --- | --- | --- | --- |
| M16-JOINTS-GEOMETRY | Skew-line distances and bar row offsets | joints-kernel | PASS | Hand values: 300 mm between orthogonal lines; ±100 mm rows |
| M16-JOINTS-CLEAR | 8.2(2) clear distance between beam and column bars | joints-kernel | PASS | Exactly at the 47.5 mm limit passes; a 350 mm beam clashes by 25 mm; no aggregate is indeterminate |
| M16-JOINTS-CROSSING | Crossing beam rows may touch, not intersect | joints-kernel | PASS | Equal beams intersect; one Ø20 lower they touch |
| M16-JOINTS-PROTOCOL | detailJoints on J01 through clash, fix and clear | joints-protocol | PASS | Deeper beam, corner-only column and aggregate size give clear |
| M16-JOINTS-BROWSER | Joints pane reports the clashes and follows an edit | joints-browser | PASS | Two crossing clashes before, none after a 640 mm beam |

Limitations: Centreline model: sections centred on the member axes, straight bars through the joint, collinear beams not compared. Eccentric beams, haunches, layer order inside the joint, laps and anchorage at the joint are the engineer's. Hand-geometry verification; no published joint example is held.
