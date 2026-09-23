/** Standalone AISC S2 steel member check UI (M07-D). */

const IN = 0.0254;
const FT = 0.3048;
const KIP = 4448.2216152605;
const KIP_FT = 1355.8179483314;
const KSI = 6.894757293168361e6;

const SEEDS = {
  "S2-D1": {
    label: "S2-D1 tension pass · W8×21",
    expect: "pass",
    payload: () => ({
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
        section: {
          ag: 6.16 * IN * IN,
          d: 8.28 * IN,
          tw: 0,
          bf: 5.27 * IN,
          tf: 0.4 * IN,
          rx: 0,
          ry: 1.26 * IN,
          zx: 0,
          zy: 0,
          sx: 0,
          sy: 0,
          bfOver2tf: 0,
          hOverTw: 0,
          e: 29000 * KSI,
        },
        tensionEnd: {
          uFloor: (2 * 5.27 * 0.4) / 6.16,
          xBar: 0.831 * IN,
          connectionLength: 9.0 * IN,
          holeCount: 4,
          holeDeductionWidth: 0.875 * IN,
        },
      },
    }),
  },
  "S2-D1-fail": {
    label: "S2-D1 tension fail · Pu=400 kip",
    expect: "fail",
    payload: () => {
      const p = SEEDS["S2-D1"].payload();
      p.memberIds = ["S2-D1-fail"];
      p.resultId = "standalone-S2-D1-fail";
      p.inputs.n = 400 * KIP;
      return p;
    },
  },
  "S2-E1C": {
    label: "S2-E1C compression pass · W14×132",
    expect: "pass",
    payload: () => ({
      profileId: "aisc-360-22-lrfd",
      memberIds: ["S2-E1C"],
      resultId: "standalone-S2-E1C",
      inputs: {
        sectionFamily: "W",
        doublySymmetric: true,
        prismatic: true,
        fy: 50 * KSI,
        fu: 65 * KSI,
        length: 30 * FT,
        ky: 1,
        kz: 1,
        lb: 0,
        cb: 1,
        torsionPresent: false,
        combinationId: "1.2D+1.6L",
        station: 0,
        n: -840 * KIP,
        vy: 0,
        vz: 0,
        my: 0,
        mz: 0,
        t: 0,
        section: {
          ag: 38.8 * IN * IN,
          d: 0,
          tw: 0,
          bf: 0,
          tf: 0,
          rx: 6.28 * IN,
          ry: 3.76 * IN,
          zx: 0,
          zy: 0,
          sx: 0,
          sy: 0,
          bfOver2tf: 7.15,
          hOverTw: 17.7,
          e: 29000 * KSI,
        },
      },
    }),
  },
  "S2-E1C-fail": {
    label: "S2-E1C compression fail · Pu=1000 kip",
    expect: "fail",
    payload: () => {
      const p = SEEDS["S2-E1C"].payload();
      p.memberIds = ["S2-E1C-fail"];
      p.resultId = "standalone-S2-E1C-fail";
      p.inputs.n = -1000 * KIP;
      return p;
    },
  },
  "S2-F11B": {
    label: "S2-F11B flexure pass · W18×50 Lb=0",
    expect: "pass",
    payload: () => ({
      profileId: "aisc-360-22-lrfd",
      memberIds: ["S2-F11B"],
      resultId: "standalone-S2-F11B",
      inputs: {
        sectionFamily: "W",
        doublySymmetric: true,
        prismatic: true,
        fy: 50 * KSI,
        fu: 65 * KSI,
        length: 35 * FT,
        ky: 1,
        kz: 1,
        lb: 0,
        cb: 1,
        torsionPresent: false,
        combinationId: "1.2D+1.6L",
        station: 0.5,
        n: 0,
        vy: 0,
        vz: 0,
        my: 0,
        mz: 266 * KIP_FT,
        t: 0,
        section: {
          ag: 0,
          d: 0,
          tw: 0,
          bf: 0,
          tf: 0,
          rx: 0,
          ry: 0,
          zx: 101 * IN * IN * IN,
          zy: 0,
          sx: 0,
          sy: 0,
          bfOver2tf: 0,
          hOverTw: 0,
          e: 29000 * KSI,
        },
      },
    }),
  },
  "S2-F11B-fail": {
    label: "S2-F11B flexure fail · Mu=500 kip·ft",
    expect: "fail",
    payload: () => {
      const p = SEEDS["S2-F11B"].payload();
      p.memberIds = ["S2-F11B-fail"];
      p.resultId = "standalone-S2-F11B-fail";
      p.inputs.mz = 500 * KIP_FT;
      return p;
    },
  },
  "S2-G1B": {
    label: "S2-G1B shear pass · W24×62",
    expect: "pass",
    payload: () => ({
      profileId: "aisc-360-22-lrfd",
      memberIds: ["S2-G1B"],
      resultId: "standalone-S2-G1B",
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
        vz: 290 * KIP,
        my: 0,
        mz: 0,
        t: 0,
        section: {
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
        },
      },
    }),
  },
  "S2-G1B-fail": {
    label: "S2-G1B shear fail · Vu=400 kip",
    expect: "fail",
    payload: () => {
      const p = SEEDS["S2-G1B"].payload();
      p.memberIds = ["S2-G1B-fail"];
      p.resultId = "standalone-S2-G1B-fail";
      p.inputs.vz = 400 * KIP;
      return p;
    },
  },
  "S2-H1B": {
    label: "S2-H1B H1 formula pass · W14×99 (published φ; Lb=0 path)",
    expect: "pass",
    payload: () => ({
      profileId: "aisc-360-22-lrfd",
      memberIds: ["S2-H1B"],
      resultId: "standalone-S2-H1B",
      inputs: {
        sectionFamily: "W",
        doublySymmetric: true,
        prismatic: true,
        fy: 50 * KSI,
        fu: 65 * KSI,
        length: 14 * FT,
        ky: 1,
        kz: 1,
        // Example H.1B has unbraced length 14 ft; LTB is deferred. This seed
        // exercises H1 with published φ capacities on the continuous-brace path.
        lb: 0,
        cb: 1,
        torsionPresent: false,
        combinationId: "1.2D+1.6L",
        station: 0,
        n: -400 * KIP,
        vy: 0,
        vz: 0,
        my: 80 * KIP_FT,
        mz: 250 * KIP_FT,
        t: 0,
        phiCPn: 1130 * KIP,
        phiBMnx: 642 * KIP_FT,
        phiBMny: 311 * KIP_FT,
        section: {
          // AISC Shapes Database v16.0 — W14X99 (US customary)
          ag: 29.1 * IN * IN,
          d: 14.2 * IN,
          tw: 0.485 * IN,
          bf: 14.6 * IN,
          tf: 0.78 * IN,
          rx: 6.17 * IN,
          ry: 3.71 * IN,
          zx: 173 * IN * IN * IN,
          zy: 83.6 * IN * IN * IN,
          sx: 0,
          sy: 0,
          bfOver2tf: 9.34,
          hOverTw: 23.5,
          e: 29000 * KSI,
        },
      },
    }),
  },
  "S2-LTB-unsupported": {
    label: "S2 LTB unsupported · Lb>0 on W18×50",
    expect: "unsupported",
    payload: () => {
      const p = SEEDS["S2-F11B"].payload();
      p.memberIds = ["S2-LTB-unsupported"];
      p.resultId = "standalone-S2-LTB-unsupported";
      p.inputs.lb = 10 * FT;
      return p;
    },
  },
  "S2-HSS-unsupported": {
    label: "S2 HSS unsupported · non-W family",
    expect: "unsupported",
    payload: () => {
      const p = SEEDS["S2-D1"].payload();
      p.memberIds = ["S2-HSS-unsupported"];
      p.resultId = "standalone-S2-HSS-unsupported";
      p.inputs.sectionFamily = "HSS";
      p.inputs.doublySymmetric = true;
      return p;
    },
  },
  "S2-torsion-unsupported": {
    label: "S2 torsion unsupported",
    expect: "unsupported",
    payload: () => {
      const p = SEEDS["S2-D1"].payload();
      p.memberIds = ["S2-torsion-unsupported"];
      p.resultId = "standalone-S2-torsion-unsupported";
      p.inputs.torsionPresent = true;
      p.inputs.t = 10 * KIP_FT;
      return p;
    },
  },
};

export function s2D1Payload() {
  return SEEDS["S2-D1"].payload();
}
export function s2D1FailPayload() {
  return SEEDS["S2-D1-fail"].payload();
}
export function s2G1BFailPayload() {
  return SEEDS["S2-G1B-fail"].payload();
}
export function seedPayload(id) {
  const seed = SEEDS[id];
  if (!seed) throw new Error(`Unknown steel seed ${id}`);
  return seed.payload();
}
export function seedCatalog() {
  return Object.entries(SEEDS).map(([id, s]) => ({
    id,
    label: s.label,
    expect: s.expect,
  }));
}

/**
 * Overlay simultaneous section actions from an analysis sample onto a W payload.
 * Keeps catalogue section/tension props; replaces demand + provenance only.
 */
export function applyAnalysisDemand(
  payload,
  { result, memberId, station = 0.5 },
) {
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
      torsionPresent: !!(payload.inputs.torsionPresent || Math.abs(t) > 0),
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
  if (u == null || !Number.isFinite(u)) return "—";
  return (u * 100).toFixed(1) + "%";
}

function formatCheckValue(value, units) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (units === "N") return (value / 1e3).toFixed(1) + " kN";
  if (units === "N·m") return (value / 1e3).toFixed(1) + " kN·m";
  if (units === "-") return value.toFixed(3);
  return `${value.toPrecision(4)} ${units || ""}`.trim();
}

function formatAction(value, moment = false) {
  return `${(value / 1e3).toFixed(1)} ${moment ? "kN·m" : "kN"}`;
}

const checkNames = {
  classification: "Section classification",
  tension: "Tension",
  compression: "Compression",
  flexure: "Major-axis flexure",
  shear: "Shear",
  "interaction-H1": "Axial and bending interaction",
};

function renderInputSummary(payload, source, modelHash, exampleLabel = "") {
  const i = payload.inputs;
  const sectionName =
    i.sectionFamily === "W"
      ? exampleLabel.match(/W\d+×\d+/)?.[0] || "Reference W section"
      : i.sectionFamily;
  const sourceText =
    source === "model"
      ? `Current analysis · ${esc(modelHash?.slice(0, 12) || "unknown hash")}…`
      : `Published example input · ${esc(payload.resultId)}`;
  return `<div class="steel-input-summary" data-testid="steel-input-summary">
    <div><span>Section source</span><strong>${esc(sectionName)}</strong><small>${esc(exampleLabel.split(" ")[0] || "S2")} example properties; the model section is not substituted.</small></div>
    <div><span>Demand source</span><strong>${sourceText}</strong><small>${esc(i.combinationId)} · x/L ${Number(i.station).toFixed(3)} · member ${esc(payload.memberIds[0])}</small></div>
    <div><span>Demand actions</span><strong>N ${formatAction(i.n)} · Vz ${formatAction(i.vz)}</strong><small>My ${formatAction(i.my, true)} · Mz ${formatAction(i.mz, true)} · local axes</small></div>
    <div><span>Check assumptions</span><strong>W shape · ${Number(i.length).toFixed(2)} m</strong><small>Ky ${i.ky} · Kz ${i.kz} · Lb ${Number(i.lb).toFixed(2)} m · Cb ${i.cb}</small></div>
  </div>`;
}

function renderResult(run) {
  const checks = run.checks || [];
  let governing = null;
  for (const c of checks) {
    if (c.utilisation == null || Number.isNaN(c.utilisation)) continue;
    if (!governing || c.utilisation > governing.utilisation) governing = c;
  }
  const rows = checks
    .map((c) => {
      const detail = Object.entries(c.intermediates || {})
        .map(
          ([key, value]) =>
            `<div><dt>${esc(key)}</dt><dd>${esc(typeof value === "number" ? Number(value.toPrecision(6)) : JSON.stringify(value))}</dd></div>`,
        )
        .join("");
      const assumptions = (c.assumptions || [])
        .map((a) => `<li>${esc(a)}</li>`)
        .join("");
      return `<tr data-testid="steel-check-row" data-check-id="${esc(c.checkId)}" data-status="${esc(c.status)}">
      <th scope="row"><strong>${esc(checkNames[c.checkId] || c.checkId)}</strong><small>${esc(c.checkId)}</small></th>
      <td>${esc(c.clause)}</td>
      <td><span class="steel-status steel-status-${esc(c.status)}" data-testid="steel-check-status">${esc(c.status)}</span></td>
      <td>${formatCheckValue(c.demand, c.units)}</td>
      <td>${formatCheckValue(c.resistance, c.units)}</td>
      <td><strong>${formatUtil(c.utilisation)}</strong>${c.utilisation != null && Number.isFinite(c.utilisation) ? `<span class="steel-meter"><span style="width:${Math.min(100, Math.max(0, c.utilisation * 100))}%"></span></span>` : ""}</td>
      <td><details><summary>Details</summary><p>${esc(c.message || "No additional note.")}</p>${assumptions ? `<ul>${assumptions}</ul>` : ""}${detail ? `<dl>${detail}</dl>` : ""}</details></td>
    </tr>`;
    })
    .join("");
  const gov = governing
    ? `<p data-testid="steel-governing">Governing check <strong>${esc(checkNames[governing.checkId] || governing.checkId)}</strong> · ${esc(governing.clause)} · ${formatUtil(governing.utilisation)}</p>`
    : `<p data-testid="steel-governing">No numeric governing ratio for this check.</p>`;
  return `<div class="steel-result-hero steel-result-${esc(run.overall)}">
    <div><span class="steel-eyebrow">Overall result</span><strong data-testid="steel-overall">${esc(run.overall)}</strong><small>${esc(run.memberId)} · ${esc(run.combinationId)} · x/L ${Number(run.station).toFixed(3)}</small></div>
    <div>${gov}<small>Highest reported ratio is shown; an unsupported check still limits the overall result.</small></div>
  </div>
  <div class="steel-check-table-wrap"><table data-testid="steel-check-table">
    <thead><tr><th scope="col">Check</th><th scope="col">Clause</th><th scope="col">Status</th><th scope="col">Demand</th><th scope="col">Resistance</th><th scope="col">Utilisation</th><th scope="col">Calculation trail</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function shell(profileMeta, { hasResults, resultState, selectedMemberId }) {
  const enabled = !!profileMeta?.enabled;
  const badge = enabled
    ? `<span class="steel-profile-badge" data-testid="steel-profile-badge">${esc(profileMeta.standard || "AISC 360")} · ${esc(profileMeta.edition || "2022")} · ${esc(profileMeta.designMethod || "LRFD")} · enabled</span>`
    : `<span class="steel-profile-badge steel-status-unsupported" data-testid="steel-profile-badge">AISC profile disabled</span>`;
  const limits = (profileMeta?.limitations || [])
    .slice(0, 4)
    .map((l) => `<li>${esc(l)}</li>`)
    .join("");
  const options = seedCatalog()
    .map(
      (s) =>
        `<option value="${esc(s.id)}" data-expect="${esc(s.expect)}">${esc(s.label)}</option>`,
    )
    .join("");
  return `<div class="steel-workspace" data-testid="steel-check-panel">
    <header class="steel-intro">
      <div><span class="steel-eyebrow">STEEL MEMBER DESIGN</span>
        <h3>Check a steel member</h3><p>Choose a reference W section, select its demand source, then inspect each clause result.</p></div>
      ${badge}
    </header>
    <div class="steel-workflow">
      <div class="steel-steps">
        <section class="steel-step" aria-labelledby="steel-step-section">
          <span class="steel-step-number">01</span><div><h4 id="steel-step-section">Section and example</h4>
          <p>Select a published S2 example. Its W-section properties and design assumptions are used in this check.</p>
          <label for="steel-seed">Reference example</label>
          <select id="steel-seed" data-testid="steel-seed">${options}</select>
          <button type="button" data-testid="steel-load-seed" id="steel-load-seed">Load example</button>
          <button type="button" data-testid="steel-load-s2d1" id="steel-load-s2d1" hidden>Load S2-D1</button>
          <button type="button" data-testid="steel-load-s2d1-fail" id="steel-load-s2d1-fail" hidden>Load S2-D1 fail</button>
          <button type="button" data-testid="steel-load-s2g1b-fail" id="steel-load-s2g1b-fail" hidden>Load shear fail</button></div>
        </section>
        <section class="steel-step" aria-labelledby="steel-step-demand">
          <span class="steel-step-number">02</span><div><h4 id="steel-step-demand">Demand source</h4>
          <p>Keep the example actions, or replace them with simultaneous actions from the current analysis.</p>
          <button type="button" data-testid="steel-use-analysis" id="steel-use-analysis" ${hasResults ? "" : "disabled"}>Use current analysis</button>
          <small id="steel-analysis-availability">${esc(resultState)}${selectedMemberId ? ` · member ${esc(selectedMemberId)}` : ""}</small>
          <small>Model demand does not replace the reference W section. Envelopes and stale results cannot be used.</small></div>
        </section>
        <section class="steel-step" aria-labelledby="steel-step-run">
          <span class="steel-step-number">03</span><div><h4 id="steel-step-run">Run and review</h4>
          <p>Run the Rust/WASM profile and review the governing result and clause details.</p>
          <button type="button" class="primary" data-testid="steel-run-check" id="steel-run-check" disabled>Run steel check</button></div>
        </section>
      </div>
      <div class="steel-review">
        <div class="steel-review-head"><div><span class="steel-eyebrow">CHECK SETUP</span><h4>Inputs and provenance</h4></div><span id="steel-source-chip" class="steel-source-chip">No input</span></div>
        <p id="steel-case-status" data-testid="steel-case-status" role="status">Load an example to inspect its inputs.</p>
        <div id="steel-input-summary" class="steel-empty">No case loaded.</div>
        <div class="steel-review-head"><div><span class="steel-eyebrow">RESULTS</span><h4>Check breakdown</h4></div></div>
        <div id="steel-check-result" data-testid="steel-check-result" class="steel-empty">Run a check to see its result and calculation trail.</div>
      </div>
    </div>
    <details class="steel-scope"><summary>Supported scope and limitations</summary>
      <ul>${limits}</ul><p>Not a professional certification claim. Commercial PROKON parity remains unknown.</p></details>
  </div>`;
}

export async function openSteelCheckDialog({
  gateway,
  openModal,
  getCapabilities,
  getAnalysisContext,
  onDesignRun,
}) {
  const caps = (await getCapabilities?.()) || {};
  const profiles = caps.designProfiles || [];
  const profileMeta = profiles.find((p) => p.id === "aisc-360-22-lrfd") || {
    id: "aisc-360-22-lrfd",
    enabled: false,
    limitations: [],
  };
  const ctx = getAnalysisContext?.() || {};
  const hasResults = !!(
    ctx.result &&
    ctx.result.analysisType !== "envelope" &&
    ctx.result.modelHash === ctx.modelHash
  );
  const resultState = !ctx.result
    ? "Analyse the model to use its actions"
    : ctx.result.analysisType === "envelope"
      ? "Choose a real case or combination"
      : !hasResults
        ? "Analysis is stale; analyse again"
        : "Current analysis available";

  openModal(
    "Steel member check",
    shell(profileMeta, {
      hasResults,
      resultState,
      selectedMemberId: ctx.selectedMemberId,
    }),
  );

  let payload = null;
  let source = "example";
  let sourceModelHash = null;
  const status = () => document.getElementById("steel-case-status");
  const resultHost = () => document.getElementById("steel-check-result");
  const runBtn = () => document.getElementById("steel-run-check");
  const seedSelect = () => document.getElementById("steel-seed");
  const inputHost = () => document.getElementById("steel-input-summary");
  const sourceChip = () => document.getElementById("steel-source-chip");

  function loadCase(next, label) {
    payload = next;
    source = "example";
    sourceModelHash = null;
    status().textContent = label;
    status().setAttribute("data-testid", "steel-case-loaded");
    runBtn().disabled = !profileMeta.enabled;
    sourceChip().textContent = "Example actions";
    inputHost().classList.remove("steel-empty");
    inputHost().innerHTML = renderInputSummary(
      payload,
      source,
      null,
      seedSelect().selectedOptions[0].textContent,
    );
    resultHost().className = "steel-empty";
    resultHost().textContent =
      "Run a check to see its result and calculation trail.";
    if (!profileMeta.enabled)
      status().textContent += " Profile disabled; check unavailable.";
  }

  function loadSelectedSeed() {
    const id = seedSelect().value;
    const meta = SEEDS[id];
    loadCase(meta.payload(), `Loaded ${meta.label}.`);
  }

  document.getElementById("steel-load-seed").onclick = loadSelectedSeed;
  seedSelect().onchange = () => {
    payload = null;
    runBtn().disabled = true;
    sourceChip().textContent = "Example not loaded";
    status().textContent =
      "Load the selected example to use its section and actions.";
    status().setAttribute("data-testid", "steel-case-status");
    inputHost().className = "steel-empty";
    inputHost().textContent = "No case loaded.";
    resultHost().className = "steel-empty";
    resultHost().textContent =
      "Run a check to see its result and calculation trail.";
  };
  // Compat aliases for earlier e2e selectors.
  document.getElementById("steel-load-s2d1").onclick = () => {
    seedSelect().value = "S2-D1";
    loadSelectedSeed();
  };
  document.getElementById("steel-load-s2d1-fail").onclick = () => {
    seedSelect().value = "S2-D1-fail";
    loadSelectedSeed();
  };
  document.getElementById("steel-load-s2g1b-fail").onclick = () => {
    seedSelect().value = "S2-G1B-fail";
    loadSelectedSeed();
  };

  document.getElementById("steel-use-analysis").onclick = () => {
    try {
      if (!payload) {
        status().textContent = "Load a reference W-section example first.";
        return;
      }
      const analysis = getAnalysisContext?.() || {};
      if (
        !analysis.result ||
        analysis.result.modelHash !== analysis.modelHash ||
        analysis.result.analysisType === "envelope"
      ) {
        throw new Error(
          "Current case results are required. Analyse the model, then reopen this check.",
        );
      }
      payload = applyAnalysisDemand(payload, {
        result: analysis.result,
        memberId: analysis.selectedMemberId,
        station: 0.5,
      });
      source = "model";
      sourceModelHash = analysis.modelHash;
      status().textContent = `Model-derived demand · member ${payload.memberIds[0]} · ${payload.inputs.combinationId} · x/L=${Number(payload.inputs.station).toPrecision(4)}`;
      status().setAttribute("data-testid", "steel-case-loaded");
      sourceChip().textContent = "Current model actions";
      inputHost().innerHTML = renderInputSummary(
        payload,
        source,
        sourceModelHash,
        seedSelect().selectedOptions[0].textContent,
      );
      resultHost().className = "steel-empty";
      resultHost().textContent =
        "Run a check to see its result and calculation trail.";
    } catch (e) {
      status().textContent = e.message || String(e);
    }
  };

  runBtn().onclick = async () => {
    if (!payload) {
      status().textContent = "Load an example before running the check.";
      return;
    }
    if (!profileMeta.enabled) {
      status().textContent = "This design profile is not enabled.";
      return;
    }
    try {
      if (source === "model") {
        const analysis = getAnalysisContext?.() || {};
        if (
          !analysis.result ||
          analysis.result.modelHash !== sourceModelHash ||
          analysis.modelHash !== sourceModelHash
        ) {
          throw new Error(
            "Analysis demand is stale. Analyse the current model and reopen this check.",
          );
        }
      }
      runBtn().disabled = true;
      const run = await gateway.send("evaluateDesign", payload);
      resultHost().className = "";
      resultHost().innerHTML = renderResult(run);
      onDesignRun?.(run, payload);
    } catch (e) {
      status().textContent = e.message || String(e);
    } finally {
      runBtn().disabled = !profileMeta.enabled;
    }
  };
}
