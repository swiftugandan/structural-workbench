// Deterministic connected multibay frame generator.
// Default seed layout: 20×25×10 nodes (5,000), columns + floor beams, fixed bases.
export function frame(base, count = 10000, options = {}) {
  const seed = options.seed ?? 1;
  const nx = options.nx ?? 20,
    ny = options.ny ?? 25,
    nz = options.nz ?? 10;
  const p = structuredClone(base);
  p.id = options.id ?? "cadCapacity";
  p.name = options.name ?? "CAD capacity frame";
  p.analysisMode = "spatial";
  p.nodes = [];
  p.members = [];
  p.supports = [];
  p.loads = [];
  p.combinations = [];
  const id = (x, y, z) => `n${z * nx * ny + y * nx + x}`;
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const node = id(x, y, z);
        p.nodes.push({ id: node, position: [x * 4, y * 4, z * 3] });
        if (!z)
          p.supports.push({
            id: `s${x + y * nx}`,
            node,
            fixed: Array(6).fill(true),
            prescribed: Array(6).fill(0),
          });
      }
  const add = (a, b) =>
    p.members.push({
      ...base.members[0],
      id: `m${p.members.length}`,
      start: a,
      end: b,
      localY: [1, 1, 0],
    });
  // Vertical columns first, then floor beams. Keep exactly the requested count.
  for (let z = 1; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) add(id(x, y, z - 1), id(x, y, z));
  for (let z = 0; z < nz && p.members.length < count; z++)
    for (let y = 0; y < ny && p.members.length < count; y++)
      for (let x = 0; x < nx && p.members.length < count; x++) {
        if (x + 1 < nx) add(id(x, y, z), id(x + 1, y, z));
        if (y + 1 < ny && p.members.length < count)
          add(id(x, y, z), id(x, y + 1, z));
      }
  p.members = p.members.slice(0, count);
  if (count < nx * ny * (nz - 1) + nx * ny * nz * 2) {
    const used = new Set(p.members.flatMap((m) => [m.start, m.end]));
    p.nodes = p.nodes.filter((n) => used.has(n.id));
    p.supports = p.supports.filter((s) => used.has(s.node));
  }
  p.loads = [
    {
      id: "loadRoof",
      type: "nodal",
      case: p.loadCases[0].id,
      node: p.nodes.at(-1).id,
      values: [1000, 0, -1000, 0, 0, 0],
    },
  ];
  p.metadata = {
    ...(p.metadata || {}),
    description: `Multibay generator seed=${seed} grid=${nx}x${ny}x${nz} members=${p.members.length}`,
    createdBy: p.metadata?.createdBy || "Structural Workbench",
    entityLabels: p.metadata?.entityLabels || {},
  };
  return p;
}
