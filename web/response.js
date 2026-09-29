/**
 * Dynamic response workspace (M15, response-v1): harmonic (steady-state)
 * response of a load case and response-spectrum analysis with a project
 * spectrum. Every number comes from the Rust kernel; this module formats and
 * plots it. A user spectrum is never a code spectrum.
 */
import { escape as esc } from "./reports/report.js";
import { responseReport } from "./reports/response.js";

const sig = (v, n = 4) =>
  Number.isFinite(v) ? String(Number(v.toPrecision(n))) : "—";
const DOFS = ["ux", "uy", "uz", "rx", "ry", "rz"];
const DOF_UNITS = ["m", "m", "m", "rad", "rad", "rad"];
export const RESPONSE_DISCLOSURE =
  "Dynamic response (response-v1) · linear, Rayleigh-damped steady state or modal combination of a user spectrum · not a code seismic or vibration check.";

/** A log- or linear-axis line plot as inline SVG. */
export function linePlot({
  xs,
  series,
  xLabel,
  yLabel,
  logX,
  logY,
  marks = [],
  testid,
}) {
  const W = 560,
    H = 240,
    L = 56,
    R = 12,
    T = 12,
    B = 36;
  const tx = (v) => (logX ? Math.log10(v) : v);
  const ty = (v) => (logY ? Math.log10(Math.max(v, 1e-300)) : v);
  const X = xs.map(tx);
  const Ys = series.flatMap((s) => s.ys.map(ty)).filter(Number.isFinite);
  const [x0, x1] = [Math.min(...X), Math.max(...X)];
  let [y0, y1] = [Math.min(...Ys), Math.max(...Ys)];
  // Linear axes include zero, so magnitudes are read from the origin.
  if (!logY) [y0, y1] = [Math.min(y0, 0), Math.max(y1, 0)];
  if (y1 === y0) [y0, y1] = [y0 - 1, y1 + 1];
  const px = (v) => L + ((tx(v) - x0) / (x1 - x0 || 1)) * (W - L - R);
  const py = (v) => T + (1 - (ty(v) - y0) / (y1 - y0)) * (H - T - B);
  const lines = series
    .map(
      (s) =>
        `<polyline fill="none" stroke="${s.color}" stroke-width="2" points="${xs.map((x, i) => `${px(x).toFixed(1)},${py(s.ys[i]).toFixed(1)}`).join(" ")}"/>`,
    )
    .join("");
  const markLines = marks
    .map(
      (m) =>
        `<line x1="${px(m.x)}" x2="${px(m.x)}" y1="${T}" y2="${H - B}" stroke="#c17f26" stroke-dasharray="3 3"/><text x="${px(m.x) + 3}" y="${T + 10}" font-size="10" fill="#8a5a12">${esc(m.label)}</text>`,
    )
    .join("");
  const fmt = (v, log) => sig(log ? 10 ** v : v, 3);
  return `<svg class="response-plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(yLabel)} against ${esc(xLabel)}" data-testid="${testid}"><rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="#fff" stroke="#dce3eb"/>${markLines}${lines}<g font-size="10" fill="#53667c"><text x="${L}" y="${H - B + 14}">${fmt(x0, logX)}</text><text x="${W - R}" y="${H - B + 14}" text-anchor="end">${fmt(x1, logX)}</text><text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">${esc(xLabel)}${logX ? " (log)" : ""}</text><text x="${L - 4}" y="${T + 8}" text-anchor="end">${fmt(y1, logY)}</text><text x="${L - 4}" y="${H - B}" text-anchor="end">${fmt(y0, logY)}</text><text x="12" y="${(T + H - B) / 2}" transform="rotate(-90 12 ${(T + H - B) / 2})" text-anchor="middle">${esc(yLabel)}${logY ? " (log)" : ""}</text></g>${series.map((s, i) => `<text x="${W - R - 4}" y="${T + 14 + i * 12}" text-anchor="end" font-size="10" fill="${s.color}">${esc(s.name)}</text>`).join("")}</svg>`;
}

/** The spectrum table as text: one "T Sa" pair per line (Sa in `unit`). */
const pointsText = (points, unit) =>
  points
    .map(
      ([t, sa]) =>
        `${t} ${Number((unit === "g" ? sa / 9.80665 : sa).toPrecision(10))}`,
    )
    .join("\n");

function parsePoints(text) {
  return text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(/[\s,;]+/).map(Number);
      if (parts.length !== 2 || parts.some((v) => !Number.isFinite(v)))
        throw new Error(`Each line needs a period and an Sa value: "${l}"`);
      return parts;
    });
}

export function responseWorkspace({
  gateway,
  getContext,
  command,
  onRunning,
  onError,
  download,
}) {
  let mode = "harmonic";
  let harmonicSettings = {
    caseId: null,
    from: 0.5,
    to: 50,
    count: 60,
    spacing: "log",
    ratio: 0.02,
    f1: 1,
    f2: 10,
    massMatrix: "consistent",
    subdivisions: 8,
  };
  let spectrumSettings = {
    spectrumId: null,
    direction: "X",
    scale: 1,
    combination: "cqc",
    modes: 12,
    massMatrix: "consistent",
    subdivisions: 8,
    participationTarget: 0.9,
  };
  let editing = null; // spectrum being edited: {id?, name, ...}
  let pick = { node: null, dof: 0 };
  const runs = { harmonic: null, responseSpectrum: null };

  const state = (run) => {
    const ctx = getContext();
    return run && run.modelHash === ctx.modelHash && !ctx.dirty
      ? "current"
      : "stale";
  };

  async function execute(host, request, kind) {
    const ctx = getContext();
    onRunning(true);
    try {
      const result = await gateway.send("analyse", request);
      runs[kind] = { modelHash: result.modelHash, request, result };
    } catch (e) {
      if (/CANCELLED/.test(e.message)) onError(e.message);
      else {
        const d = e.diagnostics?.[0] || {};
        runs[kind] = {
          modelHash: ctx.modelHash,
          request,
          failure: {
            code: d.code || e.message.split(":")[0],
            message: d.message || e.message,
          },
        };
      }
    } finally {
      onRunning(false);
      render(host);
    }
  }

  function read(host, name) {
    return host.querySelector(`[name="${name}"]`)?.value;
  }

  function cases(ctx) {
    const p = ctx.project;
    return [
      ...(p?.loadCases || []).map((c) => [
        c.id,
        `${ctx.label(c.id)} · ${c.name}`,
      ]),
      ...(p?.combinations || []).map((c) => [
        c.id,
        `${ctx.label(c.id)} · ${c.name}`,
      ]),
    ];
  }

  function massNote(ctx) {
    return (ctx.project?.massSources || []).length
      ? ""
      : '<p class="notice-small" data-testid="response-no-mass">No mass is declared. Add mass sources (Modal tab › Edit mass sources…) before a dynamic analysis.</p>';
  }

  function harmonicForm(ctx) {
    const s = harmonicSettings;
    const d = ctx.locked ? " disabled" : "";
    const options = cases(ctx);
    if (!s.caseId || !options.some(([id]) => id === s.caseId))
      s.caseId = options[0]?.[0] || null;
    return `<form class="stability-settings" id="harmonic-form" data-testid="harmonic-settings">
<label>Load case or combination <select name="h-case"${d}>${options.map(([id, l]) => `<option value="${esc(id)}"${id === s.caseId ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
<label>From (Hz) <input name="h-from" type="number" min="0" step="any" value="${s.from}"${d}></label>
<label>To (Hz) <input name="h-to" type="number" min="0" step="any" value="${s.to}"${d}></label>
<label>Frequencies <input name="h-count" type="number" min="2" max="200" step="1" value="${s.count}"${d}></label>
<label>Spacing <select name="h-spacing"${d}><option value="log"${s.spacing === "log" ? " selected" : ""}>Logarithmic</option><option value="linear"${s.spacing === "linear" ? " selected" : ""}>Linear</option></select></label>
<fieldset><legend>Rayleigh damping</legend>
<label>Ratio ζ % <input name="h-ratio" type="number" min="0" max="100" step="any" value="${Number((s.ratio * 100).toPrecision(6))}"${d}></label>
<label>at f₁ (Hz) <input name="h-f1" type="number" min="0" step="any" value="${s.f1}"${d}></label>
<label>and f₂ (Hz) <input name="h-f2" type="number" min="0" step="any" value="${s.f2}"${d}></label></fieldset>
<label>Mass matrix <select name="h-mass"${d}><option value="consistent"${s.massMatrix === "consistent" ? " selected" : ""}>Consistent</option><option value="lumped"${s.massMatrix === "lumped" ? " selected" : ""}>Lumped</option></select></label>
<label>Elements per member <input name="h-subdivisions" type="number" min="1" max="32" step="1" value="${s.subdivisions}"${d}></label>
<button type="submit" id="harmonic-run" class="primary"${ctx.locked || !options.length || !(ctx.project?.massSources || []).length ? " disabled" : ""}>Run harmonic analysis</button>
</form>`;
  }

  function readHarmonic(host) {
    const n = (k) => Number(read(host, k));
    harmonicSettings = {
      caseId: read(host, "h-case") || harmonicSettings.caseId,
      from: n("h-from"),
      to: n("h-to"),
      count: n("h-count"),
      spacing: read(host, "h-spacing"),
      ratio: n("h-ratio") / 100,
      f1: n("h-f1"),
      f2: n("h-f2"),
      massMatrix: read(host, "h-mass"),
      subdivisions: n("h-subdivisions"),
    };
    const s = harmonicSettings;
    return {
      caseIds: [s.caseId],
      combinationIds: [],
      analysisType: "harmonic",
      harmonic: {
        sweep: { from: s.from, to: s.to, count: s.count, spacing: s.spacing },
        damping: { ratio: s.ratio, frequencies: [s.f1, s.f2] },
        massMatrix: s.massMatrix,
        subdivisions: s.subdivisions,
      },
    };
  }

  function harmonicResult(r, st, ctx) {
    if (!pick.node || !r.nodeIds.includes(pick.node)) {
      // Default: the node and DOF with the largest peak amplitude.
      let best = [0, r.nodeIds[0], 0];
      for (const f of r.frequencies)
        f.displacementRe.forEach((re, k) => {
          if (k % 6 > 2) return;
          const a = Math.hypot(re, f.displacementIm[k]);
          if (a > best[0]) best = [a, r.nodeIds[Math.floor(k / 6)], k % 6];
        });
      pick = { node: best[1], dof: best[2] };
    }
    const i = r.nodeIds.indexOf(pick.node) * 6 + pick.dof;
    const xs = r.frequencies.map((f) => f.frequency);
    const amp = r.frequencies.map((f) =>
      Math.hypot(f.displacementRe[i], f.displacementIm[i]),
    );
    const lag = r.frequencies.map(
      (f) =>
        (-Math.atan2(f.displacementIm[i], f.displacementRe[i]) * 180) / Math.PI,
    );
    const peak = amp.indexOf(Math.max(...amp));
    const unit = DOF_UNITS[pick.dof];
    const rows = r.frequencies
      .map(
        (f, k) =>
          `<tr${k === peak ? ' class="governing"' : ""}><th scope="row" data-si="${f.frequency}">${sig(f.frequency, 5)}</th><td data-testid="harmonic-amplitude" data-si="${amp[k]}">${sig(amp[k], 5)}</td><td>${sig(lag[k], 4)}</td><td>${sig(f.dampingRatio * 100, 3)} %</td><td>${f.residual.toExponential(1)}</td></tr>`,
      )
      .join("");
    const logX = r.frequencies.length > 2 && xs[xs.length - 1] / xs[0] > 20;
    return `<div class="response-pick"><label>Node <select id="harmonic-node">${r.nodeIds.map((id) => `<option value="${esc(id)}"${id === pick.node ? " selected" : ""}>${esc(ctx.label(id))}</option>`).join("")}</select></label><label>Component <select id="harmonic-dof">${DOFS.map((d, k) => `<option value="${k}"${k === pick.dof ? " selected" : ""}>${d}</option>`).join("")}</select></label></div>
${linePlot({ xs, series: [{ name: `|${DOFS[pick.dof]}|`, ys: amp, color: "#225dc7" }], xLabel: "Frequency (Hz)", yLabel: `Amplitude (${unit})`, logX, logY: true, testid: "harmonic-frf" })}
${linePlot({ xs, series: [{ name: "phase lag", ys: lag, color: "#8a3fb3" }], xLabel: "Frequency (Hz)", yLabel: "Phase lag (°)", logX, logY: false, testid: "harmonic-phase" })}
<p data-testid="harmonic-peak">Peak ${esc(DOFS[pick.dof])} at ${esc(ctx.label(pick.node))}: <strong data-si="${amp[peak]}">${sig(amp[peak], 5)} ${unit}</strong> at ${sig(xs[peak], 5)} Hz (ζ there ${sig(r.frequencies[peak].dampingRatio * 100, 3)} %).</p>
<table data-testid="harmonic-table"><thead><tr><th scope="col">f (Hz)</th><th scope="col">|U| (${unit})</th><th scope="col">Lag (°)</th><th scope="col">ζ(f)</th><th scope="col">Residual</th></tr></thead><tbody>${rows}</tbody></table>
<p class="notice-small">Load ${esc(ctx.label(r.caseId))} as F·cos(Ωt) · Rayleigh a₀ = ${sig(r.damping.a0, 5)} s⁻¹, a₁ = ${sig(r.damping.a1, 5)} s · ${esc(r.massMatrix)} mass · ${r.subdivisions} elements per member · max residual ${r.numericalChecks.maxResidual.toExponential(1)}. Member actions are not reported by response-v1.</p>`;
  }

  function spectrumEditor(ctx) {
    const spectra = ctx.project?.responseSpectra || [];
    const list = spectra.length
      ? `<ul>${spectra.map((s) => `<li data-testid="spectrum-item"><strong>${esc(ctx.label(s.id))}</strong> · ${esc(s.name)} · ${s.points.length} points to ${sig(s.points.at(-1)[0], 4)} s · ζ ${sig(s.dampingRatio * 100, 3)} % <button type="button" data-spectrum-edit="${esc(s.id)}"${ctx.locked ? " disabled" : ""}>Edit</button> <button type="button" data-spectrum-delete="${esc(s.id)}"${ctx.locked ? " disabled" : ""}>Delete</button></li>`).join("")}</ul>`
      : '<p class="notice-small" data-testid="spectrum-none">No response spectrum in this project. A spectrum is your input (T, Sa from T = 0); none is supplied from a code.</p>';
    const e = editing;
    const form = e
      ? `<form id="spectrum-form" class="stability-settings" data-testid="spectrum-form"><label>Name <input name="sp-name" maxlength="128" value="${esc(e.name)}" required></label><label>Damping ratio % <input name="sp-damping" type="number" min="0" max="100" step="any" value="${Number((e.dampingRatio * 100).toPrecision(6))}"></label><label>Sa unit <select name="sp-unit"><option value="m/s2"${e.unit === "m/s2" ? " selected" : ""}>m/s²</option><option value="g"${e.unit === "g" ? " selected" : ""}>g</option></select></label><label class="full">Points (one "T Sa" pair per line, T in s from 0) <textarea name="sp-points" rows="8">${esc(pointsText(e.points, e.unit))}</textarea></label><label class="full">Reference <input name="sp-reference" maxlength="512" value="${esc(e.reference)}" placeholder="Where these ordinates come from"></label><button type="submit" class="primary" id="spectrum-save">Save spectrum</button> <button type="button" id="spectrum-cancel">Cancel</button><p role="alert" id="spectrum-error"></p></form>`
      : `<button type="button" id="spectrum-new"${ctx.locked ? " disabled" : ""}>New spectrum…</button>`;
    return `<section class="modal-sources" data-testid="spectrum-list"><h4>Response spectra</h4>${list}${form}</section>`;
  }

  function spectrumForm(ctx) {
    const s = spectrumSettings;
    const spectra = ctx.project?.responseSpectra || [];
    if (!s.spectrumId || !spectra.some((x) => x.id === s.spectrumId))
      s.spectrumId = spectra[0]?.id || null;
    const d = ctx.locked ? " disabled" : "";
    return `<form class="stability-settings" id="spectrum-run-form" data-testid="spectrum-settings">
<label>Spectrum <select name="rs-spectrum"${d}>${spectra.map((x) => `<option value="${esc(x.id)}"${x.id === s.spectrumId ? " selected" : ""}>${esc(ctx.label(x.id))} · ${esc(x.name)}</option>`).join("")}</select></label>
<label>Direction <select name="rs-direction"${d}>${["X", "Y", "Z"].map((x) => `<option${x === s.direction ? " selected" : ""}>${x}</option>`).join("")}</select></label>
<label>Scale <input name="rs-scale" type="number" min="0" step="any" value="${s.scale}"${d}></label>
<label>Combination <select name="rs-combination"${d}><option value="cqc"${s.combination === "cqc" ? " selected" : ""}>CQC</option><option value="srss"${s.combination === "srss" ? " selected" : ""}>SRSS</option></select></label>
<label>Modes <input name="rs-modes" type="number" min="1" max="50" step="1" value="${s.modes}"${d}></label>
<label>Mass matrix <select name="rs-mass"${d}><option value="consistent"${s.massMatrix === "consistent" ? " selected" : ""}>Consistent</option><option value="lumped"${s.massMatrix === "lumped" ? " selected" : ""}>Lumped</option></select></label>
<label>Elements per member <input name="rs-subdivisions" type="number" min="1" max="32" step="1" value="${s.subdivisions}"${d}></label>
<label>Participation target % <input name="rs-target" type="number" min="1" max="100" step="any" value="${Number((s.participationTarget * 100).toPrecision(6))}"${d}></label>
<button type="submit" id="spectrum-run" class="primary"${ctx.locked || !spectra.length || !(ctx.project?.massSources || []).length ? " disabled" : ""}>Run spectrum analysis</button>
</form>`;
  }

  function readSpectrum(host) {
    const n = (k) => Number(read(host, k));
    spectrumSettings = {
      spectrumId: read(host, "rs-spectrum"),
      direction: read(host, "rs-direction"),
      scale: n("rs-scale"),
      combination: read(host, "rs-combination"),
      modes: n("rs-modes"),
      massMatrix: read(host, "rs-mass"),
      subdivisions: n("rs-subdivisions"),
      participationTarget: n("rs-target") / 100,
    };
    return {
      caseIds: [],
      combinationIds: [],
      analysisType: "responseSpectrum",
      responseSpectrum: { ...spectrumSettings },
    };
  }

  function spectrumResult(r, st, ctx) {
    const spectrum = ctx.project?.responseSpectra?.find(
      (s) => s.id === r.spectrumId,
    );
    const plot = spectrum
      ? linePlot({
          xs: spectrum.points.map((p) => p[0]),
          series: [
            {
              name: "Sa",
              ys: spectrum.points.map((p) => p[1] * r.scale),
              color: "#225dc7",
            },
          ],
          xLabel: "Period (s)",
          yLabel: "Sa (m/s²)",
          logX: false,
          logY: false,
          marks: r.modes
            .slice(0, 6)
            .map((m) => ({ x: m.period, label: `${m.mode}` })),
          testid: "spectrum-plot",
        })
      : "";
    const modes = r.modes
      .map(
        (m) =>
          `<tr><th scope="row">${m.mode}</th><td>${sig(m.period, 5)}</td><td>${sig(m.frequency, 5)}</td><td data-si="${m.sa}">${sig(m.sa, 5)}</td><td>${sig(m.participationFactor, 5)}</td><td>${m.effectiveMassRatio == null ? "—" : `${(m.effectiveMassRatio * 100).toFixed(1)} %`}</td><td data-testid="spectrum-modal-shear" data-si="${m.baseShear}">${sig(m.baseShear / 1000, 5)}</td></tr>`,
      )
      .join("");
    const p = r.participation;
    const kN = (v) => sig(v / 1000, 5);
    const supports = r.supportIds
      .map(
        (id, k) =>
          `<tr><th scope="row">${esc(ctx.label(id))}</th>${[0, 1, 2, 3, 4, 5].map((a) => `<td data-si="${r.reactions[k * 6 + a]}">${kN(r.reactions[k * 6 + a])}</td>`).join("")}</tr>`,
      )
      .join("");
    const nodes = r.nodeIds
      .map(
        (id, k) =>
          `<tr><th scope="row">${esc(ctx.label(id))}</th>${[0, 1, 2].map((a) => `<td data-si="${r.nodeDisplacements[k * 6 + a]}">${sig(r.nodeDisplacements[k * 6 + a] * 1000, 4)}</td>`).join("")}</tr>`,
      )
      .join("");
    const members = r.members
      .map((m) => {
        const peak = [0, 1, 2, 3, 4, 5].map((c) =>
          Math.max(...m.stations.map((s) => s.actions[c])),
        );
        return `<tr data-testid="spectrum-member" data-member="${esc(m.id)}"><th scope="row">${esc(ctx.label(m.id))}</th>${peak.map((v, c) => `<td data-si="${v}">${c < 3 ? kN(v) : sig(v / 1000, 5)}</td>`).join("")}</tr>`;
      })
      .join("");
    return `${plot}
<p data-testid="spectrum-base">Base reaction ${esc(r.direction)} (${esc(r.combination.toUpperCase())}): <strong data-si="${r.baseReaction["XYZ".indexOf(r.direction)]}">${kN(r.baseReaction["XYZ".indexOf(r.direction)])} kN</strong> · |ΣFx| ${kN(r.baseReaction[0])}, |ΣFy| ${kN(r.baseReaction[1])}, |ΣFz| ${kN(r.baseReaction[2])} kN</p>
<p data-testid="spectrum-participation" data-achieved="${p.achieved}">${esc(p.direction)}: ${(p.cumulativeRatio * 100).toFixed(1)} % of the participating mass in ${r.modes.length} mode(s) · target ${(p.target * 100).toFixed(1)} % ${p.achieved ? "met" : `<strong>not met</strong> · ${(p.omittedRatio * 100).toFixed(1)} % in omitted modes, no missing-mass correction`}</p>
<table data-testid="spectrum-modes"><thead><tr><th scope="col">Mode</th><th scope="col">T (s)</th><th scope="col">f (Hz)</th><th scope="col">Sa (m/s²)</th><th scope="col">Γ</th><th scope="col">Mass</th><th scope="col">Modal base shear (kN)</th></tr></thead><tbody>${modes}</tbody></table>
<h4>Support reactions (peak magnitudes, kN and kN·m)</h4><table data-testid="spectrum-reactions"><thead><tr><th scope="col">Support</th><th>Fx</th><th>Fy</th><th>Fz</th><th>Mx</th><th>My</th><th>Mz</th></tr></thead><tbody>${supports}</tbody></table>
<h4>Member section actions (largest along each member; kN and kN·m)</h4><table data-testid="spectrum-members"><thead><tr><th scope="col">Member</th><th>|N|</th><th>|Vy|</th><th>|Vz|</th><th>|T|</th><th>|My|</th><th>|Mz|</th></tr></thead><tbody>${members}</tbody></table>
<h4>Node displacements (peak magnitudes, mm)</h4><table data-testid="spectrum-nodes"><thead><tr><th scope="col">Node</th><th>|ux|</th><th>|uy|</th><th>|uz|</th></tr></thead><tbody>${nodes}</tbody></table>
<p class="notice-small">${esc(r.combination.toUpperCase())} with ζ = ${sig(r.dampingRatio * 100, 3)} % · scale ${sig(r.scale, 5)} · ${esc(r.massMatrix)} mass · ${r.subdivisions} elements per member. Combined values are peak magnitudes: signs and simultaneity are lost. ${r.diagnostics
      .filter((d) => d.code !== "PARTICIPATION_TARGET_NOT_MET")
      .map((d) => `${esc(d.code)}: ${esc(d.message)}`)
      .join(" ")}</p>`;
  }

  function resultSection(kind, ctx) {
    const run = runs[kind];
    if (!run) return "";
    const st = state(run);
    const badge = `<span class="badge ${st}" data-testid="response-state">${st === "current" ? "✓ Current" : "⚠ Stale"}</span>`;
    const title =
      kind === "harmonic" ? "Harmonic response" : "Response spectrum";
    return `<section data-testid="${kind}-result"><h4>${title} ${badge}</h4>${st === "stale" ? '<p class="notice-small">Stale results — these values belong to a previous model. Run the analysis again.</p>' : ""}${
      run.failure
        ? `<div role="alert" data-testid="response-failure"><strong>${esc(run.failure.code)}</strong><p>${esc(run.failure.message)}</p><p class="notice-small">No response is reported.</p></div>`
        : kind === "harmonic"
          ? harmonicResult(run.result, st, ctx)
          : spectrumResult(run.result, st, ctx)
    }${run.result ? '<button type="button" id="response-report">Response report ↓</button> <button type="button" id="response-download">Record ↓</button>' : ""}</section>`;
  }

  function render(host) {
    const ctx = getContext();
    const kind = mode === "harmonic" ? "harmonic" : "responseSpectrum";
    host.innerHTML = `<div class="stability-workspace response-workspace"><p class="notice-small" data-testid="response-disclosure">${esc(RESPONSE_DISCLOSURE)}</p><div class="design-view-switch" role="group" aria-label="Response analysis"><button type="button" data-response-mode="harmonic" aria-pressed="${mode === "harmonic"}">Harmonic</button><button type="button" data-response-mode="spectrum" aria-pressed="${mode === "spectrum"}">Response spectrum</button></div>${massNote(ctx)}${
      mode === "harmonic"
        ? harmonicForm(ctx)
        : spectrumEditor(ctx) + spectrumForm(ctx)
    }${resultSection(kind, ctx)}</div>`;
    for (const b of host.querySelectorAll("[data-response-mode]"))
      b.onclick = () => {
        mode = b.dataset.responseMode;
        render(host);
      };
    const hf = host.querySelector("#harmonic-form");
    if (hf)
      hf.onsubmit = (e) => {
        e.preventDefault();
        void execute(host, readHarmonic(host), "harmonic");
      };
    const sf = host.querySelector("#spectrum-run-form");
    if (sf)
      sf.onsubmit = (e) => {
        e.preventDefault();
        void execute(host, readSpectrum(host), "responseSpectrum");
      };
    const node = host.querySelector("#harmonic-node");
    if (node)
      node.onchange = () => {
        pick.node = node.value;
        render(host);
      };
    const dof = host.querySelector("#harmonic-dof");
    if (dof)
      dof.onchange = () => {
        pick.dof = Number(dof.value);
        render(host);
      };
    const add = host.querySelector("#spectrum-new");
    if (add)
      add.onclick = () => {
        editing = {
          name: "Spectrum",
          dampingRatio: 0.05,
          unit: "m/s2",
          points: [
            [0, 0],
            [1, 0],
          ],
          reference: "",
        };
        render(host);
      };
    for (const b of host.querySelectorAll("[data-spectrum-edit]"))
      b.onclick = () => {
        const s = ctx.project.responseSpectra.find(
          (x) => x.id === b.dataset.spectrumEdit,
        );
        editing = { ...s, unit: "m/s2" };
        render(host);
      };
    for (const b of host.querySelectorAll("[data-spectrum-delete]"))
      b.onclick = async () => {
        try {
          await command("DeleteEntities", {
            ids: [b.dataset.spectrumDelete],
            cascade: false,
          });
        } catch (e) {
          onError(e.message);
        }
        render(host);
      };
    const form = host.querySelector("#spectrum-form");
    if (form) {
      form.querySelector("#spectrum-cancel").onclick = () => {
        editing = null;
        render(host);
      };
      form.querySelector('[name="sp-unit"]').onchange = (e) => {
        // Re-express the table in the chosen unit without touching values.
        try {
          const points = parsePoints(
            form.querySelector('[name="sp-points"]').value,
          );
          const factor = e.target.value === "g" ? 1 / 9.80665 : 9.80665;
          form.querySelector('[name="sp-points"]').value = points
            .map(([t, sa]) => `${t} ${Number((sa * factor).toPrecision(10))}`)
            .join("\n");
          editing.unit = e.target.value;
        } catch (err) {
          form.querySelector("#spectrum-error").textContent = err.message;
        }
      };
      form.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const id = editing.id || `rs-${Date.now().toString(36)}`;
          await command("SetResponseSpectrum", {
            existence: editing.id ? "update" : "create",
            id,
            name: form.querySelector('[name="sp-name"]').value,
            dampingRatio:
              Number(form.querySelector('[name="sp-damping"]').value) / 100,
            saUnit: form.querySelector('[name="sp-unit"]').value,
            points: parsePoints(form.querySelector('[name="sp-points"]').value),
            reference: form.querySelector('[name="sp-reference"]').value,
          });
          spectrumSettings.spectrumId = id;
          editing = null;
          render(host);
        } catch (err) {
          form.querySelector("#spectrum-error").textContent = err.message;
        }
      };
    }
    const run = runs[kind];
    const report = host.querySelector("#response-report");
    if (report)
      report.onclick = () =>
        download(
          `response-report-${ctx.project.id}.html`,
          responseReport(ctx.project, run.result, {
            current: state(run) === "current",
            label: ctx.label,
          }),
          "text/html",
        );
    const dl = host.querySelector("#response-download");
    if (dl)
      dl.onclick = () =>
        download(
          `${kind}-${ctx.project.id}.json`,
          JSON.stringify({ ...run, currentState: state(run) }, null, 2),
          "application/json",
        );
  }

  return {
    render,
    current: (kind, modelHash) => {
      const run = runs[kind];
      return run?.result &&
        run.modelHash === modelHash &&
        state(run) === "current"
        ? run
        : null;
    },
  };
}
