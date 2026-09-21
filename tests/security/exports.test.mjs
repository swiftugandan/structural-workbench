import test from "node:test";
import assert from "node:assert/strict";
import { escape, csv } from "../../web/reports/report.js";
test("HTML labels escaped", () => {
  assert.equal(escape('<script>"x" &'), "&lt;script&gt;&quot;x&quot; &amp;");
});
test("CSV formula labels neutralised", () => {
  const out = csv({
    nodeIds: ['=HYPERLINK("evil")'],
    nodeDisplacements: [0, 0, 0, 0, 0, 0],
    reactionSupportIds: [],
    reactions: [],
  });
  assert.ok(out.includes("'=HYPERLINK"));
});
