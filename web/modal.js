/**
 * Modal results workspace (M14, dynamics-v1): declared mass, natural
 * frequencies, mode shapes and mass participation of the current model. All
 * numbers come from the Rust kernel; this module only formats them. A
 * frequency or participation ratio is not a floor-vibration or code
 * serviceability verdict.
 */
import { escape as esc } from "./reports/report.js";
import { vibrationReport } from "./reports/vibration.js";

/** A value to `n` significant figures, or an em dash when not finite. */
function format(v, n) {
  return Number.isFinite(v) ? String(Number(v.toPrecision(n))) : "—";
}
const percent = (v) => (v == null ? "—" : `${(100 * v).toFixed(1)} %`);
const kg = (v) =>
  `${Number(v.toPrecision(6)).toLocaleString("en-GB", { maximumFractionDigits: 3 })} kg`;

export const MODAL_DISCLOSURE =
  "Modal analysis (dynamics-v1) · undamped free vibration of this elastic model with its declared mass · frequencies and participation are not a floor-vibration or code serviceability check.";

const SOURCE_KINDS = {
  selfMass: "Self mass",
  loadCase: "Load case",
  nodalMass: "Nodal mass",
};

/** Settings as edited in the panel; validated again by the kernel. */
function readSettings(host, previous) {
  const v = (name) => host.querySelector(`[name="${name}"]`);
  return {
    modes: Number(v("modal-modes")?.value ?? previous.modes),
    massMatrix:
      host.querySelector('[name="modal-mass-matrix"]:checked')?.value ||
      previous.massMatrix,
    subdivisions: Number(
      v("modal-subdivisions")?.value ?? previous.subdivisions,
    ),
    participationTarget:
      Number(v("modal-target")?.value ?? previous.participationTarget * 100) /
      100,
  };
}

export const modalRequest = (settings) => ({
  caseIds: [],
  combinationIds: [],
  analysisType: "modal",
  modal: {
    modes: settings.modes,
    massMatrix: settings.massMatrix,
    subdivisions: settings.subdivisions,
    participationTarget: settings.participationTarget,
  },
});

/** One declared source as a short description. */
export function describeSource(s, label) {
  if (s.kind === "selfMass") return `ρA of every member × ${s.factor}`;
  if (s.kind === "loadCase")
    return `${label(s.case)} gravity loads ÷ g × ${s.factor}`;
  return `${kg(s.mass)} at ${label(s.node)}`;
}

export function modalWorkspace({
  gateway,
  getContext,
  viewport,
  onRunning,
  onError,
  onEditSources,
  download,
}) {
  let settings = {
    modes: 12,
    massMatrix: "consistent",
    subdivisions: 8,
    participationTarget: 0.9,
  };
  /** { modelHash, request, result?, failure? } */
  let run = null;
  let shownMode = null;

  const state = () => {
    const ctx = getContext();
    if (!run) return "none";
    return run.modelHash === ctx.modelHash && !ctx.dirty ? "current" : "stale";
  };

  function syncViewport() {
    const mode =
      state() === "current" && run?.result && shownMode != null
        ? run.result.modes[shownMode]
        : null;
    viewport.overlay = mode
      ? {
          kind: "mode",
          modelHash: run.modelHash,
          label: `Mode ${mode.mode} · ${format(mode.frequency, 4)} Hz`,
          members: mode.members,
        }
      : null;
    viewport.draw();
  }

  async function execute(host) {
    settings = readSettings(host, settings);
    const ctx = getContext();
    const request = modalRequest(settings);
    onRunning(true);
    shownMode = null;
    try {
      const result = await gateway.send("analyse", request);
      run = { modelHash: result.modelHash, request, result };
      if (result.modes.length) shownMode = 0;
    } catch (e) {
      if (/CANCELLED/.test(e.message)) onError(e.message);
      else {
        const d = e.diagnostics?.[0] || {};
        run = {
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

  function sourcesHtml(ctx) {
    const sources = ctx.project?.massSources || [];
    return `<section class="modal-sources" data-testid="modal-sources"><h4>Mass sources</h4>${
      sources.length
        ? `<ul>${[...sources]
            .sort((a, b) =>
              ctx
                .label(a.id)
                .localeCompare(ctx.label(b.id), undefined, { numeric: true }),
            )
            .map(
              (s) =>
                `<li><strong>${esc(ctx.label(s.id))}</strong> · ${esc(SOURCE_KINDS[s.kind])} · ${esc(describeSource(s, ctx.label))}</li>`,
            )
            .join("")}</ul>`
        : '<p class="notice-small" data-testid="modal-no-sources">No mass is declared. Add self mass, load-case mass or nodal masses before a modal analysis.</p>'
    }<button type="button" id="modal-edit-sources"${ctx.locked ? " disabled" : ""}>Edit mass sources…</button></section>`;
  }

  function settingsHtml(ctx) {
    const d = ctx.locked ? " disabled" : "";
    const m = settings.massMatrix;
    return `<form class="stability-settings" data-testid="modal-settings">
<fieldset><legend>Mass matrix</legend>
<label><input type="radio" name="modal-mass-matrix" value="consistent"${m === "consistent" ? " checked" : ""}${d}> Consistent</label>
<label><input type="radio" name="modal-mass-matrix" value="lumped"${m === "lumped" ? " checked" : ""}${d}> Lumped</label>
</fieldset>
<label>Modes <input name="modal-modes" type="number" min="1" max="50" step="1" value="${settings.modes}"${d}></label>
<label>Elements per member <input name="modal-subdivisions" type="number" min="1" max="32" step="1" value="${settings.subdivisions}"${d}></label>
<label>Participation target % <input name="modal-target" type="number" min="1" max="100" step="any" value="${Number((settings.participationTarget * 100).toPrecision(6))}"${d}></label>
<button type="submit" id="modal-run" class="primary"${ctx.locked || !(ctx.project?.massSources || []).length ? " disabled" : ""}>Run modal analysis</button>
</form>`;
  }

  function resultHtml(r, st, ctx) {
    const dirs = r.participation;
    const byLabel = (a, b) =>
      ctx
        .label(a.id)
        .localeCompare(ctx.label(b.id), undefined, { numeric: true });
    const massRows = [...r.mass.sources]
      .sort(byLabel)
      .map(
        (s) =>
          `<tr><th scope="row">${esc(ctx.label(s.id))}</th><td>${esc(SOURCE_KINDS[s.kind])}</td><td data-si="${s.mass}">${kg(s.mass)}</td></tr>`,
      )
      .join("");
    const participation = dirs
      .map((p) =>
        p.achieved == null
          ? `<li data-testid="modal-direction" data-direction="${p.direction}">${p.direction}: no participating mass (restrained or constrained)</li>`
          : `<li data-testid="modal-direction" data-direction="${p.direction}" data-achieved="${p.achieved}">${p.direction}: ${percent(p.cumulativeRatio)} of ${kg(p.participatingMass)} in ${r.modes.length} mode(s) · target ${percent(p.target)} ${p.achieved ? "met" : `<strong>not met</strong> · ${percent(p.omittedRatio)} in omitted modes`}</li>`,
      )
      .join("");
    const modes = r.modes
      .map(
        (m, i) =>
          `<tr><th scope="row">${m.mode}</th><td data-testid="modal-frequency" data-si="${m.frequency}">${format(m.frequency, 5)}</td><td>${format(m.period, 5)}</td><td>${format(m.omega, 5)}</td>${[
            0, 1, 2,
          ]
            .map(
              (d) =>
                `<td data-testid="modal-ratio-${"xyz"[d]}" data-si="${m.effectiveMassRatio[d] ?? ""}">${percent(m.effectiveMassRatio[d])}</td>`,
            )
            .join(
              "",
            )}${[0, 1, 2].map((d) => `<td>${percent(m.cumulativeRatio[d])}</td>`).join("")}<td><button type="button" data-modal-mode="${i}" aria-pressed="${shownMode === i}"${st === "current" ? "" : " disabled"}>${shownMode === i ? "Shown" : "Show"}</button></td></tr>`,
      )
      .join("");
    const c = r.numericalChecks;
    return `<table data-testid="modal-mass"><thead><tr><th scope="col">Mass source</th><th scope="col">Kind</th><th scope="col">Mass</th></tr></thead><tbody>${massRows}<tr><th scope="row">Total</th><td></td><td data-testid="modal-total-mass" data-si="${r.mass.total}">${kg(r.mass.total)}</td></tr></tbody></table>
<ul class="modal-participation" data-testid="modal-participation">${participation}</ul>
<table data-testid="modal-modes"><thead><tr><th scope="col">Mode</th><th scope="col">f (Hz)</th><th scope="col">T (s)</th><th scope="col">ω (rad/s)</th><th scope="col">Mass X</th><th scope="col">Mass Y</th><th scope="col">Mass Z</th><th scope="col">Σ X</th><th scope="col">Σ Y</th><th scope="col">Σ Z</th><th scope="col">Shape</th></tr></thead><tbody>${modes}</tbody></table>
<p class="notice-small">${esc(r.massMatrix)} mass · ${r.subdivisions} elements per member · Sturm check ${c.sturm ? `${c.sturm.negativePivots} mode(s) below ${format(Math.sqrt(c.sturm.sigma) / (2 * Math.PI), 5)} Hz` : "not applicable"} · orthogonality ${c.massOrthogonality.toExponential(1)} (M), ${c.stiffnessOrthogonality.toExponential(1)} (K).</p>
${r.diagnostics
  .filter((d) => d.code !== "PARTICIPATION_TARGET_NOT_MET")
  .map(
    (d) =>
      `<p class="notice-small" data-testid="modal-diagnostic">${esc(d.code)}: ${esc(d.message)}</p>`,
  )
  .join("")}`;
  }

  function render(host) {
    const ctx = getContext();
    const st = state();
    let body = "";
    if (run) {
      const badge = `<span class="badge ${st === "current" ? "current" : "stale"}" data-testid="modal-state">${st === "current" ? "✓ Current" : "⚠ Stale"}</span>`;
      body = `<section data-testid="modal-result"><h4>Natural frequencies ${badge}</h4>${
        st === "stale"
          ? '<p class="notice-small">Stale results — these values belong to a previous model or mass. Run the modal analysis again.</p>'
          : ""
      }${
        run.failure
          ? `<div role="alert" data-testid="modal-failure"><strong>${esc(run.failure.code)}</strong><p>${esc(run.failure.message)}</p><p class="notice-small">No frequencies are reported.</p></div>`
          : resultHtml(run.result, st, ctx)
      }${run.result ? '<button type="button" id="modal-report">Vibration report ↓</button> <button type="button" id="modal-download">Record ↓</button>' : ""}</section>`;
    }
    host.innerHTML = `<div class="stability-workspace"><p class="notice-small" data-testid="modal-disclosure">${esc(MODAL_DISCLOSURE)}</p>${sourcesHtml(ctx)}${settingsHtml(ctx)}${body}</div>`;
    const form = host.querySelector("form");
    form.onchange = () => {
      settings = readSettings(host, settings);
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      void execute(host);
    };
    host.querySelector("#modal-edit-sources").onclick = () => onEditSources();
    for (const b of host.querySelectorAll("[data-modal-mode]"))
      b.onclick = () => {
        const i = Number(b.dataset.modalMode);
        shownMode = shownMode === i ? null : i;
        render(host);
      };
    const report = host.querySelector("#modal-report");
    if (report)
      report.onclick = () =>
        download(
          `vibration-report-${ctx.project.id}.html`,
          vibrationReport(ctx.project, run.result, {
            current: st === "current",
          }),
          "text/html",
        );
    const dl = host.querySelector("#modal-download");
    if (dl)
      dl.onclick = () =>
        download(
          `modal-${ctx.project.id}.json`,
          JSON.stringify({ ...run, currentState: st }, null, 2),
          "application/json",
        );
    syncViewport();
  }

  return {
    render,
    /** The run, when it is current for the given model hash; for reports. */
    current: (modelHash) =>
      run?.result && run.modelHash === modelHash && state() === "current"
        ? run
        : null,
    hide: () => {
      shownMode = null;
      viewport.overlay = null;
      viewport.draw();
    },
  };
}
