/**
 * Stability results workspace (M09, stability-v1): elastic buckling factors
 * and modes, and first- versus second-order response of one real case or
 * combination. All numbers come from the Rust kernel; this module only
 * formats them. A critical factor is an elastic load multiplier of the
 * idealised model, never a member resistance or code verdict.
 */
import { escape as esc } from "./reports/report.js";

/** A value to `n` significant figures, or an em dash when not finite. */
function format(v, n) {
  return Number.isFinite(v) ? String(Number(v.toPrecision(n))) : "—";
}

export const STABILITY_DISCLOSURE =
  "Elastic stability (stability-v1) · flexural only · a critical factor is an elastic load multiplier of this model, not a member resistance, effective length or code check.";

const REASONS = {
  TANGENT_NOT_POSITIVE_DEFINITE:
    "The load is at or beyond the elastic critical state of this model, so no second-order response exists.",
  DIVERGING: "The iteration diverged, so no second-order response is reported.",
  ITERATION_LIMIT:
    "The iteration did not converge within its limit, so no second-order response is reported.",
};

/** Settings as edited in the panel; validated again by the kernel. */
function readSettings(host, previous) {
  const v = (name) => host.querySelector(`[name="${name}"]`);
  const kind = host.querySelector('[name="stability-type"]:checked')?.value;
  return {
    type: kind || previous.type,
    subdivisions: Number(v("stability-subdivisions")?.value ?? previous.subdivisions),
    modes: Number(v("stability-modes")?.value ?? previous.modes),
    imperfection: v("stability-imperfection")?.value ?? previous.imperfection,
    ratio: Number(v("stability-ratio")?.value ?? previous.ratio),
    direction: v("stability-direction")?.value ?? previous.direction,
  };
}

export function stabilityRequest(settings, casePayload) {
  const base = { ...casePayload, analysisType: settings.type };
  if (settings.type === "elasticBuckling")
    return {
      ...base,
      stability: { subdivisions: settings.subdivisions, modes: settings.modes },
    };
  return {
    ...base,
    stability: {
      subdivisions: settings.subdivisions,
      imperfection:
        settings.imperfection === "sway"
          ? {
              kind: "sway",
              ratio: settings.ratio,
              direction: settings.direction === "Y" ? [0, 1] : [1, 0],
            }
          : { kind: "none" },
    },
  };
}

export function stabilityWorkspace({
  gateway,
  getContext,
  viewport,
  onRunning,
  onError,
  download,
}) {
  let settings = {
    type: "elasticBuckling",
    subdivisions: 8,
    modes: 5,
    imperfection: "none",
    ratio: 0.005,
    direction: "X",
  };
  /** { kind, caseId, modelHash, request, result?, failure? } */
  let run = null;
  let shownMode = null;

  const state = () => {
    const ctx = getContext();
    if (!run) return "none";
    return run.modelHash === ctx.modelHash && run.caseId === ctx.caseId && !ctx.dirty
      ? "current"
      : "stale";
  };

  /** The current run's overlay: the shown buckling mode or the second-order shape. */
  function syncViewport() {
    const current = state() === "current" && run?.result;
    let overlay = null;
    if (current && run.kind === "elasticBuckling" && shownMode != null) {
      const mode = run.result.modes[shownMode];
      overlay = {
        kind: "mode",
        modelHash: run.modelHash,
        label: `Mode ${shownMode + 1} · λ = ${format(mode.factor, 4)}`,
        members: mode.members,
      };
    } else if (current && run.kind === "secondOrder")
      overlay = {
        kind: "secondOrder",
        modelHash: run.modelHash,
        label: `Second order · ${getContext().label(run.caseId)}`,
        members: run.result.members,
      };
    viewport.stabilityOverlay = overlay;
    viewport.draw();
  }

  async function execute(host) {
    settings = readSettings(host, settings);
    const ctx = getContext();
    if (ctx.caseId === "__envelope__" || !ctx.caseId) {
      onError("Stability analyses take one real case or combination, not an envelope.");
      return;
    }
    const request = stabilityRequest(settings, ctx.casePayload);
    onRunning(true);
    shownMode = null;
    try {
      const result = await gateway.send("analyse", request);
      run = {
        kind: settings.type,
        caseId: ctx.caseId,
        modelHash: result.modelHash,
        request,
        result,
      };
      if (settings.type === "elasticBuckling" && result.modes.length) shownMode = 0;
    } catch (e) {
      const d = e.diagnostics?.[0] || {};
      if (/CANCELLED/.test(e.message)) {
        onError(e.message);
      } else {
        run = {
          kind: settings.type,
          caseId: ctx.caseId,
          modelHash: ctx.modelHash,
          request,
          failure: {
            code: d.code || e.message.split(":")[0],
            reason: d.details?.reason || null,
            message: d.message || e.message,
            iteration: d.details?.iteration ?? null,
            history: d.details?.history || [],
          },
        };
      }
    } finally {
      onRunning(false);
      render(host);
    }
  }

  function settingsHtml(locked, envelope) {
    const buckling = settings.type === "elasticBuckling";
    const disabled = locked ? " disabled" : "";
    return `<form class="stability-settings" data-testid="stability-settings">
<fieldset><legend>Analysis</legend>
<label><input type="radio" name="stability-type" value="elasticBuckling"${buckling ? " checked" : ""}${disabled}> Elastic buckling</label>
<label><input type="radio" name="stability-type" value="secondOrder"${buckling ? "" : " checked"}${disabled}> Second-order (P-Δ-δ)</label>
</fieldset>
<label>Elements per member <input name="stability-subdivisions" type="number" min="1" max="32" step="1" value="${settings.subdivisions}"${disabled}></label>
${
  buckling
    ? `<label>Modes <input name="stability-modes" type="number" min="1" max="20" step="1" value="${settings.modes}"${disabled}></label>`
    : `<label>Imperfection <select name="stability-imperfection"${disabled}><option value="none"${settings.imperfection === "none" ? " selected" : ""}>None (stated)</option><option value="sway"${settings.imperfection === "sway" ? " selected" : ""}>Sway: equivalent horizontal forces</option></select></label>
${
  settings.imperfection === "sway"
    ? `<label>Ratio H/V <input name="stability-ratio" type="number" min="0" max="0.1" step="any" value="${settings.ratio}"${disabled}></label><label>Direction <select name="stability-direction"${disabled}><option value="X"${settings.direction === "X" ? " selected" : ""}>Global X</option><option value="Y"${settings.direction === "Y" ? " selected" : ""}>Global Y</option></select></label>`
    : ""
}`
}
<button type="submit" id="stability-run" class="primary"${locked || envelope ? " disabled" : ""}>Run stability analysis</button>
<span class="status-text" id="stability-readiness">${envelope ? "Select one case or combination; envelopes are not valid inputs." : "Runs on the selected case or combination."}</span>
</form>`;
  }

  function bucklingHtml(r, st) {
    if (!r.modes.length) {
      const negative = r.negativeFactors[0];
      return `<p class="notice-small" data-testid="stability-no-factor">${esc(r.diagnostics[0]?.message || "No positive critical factor.")}${negative != null ? ` Reversing the reference load would give ${format(-negative, 4)}.` : ""}</p>`;
    }
    return `<table data-testid="stability-modes"><thead><tr><th scope="col">Mode</th><th scope="col">Critical factor λ</th><th scope="col">Residual</th><th scope="col">Shape</th></tr></thead><tbody>${r.modes
      .map(
        (m, i) =>
          `<tr><th scope="row">${i + 1}</th><td data-testid="stability-factor" data-si="${m.factor}">${format(m.factor, 4)}</td><td>${m.residual.toExponential(1)}</td><td><button type="button" data-stability-mode="${i}" aria-pressed="${shownMode === i}"${st === "current" ? "" : " disabled"}>${shownMode === i ? "Shown" : "Show"}</button></td></tr>`,
      )
      .join("")}</tbody></table>
<p class="notice-small">λ scales the whole reference case. Mesh: ${r.subdivisions} elements per member. Sturm check: ${r.numericalChecks.sturm ? `${r.numericalChecks.sturm.negativePivots} factor(s) below λ${r.modes.length}` : "not applicable"}.</p>`;
  }

  function secondOrderHtml(r, ctx) {
    const first = r.numericalChecks.firstOrder;
    const nodes = r.nodeIds;
    // Largest second-order translation and its first-order counterpart.
    let at = 0;
    let peak = 0;
    for (let i = 0; i < nodes.length; i++)
      for (let a = 0; a < 3; a++) {
        const v = Math.abs(r.nodeDisplacements[i * 6 + a]);
        if (v > peak) [peak, at] = [v, i * 6 + a];
      }
    const comp = ["ux", "uy", "uz"][at % 6];
    const node = nodes[Math.floor(at / 6)];
    const second = r.nodeDisplacements[at];
    const firstValue = first.nodeDisplacements[at];
    const rows = [
      [
        `${esc(ctx.label(node))} ${comp}`,
        ctx.length(firstValue),
        ctx.length(second),
        firstValue ? format(second / firstValue, 4) : "—",
        second,
      ],
    ];
    r.reactionSupportIds.forEach((id, s) => {
      const m = (v) => Math.hypot(v[s * 6 + 3], v[s * 6 + 4], v[s * 6 + 5]);
      const a = m(first.reactions);
      const b = m(r.reactions);
      rows.push([
        `${esc(ctx.label(id))} |M|`,
        ctx.moment(a),
        ctx.moment(b),
        a ? format(b / a, 4) : "—",
        b,
      ]);
    });
    const forces = r.numericalChecks.imperfection.equivalentNodalForces;
    return `<table data-testid="stability-comparison"><thead><tr><th scope="col">Quantity</th><th scope="col">First order</th><th scope="col">Second order</th><th scope="col">Amplification</th></tr></thead><tbody>${rows
      .map(
        ([q, a, b, amp, si], i) =>
          `<tr><th scope="row">${q}</th><td>${a}</td><td data-si="${si}"${i === 0 ? ' data-testid="stability-sway"' : ""}>${b}</td><td${i === 0 ? ' data-testid="stability-amplification"' : ""}>${amp}</td></tr>`,
      )
      .join("")}</tbody></table>
<p class="notice-small">Converged in ${r.numericalChecks.iterations} iterations · ${r.numericalChecks.subdivisions} elements per member · first order is iteration 0 on the same loads and mesh.</p>
<p class="notice-small" data-testid="stability-imperfection">Imperfection: ${
      r.numericalChecks.imperfection.settings.kind === "none"
        ? "none (stated)"
        : `sway ratio ${r.numericalChecks.imperfection.settings.ratio}, ${forces.length} equivalent nodal force(s)`
    }.</p>`;
  }

  function failureHtml(f) {
    const history = f.history
      .map(
        (h) =>
          `<tr><td>${h.iteration}</td><td>${h.maxTranslationIncrement == null ? "—" : h.maxTranslationIncrement.toExponential(2)}</td><td>${h.maxAxialChange.toExponential(2)}</td></tr>`,
      )
      .join("");
    return `<div role="alert" data-testid="stability-failure"><strong>${esc(f.code)}${f.reason ? ` · ${esc(f.reason)}` : ""}</strong><p>${esc(REASONS[f.reason] || f.message)}</p>${f.iteration != null ? `<p class="notice-small">Stopped at iteration ${f.iteration}. No numerical response is reported.</p>` : ""}</div>${history ? `<details><summary>Iteration history</summary><table><thead><tr><th scope="col">Iteration</th><th scope="col">Max translation increment (m)</th><th scope="col">Max axial change (N)</th></tr></thead><tbody>${history}</tbody></table></details>` : ""}`;
  }

  function render(host) {
    const ctx = getContext();
    const st = state();
    const envelope = ctx.caseId === "__envelope__";
    let body = "";
    if (run) {
      const badge = `<span class="badge ${st === "current" ? "current" : "stale"}" data-testid="stability-state">${st === "current" ? "✓ Current" : "⚠ Stale"}</span>`;
      const title =
        run.kind === "elasticBuckling" ? "Elastic buckling" : "First- vs second-order response";
      body = `<section data-testid="stability-result"><h4>${title} · ${esc(ctx.label(run.caseId))} ${badge}</h4>${
        st === "stale"
          ? '<p class="notice-small">Stale results — these values belong to a previous model or case. Run the stability analysis again.</p>'
          : ""
      }${
        run.failure
          ? failureHtml(run.failure)
          : run.kind === "elasticBuckling"
            ? bucklingHtml(run.result, st)
            : secondOrderHtml(run.result, ctx)
      }${run.result ? '<button type="button" id="stability-download">Record ↓</button>' : ""}</section>`;
    }
    host.innerHTML = `<div class="stability-workspace"><p class="notice-small" data-testid="stability-disclosure">${esc(STABILITY_DISCLOSURE)}</p>${settingsHtml(ctx.locked, envelope)}${body}</div>`;
    const form = host.querySelector("form");
    form.onchange = () => {
      settings = readSettings(host, settings);
      render(host);
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      void execute(host);
    };
    for (const b of host.querySelectorAll("[data-stability-mode]"))
      b.onclick = () => {
        const i = Number(b.dataset.stabilityMode);
        shownMode = shownMode === i ? null : i;
        render(host);
      };
    const dl = host.querySelector("#stability-download");
    if (dl)
      dl.onclick = () =>
        download(
          `stability-${run.kind}-${run.caseId}.json`,
          JSON.stringify({ ...run, currentState: st }, null, 2),
          "application/json",
        );
    syncViewport();
  }

  return {
    render,
    /** The run, when it is current for the given model hash; for reports. */
    current: (modelHash) =>
      run?.result && run.modelHash === modelHash && state() === "current" ? run : null,
    hide: () => {
      shownMode = null;
      viewport.stabilityOverlay = null;
      viewport.draw();
    },
  };
}
