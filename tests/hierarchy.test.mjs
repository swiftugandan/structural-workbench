import { test } from "node:test";
import assert from "node:assert/strict";
import {
  memberHierarchy,
  lineageSummary,
  renderMemberNav,
  stationRangeText,
} from "../web/hierarchy.js";

test("memberHierarchy groups analytical children under physical roots", () => {
  const members = [
    {
      id: "c2",
      parentMemberId: "m1",
      stationRange: [0.5, 1],
      start: "n2",
      end: "n3",
    },
    {
      id: "c1",
      parentMemberId: "m1",
      stationRange: [0, 0.5],
      start: "n1",
      end: "n2",
    },
    { id: "m2", start: "n4", end: "n5" },
  ];
  const { roots, unsplit, hasLineage } = memberHierarchy(members);
  assert.equal(hasLineage, true);
  assert.deepEqual(
    roots.get("m1").map((m) => m.id),
    ["c1", "c2"],
  );
  assert.deepEqual(
    unsplit.map((m) => m.id),
    ["m2"],
  );
  assert.equal(stationRangeText(roots.get("m1")[0]), "0–0.5");
});

test("lineageSummary and nav render physical headers", () => {
  const project = { metadata: { entityLabels: {} } };
  const child = {
    id: "c1",
    parentMemberId: "m1",
    stationRange: [0.25, 0.75],
    start: "n1",
    end: "n2",
  };
  const summary = lineageSummary(project, child, (id) => id);
  assert.equal(summary.physicalId, "m1");
  assert.match(summary.text, /physical m1/);
  assert.match(summary.text, /0\.25–0\.75/);
  const html = renderMemberNav([child], {
    selected: "c1",
    label: (id) => id,
    esc: (s) => String(s),
  });
  assert.match(html, /Physical m1 · 1 analytical/);
  assert.match(html, /data-physical="m1"/);
  assert.match(html, /hierarchy-child/);
  assert.match(html, /0\.25–0\.75/);
});
