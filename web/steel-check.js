/** Standalone AISC S2 steel member check UI (M07-D). */

const IN = 0.0254;
const FT = 0.3048;
const KIP = 4448.2216152605;
const KSI = 6.894757293168361e6;

function w8x21Section() {
  const bf = 5.27 * IN;
  const tf = 0.4 * IN;
  const ag = 6.16 * IN * IN;
  return {
    ag,
    d: 8.28 * IN,
    tw: 0,
    bf,
    tf,
    rx: 0,
    ry: 1.26 * IN,
    zx: 0,
    zy: 0,
    sx: 0,
    sy: 0,
    bfOver2tf: 0,
    hOverTw: 0,
    e: 29000 * KSI,
  };
}

function w8x21TensionEnd() {
  return {
    uFloor: (2 * 5.27 * 0.4) / 6.16,
    xBar: 0.831 * IN,
    connectionLength: 9.0 * IN,
    holeCount: 4,
    holeDeductionWidth: 0.875 * IN,
  };
}

function w24x62Section() {
  return {
    ag: 0,
    d: 23.7 * IN,
    tw: 0.43 * IN,
    bf: 0,
    tf: 0,
    rx: 0,
    ry: 0,
    zx: 0,
    zy: 0,
    sx: 0,
    sy: 0,
    bfOver2tf: 0,
    hOverTw: 0,
    e: 29000 * KSI,
  };
}

/** S2-D1 payload in SI — fixtures/design/aisc-360-22-lrfd/S2-D1-tension-W8x21.json */
export function s2D1Payload() {
  return {
    profileId: "aisc-360-22-lrfd",
    memberIds: ["S2-D1"],
    resultId: "standalone-S2-D1",
    inputs: {
      sectionFamily: "W",
      doublySymmetric: true,
      prismatic: true,
      fy: 50 * KSI,
      fu: 65 * KSI,
      length: 25 * FT,
      ky: 1,
      kz: 1,
      lb: 0,
      cb: 1,
      torsionPresent: false,
      combinationId: "1.2D+1.6L",
      station: 0,
      n: 180 * KIP,
      vy: 0,
      vz: 0,
      my: 0,
      mz: 0,
      t: 0,
      section: w8x21Section(),
      tensionEnd: w8x21TensionEnd(),
    },
  };
}

/** Same section as S2-D1 with Pu raised above φtPn rupture (211 kip). */
export function s2D1FailPayload() {
  const base = s2D1Payload();
  base.memberIds = ["S2-D1-fail"];
  base.resultId = "standalone-S2-D1-fail";
  base.inputs.n = 400 * KIP;
  return base;
}

/** S2-G1B shear with Vu above φvVn (306 kip). */
export function s2G1BFailPayload() {
  return {
    profileId: "aisc-360-22-lrfd",
    memberIds: ["S2-G1B-fail"],
    resultId: "standalone-S2-G1B-fail",
    inputs: {
      sectionFamily: "W",
      doublySymmetric: true,
      prismatic: true,
      fy: 50 * KSI,
      fu: 65 * KSI,
      length: 20 * FT,
      ky: 1,
      kz: 1,
      lb: 0,
      cb: 1,
      torsionPresent: false,
      combinationId: "1.2D+1.6L",
      station: 0,
      n: 0,
      vy: 0,
      vz: 400 * KIP,
      my: 0,
      mz: 0,
      t: 0,
      section: w24x62Section(),
    },
  };
}

/**
 * Overlay simultaneous section actions from an analysis sample onto a W payload.
 * Keeps catalogue section/tension props; replaces demand + provenance only.
 */
export function applyAnalysisDemand(payload, { result, memberId, station = 0.5 }) {
  if (!payload?.inputs || !result?.members?.length) {
    throw new Error("Load a W seed case and analyse the model first.");
  }
  if (result.analysisType === "envelope") {
    throw new Error(
      "Envelopes are not simultaneous design demands. Use a real case or combination.",
    );
  }
  const member =
    result.members.find((m) => m.id === memberId) || result.members[0];
  if (!member?.samples?.length) {
    throw new Error("No member samples available on the current result.");
  }
  let sample = member.samples[0];
  let best = Math.abs((sample.station ?? 0) - station);
  for (const s of member.samples) {
    const d = Math.abs((s.station ?? 0) - station);
    if (d < best) {
      best = d;
      sample = s;
    }
  }
  const [n, vy, vz, t, my, mz] = sample.actions;
  return {
    ...payload,
    memberIds: [member.id],
    resultId: `model-derived:${result.caseId || "case"}:${member.id}`,
    inputs: {
      ...payload.inputs,
      combinationId: result.caseId || payload.inputs.combinationId,
      station: sample.station ?? station,
      n,
      vy,
      vz,
      t,
      my,
      mz,
      length: member.length ?? payload.inputs.length,
    },
  };
}

export function designRunReportHtml(run, escapeFn = (s) => String(s)) {
  const e = escapeFn;
  if (!run) return "";
  const rows = (run.checks || [])
    .map(
      (c) =>
        `<tr><th scope="row">${e(c.checkId)}</th><td>${e(c.clause)}</td><td>${e(c.status)}</td><td>${c.demand ?? ""}</td><td>${c.resistance ?? ""}</td><td>${c.utilisation ?? ""}</td><td>${e(JSON.stringify(c.intermediates || {}))}</td></tr>`,
    )
    .join("");
  return `<h2>Steel design checks</h2>
<p>Profile ${e(run.profileId)} · member ${e(run.memberId)} · ${e(run.combinationId)} · station ${e(run.station)} · overall <strong>${e(run.overall)}</strong></p>
<p>Demands are from one real case/combination (not envelope maxima). Clause trail below.</p>
<table><thead><tr><th>Check</th><th>Clause</th><th>Status</th><th>Demand</th><th>φRn</th><th>Util.</th><th>Intermediates</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatUtil(u) {
  if (u == null || Number.isNaN(u)) return "—";
  return (u * 100).toFixed(1) + "%";
}

function formatForceN(n) {
  if (n == null) return "—";
  return (n / 1e3).toFixed(1) + " kN";
}

function renderResult(run) {
  const rows = (run.checks || [])
    .map(
      (c) =>
        `<tr data-testid="steel-check-row" data-check-id="${esc(c.checkId)}">
          <th scope="row">${esc(c.checkId)}</th>
          <td>${esc(c.clause)}</td>
          <td data-testid="steel-check-status">${esc(c.status)}</td>
          <td>${formatForceN(c.demand)}</td>
          <td>${formatForceN(c.resistance)}</td>
          <td>${formatUtil(c.utilisation)}</td>
          <td>${esc(c.message || "")}</td>
        </tr>`,
    )
    .join("");
  return `<p><strong>Overall:</strong> <span data-testid="steel-overall">${esc(run.overall)}</span>
    · member ${esc(run.memberId)} · ${esc(run.combinationId)}</p>
  <table data-testid="steel-check-table">
    <thead><tr><th>Check</th><th>Clause</th><th>Status</th><th>Demand</th><th>φRn</th><th>Util.</th><th>Notes</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function shell(profileMeta, { hasResults }) {
  const enabled = !!profileMeta?.enabled;
  const badge = enabled
    ? `<span class="badge" data-testid="steel-profile-badge">${esc(profileMeta.id)} · ${esc(profileMeta.edition || "")} · enabled</span>`
    : `<span class="badge" data-testid="steel-profile-badge">profile disabled</span>`;
  const limits = (profileMeta?.limitations || [])
    .slice(0, 4)
    .map((l) => `<li>${esc(l)}</li>`)
    .join("");
  return `<div data-testid="steel-check-panel">
    <p>${badge}</p>
    <p class="form-help">Standalone or model-derived member check against AISC 360-22 LRFD S2.</p>
    <p class="notice-small">Not a professional certification claim. Commercial PROKON parity remains UNKNOWN. Envelopes cannot supply design demands.</p>
    <div class="fields" style="margin:0.75rem 0; display:flex; flex-wrap:wrap; gap:0.5rem">
      <button type="button" data-testid="steel-load-s2d1" id="steel-load-s2d1">Load S2-D1 pass</button>
      <button type="button" data-testid="steel-load-s2d1-fail" id="steel-load-s2d1-fail">Load S2-D1 fail</button>
      <button type="button" data-testid="steel-load-s2g1b-fail" id="steel-load-s2g1b-fail">Load shear fail</button>
      <button type="button" data-testid="steel-use-analysis" id="steel-use-analysis" ${hasResults ? "" : "disabled"}>Use analysis demand</button>
      <button type="button" data-testid="steel-run-check" id="steel-run-check" ${enabled ? "" : "disabled"}>Run check</button>
    </div>
    <p class="notice-small" id="steel-case-status" data-testid="steel-case-status">No case loaded.</p>
    <ul class="notice-small">${limits}</ul>
    <div id="steel-check-result" data-testid="steel-check-result"></div>
  </div>`;
}

export async function openSteelCheckDialog({
  gateway,
  openModal,
  message,
  getCapabilities,
  getAnalysisContext,
  onDesignRun,
}) {
  const caps = (await getCapabilities?.()) || {};
  const profiles = caps.designProfiles || [];
  const profileMeta =
    profiles.find((p) => p.id === "aisc-360-22-lrfd") || {
      id: "aisc-360-22-lrfd",
      enabled: false,
      limitations: [],
    };
  const ctx = getAnalysisContext?.() || {};
  const hasResults = !!(ctx.result && ctx.result.analysisType !== "envelope");

  openModal("Steel member check", shell(profileMeta, { hasResults }));

  let payload = null;
  const status = () => document.getElementById("steel-case-status");
  const resultHost = () => document.getElementById("steel-check-result");
  const runBtn = () => document.getElementById("steel-run-check");

  function loadCase(next, label) {
    payload = next;
    status().textContent = label;
    status().setAttribute("data-testid", "steel-case-loaded");
    runBtn().disabled = !profileMeta.enabled;
    resultHost().innerHTML = "";
    message(profileMeta.enabled ? label : "Profile disabled — cannot run Pass/Fail.");
  }

  document.getElementById("steel-load-s2d1").onclick = () =>
    loadCase(s2D1Payload(), "Loaded S2-D1 pass · Pu = 180 kip.");
  document.getElementById("steel-load-s2d1-fail").onclick = () =>
    loadCase(s2D1FailPayload(), "Loaded S2-D1 fail · Pu = 400 kip (> φtPn).");
  document.getElementById("steel-load-s2g1b-fail").onclick = () =>
    loadCase(s2G1BFailPayload(), "Loaded shear fail · Vu = 400 kip (> φvVn).");

  document.getElementById("steel-use-analysis").onclick = () => {
    try {
      if (!payload) {
        message("Load a W seed case first, then overlay analysis demand.");
        return;
      }
      const analysis = getAnalysisContext?.() || {};
      payload = applyAnalysisDemand(payload, {
        result: analysis.result,
        memberId: analysis.selectedMemberId,
        station: 0.5,
      });
      status().textContent = `Model-derived demand · member ${payload.memberIds[0]} · ${payload.inputs.combinationId} · x/L=${Number(payload.inputs.station).toPrecision(4)}`;
      status().setAttribute("data-testid", "steel-case-loaded");
      resultHost().innerHTML = "";
      message("Analysis demand applied to the loaded W section.");
    } catch (e) {
      message(e.message || String(e));
    }
  };

  runBtn().onclick = async () => {
    if (!payload) {
      message("Load a seed case first.");
      return;
    }
    if (!profileMeta.enabled) {
      message("Design profile is not enabled.");
      return;
    }
    try {
      const run = await gateway.send("evaluateDesign", payload);
      resultHost().innerHTML = renderResult(run);
      onDesignRun?.(run, payload);
      message(`Steel check overall: ${run.overall}`);
    } catch (e) {
      message(e.message || String(e));
    }
  };
}
