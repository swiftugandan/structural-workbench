/**
 * Standalone dynamic response report (M15, response-v1) for a harmonic or a
 * response-spectrum result. Every number is the kernel's, with its SI value
 * in data-si; the page has no script. Mechanics only: a user spectrum is not
 * a code spectrum and no code check is claimed.
 */
import { escape } from "./report.js";
import { linePlot } from "../response.js";

const sig = (v, n = 5) =>
  Number.isFinite(v) ? String(Number(v.toPrecision(n))) : "—";
const si = (v, scale = 1, n = 6) =>
  `<td data-si="${v}">${sig(v / scale, n)}</td>`;

function harmonicBody(project, r, e, label) {
  const peaks = r.nodeIds
    .map((id, k) => {
      const amp = (a) =>
        Math.max(
          ...r.frequencies.map((f) =>
            Math.hypot(
              f.displacementRe[k * 6 + a],
              f.displacementIm[k * 6 + a],
            ),
          ),
        );
      return `<tr><th scope="row">${e(label(id))}</th>${[0, 1, 2].map((a) => si(amp(a), 1e-3)).join("")}</tr>`;
    })
    .join("");
  // Frequency response of the largest translational amplitude.
  let best = [0, 0];
  for (const f of r.frequencies)
    f.displacementRe.forEach((re, k) => {
      if (k % 6 < 3) {
        const a = Math.hypot(re, f.displacementIm[k]);
        if (a > best[0]) best = [a, k];
      }
    });
  const k = best[1];
  const xs = r.frequencies.map((f) => f.frequency);
  const plot = linePlot({
    xs,
    series: [
      {
        name: `|${"xyz"[k % 6]}| at ${label(r.nodeIds[Math.floor(k / 6)])}`,
        ys: r.frequencies.map((f) =>
          Math.hypot(f.displacementRe[k], f.displacementIm[k]),
        ),
        color: "#225dc7",
      },
    ],
    xLabel: "Frequency (Hz)",
    yLabel: "Amplitude (m)",
    logX: xs.length > 2 && xs.at(-1) / xs[0] > 20,
    logY: true,
    testid: "report-harmonic-frf",
  });
  const reactions = r.supportIds
    .map((id, s) => {
      const amp = (a) =>
        Math.max(
          ...r.frequencies.map((f) =>
            Math.hypot(f.reactionRe[s * 6 + a], f.reactionIm[s * 6 + a]),
          ),
        );
      return `<tr><th scope="row">${e(label(id))}</th>${[0, 1, 2, 3, 4, 5].map((a) => si(amp(a), 1e3)).join("")}</tr>`;
    })
    .join("");
  return `<h2>Harmonic response</h2>
<p>Load ${e(label(r.caseId))} applied as F·cos(Ωt) at ${r.frequencies.length} frequencies from ${sig(xs[0])} to ${sig(xs.at(-1))} Hz. Rayleigh damping a₀ = ${sig(r.damping.a0)} s⁻¹, a₁ = ${sig(r.damping.a1)} s${r.damping.ratio ? ` (ζ = ${sig(r.damping.ratio * 100, 4)} % at ${r.damping.frequencies.map((f) => sig(f)).join(" and ")} Hz)` : ""}. ${e(r.massMatrix)} mass, ${r.subdivisions} elements per member; direct complex solve, max residual ${r.numericalChecks.maxResidual.toExponential(1)}.</p>
<figure>${plot}</figure>
<h3>Peak displacement amplitudes over the sweep (mm)</h3>
<table data-testid="report-harmonic-peaks"><thead><tr><th scope="col">Node</th><th>|ux|</th><th>|uy|</th><th>|uz|</th></tr></thead><tbody>${peaks}</tbody></table>
<h3>Peak support reaction amplitudes (kN, kN·m)</h3>
<table><thead><tr><th scope="col">Support</th><th>Fx</th><th>Fy</th><th>Fz</th><th>Mx</th><th>My</th><th>Mz</th></tr></thead><tbody>${reactions}</tbody></table>`;
}

function spectrumBody(project, r, e, label) {
  const spectrum = project.responseSpectra?.find((s) => s.id === r.spectrumId);
  const table = spectrum
    ? `<table><thead><tr><th scope="col">T (s)</th><th>Sa (m/s²)</th></tr></thead><tbody>${spectrum.points.map(([t, sa]) => `<tr><td data-si="${t}">${sig(t)}</td>${si(sa)}</tr>`).join("")}</tbody></table><p>Spectrum ${e(label(spectrum.id))} · ${e(spectrum.name)} · ζ = ${sig(spectrum.dampingRatio * 100, 4)} % · reference: ${e(spectrum.reference || "none given")}</p>`
    : "";
  const modes = r.modes
    .map(
      (m) =>
        `<tr><th scope="row">${m.mode}</th>${si(m.period)}${si(m.sa)}${si(m.participationFactor)}<td>${m.effectiveMassRatio == null ? "—" : `${(m.effectiveMassRatio * 100).toFixed(2)} %`}</td>${si(m.baseShear, 1e3)}</tr>`,
    )
    .join("");
  const reactions = r.supportIds
    .map(
      (id, s) =>
        `<tr><th scope="row">${e(label(id))}</th>${[0, 1, 2, 3, 4, 5].map((a) => si(r.reactions[s * 6 + a], 1e3)).join("")}</tr>`,
    )
    .join("");
  const members = r.members
    .map(
      (m) =>
        `<tr data-testid="report-spectrum-member"><th scope="row">${e(label(m.id))}</th>${[0, 1, 2, 3, 4, 5].map((c) => si(Math.max(...m.stations.map((s) => s.actions[c])), 1e3)).join("")}</tr>`,
    )
    .join("");
  const nodes = r.nodeIds
    .map(
      (id, k) =>
        `<tr><th scope="row">${e(label(id))}</th>${[0, 1, 2].map((a) => si(r.nodeDisplacements[k * 6 + a], 1e-3)).join("")}</tr>`,
    )
    .join("");
  const p = r.participation;
  const dir = "XYZ".indexOf(r.direction);
  return `<h2>Response-spectrum analysis</h2>
<p>Direction ${e(r.direction)}, scale ${sig(r.scale)}, ${e(r.combination.toUpperCase())} combination (ζ = ${sig(r.dampingRatio * 100, 4)} %), ${r.modes.length} modes, ${e(r.massMatrix)} mass, ${r.subdivisions} elements per member.</p>
<p data-testid="report-spectrum-base">Combined base reaction in ${e(r.direction)}: <strong data-si="${r.baseReaction[dir]}">${sig(r.baseReaction[dir] / 1e3)} kN</strong>. Participation ${(p.cumulativeRatio * 100).toFixed(1)} % against a ${(p.target * 100).toFixed(1)} % target (${p.achieved ? "met" : "not met; no missing-mass correction"}).</p>
${table}
<h3>Modal contributions</h3>
<table data-testid="report-spectrum-modes"><thead><tr><th scope="col">Mode</th><th>T (s)</th><th>Sa (m/s²)</th><th>Γ</th><th>Mass</th><th>Base shear (kN)</th></tr></thead><tbody>${modes}</tbody></table>
<h3>Support reactions (peak magnitudes, kN and kN·m)</h3>
<table><thead><tr><th scope="col">Support</th><th>Fx</th><th>Fy</th><th>Fz</th><th>Mx</th><th>My</th><th>Mz</th></tr></thead><tbody>${reactions}</tbody></table>
<h3>Member section actions (largest along each member; kN, kN·m)</h3>
<table><thead><tr><th scope="col">Member</th><th>|N|</th><th>|Vy|</th><th>|Vz|</th><th>|T|</th><th>|My|</th><th>|Mz|</th></tr></thead><tbody>${members}</tbody></table>
<h3>Node displacements (peak magnitudes, mm)</h3>
<table><thead><tr><th scope="col">Node</th><th>|ux|</th><th>|uy|</th><th>|uz|</th></tr></thead><tbody>${nodes}</tbody></table>`;
}

export function responseReport(
  project,
  r,
  { current = true, label = (id) => id } = {},
) {
  const e = escape;
  const body =
    r.analysisType === "harmonic"
      ? harmonicBody(project, r, e, label)
      : spectrumBody(project, r, e, label);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Response report · ${e(project.name)}</title><style>body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#142b44}table{border-collapse:collapse;margin:8px 0 16px}th,td{border:1px solid #dce3eb;padding:3px 8px;text-align:right}th[scope=row]{text-align:left}.banner{background:#fff7e6;border:1px solid #e8c77f;padding:8px 12px}.response-plot{max-width:640px;width:100%}</style></head><body>
<h1>Dynamic response report</h1>
<p class="banner" data-testid="report-response-banner">MECHANICS ONLY (response-v1). Linear elastic model with declared mass${r.analysisType === "harmonic" ? " and Rayleigh damping" : "; the spectrum is the user's input, not a code spectrum. Combined values are peak magnitudes: signs and simultaneity are lost"}. This is not a seismic, vibration or serviceability code check.${current ? "" : " <strong>STALE: the model has changed since this analysis.</strong>"}</p>
<p>Project ${e(project.name)} · model ${e(r.modelHash)} · result ${e(r.resultId)} · settings ${e(r.settingsHash)} · solver ${e(r.solverBuildHash)}</p>
${body}
<p>Disclosures: ${r.disclosures.map(e).join(", ")}.</p>
<details><summary>Complete result record</summary><pre>${e(JSON.stringify(r, null, 2))}</pre></details>
</body></html>`;
}
