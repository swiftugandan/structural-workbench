#!/usr/bin/env node
/**
 * Writes fixtures/models/CB01.json (M17, ADR 0031) through the built WASM
 * kernel: Design Example I.1 as a model. A 45 ft W21X50 beam, simply
 * supported, at 10 ft centres, with its stage loads per 10 ft strip:
 *
 * - WET: slab 75 psf + self weight 5 psf (0.800 kip/ft);
 * - CONST: construction live 25 psf (0.250 kip/ft);
 * - SDL: miscellaneous 10 psf (0.100 kip/ft), applied after hardening;
 * - LIVE: 100 psf (1.00 kip/ft);
 *
 * and the combinations C-CON = 1.2 WET + 1.6 CONST (construction) and
 * C-COMP = 1.2 (WET + SDL) + 1.6 LIVE (composite). Run after `npm run build`:
 *
 *     node tools/make-composite-fixture.mjs
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
const FT = 0.3048,
  KIP_FT = 4448.2216152605 / FT;
const span = 45 * FT;
const load = (id, kipPerFt) => ({
  id: `w-${id}`,
  case: id,
  type: "uniform",
  member: "beam",
  axes: "global",
  forcePerLength: [0, 0, -kipPerFt * KIP_FT],
});
request("createProject", {
  project: {
    schemaVersion: "1.0.0",
    id: "CB01",
    name: "Composite floor beam · Design Example I.1",
    revision: 0,
    displayUnits: "engineeringMetric",
    analysisMode: "spatial",
    gravity: [0, 0, -9.80665],
    metadata: {
      description:
        "45 ft W21X50 simply supported at 10 ft centres with the stage loads of AISC Design Example I.1 (M17 fixture)",
      createdBy: "Structural Workbench",
      entityLabels: {},
    },
    materials: [
      { id: "mat1", name: "steel", E: 200e9, nu: 0.3, density: 7850 },
    ],
    sections: [
      {
        id: "s",
        name: "placeholder",
        A: 0.01,
        Iy: 1e-5,
        Iz: 2e-5,
        J: 1e-6,
        cy: 0.2,
        cz: 0.1,
        provenance: "Replaced by the catalogue assignment",
      },
    ],
    nodes: [
      { id: "n1", position: [0, 0, 3.5] },
      { id: "n2", position: [span, 0, 3.5] },
    ],
    members: [
      {
        id: "beam",
        start: "n1",
        end: "n2",
        material: "mat1",
        section: "s",
        localY: [0, 0, 1],
        releaseStart: { my: false, mz: false },
        releaseEnd: { my: false, mz: false },
      },
    ],
    supports: [
      // Pinned: translations and torsion held at n1; lateral, vertical and
      // torsion at n2; strong-axis rotation free at both.
      {
        id: "s1",
        node: "n1",
        fixed: [true, true, true, true, false, false],
        prescribed: [0, 0, 0, 0, 0, 0],
      },
      {
        id: "s2",
        node: "n2",
        fixed: [false, true, true, true, false, false],
        prescribed: [0, 0, 0, 0, 0, 0],
      },
    ],
    loadCases: [
      { id: "WET", name: "Wet concrete and self weight", category: "dead" },
      { id: "CONST", name: "Construction live", category: "live" },
      { id: "SDL", name: "Superimposed dead (composite)", category: "dead" },
      { id: "LIVE", name: "Live (composite)", category: "live" },
    ],
    loads: [
      load("WET", 0.8),
      load("CONST", 0.25),
      load("SDL", 0.1),
      load("LIVE", 1.0),
    ],
    combinations: [
      {
        id: "C-CON",
        name: "Construction 1.2 WET + 1.6 CONST",
        purpose: "strength",
        terms: [
          { case: "WET", factor: 1.2 },
          { case: "CONST", factor: 1.6 },
        ],
      },
      {
        id: "C-COMP",
        name: "Composite 1.2 (WET + SDL) + 1.6 LIVE",
        purpose: "strength",
        terms: [
          { case: "WET", factor: 1.2 },
          { case: "SDL", factor: 1.2 },
          { case: "LIVE", factor: 1.6 },
        ],
      },
    ],
    analysisSettings: {
      type: "linearStatic",
      formulation: "eulerBernoulli3D",
      mergeTolerance: 1e-6,
      timeoutMs: 30000,
      memoryLimitMiB: 512,
    },
  },
});
request("applyCommand", {
  command: {
    id: "assign-beam",
    type: "AssignSteelCatalogue",
    args: {
      id: "beam",
      sectionRef: "aisc-shapes-v16.0-subset-1:W21X50",
      materialRef: "astm-a992-50-65-v1",
    },
  },
});
const { project } = request("getSnapshot", {});
project.sections = project.sections.filter((s) => s.id !== "s");
project.revision = 0;
await writeFile(
  "fixtures/models/CB01.json",
  JSON.stringify(project, null, 2) + "\n",
);
console.log(`wrote fixtures/models/CB01.json (schema ${project.schemaVersion})`);
