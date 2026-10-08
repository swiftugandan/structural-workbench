/**
 * Result panes every design kind shares (ADR 0033): summary, actions,
 * calculation details, reinforcement and schedule. A kind overrides a pane
 * through its descriptor; nothing here branches on the kind.
 */
import { html, raw } from "../core/html.js";
import {
  pretty,
  proposalPanel,
  provenanceTable,
  statusLabel,
  utilisationOf,
} from "../design-presentation.js";

const SYMBOL = { STALE: "◷", PASS: "✓", FAIL: "✕" };

function basis(run) {
  const p = run?.codeProfile;
  if (!p)
    return "NO CODE CHECK — synthetic actions illustrate the workflow; no code-compliance claim.";
  const amendments = p.unreconciledAmendments || [];
  return `DEMONSTRATION — ${p.id === "aisc-360-22-lrfd" ? `${p.standard} ` : ""}${p.edition}; ${amendments.length ? `${amendments.join(", ")} not reconciled; ` : ""}${p.certification}.`;
}

function actionsName(source) {
  if (!source) return "Not captured";
  if (source.mock) return "SYNTHETIC FIXTURE";
  return source.kind === "plateAnalysis"
    ? "Plate analysis (plate-v1)"
    : "Actual model analysis";
}

function summary({ run, state, kind, d }) {
  const checks = run?.checks || [];
  return html`<div class="design-summary-grid"><article class="design-verdict ${state.toLowerCase()}"><div class="verdict-symbol">${SYMBOL[state] || "△"}</div><div><small>OVERALL DESIGN</small><strong data-testid="preview-state">${state}</strong><p>${kind.name}</p><span>Utilisation <b data-testid="preview-utilisation">${utilisationOf(checks)}</b></span><small>${run?.codeProfile ? `${run.codeProfile.edition} · DEMONSTRATION` : "No verified resistance"}</small></div></article><div class="design-check-matrix"><table><thead><tr><th>Check</th><th>Status</th><th>Util.</th></tr></thead><tbody>${checks.map(
    (c, i) =>
      html`<tr data-testid="preview-check-row" data-check="${c.name}"><td><button class="check-link" data-preview-check="${i}">${c.name}</button></td><td><span class="status-text ${c.status}">${statusLabel(c.status)}</span></td><td>${c.utilisation == null ? "—" : pretty(c.utilisation, 3)}</td></tr>`,
  )}</tbody></table>${!run && html`<p>Run a preview to record actions and unavailable checks.</p>`}</div><aside class="design-notes"><h4>Design basis</h4><p class="design-note" data-testid="design-basis">${basis(run)}</p><p>Actions: <b>${actionsName(run?.sourceProvenance)}</b></p><p>Code profile: ${run?.codeProfile ? run.codeProfile.id : "unavailable"}</p>${kind.summaryBasis?.(run, d)}</aside>${raw(proposalPanel(run?.reinforcementProposal))}</div>`;
}

function reinforcement({ d, sketch }) {
  return html`<div class="reinforcement-layout"><article><h4>Reinforcement plan <small>· illustration only</small></h4><svg class="design-drawing" viewBox="0 0 300 230">${sketch}</svg><p class="design-note">Preference illustration · not a verified arrangement or construction drawing.</p></article><article><h4>Geometry and layers</h4><svg class="section-drawing" viewBox="0 0 300 230">${sketch}</svg><p>Cover ${pretty(d.inputs.cover * 1000)} mm · fit, spacing and anchorage unverified.</p></article></div>`;
}

function schedule({ run }) {
  const len = (v) => (v == null ? "—" : `${pretty(v * 1000)} mm`);
  const kg = (v) => (v == null ? "—" : `${pretty(v, 3)} kg`);
  const rows = run?.schedule || [];
  const total =
    rows.length && rows.every((r) => r.massKg != null)
      ? rows.reduce((a, r) => a + r.massKg, 0)
      : null;
  return html`<h4>Bar schedule · indicative</h4><table><thead><tr><th>Mark</th><th>Region</th><th>Shape</th><th>Bar</th><th>Qty</th><th>Cut length</th><th>Mass</th><th>Basis</th></tr></thead><tbody>${rows.map(
    (r) =>
      html`<tr data-testid="schedule-row" data-mark="${r.mark}"><td>${r.mark}</td><td>${r.region}</td><td>${r.shape || ""}</td><td>Ø${pretty(r.diameter * 1000)} mm</td><td>${r.quantity ?? "—"}</td><td>${len(r.cutLength)}</td><td>${kg(r.massKg)}</td><td>${r.basis || ""}</td></tr>`,
  )}</tbody>${total != null && html`<tfoot><tr><td colspan="6">Total</td><td data-testid="schedule-total">${kg(total)}</td><td></td></tr></tfoot>`}</table><p class="design-note">${rows.length ? "INDICATIVE — designed straight bars with no curtailment or laps; BS 8666 shape codes are not held. Not a fabrication schedule." : "A schedule is unavailable for this design object."}</p>`;
}

function details({ run, checkIndex }) {
  const checks = run?.checks || [];
  const c = checks[checkIndex] || checks[0];
  const profile = run?.codeProfile;
  return html`<div class="calculation-layout"><nav aria-label="Design calculation checks">${checks.map(
    (x, i) =>
      html`<button class="${i === checkIndex ? "active" : ""}" data-preview-check="${i}">△ ${x.name}</button>`,
  )}</nav><article><h3>${c?.name || "Calculation details"}</h3><span class="status-text ${c?.status || "unsupported"}">${statusLabel(c?.status || "unsupported")}</span><p>${c?.reason || "No recorded check."}</p><dl class="design-provenance-grid"><dt>Demand</dt><dd>${profile ? "Per station in the code checks tab" : "See recorded upstream actions"}</dd><dt>Resistance</dt><dd>${profile ? "Per station in the code checks tab" : "Unavailable"}</dd><dt>Clause / code profile</dt><dd>${profile ? `${profile.id} · ${profile.edition}` : "Unavailable"}</dd><dt>Utilisation</dt><dd>${c?.utilisation == null ? "—" : pretty(c.utilisation, 3)}</dd></dl>${run && raw(provenanceTable(run))}</article></div>`;
}

function actions({ run }) {
  const source = run?.sourceProvenance;
  if (!source) return html`<p>No actions captured yet.</p>`;
  const kindText = source.mock
    ? "synthetic fixture"
    : source.kind === "plateAnalysis"
      ? "plate analysis"
      : "actual model analysis";
  const body = source.rawPlateActions
    ? html`<table><thead><tr><th>Raw plate action</th><th>N·m/m</th></tr></thead><tbody>${Object.entries(
        source.rawPlateActions,
      ).map(
        ([k, v]) => html`<tr><td>${k}</td><td>${pretty(v)}</td></tr>`,
      )}</tbody></table><p>Design transformation and mesh convergence unavailable.</p>`
    : source.foundationActions
      ? html`<table><thead><tr>${["Fx", "Fy", "Fz", "Mx", "My", "Mz"].map(
          (k) => html`<th>${k}</th>`,
        )}</tr></thead><tbody><tr>${source.foundationActions.map(
          (n, i) => html`<td>${pretty(n / 1000)} ${i < 3 ? "kN" : "kN·m"}</td>`,
        )}</tr></tbody></table><p>${source.axes || ""}</p>`
      : html`<p>${source.stations?.length || 0} recorded member key stations · exact data in the preview record.</p>`;
  return html`<h4>Design actions · ${kindText}</h4>${body}${raw(provenanceTable(run))}`;
}

const SHARED = { summary, actions, details, reinforcement, schedule };

/**
 * The pane `id` for the draft: the kind's renderer when it has one and it
 * returns a value, otherwise the shared pane of that id.
 */
export function designPane(id, ctx) {
  const own = ctx.kind.panes.find((p) => p.id === id);
  const rendered = own?.render?.(ctx);
  if (rendered !== undefined) return rendered;
  const shared = SHARED[id] || SHARED.summary;
  return shared(ctx);
}
