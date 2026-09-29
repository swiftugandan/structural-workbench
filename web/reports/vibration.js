/**
 * Standalone vibration report (M14, dynamics-v1) from a modal result. Every
 * number is the kernel's, embedded with its SI value; the page has no script.
 */
import { entityLabel } from "../entity-labels.js";
import { escape } from "./report.js";

const KINDS = {
  selfMass: "Self mass (ρA of every member)",
  loadCase: "Load case (gravity component ÷ g)",
  nodalMass: "Nodal mass",
};

/** Two global axes with the largest model extent: the drawing plane. */
function plane(project) {
  const extent = [0, 1, 2].map((a) => {
    const v = project.nodes.map((n) => n.position[a]);
    return Math.max(...v) - Math.min(...v);
  });
  if (project.analysisMode === "planarXZ") return [0, 2];
  const order = [0, 1, 2].sort((a, b) => extent[b] - extent[a] || a - b);
  const pair = order.slice(0, 2).sort((a, b) => a - b);
  // Keep Z vertical whenever it is one of the two axes.
  return pair;
}

/** One mode shape in the drawing plane, undeformed in grey. */
function shapeSvg(project, mode, [h, v]) {
  const points = mode.members.flatMap((m) => m.stations.map((s) => s.position));
  const lo = [0, 1, 2].map((a) => Math.min(...points.map((p) => p[a])));
  const hi = [0, 1, 2].map((a) => Math.max(...points.map((p) => p[a])));
  const span = Math.max(hi[h] - lo[h], hi[v] - lo[v], 1e-9);
  const amp = 0.12 * span;
  const W = 460;
  const Hh = 300;
  const pad = 40;
  const k = Math.min(
    (W - 2 * pad) / (hi[h] - lo[h] + 2 * amp || 1),
    (Hh - 2 * pad) / (hi[v] - lo[v] + 2 * amp || 1),
  );
  const x = (p) => pad + (p[h] - lo[h] + amp) * k;
  const y = (p) => Hh - pad - (p[v] - lo[v] + amp) * k;
  const path = (pts) =>
    pts
      .map((p, i) => `${i ? "L" : "M"}${x(p).toFixed(1)} ${y(p).toFixed(1)}`)
      .join("");
  const undeformed = mode.members
    .map(
      (m) =>
        `<path d="${path(m.stations.map((s) => s.position))}" stroke="#9aa7b5" stroke-width="1.5" fill="none"/>`,
    )
    .join("");
  const deformed = mode.members
    .map(
      (m) =>
        `<path d="${path(m.stations.map((s) => s.position.map((c, a) => c + amp * s.displacement[a])))}" stroke="#733da8" stroke-width="2.5" fill="none"/>`,
    )
    .join("");
  const axes = "XYZ";
  return `<figure><svg viewBox="0 0 ${W} ${Hh}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mode ${mode.mode} shape in the global ${axes[h]}${axes[v]} plane">${undeformed}${deformed}</svg><figcaption>Mode ${mode.mode} · ${Number(mode.frequency.toPrecision(5))} Hz · global ${axes[h]}${axes[v]} projection · normalised shape (largest translation drawn at 12 % of the model size), not a response</figcaption></figure>`;
}

export function vibrationReport(project, result, { current = true } = {}) {
  const e = escape;
  const label = (id) => e(entityLabel(project, id));
  const si = (v, digits = 6) =>
    v == null
      ? "<td>—</td>"
      : `<td data-si="${v}">${e(Number(v.toPrecision(digits)))}</td>`;
  const pct = (v) =>
    v == null
      ? "<td>—</td>"
      : `<td data-si="${v}">${(100 * v).toFixed(2)} %</td>`;
  const source = (s) => project.massSources?.find((x) => x.id === s.id) || {};
  const describe = (s) => {
    const d = source(s);
    if (d.kind === "selfMass") return `factor ${e(d.factor)}`;
    if (d.kind === "loadCase") return `${label(d.case)} × ${e(d.factor)}`;
    if (d.kind === "nodalMass") return `at ${label(d.node)}`;
    return "";
  };
  const p = plane(project);
  const shown = result.modes.slice(0, 6);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${e(project.name)} — vibration report</title><style>body{font:15px system-ui;color:#182d43;max-width:1100px;margin:50px auto;padding:24px}h1{font-size:32px}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:right;border-bottom:1px solid #ddd;padding:8px}th:first-child,td:first-child{text-align:left}.banner{padding:20px;background:#fff3d6}.stale{padding:20px;background:#ffe9e4}small{overflow-wrap:anywhere}.shapes{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}figure{margin:0}svg{width:100%;height:auto;background:#f7f9fb}figcaption{font-size:12px;color:#53667c}@media print{body{margin:0;padding:0}tr,figure{break-inside:avoid}}</style>
<header><p>STRUCTURAL WORKBENCH / VIBRATION REPORT</p><h1>${e(project.name)}</h1><p>Modal analysis (dynamics-v1) · ${e(result.massMatrix)} mass · ${result.subdivisions} elements per member · SI units</p><small>Model SHA-256: ${e(result.modelHash)}<br>Solver source: ${e(result.solverBuildHash)}<br>Settings: ${e(result.settingsHash)}<br>Result: ${e(result.resultId)}<br>Created ${e(new Date().toISOString())}</small></header>
${current ? "" : '<p class="stale" data-testid="vibration-stale">STALE — this result belongs to a previous model or mass definition.</p>'}
<p class="banner" data-testid="vibration-banner">Undamped free vibration of the elastic Euler–Bernoulli model with its declared mass. Rotary inertia of sections is neglected and participation is reported for global translations only. Frequencies and participation ratios are not a floor-vibration, comfort or code serviceability verdict. Commercial numerical parity is UNKNOWN.</p>
<h2>Mass</h2><table data-testid="vibration-mass"><tr><th>Source</th><th>Kind</th><th>Definition</th><th>Mass (kg)</th></tr>${[
    ...result.mass.sources,
  ]
    .sort((a, b) =>
      entityLabel(project, a.id).localeCompare(
        entityLabel(project, b.id),
        undefined,
        { numeric: true },
      ),
    )
    .map(
      (s) =>
        `<tr><th>${label(s.id)}</th><td>${e(KINDS[s.kind] || s.kind)}</td><td>${describe(s)}</td>${si(s.mass, 10)}</tr>`,
    )
    .join(
      "",
    )}<tr><th>Total (each direction)</th><td></td><td></td>${si(result.mass.total, 10)}</tr></table>
<h2>Participation</h2><table data-testid="vibration-participation"><tr><th>Direction</th><th>Participating mass (kg)</th><th>Not participating (kg)</th><th>Cumulative ratio</th><th>Omitted modes</th><th>Target</th><th>Achieved</th></tr>${result.participation.map((d) => `<tr><th>${e(d.direction)}</th>${si(d.participatingMass, 10)}${si(d.nonParticipatingMass, 10)}${pct(d.cumulativeRatio)}${pct(d.omittedRatio)}${pct(d.target)}<td data-testid="vibration-achieved-${e(d.direction)}">${d.achieved == null ? "not applicable" : d.achieved ? "yes" : "NO"}</td></tr>`).join("")}</table>
<p>${result.modes.length} of ${result.requestedModes} requested modes are reported. Modes above ${e(Number((result.modes.at(-1)?.frequency ?? 0).toPrecision(5)))} Hz were not computed; their mass is the omitted ratio above.</p>
<h2>Modes</h2><table data-testid="vibration-modes"><tr><th>Mode</th><th>f (Hz)</th><th>T (s)</th><th>ω (rad/s)</th><th>Γ X</th><th>Γ Y</th><th>Γ Z</th><th>M* X</th><th>M* Y</th><th>M* Z</th><th>Σ X</th><th>Σ Y</th><th>Σ Z</th></tr>${result.modes.map((m) => `<tr><th>${m.mode}</th>${si(m.frequency, 10)}${si(m.period, 10)}${si(m.omega, 10)}${m.participationFactor.map((v) => si(v)).join("")}${m.effectiveMassRatio.map(pct).join("")}${m.cumulativeRatio.map(pct).join("")}</tr>`).join("")}</table>
<p><small>Γ = φᵀMr with φ mass-normalised (kg<sup>½</sup>), signed like the drawn shape; M* is Γ² as a fraction of the participating mass.</small></p>
<h2>Mode shapes</h2><div class="shapes">${shown.map((m) => shapeSvg(project, m, p)).join("")}</div>
<h2>Numerical checks and diagnostics</h2><pre>${e(JSON.stringify({ checks: result.numericalChecks, diagnostics: result.diagnostics, disclosures: result.disclosures }, null, 2))}</pre>
<h2>Reproducible project input</h2><pre>${e(JSON.stringify(project, null, 2))}</pre></html>`;
}
