/** Dimensioned elevation of a single-plate connection (M13, ADR 0030) from
 * the run's Rust geometry: every dimension value and label is a Rust value;
 * only the placement of the dimension lines is chosen here. No imports, so
 * the workspace and the calculation record share it. */
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const mm = (v) =>
  new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 1,
    signDisplay: "negative",
  }).format(v * 1000);

export function connectionDrawing(code) {
  const g = code?.geometry;
  if (!g) return "<p>Run the connection check for the dimensioned drawing.</p>";
  const W = 640,
    H = 500;
  const depth = g.beam.depth,
    ts = Math.max(g.support.thickness, 0.008);
  // The beam continues past the plate for context.
  const right = g.plate.x1 + 0.6 * depth;
  const s = Math.min((W - 250) / (right + ts), (H - 130) / (depth + 0.06));
  const ox = 130,
    oy = 60;
  const X = (x) => ox + s * x,
    Y = (y) => oy + s * y;
  const line = (x1, y1, x2, y2, extra = "") =>
    `<path d="M${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}" ${extra}/>`;
  const support = `<rect x="${X(-ts)}" y="${Y(-0.03)}" width="${s * ts}" height="${s * (depth + 0.06)}" fill="#9aa8b6" stroke="#516b82" data-testid="conn-support"/><text x="${X(-ts / 2)}" y="${Y(depth + 0.03) + 16}" text-anchor="middle">${esc(g.support.designation)} ${esc(
    String(g.support.kind)
      .replace(/([A-Z])/g, " $1")
      .toLowerCase(),
  )}</text>`;
  const b0 = g.beam.end;
  const beam = `<g fill="#eef2f6" stroke="#516b82"><rect x="${X(b0)}" y="${Y(0)}" width="${s * (right - b0)}" height="${s * g.beam.flange}"/><rect x="${X(b0)}" y="${Y(depth - g.beam.flange)}" width="${s * (right - b0)}" height="${s * g.beam.flange}"/>${line(X(b0), Y(g.beam.flange), X(b0), Y(depth - g.beam.flange), 'fill="none"')}</g><g stroke="#8a9bb0" stroke-dasharray="4 3">${line(X(b0), Y(g.beam.kdes), X(right), Y(g.beam.kdes))}${line(X(b0), Y(depth - g.beam.kdes), X(right), Y(depth - g.beam.kdes))}</g><text x="${X(right) - 4}" y="${Y(depth) + 14}" text-anchor="end">${esc(g.beam.designation)} · k<tspan font-size="8" dy="2">des</tspan><tspan dy="-2"> lines dashed</tspan></text>`;
  const plate = `<rect x="${X(g.plate.x0)}" y="${Y(g.plate.y0)}" width="${s * (g.plate.x1 - g.plate.x0)}" height="${s * (g.plate.y1 - g.plate.y0)}" fill="#c9d9e8" fill-opacity="0.85" stroke="#142b44" stroke-width="1.5" data-testid="conn-plate"/>`;
  const holes = g.bolts.x
    .flatMap((x) =>
      g.bolts.y.map(
        (y) =>
          `<circle cx="${X(x)}" cy="${Y(y)}" r="${Math.max((s * g.bolts.hole) / 2, 3)}" fill="#fff" stroke="#142b44" data-testid="conn-bolt"/>`,
      ),
    )
    .join("");
  const w = s * g.weld.size;
  const weld = `<g fill="#c17f26" data-testid="conn-weld"><path d="M${X(0)},${Y(g.plate.y0)}h${w}l${-w},${-w}z"/><path d="M${X(0)},${Y(g.plate.y1)}h${w}l${-w},${w}z"/></g>`;
  // Dimension placement: the horizontal chain above the beam, the beam edge
  // below the plate, the vertical chain right of the plate, the plate length
  // left of the support.
  const top = Y(0) - 22,
    below = Y(g.plate.y1) + 24,
    rightCol = X(g.plate.x1) + 22,
    leftCol = X(-ts) - 26;
  const tick = 'marker-start="url(#tick)" marker-end="url(#tick)"';
  const dims = g.dimensions
    .filter((d) => d.present !== false && d.value > 0)
    .map((d) => {
      const total = d.count ? d.value * d.count : d.value;
      const text = `${esc(d.label)} ${mm(total)}${d.count ? ` (${d.count} × ${mm(d.value)})` : ""}`;
      const attrs = `data-testid="conn-dimension" data-label="${esc(d.label)}" data-si="${d.value}"`;
      if (d.axis === "x") {
        // a on the upper row; the gauge and plate edge on the lower row.
        const y =
          d.label === "leh (beam)" ? below : d.label === "a" ? top - 18 : top;
        const [x1, x2] = [X(d.from[0]), X(d.to[0])];
        const ext = `${line(x1, y - 4, x1, d.label === "leh (beam)" ? Y(d.from[1]) : Y(0), 'stroke="#9aa8b6" stroke-width="0.6"')}${line(x2, y - 4, x2, d.label === "leh (beam)" ? Y(d.to[1]) : Y(0), 'stroke="#9aa8b6" stroke-width="0.6"')}`;
        const ty = d.label === "leh (beam)" ? y + 14 : y - 5;
        return `<g ${attrs}>${ext}${line(x1, y, x2, y, `stroke="#142b44" ${tick}`)}<text x="${(x1 + x2) / 2}" y="${ty}" text-anchor="middle">${text}</text></g>`;
      }
      const x = d.label === "l" ? leftCol : rightCol;
      const [y1, y2] = [Y(d.from[1]), Y(d.to[1])];
      const anchor = d.label === "l" ? "end" : "start",
        tx = d.label === "l" ? x - 6 : x + 6;
      return `<g ${attrs}>${line(x, y1, x, y2, `stroke="#142b44" ${tick}`)}<text x="${tx}" y="${(y1 + y2) / 2 + 4}" text-anchor="${anchor}">${text}</text></g>`;
    })
    .join("");
  const title = `<text x="${W / 2}" y="${H - 14}" text-anchor="middle" font-weight="600">PL ${mm(g.plate.thickness)} × ${mm(g.plate.width)} × ${mm(g.plate.length)} · ${g.bolts.x.length * g.bolts.y.length} × ${esc(g.bolts.designation)} bolts in Ø${mm(g.bolts.hole)} holes · ${mm(g.weld.size)} fillet both sides · mm</text>`;
  return `<svg class="conn-drawing" viewBox="0 0 ${W} ${H}" role="img" aria-label="Single-plate connection elevation" data-testid="conn-drawing"><defs><marker id="tick" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="8" markerHeight="8"><path d="M1,7L7,1" stroke="#142b44" stroke-width="1.2"/></marker></defs>${support}${beam}${plate}${weld}${holes}${dims}${title}</svg>`;
}
