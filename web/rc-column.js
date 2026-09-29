/** RC column section mechanics (ADR 0022): the interaction contour and the
 * per-station table from the Rust run record. Display only. */
import { escape as esc } from "./reports/report.js";
import { pretty } from "./design-presentation.js";

const kN = (v) => `${pretty(v / 1000, 1)} kN`;
const kNm = (v) => `${pretty(v / 1000, 1)} kN·m`;

/** Cross-section sketch with the kernel's perimeter bar positions. */
export function columnSketch(d) {
  const v = d.inputs,
    s = 180 / Math.max(v.width, v.depth),
    w = v.width * s,
    h = v.depth * s,
    x0 = 150 - w / 2,
    y0 = 110 - h / 2;
  const inset = v.cover + v.linkDiameter + v.barDiameter / 2,
    a = v.width / 2 - inset,
    c = v.depth / 2 - inset,
    at = (k, n, half) => -half + (2 * half * k) / (n - 1),
    pts = [];
  for (const z of [-c, c])
    for (let k = 0; k < v.barsAlongWidth; k++)
      pts.push([at(k, v.barsAlongWidth, a), z]);
  for (const y of [-a, a])
    for (let k = 1; k < v.barsAlongDepth - 1; k++)
      pts.push([y, at(k, v.barsAlongDepth, c)]);
  const r = Math.max(2.5, (v.barDiameter / 2) * s);
  const link = (v.cover + v.linkDiameter / 2) * s;
  return `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#dce6ef" stroke="#516b82"/><rect x="${x0 + link}" y="${y0 + link}" width="${w - 2 * link}" height="${h - 2 * link}" rx="4" fill="none" stroke="#62798a"/>${pts.map(([y, z]) => `<circle cx="${150 + y * s}" cy="${110 - z * s}" r="${r}" fill="#1167a2"/>`).join("")}<text x="150" y="218" text-anchor="middle">y → · z ↑ · ${pts.length} bars · fit unverified</text>`;
}

/** The resistance contour at N_Ed in the (My, Mz) plane with the demand
 * points of the stations at that axial force. */
function contourSvg(cm) {
  const pts = cm.contour.points,
    nEd = cm.contour.nEd;
  const at = (cm.stations || []).filter(
    (s) =>
      s.status === "evaluated" &&
      Math.abs(s.nEd - nEd) <= 1e-9 * Math.max(1, Math.abs(nEd)),
  );
  const extent =
    Math.max(
      ...pts.map(([y, z]) => Math.max(Math.abs(y), Math.abs(z))),
      ...at.map((s) => Math.max(Math.abs(s.myEd), Math.abs(s.mzEd))),
    ) * 1.12 || 1;
  const W = 360,
    c = W / 2,
    k = (W / 2 - 24) / extent;
  const X = (my) => c + my * k,
    Y = (mz) => c - mz * k;
  const poly = pts.map(([y, z]) => `${X(y).toFixed(2)},${Y(z).toFixed(2)}`);
  const gov = cm.governing?.index;
  const dots = at
    .map((s) => {
      const i = cm.stations.indexOf(s);
      return `<circle cx="${X(s.myEd)}" cy="${Y(s.mzEd)}" r="${i === gov ? 6 : 4}" fill="${s.utilisation > 1 ? "#b42828" : "#142b44"}" ${i === gov ? 'stroke="#fff" stroke-width="2"' : ""}><title>station ${pretty(s.station, 3)} · utilisation ${pretty(s.utilisation, 3)}</title></circle>`;
    })
    .join("");
  return `<svg class="column-contour" viewBox="0 0 ${W} ${W}" role="img" aria-label="Resistance contour at the governing axial force" data-testid="column-contour" data-points="${pts.length}" data-demands="${at.length}"><line x1="12" y1="${c}" x2="${W - 12}" y2="${c}" stroke="#b8c4d0"/><line x1="${c}" y1="12" x2="${c}" y2="${W - 12}" stroke="#b8c4d0"/><polygon points="${poly.join(" ")}" fill="rgba(34,93,199,0.10)" stroke="#225dc7" stroke-width="2"/>${dots}<text x="${W - 14}" y="${c - 6}" text-anchor="end" font-size="11" fill="#53667c">My</text><text x="${c + 6}" y="20" font-size="11" fill="#53667c">Mz</text><text x="14" y="${W - 10}" font-size="11" fill="#142b44">N = ${kN(nEd)} · scale ±${kNm(extent)}</text></svg>`;
}

export function columnPane(run) {
  const cm = run?.columnMechanics;
  if (!cm)
    return '<p data-testid="column-status">Run the preview to compute the section mechanics.</p>';
  const banner =
    '<p class="design-note">MECHANICS ONLY · explicit material law and strain limits, no partial factors, slenderness or minimum eccentricity. Never a code resistance or PASS.</p>';
  if (cm.status !== "evaluated")
    return `<h4>Column section mechanics</h4>${banner}<p data-testid="column-status">${esc(cm.status === "notConfigured" ? "Not configured" : "Unsupported")} · ${esc(cm.reason || "")}</p>`;
  const r = cm.axialRange,
    g = cm.governing;
  const rows = (cm.stations || [])
    .map(
      (s, i) =>
        `<tr data-testid="column-station" data-status="${esc(s.status)}"${i === g?.index ? ' class="governing"' : ""}><td>${pretty(s.station, 3)}${s.side ? ` ${esc(s.side)}` : ""}</td><td>${kN(s.nEd)}</td><td>${kNm(s.myEd)}</td><td>${kNm(s.mzEd)}</td><td>${s.capacity ? kNm(s.capacity.mRd) : "—"}</td><td data-si="${s.utilisation ?? ""}">${s.status === "evaluated" ? pretty(s.utilisation, 3) : s.status === "beyondAxialRange" ? "beyond N range" : esc(s.reason || "refused")}</td></tr>`,
    )
    .join("");
  const stations = cm.stations?.length
    ? `<table><thead><tr><th>Station</th><th>N<sub>Ed</sub> (comp. +)</th><th>My</th><th>Mz</th><th>M<sub>Rd</sub>(N, θ)</th><th>M<sub>Ed</sub>/M<sub>Rd</sub></th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p data-testid="column-demand">${esc(cm.demand.reason || "No station actions")}</p>`;
  return `<div class="column-pane" data-testid="column-pane"><div>${cm.contour.status === "evaluated" ? contourSvg(cm) : `<p>${esc(cm.contour.reason)}</p>`}</div><div><h4>Column section mechanics <span class="design-tag">MECHANICS · rc-column</span></h4>${banner}<table><tbody><tr><td>Section</td><td>${pretty(cm.section.width * 1000, 0)} × ${pretty(cm.section.depth * 1000, 0)} mm · ${cm.section.barCount} bars · A<sub>s</sub> ${pretty(cm.section.steelArea * 1e6, 0)} mm²</td></tr><tr><td>Axial range</td><td data-testid="column-squash" data-si="${r.squash}">${kN(r.tension)} … ${kN(r.squash)}${r.tensionAttained ? "" : " (tension approached)"}</td></tr><tr><td>Governing</td><td data-testid="column-governing" data-si="${g?.utilisation ?? ""}">${g ? `${pretty(g.utilisation, 3)} at station ${pretty(g.station, 3)}` : cm.beyondAxialRange ? "N beyond the axial range" : "—"}</td></tr></tbody></table>${stations}<p class="design-note">${esc(cm.convention)}. ${cm.limitations.map(esc).join(". ")}.</p></div></div>`;
}
