// dynamics-v1 through the built WASM kernel and the Worker protocol envelopes
// (contracts/PROTOCOL.md "Modal analysis", ADR 0018). Expected values come
// from the independent oracle, never from the kernel.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv from "ajv/dist/2020.js";

const oracle = JSON.parse(
  await readFile("fixtures/dynamics/modal-oracle.json", "utf8"),
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
const projectSchema = ajv.compile(
  JSON.parse(await readFile("contracts/project.schema.json", "utf8")),
);

const sdof = oracle.sdof;

/** The oracle's massless cantilever along X, as a legacy 1.0.0 document. */
function cantilever() {
  const s = sdof.section;
  return {
    schemaVersion: "1.0.0",
    id: "modal-protocol",
    name: "modal-protocol",
    revision: 0,
    displayUnits: "SI",
    analysisMode: "spatial",
    gravity: [0, 0, -9.80665],
    materials: [{ id: "mat1", name: "steel", E: sdof.E, nu: 0.3, density: 0 }],
    sections: [
      {
        id: "sec1",
        name: "oracle",
        A: s.A,
        Iy: s.Iy,
        Iz: s.Iz,
        J: s.J,
        cy: 0.1,
        cz: 0.1,
        provenance: "dynamics-v1 oracle",
      },
    ],
    nodes: [
      { id: "n1", position: [0, 0, 0] },
      { id: "n2", position: [sdof.L, 0, 0] },
    ],
    members: [
      {
        id: "m1",
        start: "n1",
        end: "n2",
        material: "mat1",
        section: "sec1",
        localY: [0, 1, 0],
        releaseStart: { my: false, mz: false },
        releaseEnd: { my: false, mz: false },
      },
    ],
    supports: [
      {
        id: "s1",
        node: "n1",
        fixed: Array(6).fill(true),
        prescribed: Array(6).fill(0),
      },
    ],
    loadCases: [{ id: "LC1", name: "Uplift", category: "wind" }],
    loads: [
      {
        id: "u1",
        case: "LC1",
        type: "nodal",
        node: "n2",
        values: [0, 0, 1000, 0, 0, 0],
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
    metadata: { description: "dynamics-v1 protocol test", createdBy: "tests" },
  };
}

function session() {
  const kernel = new Kernel();
  let revision = null;
  let n = 0;
  const ask = (operation, payload) => {
    const r = {
      protocolVersion: 1,
      requestId: `modal${n++}`,
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
  const imported = ask("importProject", {
    jsonUtf8: JSON.stringify(cantilever()),
    replaceCurrent: true,
  });
  assert.equal(imported.status, "ok", JSON.stringify(imported));
  return { ask, imported, free: () => kernel.free() };
}

const rel = (a, b) => Math.abs(a / b - 1);

test("capabilities advertise modal analysis and schema 1.4.0", () => {
  const { ask, free } = session();
  const c = ask("capabilities", {}).payload;
  assert.ok(c.analysisTypes.includes("modal"));
  assert.ok(c.schemaVersions.includes("1.4.0"));
  assert.ok(
    c.excludedDomains.includes(
      "response spectrum, time-history and harmonic analysis",
    ),
  );
  free();
});

test("a legacy import migrates to 1.4.0 with no mass, and modal refuses to run", () => {
  const { ask, imported, free } = session();
  const p = imported.payload.project;
  assert.ok(
    imported.payload.migrationReport.steps.includes(
      "set schemaVersion 1.4.0 (no mass sources declared)",
    ),
  );
  assert.equal(p.schemaVersion, "1.4.0");
  assert.equal(p.massSources, undefined);
  assert.ok(projectSchema(p), JSON.stringify(projectSchema.errors));
  const r = ask("analyse", {
    caseIds: [],
    combinationIds: [],
    analysisType: "modal",
  });
  assert.equal(r.status, "error");
  assert.equal(r.diagnostics[0].code, "NO_MASS");
  assert.equal(r.payload, null);
  free();
});

test("SetMassSource with a dimensioned mass gives the SDOF closed form", () => {
  const { ask, free } = session();
  const set = ask("applyCommand", {
    command: {
      type: "SetMassSource",
      args: {
        id: "tip",
        kind: "nodalMass",
        node: "n2",
        mass: `${sdof.tipMass / 1000} t`,
        existence: "create",
      },
    },
  });
  assert.equal(set.status, "ok", JSON.stringify(set));
  const snapshot = ask("getSnapshot", {}).payload.project;
  assert.deepEqual(snapshot.massSources, [
    { id: "tip", kind: "nodalMass", node: "n2", mass: sdof.tipMass },
  ]);
  assert.ok(projectSchema(snapshot), JSON.stringify(projectSchema.errors));
  for (const massMatrix of ["consistent", "lumped"]) {
    const r = ask("analyse", {
      caseIds: [],
      combinationIds: [],
      analysisType: "modal",
      modal: { modes: 6, massMatrix, subdivisions: 4 },
    });
    assert.equal(r.status, "ok", JSON.stringify(r.diagnostics));
    const m = r.payload;
    assert.equal(m.analysisType, "modal");
    assert.equal(m.bufferDescriptors, undefined);
    assert.equal(m.modes.length, 3);
    const omegas = m.modes.map((x) => x.omega);
    const expected = [sdof.omegaWeak, sdof.omegaStrong, sdof.omegaAxial].sort(
      (a, b) => a - b,
    );
    omegas.forEach((w, i) =>
      assert.ok(
        rel(w, expected[i]) <= sdof.tolerance,
        `${massMatrix} ${i}: ${w}`,
      ),
    );
    assert.ok(
      m.diagnostics.some((d) => d.code === "FEWER_MODES_THAN_REQUESTED"),
    );
    assert.equal(m.mass.total, sdof.tipMass);
    for (const d of m.participation) assert.equal(d.achieved, true);
  }
  free();
});

test("negative mass fails with its reason and no payload", () => {
  const { ask, free } = session();
  ask("applyCommand", {
    command: {
      type: "SetMassSource",
      args: {
        id: "up",
        kind: "loadCase",
        case: "LC1",
        factor: "1",
        existence: "create",
      },
    },
  });
  const r = ask("analyse", {
    caseIds: [],
    combinationIds: [],
    analysisType: "modal",
  });
  assert.equal(r.status, "error");
  assert.equal(r.diagnostics[0].code, "NEGATIVE_MASS");
  assert.equal(r.payload, null);
  free();
});

test("malformed or ambiguous modal requests and sources are refused", () => {
  const { ask, free } = session();
  ask("applyCommand", {
    command: {
      type: "SetMassSource",
      args: {
        id: "tip",
        kind: "nodalMass",
        node: "n2",
        mass: 100,
        existence: "create",
      },
    },
  });
  const refused = [
    [
      { caseIds: ["LC1"], combinationIds: [], analysisType: "modal" },
      "INVALID_LOAD",
    ],
    [
      {
        caseIds: [],
        combinationIds: [],
        analysisType: "modal",
        modal: { modes: 0 },
      },
      "INVALID_SETTINGS",
    ],
    [
      {
        caseIds: [],
        combinationIds: [],
        analysisType: "modal",
        modal: { participationTarget: 2 },
      },
      "INVALID_SETTINGS",
    ],
    [
      {
        caseIds: [],
        combinationIds: [],
        analysisType: "modal",
        modal: { massMatrix: "diagonal" },
      },
      "INVALID_SCHEMA",
    ],
    [
      {
        caseIds: [],
        combinationIds: [],
        analysisType: "modal",
        modal: { damping: 0.05 },
      },
      "INVALID_SCHEMA",
    ],
    [{ caseIds: ["LC1"], combinationIds: [], modal: {} }, "INVALID_SCHEMA"],
  ];
  for (const [payload, code] of refused) {
    const r = ask("analyse", payload);
    assert.equal(r.status, "error", JSON.stringify(payload));
    assert.equal(r.diagnostics[0].code, code, JSON.stringify(payload));
  }
  // A second nodal mass on the same node is refused atomically.
  const dup = ask("applyCommand", {
    command: {
      type: "SetMassSource",
      args: {
        id: "tip2",
        kind: "nodalMass",
        node: "n2",
        mass: 5,
        existence: "create",
      },
    },
  });
  assert.equal(dup.status, "error");
  assert.equal(dup.diagnostics[0].code, "INVALID_MASS_SOURCE");
  assert.equal(ask("getSnapshot", {}).payload.project.massSources.length, 1);
  free();
});
