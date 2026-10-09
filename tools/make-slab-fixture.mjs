#!/usr/bin/env node
/**
 * Writes fixtures/models/SL01.json (ADR 0021, ADR 0035) through the built WASM
 * kernel: a flat slab on a two-by-two bay frame, ready to analyse.
 *
 * - Frame: nine 3 m columns (300 × 300 mm) with fixed bases on a 4 × 3 m grid,
 *   tied at the top by 300 × 500 mm downstand beams on every grid line.
 * - Slab: 8 × 6 m, 250 mm, a 1 × 1 m opening at (1.5, 1) m, 7.5 kPa, E 33 GPa,
 *   ν 0.2, free edges, placed at the beam and column tops (support level 3 m).
 *   Drawn resting on the beams; analysed as a plate on the nine columns as
 *   springs (plate-v1 has no line supports inside the panel).
 * - "Slab reactions": the plate solve's column loads, applied to the frame,
 *   so an analysis gives the frame its share of the slab at once.
 *
 * Every value is the example's own, never a code value. Run after
 * `npm run build`:
 *
 *     node tools/make-slab-fixture.mjs
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
const command = (id, type, args) =>
  request("applyCommand", { command: { id, type, args } });

const xs = [0, 4, 8],
  ys = [0, 3, 6],
  level = 3;
const grid = ys.flatMap((y, j) => xs.map((x, i) => ({ i, j, x, y })));
const tag = ({ i, j }) => `${i}${j}`;
const member = (id, start, end, section, localY) => ({
  id,
  start,
  end,
  material: "c30",
  section,
  localY,
  releaseStart: { my: false, mz: false },
  releaseEnd: { my: false, mz: false },
});
const beams = [];
for (const p of grid)
  for (const q of grid)
    if ((q.i === p.i + 1 && q.j === p.j) || (q.j === p.j + 1 && q.i === p.i))
      beams.push(
        member(
          `B${tag(p)}-${tag(q)}`,
          `T${tag(p)}`,
          `T${tag(q)}`,
          "beam",
          [0, 0, 1],
        ),
      );

request("createProject", {
  project: {
    schemaVersion: "1.0.0",
    id: "SL01",
    name: "Flat slab on a two-bay frame",
    revision: 0,
    displayUnits: "engineeringMetric",
    analysisMode: "spatial",
    gravity: [0, 0, -9.80665],
    metadata: {
      description:
        "8 × 6 m flat slab with an opening on nine columns and downstand beams; its plate analysis's column loads applied to the frame (ADR 0021, ADR 0035)",
      createdBy: "Structural Workbench",
      entityLabels: {},
    },
    materials: [
      { id: "c30", name: "Concrete C30/37", E: 33e9, nu: 0.2, density: 0 },
    ],
    sections: [
      {
        id: "col",
        name: "Column 300 × 300",
        A: 0.09,
        Iy: 6.75e-4,
        Iz: 6.75e-4,
        J: 1.14e-3,
        cy: 0.15,
        cz: 0.15,
        provenance: "Rectangle 300 × 300 mm; Saint-Venant J = 0.141 a⁴",
      },
      {
        // Depth along local y (vertical), strong-axis bending about local z.
        id: "beam",
        name: "Beam 300 × 500",
        A: 0.15,
        Iy: 1.125e-3,
        Iz: 3.125e-3,
        J: 2.82e-3,
        cy: 0.25,
        cz: 0.15,
        provenance: "Rectangle 300 wide × 500 deep; Saint-Venant J ≈ 0.208 b³h",
      },
    ],
    nodes: grid.flatMap((p) => [
      { id: `F${tag(p)}`, position: [p.x, p.y, 0] },
      { id: `T${tag(p)}`, position: [p.x, p.y, level] },
    ]),
    members: [
      ...grid.map((p) =>
        member(`C${tag(p)}`, `F${tag(p)}`, `T${tag(p)}`, "col", [1, 0, 0]),
      ),
      ...beams,
    ],
    supports: grid.map((p) => ({
      id: `S${tag(p)}`,
      node: `F${tag(p)}`,
      fixed: [true, true, true, true, true, true],
      prescribed: [0, 0, 0, 0, 0, 0],
    })),
    loadCases: [{ id: "SL", name: "Slab reactions", category: "dead" }],
    loads: [],
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

const draft = command("create-slab", "CreateDesignPreview", { kind: "slab" })
  .project.designPreviews[0];
command("set-slab", "SetDesignPreview", {
  id: draft.id,
  inputs: {
    ...draft.inputs,
    length: 8,
    width: 6,
    thickness: 0.25,
    meshSize: 0.25,
    openingLength: 1,
    openingWidth: 1,
  },
  soilReference: "",
  plate: {
    edges: ["free", "free", "free", "free"],
    includeOpening: true,
    inputs: {
      pressure: 7.5e3,
      elasticModulus: 33e9,
      poissonRatio: 0.2,
      openingX: 1.5,
      openingY: 1,
    },
    placement: [0, 0, level],
  },
});
command("slab-columns", "DeriveSlabColumns", {
  id: draft.id,
  origin: [0, 0, level],
});
command("slab-loads", "ApplySlabColumnLoads", { id: draft.id, caseId: "SL" });

const { project } = request("getSnapshot", {});
project.revision = 0;
const total = -project.loads.reduce((t, l) => t + l.values[2], 0);
await writeFile(
  "fixtures/models/SL01.json",
  JSON.stringify(project, null, 2) + "\n",
);
console.log(
  `wrote fixtures/models/SL01.json (schema ${project.schemaVersion}): ${project.designPreviews[0].plate.columns.length} slab columns, ${project.loads.length} column loads, ${(total / 1e3).toFixed(3)} kN`,
);
