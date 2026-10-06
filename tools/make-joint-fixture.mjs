#!/usr/bin/env node
/**
 * Writes fixtures/models/J01.json (M16, ADR 0032) through the built WASM
 * kernel: a 3.5 m RC column with two beams framing into its top at right
 * angles, an rcColumn draft on the column and an rcBeam draft on each beam
 * with the application's starter inputs (equal 600 mm beams, Ø20 top bars,
 * a 400 mm column with Ø25 bars, three per face). Run after `npm run build`:
 *
 *     node tools/make-joint-fixture.mjs
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
const rigid = { my: false, mz: false };
const fixed = [true, true, true, true, true, true];
request("createProject", {
  project: {
    schemaVersion: "1.0.0",
    id: "J01",
    name: "RC joint · two beams into a column",
    revision: 0,
    displayUnits: "engineeringMetric",
    analysisMode: "spatial",
    gravity: [0, 0, -9.80665],
    metadata: {
      description:
        "Column with two orthogonal beams at its top, each with an RC draft (M16 joint clash fixture)",
      createdBy: "Structural Workbench",
      entityLabels: {},
    },
    materials: [
      { id: "conc", name: "C30/37", E: 33e9, nu: 0.2, density: 2500 },
    ],
    sections: [
      {
        id: "col",
        name: "400 × 400",
        A: 0.16,
        Iy: 2.133e-3,
        Iz: 2.133e-3,
        J: 3.6e-3,
        cy: 0.2,
        cz: 0.2,
        provenance: "Rectangle",
      },
      {
        id: "bm",
        name: "300 × 600",
        A: 0.18,
        Iy: 5.4e-3,
        Iz: 1.35e-3,
        J: 3.7e-3,
        cy: 0.15,
        cz: 0.3,
        provenance: "Rectangle",
      },
    ],
    nodes: [
      { id: "base", position: [0, 0, 0] },
      { id: "top", position: [0, 0, 3.5] },
      { id: "ex", position: [5, 0, 3.5] },
      { id: "ey", position: [0, 5, 3.5] },
    ],
    members: [
      {
        id: "column",
        start: "base",
        end: "top",
        material: "conc",
        section: "col",
        localY: [1, 0, 0],
        releaseStart: rigid,
        releaseEnd: rigid,
      },
      // Width along local y, top face along local +z (up).
      {
        id: "beamX",
        start: "top",
        end: "ex",
        material: "conc",
        section: "bm",
        localY: [0, 1, 0],
        releaseStart: rigid,
        releaseEnd: rigid,
      },
      {
        id: "beamY",
        start: "top",
        end: "ey",
        material: "conc",
        section: "bm",
        localY: [-1, 0, 0],
        releaseStart: rigid,
        releaseEnd: rigid,
      },
    ],
    supports: [
      { id: "s0", node: "base", fixed, prescribed: [0, 0, 0, 0, 0, 0] },
      {
        id: "sx",
        node: "ex",
        fixed: [true, true, true, true, false, false],
        prescribed: [0, 0, 0, 0, 0, 0],
      },
      {
        id: "sy",
        node: "ey",
        fixed: [true, true, true, true, false, false],
        prescribed: [0, 0, 0, 0, 0, 0],
      },
    ],
    loadCases: [{ id: "LC1", name: "Dead", category: "dead" }],
    loads: [
      {
        id: "wx",
        case: "LC1",
        type: "uniform",
        member: "beamX",
        axes: "global",
        forcePerLength: [0, 0, -20000],
      },
      {
        id: "wy",
        case: "LC1",
        type: "uniform",
        member: "beamY",
        axes: "global",
        forcePerLength: [0, 0, -20000],
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
for (const [kind, target] of [
  ["rcColumn", "column"],
  ["rcBeam", "beamX"],
  ["rcBeam", "beamY"],
])
  request("applyCommand", {
    command: {
      id: `draft-${target}`,
      type: "CreateDesignPreview",
      args: { kind, targetId: target },
    },
  });
const { project } = request("getSnapshot", {});
project.revision = 0;
await writeFile(
  "fixtures/models/J01.json",
  JSON.stringify(project, null, 2) + "\n",
);
console.log(
  `wrote fixtures/models/J01.json (${project.designPreviews.length} drafts)`,
);
