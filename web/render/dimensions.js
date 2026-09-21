// Screen-space layout only. Lengths are supplied by the Rust geometry query.
export function dimensionLayout(a, b, center, offset = 38, bounds = null) {
  let start = a,
    end = b;
  if (b[0] < a[0] || (b[0] === a[0] && b[1] < a[1])) [start, end] = [b, a];
  const dx = end[0] - start[0],
    dy = end[1] - start[1],
    span = Math.hypot(dx, dy);
  if (span < 28) return null;
  const tangent = [dx / span, dy / span];
  let normal = [-tangent[1], tangent[0]];
  const mid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  if ((mid[0] - center[0]) * normal[0] + (mid[1] - center[1]) * normal[1] < 0)
    normal = normal.map((v) => -v);
  if (bounds) {
    const x = mid[0] + normal[0] * offset,
      y = mid[1] + normal[1] * offset;
    if (x < 28 || x > bounds[0] - 28 || y < 16 || y > bounds[1] - 16)
      normal = normal.map((v) => -v);
  }
  const shift = (p, d) => [p[0] + normal[0] * d, p[1] + normal[1] * d, 0.15];
  const u = shift(start, offset),
    v = shift(end, offset);
  const segments = [
    [shift(start, 7), shift(start, offset + 6)],
    [shift(end, 7), shift(end, offset + 6)],
    [u, v],
  ];
  for (const [tip, sign] of [
    [u, 1],
    [v, -1],
  ])
    for (const side of [-1, 1])
      segments.push([
        tip,
        [
          tip[0] + sign * tangent[0] * 7 + normal[0] * side * 3,
          tip[1] + sign * tangent[1] * 7 + normal[1] * side * 3,
          0.15,
        ],
      ]);
  return {
    segments,
    mid: shift(mid, offset),
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}
export function dimensionText(metres) {
  if (!Number.isFinite(metres) || metres <= 0) return null;
  return `${Number(metres.toPrecision(8)).toLocaleString("en-GB", { maximumSignificantDigits: 8 })} m`;
}
