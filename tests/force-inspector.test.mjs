import test from "node:test";
import assert from "node:assert/strict";
import { nodeContributions } from "../web/force-inspector.js";
test("Node loads respect combination factors and member-on-node sign and rotated axes", () => {
  const project = {
    combinations: [{ id: "c", terms: [{ case: "lc", factor: 2 }] }],
    loads: [
      { type: "nodal", node: "n", case: "lc", values: [1, 2, 3, 4, 5, 6] },
    ],
    supports: [{ id: "s", node: "n" }],
    members: [{ id: "m", start: "n", end: "other" }],
  };
  const result = {
    caseId: "c",
    reactionSupportIds: ["s"],
    reactions: new Float64Array([-2, -4, -6, -8, -10, -12]),
    members: [{ id: "m", endActions: [1, 2, 3, 4, 5, 6, 0, 0, 0, 0, 0, 0] }],
  };
  const groups = nodeContributions(project, result, "n", [
    {
      id: "m",
      axes: [
        [0, 1, 0],
        [0, 0, 1],
        [1, 0, 0],
      ],
    },
  ]);
  assert.deepEqual(groups[0].values, [2, 4, 6, 8, 10, 12]);
  assert.deepEqual(groups[1].values, Array.from(result.reactions));
  assert.deepEqual(groups[2].values, [-3, -1, -2, -6, -4, -5]);
});
