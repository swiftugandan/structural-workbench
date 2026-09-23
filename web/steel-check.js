/** Standalone AISC S2 steel member check UI (M07-D first slice). */

const IN = 0.0254;
const FT = 0.3048;
const KIP = 4448.2216152605;
const KSI = 6.894757293168361e6;

/** S2-D1 payload in SI — digits from fixtures/design/aisc-360-22-lrfd/S2-D1-tension-W8x21.json */
export function s2D1Payload() {
  const bf = 5.27 * IN;
  const tf = 0.4 * IN;
  const ag = 6.16 * IN * IN;
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
      section: {
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
      },
      tensionEnd: {
        uFloor: (2 * 5.27 * 0.4) / 6.16,
        xBar: 0.831 * IN,
        connectionLength: 9.0 * IN,
        holeCount: 4,
        holeDeductionWidth: 0.875 * IN,
      },
    },
  };
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

function shell(profileMeta) {
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
    <p class="form-help">Standalone member check against AISC 360-22 LRFD S2. Load seeded Example D.1, then run.</p>
    <p class="notice-small">Not a professional certification claim. Commercial PROKON parity remains UNKNOWN.</p>
    <div class="fields" style="margin:0.75rem 0">
      <button type="button" data-testid="steel-load-s2d1" id="steel-load-s2d1">Load S2-D1 (W8×21 tension)</button>
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
}) {
  const caps = (await getCapabilities?.()) || {};
  const profiles = caps.designProfiles || [];
  const profileMeta =
    profiles.find((p) => p.id === "aisc-360-22-lrfd") || {
      id: "aisc-360-22-lrfd",
      enabled: false,
      limitations: [],
    };

  openModal("Steel member check", shell(profileMeta));

  let payload = null;
  const status = () => document.getElementById("steel-case-status");
  const result = () => document.getElementById("steel-check-result");
  const runBtn = () => document.getElementById("steel-run-check");

  document.getElementById("steel-load-s2d1").onclick = () => {
    payload = s2D1Payload();
    status().textContent = "Loaded S2-D1 · Pu = 180 kip (converted to SI).";
    status().setAttribute("data-testid", "steel-case-loaded");
    runBtn().disabled = !profileMeta.enabled;
    result().innerHTML = "";
    message(profileMeta.enabled ? "S2-D1 loaded." : "Profile disabled — cannot run Pass/Fail.");
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
      result().innerHTML = renderResult(run);
      message(`Steel check overall: ${run.overall}`);
    } catch (e) {
      message(e.message || String(e));
    }
  };
}
