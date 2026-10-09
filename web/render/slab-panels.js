/** Slab panels in the model views (ADR 0035). Display meshes only: the
 * outline, opening and placement come from Rust (`queryGeometry` axes →
 * `slabs`); this module extrudes and splits them for drawing. */

const sub = (a, b) => a.map((v, i) => v - b[i]);
const unit = (a) => {
  const l = Math.hypot(...a) || 1;
  return a.map((v) => v / l);
};
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Whether a slab is drawn. A placed slab follows the columns it sits on: in
 * a storey, layer or isolation scope it shows when one of its model columns'
 * nodes does, and a slab without model columns shows only unscoped. */
export function slabVisible(slab, { enabled, scoped, isVisible }) {
  if (!enabled || !slab.corners) return false;
  if (!scoped) return true;
  return slab.columnNodeIds.some((id) => isVisible(id));
}

/** The panel minus its opening as rectangles [x0, x1, y0, y1] in panel
 * coordinates; zero-width strips (an opening on an edge) are dropped. */
export function panelRegions(length, width, opening) {
  if (!opening) return [[0, length, 0, width]];
  const [x0, x1, y0, y1] = opening;
  return [
    [0, x0, 0, width],
    [x1, length, 0, width],
    [x0, x1, 0, y0],
    [x0, x1, y1, width],
  ].filter(([a, b, c, d]) => b - a > 0 && d - c > 0);
}

/** Panel coordinates (x, y, height above the support level) to the model. */
function panelFrame(slab) {
  const [c0, c1, , c3] = slab.corners;
  const ex = unit(sub(c1, c0)),
    ey = unit(sub(c3, c0)),
    n = unit(cross(ex, ey));
  return (x, y, z) => c0.map((v, i) => v + ex[i] * x + ey[i] * y + n[i] * z);
}

/** Faces and edges of one placed slab in model coordinates.
 *
 * - `solid` (physical): the slab from its drawn soffit, where it bears on the
 *   members at its support level, up by its thickness, with the opening's
 *   walls.
 * - otherwise (analytical): the support-level surface, with the outline and
 *   opening rings, as line members sit on their nodes.
 *
 * Faces are quads `{points, shade}` (shade 1 for the plan faces, lower for
 * walls); edges are segments. Returns null for an unplaced slab. */
export function slabMesh(slab, solid) {
  if (!slab.corners) return null;
  const at = panelFrame(slab);
  const quad = ([x0, x1, y0, y1], z) => [
    at(x0, y0, z),
    at(x1, y0, z),
    at(x1, y1, z),
    at(x0, y1, z),
  ];
  const ring = (r, z) => {
    const q = quad(r, z);
    return q.map((p, i) => [p, q[(i + 1) % 4]]);
  };
  const outer = [0, slab.length, 0, slab.width];
  const rings = slab.opening ? [outer, slab.opening] : [outer];
  const regions = panelRegions(slab.length, slab.width, slab.opening);
  const faces = [],
    edges = [];
  if (!solid) {
    for (const r of regions) faces.push({ points: quad(r, 0), shade: 1 });
    for (const r of rings) edges.push(...ring(r, 0));
    return { faces, edges };
  }
  const bottom = slabLift(slab),
    top = bottom + slab.thickness;
  for (const r of regions)
    for (const z of [top, bottom]) faces.push({ points: quad(r, z), shade: 1 });
  for (const r of rings) {
    const up = quad(r, top),
      down = quad(r, bottom);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      faces.push({ points: [down[i], down[j], up[j], up[i]], shade: 0.82 });
      edges.push([up[i], up[j]], [down[i], down[j]], [up[i], down[i]]);
    }
  }
  return { faces, edges };
}

/** Height of the drawn soffit above the support level (0 on columns alone). */
export function slabLift(slab) {
  return slab.soffit == null ? 0 : slab.soffit - slab.corners[0][2];
}

/** Where to draw the slab's plate pressure: arrow tips on the loaded face
 * (the top in the solid view, the support plane otherwise), on an even grid
 * of about `spacing` metres clear of the opening, and an anchor for its
 * label at the panel centre. Null when the slab is unplaced or unloaded. */
export function pressureGlyph(slab, solid, spacing = 1.5) {
  if (!slab.corners || !(slab.pressure > 0)) return null;
  const at = panelFrame(slab);
  const z = solid ? slabLift(slab) + slab.thickness : 0;
  const steps = (l) => Math.max(2, Math.round(l / spacing));
  const nx = steps(slab.length),
    ny = steps(slab.width);
  const o = slab.opening;
  const tips = [];
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      const x = ((i + 0.5) * slab.length) / nx,
        y = ((j + 0.5) * slab.width) / ny;
      if (o && x >= o[0] && x <= o[1] && y >= o[2] && y <= o[3]) continue;
      tips.push(at(x, y, z));
    }
  return { tips, label: at(slab.length / 2, slab.width / 2, z) };
}
