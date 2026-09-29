// stability-v1 through the built WASM kernel and the Worker protocol envelopes
// (contracts/PROTOCOL.md "Stability analyses", ADR 0017). Expected values come
// from the independent oracle, never from the kernel.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv from "ajv/dist/2020.js";

const oracle = JSON.parse(
  await readFile("fixtures/stability/stability-oracle.json", "utf8"),
);
const { initSync, Kernel } = await import("../dist/pkg/workbench_wasm_api.js");
initSync({ module: await readFile("dist/pkg/workbench_wasm_api_bg.wasm") });
const ajv = new Ajv({ strict: false, allErrors: true });
const requestSchema = ajv.compile(
  JSON.parse(await readFile("contracts/request.schema.json", "utf8")),
);
const responseSchema = ajv.compile(
  JSON.parse(await readFile("contracts/response.schema.json", "utf8")),
);

const H = oracle.firstOrderSwayUnderH.H;
const pb = oracle.portalBuckling;

/** The oracle's fixed-base planar portal with loads at the column tops. */
function portal(leftTop, rightFz) {
  const sec = (id, part) => ({
    id,
    name: id,
    A: part.A,
    Iy: part.I,
    Iz: part.I,
    J: 1e-4,
    cy: 0.1,
    cz: 0.1,
    provenance: "stability-v1 oracle portal",
  });
  const member = (id, start, end, section) => ({
    id,
    start,
    end,
    material: "mat1",
    section,
    localY: [0, 1, 0],
    releaseStart: { my: false, mz: false },
    releaseEnd: { my: false, mz: false },
  });
  const { h, b } = pb.geometry;
  return {
    schemaVersion: "1.0.0",
    id: "stability-protocol",
    name: "stability-protocol",
    revision: 0,
    displayUnits: "engineeringMetric",
    analysisMode: "planarXZ",
    gravity: [0, 0, -9.80665],
    materials: [{ id: "mat1", name: "steel", E: 210e9, nu: 0.3, density: 0 }],
    sections: [sec("col", pb.column), sec("beam", pb.beam)],
    nodes: [
      { id: "bl", position: [0, 0, 0] },
      { id: "br", position: [b, 0, 0] },
      { id: "tl", position: [0, 0, h] },
      { id: "tr", position: [b, 0, h] },
    ],
    members: [
      member("cl", "bl", "tl", "col"),
      member("cr", "br", "tr", "col"),
      member("bm", "tl", "tr", "beam"),
    ],
    supports: ["bl", "br"].map((n, i) => ({
      id: `s${i}`,
      node: n,
      fixed: Array(6).fill(true),
      prescribed: Array(6).fill(0),
    })),
    loadCases: [
      { id: "LC1", name: "Reference", category: "other" },
      { id: "LC2", name: "Other", category: "other" },
    ],
    loads: [
      {
        id: "l1",
        case: "LC1",
        type: "nodal",
        node: "tl",
        values: [leftTop[0], 0, leftTop[1], 0, 0, 0],
      },
      {
        id: "l2",
        case: "LC1",
        type: "nodal",
        node: "tr",
        values: [0, 0, rightFz, 0, 0, 0],
      },
    ],
    combinations: [],
    analysisSettings: {
      type: "linearStatic",
      formulation: "eulerBernoulli3D",
      mergeTolerance: 1e-6,
      timeoutMs: 30000,
      memoryLimitMiB: 512,
    },
    metadata: { description: "stability-v1 protocol test", createdBy: "tests" },
  };
}

/** A kernel session holding one project; `ask` returns the validated response. */
function session(project) {
  const kernel = new Kernel();
  let revision = null;
  let n = 0;
  const ask = (operation, payload) => {
    const r = {
      protocolVersion: 1,
      requestId: `stability${n++}`,
      operation,
      expectedRevision: revision,
      payload,
    };
    assert.ok(requestSchema(r), JSON.stringify(requestSchema.errors));
    const out = JSON.parse(kernel.request(JSON.stringify(r)));
    assert.ok(responseSchema(out), JSON.stringify(responseSchema.errors));
    revision = out.revision;
    return out;
  };
  if (project) assert.equal(ask("createProject", { project }).status, "ok");
  return { ask, free: () => kernel.free() };
}

test("capabilities advertise the stability types with precise exclusions", () => {
  const s = session();
  const caps = s.ask("capabilities", {}).payload;
  assert.deepEqual(caps.analysisTypes, [
    "linearStatic",
    "elasticBuckling",
    "secondOrder",
    "modal",
    "harmonic",
    "responseSpectrum",
  ]);
  assert.ok(
    caps.excludedDomains.includes(
      "geometrically nonlinear (large-displacement) response",
    ),
  );
  assert.ok(
    caps.excludedDomains.includes(
      "torsional and lateral-torsional instability",
    ),
  );
  assert.ok(!caps.excludedDomains.includes("second-order response"));
  assert.ok(caps.limitations.some((l) => /not a member resistance/.test(l)));
  s.free();
});

test("elasticBuckling returns the portal sway factor with disclosures", () => {
  const s = session(portal([0, -1e3], -1e3));
  const out = s.ask("analyse", {
    caseIds: ["LC1"],
    combinationIds: [],
    analysisType: "elasticBuckling",
  });
  assert.equal(out.status, "ok", JSON.stringify(out.diagnostics));
  const r = out.payload;
  assert.equal(r.analysisType, "elasticBuckling");
  assert.equal(r.subdivisions, 8);
  assert.equal(r.requestedModes, 5);
  assert.ok(
    Math.abs(r.modes[0].factor / (pb.PcrPerColumn / 1e3) - 1) <= 1e-4,
    `${r.modes[0].factor}`,
  );
  assert.deepEqual(r.disclosures, [
    "FLEXURAL_ONLY",
    "NOT_A_RESISTANCE_CHECK",
    "LINEAR_REFERENCE_STATE",
  ]);
  assert.equal(r.bufferDescriptors, undefined);
  s.free();
});

test("both stability types take end releases as hinge DOFs", () => {
  // Beam pinned at both ends: each fixed-base column is a flagpole (K = 2).
  const p = portal([0, -1e3], -1e3);
  const beam = p.members.find((m) => m.id === "bm");
  beam.releaseStart = { my: true, mz: false };
  beam.releaseEnd = { my: true, mz: false };
  const s = session(p);
  const out = s.ask("analyse", {
    caseIds: ["LC1"],
    combinationIds: [],
    analysisType: "elasticBuckling",
    stability: { subdivisions: 16, modes: 1 },
  });
  assert.equal(out.status, "ok", JSON.stringify(out.diagnostics));
  const { h } = pb.geometry;
  const flagpole = (Math.PI ** 2 * 210e9 * pb.column.I) / (4 * h * h) / 1e3;
  assert.ok(
    Math.abs(out.payload.modes[0].factor / flagpole - 1) <= 1e-4,
    `${out.payload.modes[0].factor} vs ${flagpole}`,
  );
  s.free();
  // Second order on the same frame with the lateral load H at the left top.
  const lateral = portal([H, -1e3], -1e3);
  const pinned = lateral.members.find((m) => m.id === "bm");
  pinned.releaseStart = { my: true, mz: false };
  pinned.releaseEnd = { my: true, mz: false };
  const t = session(lateral);
  const second = t.ask("analyse", {
    caseIds: ["LC1"],
    combinationIds: [],
    analysisType: "secondOrder",
    stability: { subdivisions: 16, imperfection: { kind: "none" } },
  });
  assert.equal(second.status, "ok", JSON.stringify(second.diagnostics));
  // 1 kN at 1/1000 of the flagpole load: sway within 1e-3 of the exact
  // cantilever beam-column, each column carrying H/2.
  const P = 1e3;
  const k = Math.sqrt(P / (210e9 * pb.column.I));
  const exact = (0.5 * H * (Math.tan(k * h) - k * h)) / (P * k);
  const ids = second.payload.nodeIds;
  const d = second.payload.nodeDisplacements;
  const sway = 0.5 * (d[ids.indexOf("tl") * 6] + d[ids.indexOf("tr") * 6]);
  assert.ok(Math.abs(sway / exact - 1) <= 1e-3, `${sway} vs ${exact}`);
  t.free();
});

test("secondOrder reproduces the exact P-Delta sway and records convergence", () => {
  const c = oracle.secondOrder.find((x) => x.id === "S-POR-PD-050");
  const s = session(portal([H, -c.PPerColumn], -c.PPerColumn));
  const out = s.ask("analyse", {
    caseIds: ["LC1"],
    combinationIds: [],
    analysisType: "secondOrder",
    stability: { imperfection: { kind: "none" } },
  });
  assert.equal(out.status, "ok", JSON.stringify(out.diagnostics));
  const r = out.payload;
  assert.equal(r.analysisType, "secondOrder");
  const ux = (id) => r.nodeDisplacements[r.nodeIds.indexOf(id) * 6];
  const sway = 0.5 * (ux("tl") + ux("tr"));
  assert.ok(
    Math.abs(sway / c.exact.sway - 1) <= 1e-3,
    `${sway} vs ${c.exact.sway}`,
  );
  assert.ok(r.numericalChecks.iterations >= 2);
  assert.ok(Array.isArray(r.numericalChecks.history));
  s.free();
});

test("an over-critical secondOrder fails with its reason and no payload", () => {
  const p = oracle.overCritical.PPerColumn;
  const s = session(portal([H, -p], -p));
  const out = s.ask("analyse", {
    caseIds: ["LC1"],
    combinationIds: [],
    analysisType: "secondOrder",
    stability: { subdivisions: 8, imperfection: { kind: "none" } },
  });
  assert.equal(out.status, "error");
  assert.equal(out.payload, null);
  const d = out.diagnostics[0];
  assert.equal(d.code, "NONCONVERGED");
  assert.equal(d.details.reason, "TANGENT_NOT_POSITIVE_DEFINITE");
  assert.ok(d.details.history.length > 0);
  s.free();
});

test("malformed or ambiguous stability requests are refused", () => {
  const s = session(portal([0, -1e3], -1e3));
  const code = (payload) => {
    const out = s.ask("analyse", {
      caseIds: ["LC1"],
      combinationIds: [],
      ...payload,
    });
    assert.equal(out.status, "error", JSON.stringify(payload));
    return out.diagnostics[0].code;
  };
  assert.equal(code({ stability: { subdivisions: 8 } }), "INVALID_SCHEMA");
  assert.equal(code({ analysisType: "plastic" }), "INVALID_SCHEMA");
  assert.equal(code({ analysisType: "secondOrder" }), "INVALID_SCHEMA");
  assert.equal(
    code({ analysisType: "secondOrder", stability: {} }),
    "INVALID_SCHEMA",
  );
  assert.equal(
    code({ analysisType: "elasticBuckling", stability: { shift: 1 } }),
    "INVALID_SCHEMA",
  );
  assert.equal(
    code({ analysisType: "elasticBuckling", stability: { modes: 1.5 } }),
    "INVALID_SCHEMA",
  );
  assert.equal(
    code({ analysisType: "elasticBuckling", stability: { modes: 21 } }),
    "INVALID_SETTINGS",
  );
  assert.equal(
    code({
      analysisType: "secondOrder",
      stability: {
        imperfection: { kind: "sway", ratio: 0.5, direction: [1, 0] },
      },
    }),
    "INVALID_SETTINGS",
  );
  assert.equal(
    code({ analysisType: "elasticBuckling", caseIds: ["LC1", "LC2"] }),
    "INVALID_LOAD",
  );
  s.free();
});
