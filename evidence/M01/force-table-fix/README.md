# Reaction table NaN fix
Source change 295508e. Source hash 6a129fa8d499b9c61f8e3735996c355830462bb67b7b3b7db46b1e70c5aac198; build hash da74a74663ba8812275b58347323c704e945b75edd651f86629c29e778e69507.
Root cause: Float64Array.map coerced generated HTML/SVG strings into NaN. Convert numeric buffers to normal arrays before rendering strings. No numerical values changed. Build, typed-array unit test and expanded browser journey pass. Browser selects supported node n1, verifies six reaction rows and +10,000 N, and rejects NaN; also retains member/node/station/units/stale checks.
