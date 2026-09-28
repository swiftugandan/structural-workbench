/** Display meshes only. No design resistance, quantities, or contact is calculated here. */
const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, s) => a.map((v) => v * s);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a) => mul(a, 1 / (Math.hypot(...a) || 1));
export function sceneGeometry(
  draft,
  project,
  mode = "both",
  face = "Top X",
  frames = [],
) {
  const faces = [],
    edges = [],
    bars = [],
    labels = [],
    bounds = [];
  const box = (
    origin,
    size,
    color = [0.69, 0.73, 0.76, 0.7],
    transform = (p) => p,
  ) => {
    const p = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ].map((q) => transform(q.map((v, i) => origin[i] + v * size[i])));
    bounds.push(...p);
    for (const [j, ids] of [
      [0, [0, 1, 2, 3]],
      [1, [0, 1, 5, 4]],
      [2, [1, 2, 6, 5]],
      [3, [2, 3, 7, 6]],
      [4, [3, 0, 4, 7]],
      [5, [4, 5, 6, 7]],
    ])
      faces.push({
        points: ids.map((i) => p[i]),
        color: color.map((v, i) => (i === 3 ? v : v * (0.74 + j * 0.045))),
      });
    for (const [a, b] of [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ])
      edges.push([p[a], p[b]]);
  };
  const bar = (a, b, color = [0.12, 0.35, 0.67, 1], width = 2.5) =>
    bars.push({ a, b, color, width });
  const v = draft.inputs;
  if (draft.kind === "rcBeam") {
    const m = project.members.find((m) => m.id === draft.targetId),
      start = project.nodes.find((n) => n.id === m?.start)?.position || [
        0, 0, 0,
      ],
      end = project.nodes.find((n) => n.id === m?.end)?.position || [6.4, 0, 0];
    const frame = frames.find((f) => f.id === m?.id);
    const axis = frame?.axes[0] || unit(end.map((n, i) => n - start[i])),
      length = frame?.length || Math.hypot(...end.map((n, i) => n - start[i])),
      // ADR 0014: draft width along local y, depth along local z (top = +z).
      side =
        frame?.axes[1] ||
        unit(cross(Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0], axis)),
      up = frame?.axes[2] || cross(axis, side);
    const tr = ([x, y, z]) =>
      add(start, add(mul(axis, x), add(mul(side, y), mul(up, z))));
    box(
      [0, -v.width / 2, -v.depth / 2],
      [length, v.width, v.depth],
      [0.6, 0.71, 0.84, mode === "both" ? 0.16 : 0.88],
      tr,
    );
    if (mode !== "concrete") {
      for (const [z, n] of [
        [-v.depth / 2 + v.cover, v.bottomBarCount],
        [v.depth / 2 - v.cover, v.topBarCount],
      ])
        for (let i = 0; i < n; i++) {
          const y =
            -v.width / 2 +
            v.cover +
            ((v.width - 2 * v.cover) * (n === 1 ? 0.5 : i)) /
              Math.max(1, n - 1);
          bar(
            tr([v.cover, y, z]),
            tr([length - v.cover, y, z]),
            z > 0 ? [0.73, 0.22, 0.16, 1] : [0.13, 0.36, 0.72, 1],
            3.2,
          );
        }
      const count = Math.min(
        90,
        Math.max(2, Math.ceil(length / v.linkSpacing)),
      );
      for (let i = 0; i <= count; i++) {
        const x = v.cover + ((length - 2 * v.cover) * i) / count,
          y = v.width / 2 - v.cover,
          z = v.depth / 2 - v.cover,
          p = [tr([x, -y, -z]), tr([x, y, -z]), tr([x, y, z]), tr([x, -y, z])];
        for (let j = 0; j < 4; j++)
          bar(p[j], p[(j + 1) % 4], [0.36, 0.42, 0.49, 0.95], 1.35);
      }
    }
    labels.push(
      {
        point: tr([length / 2, 0, v.depth / 2 + 0.3]),
        text: `${draft.targetId || "RC beam"} · illustrative reinforcement`,
      },
      {
        point: tr([length / 2, 0, -v.depth / 2 - 0.3]),
        text: `${length.toFixed(2)} m · ${v.width * 1000} × ${v.depth * 1000} mm`,
      },
    );
  } else {
    const l = v.length,
      w = v.width,
      t = v.thickness,
      base = [-l / 2, -w / 2, 0];
    if (draft.kind === "slab") {
      const ox = v.openingLength,
        oy = v.openingWidth;
      box(base, [(l - ox) / 2, w, t]);
      box([ox / 2, -w / 2, 0], [(l - ox) / 2, w, t]);
      box([-ox / 2, -w / 2, 0], [ox, (w - oy) / 2, t]);
      box([-ox / 2, oy / 2, 0], [ox, (w - oy) / 2, t]);
      const step = Math.max(v.meshSize, Math.max(l, w) / 35),
        z = t + 0.006;
      for (let x = -l / 2; x <= l / 2; x += step) {
        if (Math.abs(x) < ox / 2) {
          bar([x, -w / 2, z], [x, -oy / 2, z]);
          bar([x, oy / 2, z], [x, w / 2, z]);
        } else bar([x, -w / 2, z], [x, w / 2, z]);
      }
      for (let y = -w / 2; y <= w / 2; y += step) {
        if (Math.abs(y) < oy / 2) {
          bar([-l / 2, y, z], [-ox / 2, y, z]);
          bar([ox / 2, y, z], [l / 2, y, z]);
        } else bar([-l / 2, y, z], [l / 2, y, z]);
      }
      labels.push({
        point: [0, w / 2, t + 0.15],
        text: `${face} · illustrative grid, not FE mesh`,
      });
    } else {
      box(base, [l, w, t], [0.7, 0.72, 0.7, mode === "both" ? 0.25 : 0.9]);
      box(
        [-v.columnWidth / 2, -v.columnDepth / 2, t],
        [v.columnWidth, v.columnDepth, Math.max(0.8, t * 1.6)],
        [0.61, 0.65, 0.68, 0.9],
      );
      if (mode !== "concrete")
        for (let i = 0; i <= 12; i++) {
          const x = -l / 2 + v.cover + ((l - 2 * v.cover) * i) / 12,
            y = -w / 2 + v.cover + ((w - 2 * v.cover) * i) / 12;
          bar([x, -w / 2 + v.cover, v.cover], [x, w / 2 - v.cover, v.cover]);
          bar(
            [-l / 2 + v.cover, y, v.cover + 0.02],
            [l / 2 - v.cover, y, v.cover + 0.02],
          );
        }
      labels.push({
        point: [0, w / 2, t + 0.08],
        text: "Contact INDETERMINATE · no pressure solution",
      });
    }
    labels.push({
      point: [0, -w / 2 - 0.22, 0],
      text: `${l.toFixed(2)} × ${w.toFixed(2)} m · ${t * 1000} mm`,
    });
  }
  // A bound footing is located at its actual support; its top is the support plane.
  if (draft.kind === "padFooting" && draft.targetId) {
    const support = project.supports.find((s) => s.id === draft.targetId);
    const node = project.nodes.find((n) => n.id === support?.node);
    if (node) {
      const place = (p) =>
        p.map(
          (v, i) =>
            v + node.position[i] - (i === 2 ? draft.inputs.thickness : 0),
        );
      for (const f of faces) f.points = f.points.map(place);
      for (let i = 0; i < edges.length; i++) edges[i] = edges[i].map(place);
      for (const b of bars) {
        b.a = place(b.a);
        b.b = place(b.b);
      }
      for (const l of labels) l.point = place(l.point);
      for (let i = 0; i < bounds.length; i++) bounds[i] = place(bounds[i]);
    }
  }
  return {
    faces: mode === "reinforcement" ? [] : faces,
    edges,
    bars,
    labels,
    bounds,
  };
}
export function drawScene(scene, projectPoint, triangle, line) {
  // Back-to-front translucent faces; projected depth is for display only.
  const fs = scene.faces
    .map((f) => ({ ...f, p: f.points.map(projectPoint) }))
    .sort(
      (a, b) =>
        b.p.reduce((s, p) => s + p[2], 0) - a.p.reduce((s, p) => s + p[2], 0),
    );
  for (const f of fs) {
    triangle(f.p[0], f.p[1], f.p[2], f.color);
    triangle(f.p[0], f.p[2], f.p[3], f.color);
  }
  for (const [a, b] of scene.edges)
    line(projectPoint(a), projectPoint(b), 1, [0.37, 0.47, 0.58, 0.7]);
  // Cage overlay is explicitly illustrative, so show bars through the envelope.
  const front = (p) => {
    const q = projectPoint(p);
    return [q[0], q[1], 0.025];
  };
  for (const b of scene.bars) line(front(b.a), front(b.b), b.width, b.color);
}

/** Actual member envelope / catalogue shape in Rust-provided local axes. */
export function drawMemberSurface(
  member,
  section,
  frame,
  shape,
  selected,
  projectPoint,
  triangle,
  line,
  range = [0, frame?.length],
  statusColour = null,
) {
  if (!frame) return;
  const tr = ([x, y, z]) =>
    frame.origin.map(
      (n, i) =>
        n +
        frame.axes[0][i] * (x - frame.length / 2) +
        frame.axes[1][i] * y +
        frame.axes[2][i] * z,
    );
  const depth = shape ? shape.d * 0.0254 : section?.cy * 2,
    width = shape ? shape.bf * 0.0254 : section?.cz * 2;
  if (!(depth > 0 && width > 0)) return;
  const boxes = shape
    ? [
        [0, -depth / 2, -width / 2, frame.length, shape.tf * 0.0254, width],
        [
          0,
          depth / 2 - shape.tf * 0.0254,
          -width / 2,
          frame.length,
          shape.tf * 0.0254,
          width,
        ],
        [
          0,
          -depth / 2 + shape.tf * 0.0254,
          (-shape.tw * 0.0254) / 2,
          frame.length,
          depth - 2 * shape.tf * 0.0254,
          shape.tw * 0.0254,
        ],
      ]
    : [[0, -depth / 2, -width / 2, frame.length, depth, width]];
  for (const [x, y, z, l, d, w] of boxes) {
    const p = [
      [range[0], y, z],
      [range[1], y, z],
      [range[1], y + d, z],
      [range[0], y + d, z],
      [range[0], y, z + w],
      [range[1], y, z + w],
      [range[1], y + d, z + w],
      [range[0], y + d, z + w],
    ]
      .map(tr)
      .map(projectPoint);
    for (const [i, face] of [
      [0, [0, 1, 2, 3]],
      [1, [0, 1, 5, 4]],
      [2, [1, 2, 6, 5]],
      [3, [2, 3, 7, 6]],
      [4, [3, 0, 4, 7]],
      [5, [4, 5, 6, 7]],
    ]) {
      const shade = 0.67 + i * 0.04,
        color = statusColour
          ? statusColour.map((v, index) => (index === 3 ? v : v * shade))
          : selected
            ? [0.12 * shade, 0.4 * shade, 0.88 * shade, 1]
            : [shade, shade + 0.035, shade + 0.06, 1];
      triangle(p[face[0]], p[face[1]], p[face[2]], color);
      triangle(p[face[0]], p[face[2]], p[face[3]], color);
    }
    for (const [a, b] of [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ])
      line(
        p[a],
        p[b],
        0.7,
        selected ? [0.08, 0.3, 0.75, 1] : [0.4, 0.46, 0.52, 1],
      );
  }
}
