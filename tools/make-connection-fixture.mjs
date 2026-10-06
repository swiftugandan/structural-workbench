#!/usr/bin/env node
/**
 * Writes fixtures/models/C01.json (M13, ADR 0030) through the built WASM
 * kernel: a 9 m W18X50 beam between two 4 m W14X90 columns, pinned for
 * strong-axis moment at both ends, under 30 kN/m (wL/2 = 135 kN per end).
 * The catalogue sections are assigned with AssignSteelCatalogue exactly as
 * the application does. Run after `npm run build`:
 *
 *     node tools/make-connection-fixture.mjs
 */
import { readFile, writeFile } from "node:fs/promises";

const { initSync, Kernel } = await import("../dist/pkg/workbench_wasm_api.js");
initSync({ module: await readFile("dist/pkg/workbench_wasm_api_bg.wasm") });
const kernel = new Kernel();
let revision = null;
const request = (operation, payload) => {
  const r = JSON.parse(
    kernel.request(
      JSON.stringify({
        protocolVersion: 1,
        requestId: operation,
        operation,
        expectedRevision: revision,
        payload,
      }),
    ),
  );
  if (r.status !== "ok") throw new Error(JSON.stringify(r.diagnostics));
  revision = r.revision;
  return r.payload;
};
const rigid = { my: false, mz: false },
  pinned = { my: false, mz: true },
  fixed = [true, true, true, true, true, true];
const section = {
  id: "s",
  name: "placeholder",
  A: 0.01,
  Iy: 1e-5,
  Iz: 2e-5,
  J: 1e-6,
  cy: 0.2,
  cz: 0.1,
  provenance: "Replaced by the catalogue assignment",
};
request("createProject", {
  project: {
    schemaVersion: "1.0.0",
    id: "C01",
    name: "Single-plate connection frame",
    revision: 0,
    displayUnits: "engineeringMetric",
    analysisMode: "spatial",
    gravity: [0, 0, -9.80665],
    metadata: {
      description:
        "W18X50 beam pinned between two W14X90 columns, 30 kN/m (M13 connection fixture)",
      createdBy: "Structural Workbench",
      entityLabels: {},
    },
    materials: [
      { id: "mat1", name: "steel", E: 200e9, nu: 0.3, density: 7850 },
    ],
    sections: [section],
    nodes: [
      { id: "b1", position: [0, 0, 0] },
      { id: "t1", position: [0, 0, 4] },
      { id: "b2", position: [9, 0, 0] },
      { id: "t2", position: [9, 0, 4] },
    ],
    members: [
      {
        id: "c1",
        start: "b1",
        end: "t1",
        material: "mat1",
        section: "s",
        localY: [1, 0, 0],
        releaseStart: rigid,
        releaseEnd: rigid,
      },
      {
        id: "c2",
        start: "b2",
        end: "t2",
        material: "mat1",
        section: "s",
        localY: [1, 0, 0],
        releaseStart: rigid,
        releaseEnd: rigid,
      },
      {
        id: "beam",
        start: "t1",
        end: "t2",
        material: "mat1",
        section: "s",
        localY: [0, 0, 1],
        releaseStart: pinned,
        releaseEnd: pinned,
      },
    ],
    supports: [
      { id: "s1", node: "b1", fixed, prescribed: [0, 0, 0, 0, 0, 0] },
      { id: "s2", node: "b2", fixed, prescribed: [0, 0, 0, 0, 0, 0] },
    ],
    loadCases: [{ id: "LC1", name: "Floor", category: "other" }],
    loads: [
      {
        id: "w",
        case: "LC1",
        type: "uniform",
        member: "beam",
        axes: "global",
        forcePerLength: [0, 0, -30000],
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
  },
});
for (const [id, shape] of [
  ["c1", "W14X90"],
  ["c2", "W14X90"],
  ["beam", "W18X50"],
])
  request("applyCommand", {
    command: {
      id: `assign-${id}`,
      type: "AssignSteelCatalogue",
      args: {
        id,
        sectionRef: `aisc-shapes-v16.0-subset-1:${shape}`,
        materialRef: "astm-a992-50-65-v1",
      },
    },
  });
const { project } = request("getSnapshot", {});
// The placeholder section is no longer used by any member.
// The placeholder section and material are no longer used by any member.
project.sections = project.sections.filter((s) => s.id !== "s");
const removed = project.materials
  .filter((m) => !project.members.some((x) => x.material === m.id))
  .map((m) => m.id)
  .concat(["s"]);
project.materials = project.materials.filter((m) => !removed.includes(m.id));
for (const id of removed) delete project.metadata.entityLabels?.[id];
project.revision = 0;
await writeFile(
  "fixtures/models/C01.json",
  JSON.stringify(project, null, 2) + "\n",
);
console.log(`wrote fixtures/models/C01.json (schema ${project.schemaVersion})`);
