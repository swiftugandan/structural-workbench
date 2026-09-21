const names = ["X", "Y", "Z"];
const colors = ["#b43e36", "#167447", "#225dc7"];
export function orientationAxes(basis) {
  return names.map((name, i) => ({
    name,
    color: colors[i],
    x: basis[0][i],
    y: -basis[1][i],
    depth: basis[2][i],
  }));
}
export function orientationSvg(basis) {
  const axes = orientationAxes(basis).sort((a, b) => a.depth - b.depth);
  return `<svg viewBox="0 0 120 110" role="img" aria-label="Global axes follow the camera: X red, Y green, Z blue"><circle cx="58" cy="56" r="3" fill="#64748b"/>${axes
    .map((a) => {
      const x = 58 + a.x * 33,
        y = 56 + a.y * 33,
        length = Math.hypot(a.x, a.y);
      const endOn = length < 0.15;
      const tx = endOn ? 58 : x + (a.x / length) * 12,
        ty = endOn ? 82 : y + (a.y / length) * 12;
      return `<g data-global-axis="${a.name}" data-direction="${a.x},${a.y}" stroke="${a.color}" fill="${a.color}">${endOn ? `<circle cx="58" cy="56" r="7" fill="none" stroke-width="2"/>` : `<path d="M58 56 L${x} ${y}" stroke-width="2.5" fill="none"/><path d="M${x - (a.x / length) * 6 + (a.y / length) * 3} ${y - (a.y / length) * 6 - (a.x / length) * 3} L${x} ${y} L${x - (a.x / length) * 6 - (a.y / length) * 3} ${y - (a.y / length) * 6 + (a.x / length) * 3}" fill="none" stroke-width="2"/>`}<text x="${tx}" y="${ty}" stroke="none" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="700">${a.name}</text><title>Global ${a.name}${endOn ? " (end-on)" : ""}</title></g>`;
    })
    .join(
      "",
    )}<text x="60" y="103" text-anchor="middle" fill="#52657b" font-size="10">GLOBAL AXES</text></svg>`;
}
export function referenceGrid(origin, extent, spacing) {
  // Bounded, snap-aligned XY reference lattice centered near the model.
  const step = spacing * Math.max(1, Math.ceil(extent / (10 * spacing)));
  const cx = Math.round(origin[0] / step) * step,
    cy = Math.round(origin[1] / step) * step;
  return { step, cx, cy, radius: step * 6 };
}
