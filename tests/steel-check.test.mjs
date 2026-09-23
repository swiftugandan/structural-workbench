import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAnalysisDemand,
  s2D1FailPayload,
  s2G1BFailPayload,
  s2D1Payload,
  seedCatalog,
  seedPayload,
} from "../web/steel-check.js";

test("fail seeds raise demand above published capacity", () => {
  const pass = s2D1Payload();
  const fail = s2D1FailPayload();
  assert.ok(fail.inputs.n > pass.inputs.n);
  assert.equal(fail.memberIds[0], "S2-D1-fail");
  const shearFail = s2G1BFailPayload();
  assert.ok(shearFail.inputs.vz > 0);
  assert.equal(shearFail.memberIds[0], "S2-G1B-fail");
});

test("seed catalog has ≥3 pass, ≥3 fail, and unsupported scope cases", () => {
  const catalog = seedCatalog();
  const pass = catalog.filter((s) => s.expect === "pass");
  const fail = catalog.filter((s) => s.expect === "fail");
  const unsupported = catalog.filter((s) => s.expect === "unsupported");
  assert.ok(pass.length >= 3, `pass=${pass.length}`);
  assert.ok(fail.length >= 3, `fail=${fail.length}`);
  assert.ok(unsupported.length >= 3, `unsupported=${unsupported.length}`);
  for (const s of catalog) {
    const p = seedPayload(s.id);
    assert.equal(p.profileId, "aisc-360-22-lrfd");
    assert.ok(p.inputs.section);
  }
  const ltb = seedPayload("S2-LTB-unsupported");
  assert.ok(ltb.inputs.lb > 0);
  assert.equal(seedPayload("S2-HSS-unsupported").inputs.sectionFamily, "HSS");
  assert.equal(seedPayload("S2-torsion-unsupported").inputs.torsionPresent, true);
});

test("applyAnalysisDemand overlays midspan sample and rejects envelopes", () => {
  const base = s2D1Payload();
  const result = {
    caseId: "LC1",
    analysisType: "static",
    members: [
      {
        id: "m1",
        length: 5,
        samples: [
          { station: 0, actions: [1, 0, 0, 0, 0, 0] },
          { station: 0.5, actions: [100, 20, 30, 0, 40, 50] },
          { station: 1, actions: [2, 0, 0, 0, 0, 0] },
        ],
      },
    ],
  };
  const next = applyAnalysisDemand(base, {
    result,
    memberId: "m1",
    station: 0.5,
  });
  assert.equal(next.memberIds[0], "m1");
  assert.equal(next.inputs.n, 100);
  assert.equal(next.inputs.vy, 20);
  assert.equal(next.inputs.vz, 30);
  assert.equal(next.inputs.my, 40);
  assert.equal(next.inputs.mz, 50);
  assert.equal(next.inputs.combinationId, "LC1");
  assert.equal(next.inputs.station, 0.5);
  assert.match(next.resultId, /^model-derived:/);
  assert.equal(next.inputs.section.ag, base.inputs.section.ag);
  assert.equal(next.inputs.torsionPresent, false);

  const withTorsion = applyAnalysisDemand(base, {
    result: {
      ...result,
      members: [
        {
          id: "m1",
          length: 5,
          samples: [{ station: 0.5, actions: [0, 0, 0, 12, 0, 0] }],
        },
      ],
    },
  });
  assert.equal(withTorsion.inputs.torsionPresent, true);

  assert.throws(
    () =>
      applyAnalysisDemand(base, {
        result: { ...result, analysisType: "envelope" },
      }),
    /Envelopes/,
  );
});
