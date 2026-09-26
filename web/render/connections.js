/** Illustrative display geometry only; never changes analytical connectivity or restraints. */
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a) => {
  const l = Math.hypot(...a);
  return l ? a.map((v) => v / l) : [0, 0, 1];
};
export function sectionSize(project, member, catalogue) {
  const shape = catalogue?.shapes.find(
    (s) =>
      member.steelDesign?.sectionRef === `${catalogue.id}:${s.designation}`,
  );
  const section = project.sections.find((s) => s.id === member.section);
  return shape
    ? [shape.d * 0.0254, shape.bf * 0.0254]
    : [2 * (section?.cy || 0.1), 2 * (section?.cz || 0.1)];
}
export function memberDisplayRange(project, member, frame, frames, catalogue) {
  let start = 0,
    end = frame.length;
  const vertical = Math.abs(frame.axes[0][2]) > 0.999;
  for (const [at, nodeId] of [
    [0, member.start],
    [1, member.end],
  ]) {
    const node = project.nodes.find((n) => n.id === nodeId);
    for (const other of project.members.filter(
      (m) => m.id !== member.id && (m.start === nodeId || m.end === nodeId),
    )) {
      const f = frames.find((f) => f.id === other.id);
      if (!f) continue;
      const [depth, width] = sectionSize(project, other, catalogue);
      if (!vertical && Math.abs(f.axes[0][2]) > 0.999) {
        const clearance = Math.min(
          frame.length * 0.2,
          (Math.abs(dot(frame.axes[0], f.axes[1])) * depth +
            Math.abs(dot(frame.axes[0], f.axes[2])) * width) /
            2,
        );
        if (at === 0) start = Math.max(start, clearance);
        else end = Math.min(end, frame.length - clearance);
      } else if (
        vertical &&
        Math.abs(f.axes[0][2]) < 0.001 &&
        node?.position[2] > frame.origin[2]
      ) {
        const extension = Math.min(
          frame.length * 0.1,
          (Math.abs(f.axes[1][2]) * depth + Math.abs(f.axes[2][2]) * width) / 2,
        );
        if (at === 0) start = Math.min(start, -extension);
        else end = Math.max(end, frame.length + extension);
      }
    }
  }
  return [start, end];
}
export function supportMesh(project, support, kind, catalogue) {
  if (!["fixed", "pinned", "roller"].includes(kind)) return null;
  const node = project.nodes.find((n) => n.id === support.node);
  if (!node) return null;
  const neighbours = project.members.filter(
    (m) => m.start === node.id || m.end === node.id,
  );
  const vectors = neighbours.map((m) => {
    const other = project.nodes.find(
      (n) => n.id === (m.start === node.id ? m.end : m.start),
    );
    return unit(other.position.map((v, i) => v - node.position[i]));
  });
  // Prefer a vertical column's bearing plane; a cantilever instead bears on its end plane.
  let normal =
    vectors.find((v) => Math.abs(v[2]) > 0.999) ||
    unit(vectors.reduce((a, v) => a.map((x, i) => x + v[i]), [0, 0, 0]));
  if (kind === "roller") {
    const axis = support.fixed.findIndex((v, i) => v && i < 3);
    normal = [0, 0, 0];
    normal[axis] = vectors.reduce((s, v) => s + v[axis], 0) < 0 ? -1 : 1;
  }
  const u = unit(
      cross(Math.abs(normal[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1], normal),
    ),
    v = cross(normal, u);
  const size = Math.max(
      0.22,
      ...neighbours.flatMap((m) => sectionSize(project, m, catalogue)),
    ),
    r = size * 0.8;
  const transform = ([x, y, z]) =>
    node.position.map((p, i) => p + u[i] * x + v[i] * y + normal[i] * z);
  const triangles = [];
  const tri = (a, b, c, color) =>
    triangles.push({ points: [a, b, c].map(transform), color });
  const box = (x, y, z, w, d, h, color) => {
    const p = [
      [x, y, z],
      [x + w, y, z],
      [x + w, y + d, z],
      [x, y + d, z],
      [x, y, z + h],
      [x + w, y, z + h],
      [x + w, y + d, z + h],
      [x, y + d, z + h],
    ];
    for (const [j, f] of [
      [0, [0, 1, 2, 3]],
      [1, [0, 1, 5, 4]],
      [2, [1, 2, 6, 5]],
      [3, [2, 3, 7, 6]],
      [4, [3, 0, 4, 7]],
      [5, [4, 5, 6, 7]],
    ]) {
      const c = color.map((v, i) => (i === 3 ? v : v * (0.68 + j * 0.055)));
      tri(p[f[0]], p[f[1]], p[f[2]], c);
      tri(p[f[0]], p[f[2]], p[f[3]], c);
    }
  };
  const metal = [0.45, 0.53, 0.62, 1],
    concrete = [0.73, 0.73, 0.7, 1];
  if (kind === "fixed") {
    box(-r, -r, -size * 0.11, 2 * r, 2 * r, size * 0.11, metal);
    box(
      -r * 1.2,
      -r * 1.2,
      -size * 0.55,
      2.4 * r,
      2.4 * r,
      size * 0.44,
      concrete,
    );
  } else {
    box(-r, -r, -size * 0.09, 2 * r, 2 * r, size * 0.09, metal);
    // Bearing barrel under the seat: an illustrative hinge/roller, not a specified product.
    const radius = size * 0.2,
      z = -size * 0.29;
    if (kind === "pinned" && project.analysisMode !== "planarXZ") {
      // Spherical articulation avoids suggesting a single-axis hinge for a spatial pin.
      const at = (a, b) => [
        radius * Math.cos(a) * Math.cos(b),
        radius * Math.sin(a) * Math.cos(b),
        z + radius * Math.sin(b),
      ];
      for (let i = 0; i < 24; i++)
        for (let j = 0; j < 12; j++) {
          const a = (i * Math.PI) / 12,
            b = -Math.PI / 2 + (j * Math.PI) / 12;
          const points = [
            at(a, b),
            at(a + Math.PI / 12, b),
            at(a + Math.PI / 12, b + Math.PI / 12),
            at(a, b + Math.PI / 12),
          ];
          const shade = 0.8 + 0.18 * Math.sin(b);
          const c = metal.map((v, k) => (k === 3 ? v : v * shade));
          tri(points[0], points[1], points[2], c);
          tri(points[0], points[2], points[3], c);
        }
    } else
      for (let i = 0; i < 32; i++) {
        const a = (i * Math.PI) / 16,
          b = ((i + 1) * Math.PI) / 16;
        const p = [
          [-r * 0.7, Math.cos(a) * radius, z + Math.sin(a) * radius],
          [r * 0.7, Math.cos(a) * radius, z + Math.sin(a) * radius],
          [r * 0.7, Math.cos(b) * radius, z + Math.sin(b) * radius],
          [-r * 0.7, Math.cos(b) * radius, z + Math.sin(b) * radius],
        ];
        const c = [
          0.38 + 0.12 * Math.sin(a),
          0.46 + 0.12 * Math.sin(a),
          0.55 + 0.12 * Math.sin(a),
          1,
        ];
        tri(p[0], p[1], p[2], c);
        tri(p[0], p[2], p[3], c);
        tri([-r * 0.7, 0, z], p[3], p[0], metal);
        tri([r * 0.7, 0, z], p[1], p[2], metal);
      }
    if (kind === "pinned" && project.analysisMode === "planarXZ") {
      box(-r, -r * 0.65, -size * 0.5, size * 0.16, r * 1.3, size * 0.4, metal);
      box(
        r - size * 0.16,
        -r * 0.65,
        -size * 0.5,
        size * 0.16,
        r * 1.3,
        size * 0.4,
        metal,
      );
    }
    box(
      -r * 1.2,
      -r * 1.2,
      -size * 0.72,
      2.4 * r,
      2.4 * r,
      size * 0.23,
      concrete,
    );
  }
  return { triangles, normal, size, kind };
}
export function drawSupportMesh(
  mesh,
  projectPoint,
  triangle,
  selected = false,
) {
  for (const t of mesh.triangles)
    triangle(
      ...t.points.map(projectPoint),
      selected ? [0.2, 0.48, 0.85, 1] : t.color,
    );
}
