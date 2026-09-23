import test from "node:test";
import assert from "node:assert/strict";
import {
  duplicateAsVariant,
  tipUz,
  sectionIy,
  buildComparison,
} from "../web/variants.js";

const sample = {
  schemaVersion: "1.0.0",
  id: "base",
  name: "Cantilever",
  revision: 3,
  sections: [{ id: "sec1", Iy: 1e-5 }],
  nodes: [{ id: "n1" }, { id: "n2" }],
  members: [{ id: "m1", start: "n1", end: "n2", section: "sec1" }],
  loads: [{ id: "l1", member: "m1" }],
};

test("duplicateAsVariant remaps id/name/revision and keeps entity links", () => {
  const v = duplicateAsVariant(sample);
  assert.notEqual(v.id, sample.id);
  assert.match(v.name, /\(variant\)$/);
  assert.equal(v.revision, 0);
  assert.equal(v.members[0].section, "sec1");
  assert.equal(v.loads[0].member, "m1");
  assert.equal(v.sections[0].Iy, 1e-5);
});

test("buildComparison requires matching hashes and reports tip uz", () => {
  const displacements = new Float64Array(12);
  displacements[8] = -0.045; // n2 uz
  const result = {
    modelHash: "aaa",
    nodeIds: ["n1", "n2"],
    nodeDisplacements: displacements,
    caseId: "LC1",
  };
  const comparison = buildComparison({
    baseline: { project: sample, modelHash: "aaa" },
    baselineResult: result,
    variant: {
      project: { ...sample, id: "var", sections: [{ id: "sec1", Iy: 2e-5 }] },
      modelHash: "bbb",
    },
    variantResult: {
      ...result,
      modelHash: "bbb",
      nodeDisplacements: Float64Array.from(displacements, (x, i) =>
        i === 8 ? -0.0225 : x,
      ),
    },
  });
  assert.equal(comparison.baseline.tipUz, -0.045);
  assert.equal(comparison.variant.tipUz, -0.0225);
  assert.equal(comparison.baseline.Iy, 1e-5);
  assert.equal(comparison.variant.Iy, 2e-5);
  assert.notEqual(comparison.baseline.modelHash, comparison.variant.modelHash);
});

test("tipUz and sectionIy helpers", () => {
  assert.equal(sectionIy(sample), 1e-5);
  const d = new Float64Array(6);
  d[2] = -1;
  assert.equal(tipUz({ nodeIds: ["n1"], nodeDisplacements: d }, "n1"), -1);
});
