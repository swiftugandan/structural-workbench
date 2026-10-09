import test from "node:test";
import assert from "node:assert/strict";
import {
  panelRegions,
  pressureGlyph,
  slabLift,
  slabMesh,
  slabVisible,
} from "../web/render/slab-panels.js";
import slab from "../web/design/kinds/slab.js";

// A Rust `slabs` entry (ADR 0035): 6 × 5 m, 0.2 m thick, support level
// z = 3, bearing on beams whose tops are at z = 3.25, opening x 1…2,
// y 0.5…1.5, 7.5 kPa.
const placed = {
  id: "dp1",
  length: 6,
  width: 5,
  thickness: 0.2,
  opening: [1, 2, 0.5, 1.5],
  openingBasis: "analysed",
  placement: [10, 20, 3],
  corners: [
    [10, 20, 3],
    [16, 20, 3],
    [16, 25, 3],
    [10, 25, 3],
  ],
  openingCorners: [
    [11, 20.5, 3],
    [12, 20.5, 3],
    [12, 21.5, 3],
    [11, 21.5, 3],
  ],
  soffit: 3.25,
  bearingMemberIds: ["b1", "b2"],
  columnNodeIds: ["t1", "t2"],
  pressure: 7500,
};
const area = (faces) =>
  faces.reduce((s, { points: [a, b, , d] }) => {
    const u = b.map((v, i) => v - a[i]),
      w = d.map((v, i) => v - a[i]);
    return (
      s +
      Math.hypot(
        u[1] * w[2] - u[2] * w[1],
        u[2] * w[0] - u[0] * w[2],
        u[0] * w[1] - u[1] * w[0],
      )
    );
  }, 0);

test("The panel minus its opening tiles exactly, with no overlap", () => {
  const regions = panelRegions(6, 5, [1, 2, 0.5, 1.5]);
  const sum = regions.reduce((s, [a, b, c, d]) => s + (b - a) * (d - c), 0);
  assert.equal(sum, 6 * 5 - 1);
  assert.deepEqual(panelRegions(6, 5, null), [[0, 6, 0, 5]]);
  // An opening on an edge leaves no zero-width strip.
  assert.equal(panelRegions(6, 5, [0, 1, 0, 1]).length, 2);
});

test("Lines: the analytical surface at the support level with both rings", () => {
  const { faces, edges } = slabMesh(placed, false);
  assert.ok(faces.every((f) => f.points.every((p) => p[2] === 3)));
  assert.equal(area(faces), 29);
  assert.equal(edges.length, 8);
  // The opening ring is the Rust opening, in model coordinates.
  const ring = edges.slice(4).map(([a]) => a);
  assert.deepEqual(ring, placed.openingCorners);
});

test("Solid: the slab rests on its supports, soffit up by its thickness", () => {
  const { faces, edges } = slabMesh(placed, true);
  const zs = new Set(faces.flatMap((f) => f.points.map((p) => p[2])));
  assert.deepEqual(
    [...zs].sort((a, b) => a - b),
    [3.25, 3.45],
  );
  const plan = faces.filter((f) => f.shade === 1),
    walls = faces.filter((f) => f.shade < 1);
  assert.equal(area(plan), 2 * 29);
  // Outer perimeter 22 m and opening perimeter 4 m, 0.2 m high.
  assert.ok(Math.abs(area(walls) - 26 * 0.2) < 1e-9);
  assert.equal(edges.length, 24);
  assert.equal(slabMesh({ ...placed, corners: null }, true), null);
  // On columns alone the soffit is the support level.
  assert.equal(slabLift({ ...placed, soffit: 3 }), 0);
  const flat = slabMesh({ ...placed, soffit: 3 }, true);
  assert.equal(
    Math.min(...flat.faces.flatMap((f) => f.points.map((p) => p[2]))),
    3,
  );
});

test("The plate pressure is drawn on the loaded face, clear of the opening", () => {
  const solid = pressureGlyph(placed, true, 1);
  // 6 × 5 grid at (i + ½, j + ½) m; (1.5, 0.5) and (1.5, 1.5) lie on the
  // opening and are left out.
  assert.equal(solid.tips.length, 28);
  assert.ok(solid.tips.every((p) => Math.abs(p[2] - 3.45) < 1e-12));
  assert.ok(
    solid.tips.every(
      ([x, y]) => !(x >= 11 && x <= 12 && y >= 20.5 && y <= 21.5),
    ),
  );
  assert.deepEqual(solid.label, [13, 22.5, 3.45]);
  assert.ok(pressureGlyph(placed, false).tips.every((p) => p[2] === 3));
  assert.equal(pressureGlyph({ ...placed, pressure: null }, true), null);
  assert.equal(pressureGlyph({ ...placed, corners: null }, true), null);
});

test("A slab follows the columns it sits on when the view is scoped", () => {
  const rule = (over) => ({
    enabled: true,
    scoped: false,
    isVisible: () => false,
    ...over,
  });
  assert.equal(slabVisible(placed, rule()), true);
  assert.equal(slabVisible(placed, rule({ enabled: false })), false);
  assert.equal(slabVisible({ ...placed, corners: null }, rule()), false);
  assert.equal(slabVisible(placed, rule({ scoped: true })), false);
  assert.equal(
    slabVisible(placed, rule({ scoped: true, isVisible: (id) => id === "t2" })),
    true,
  );
  // No model columns: shown only unscoped.
  const bare = { ...placed, columnNodeIds: [] };
  assert.equal(slabVisible(bare, rule({ scoped: true })), false);
  assert.equal(slabVisible(bare, rule()), true);
});

test("The sketch draws the opening where the plate solve cuts it", () => {
  const d = {
    inputs: { length: 6, width: 5, openingLength: 1, openingWidth: 1 },
  };
  const svg = String(slab.sketch(d, { face: "Top X", panel: placed }));
  // 230 px across 6 m: x = 35 + 1/6 · 230; panel y runs up the page.
  const w = 230,
    h = (160 * 5) / 6,
    x0 = (300 - w) / 2,
    y0 = (200 - h) / 2;
  const rect = svg.match(
    /data-testid="slab-sketch-opening" x="([^"]+)" y="([^"]+)"/,
  );
  assert.ok(rect, svg);
  assert.ok(Math.abs(Number(rect[1]) - (x0 + w / 6)) < 1e-9);
  assert.ok(Math.abs(Number(rect[2]) - (y0 + h - (1.5 / 5) * h)) < 1e-9);
  // No opening analysed, none drawn.
  assert.ok(
    !String(
      slab.sketch(d, { face: "Top X", panel: { ...placed, opening: null } }),
    ).includes("slab-sketch-opening"),
  );
});

test("With model context the caption says where the slab sits", () => {
  const view = { face: "Top X", context: true };
  assert.match(
    slab.caption({}, { ...view, panel: placed }),
    /support level z = 3 m · soffit on 2 members at z = 3\.25 m/,
  );
  assert.match(
    slab.caption(
      {},
      { ...view, panel: { ...placed, soffit: 3, bearingMemberIds: [] } },
    ),
    /soffit at the support level/,
  );
  assert.match(
    slab.caption({}, { ...view, panel: { ...placed, placement: null } }),
    /Not placed in the model/,
  );
  assert.doesNotMatch(
    slab.caption({}, { face: "Top X", context: false, panel: placed }),
    /placed|support/i,
  );
});
