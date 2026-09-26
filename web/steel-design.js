/** Model-native steel workspace. Engineering values and readiness come from WASM. */
import { escape as esc } from "./reports/report.js";
import { renderResult } from "./steel-check.js";

export function designState(run, modelHash, result, dirty = false) {
  if (!run) return "not checked";
  if (dirty || run.modelHash !== modelHash || run.resultId !== result?.resultId)
    return "stale";
  return run.overall;
}

export function provenanceHtml(run) {
  return `<details class="design-provenance"><summary>Inputs and exact provenance</summary>
    <dl>${Object.entries({
      "Design run": run.designRunId,
      "Analysis result": run.resultId,
      "Model hash": run.modelHash,
      "Model revision": run.sourceRevision,
      "Solver build": run.solverBuildHash,
      "Profile version": run.profileVersion,
      "Design settings": run.designSettingsHash,
      "Catalogue source": run.catalogueSourceHash,
    })
      .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v ?? "Not recorded")}</dd>`)
      .join("")}</dl>
    <p>${esc(run.stabilityBasis || "")}</p></details>`;
}

export function designResultsHtml(run, state) {
  if (!run)
    return '<div class="empty-results"><strong>Steel design · NOT CHECKED</strong><p>Select a member and complete its design inputs in the Selection Inspector.</p></div>';
  return `<section data-testid="native-design-result" class="native-design-workspace"><div class="design-result-tabs"><button data-steel-pane="summary" aria-pressed="true">Design summary</button><button data-steel-pane="details" aria-pressed="false">Calculation details</button><button data-steel-pane="provenance" aria-pressed="false">Provenance</button><span class="spacer"></span><button id="design-why">Show governing location</button><button id="design-download">Download design record</button></div><div data-steel-view="summary" class="steel-summary-pane">${renderResult({ ...run, overall: state })}<aside class="design-notes"><h4>Design basis</h4><p class="design-note">${state === "stale" ? "STALE — recorded model or result has changed." : "Model-native checks · selected case/combination only."}</p><p>${esc(run.stabilityBasis)}</p><p>Serviceability: NOT CHECKED.</p><p>LTB requires a future validated profile; no full-code compliance claim.</p></aside></div><div data-steel-view="details" class="design-pane" hidden></div><div data-steel-view="provenance" class="design-pane" hidden>${provenanceHtml(run)}<p>Download the exact record for all ${run.stationChecks.length} station checks.</p></div></section>`;
}
export function bindSteelResultViews(host, run) {
  let index = 0;
  const detail = () => {
    const c = run.checks[index];
    host.querySelector("[data-steel-view=details]").innerHTML =
      `<div class="calculation-layout"><nav aria-label="Steel calculation checks">${run.checks.map((c, i) => `<button data-steel-check="${i}" class="${index === i ? "active" : ""}">${esc(c.checkId)} · ${esc(c.clause)}</button>`).join("")}</nav><article><h3>${esc(c.checkId)} — ${esc(c.clause)}</h3><span class="steel-status steel-status-${esc(c.status)}">${esc(c.status.toUpperCase())}</span><p>${esc(c.message || "")}</p><dl class="design-provenance-grid">${Object.entries(
        {
          Combination: c.combinationId,
          "Station x/L": c.station,
          "Discontinuity side": c.side ?? "—",
          Demand: c.demand == null ? "—" : `${c.demand} ${c.units}`,
          Resistance: c.resistance == null ? "—" : `${c.resistance} ${c.units}`,
          Utilisation: c.utilisation ?? "—",
          Formula: c.formulaId,
          ...c.intermediates,
        },
      )
        .map(
          ([k, v]) =>
            `<dt>${esc(k)}</dt><dd>${esc(typeof v === "object" ? JSON.stringify(v) : v)}</dd>`,
        )
        .join(
          "",
        )}</dl><p>${(c.assumptions || []).map(esc).join(" · ")}</p></article></div>`;
    for (const b of host.querySelectorAll("[data-steel-check]"))
      b.onclick = () => {
        index = Number(b.dataset.steelCheck);
        detail();
      };
  };
  for (const b of host.querySelectorAll("[data-steel-pane]"))
    b.onclick = () => {
      for (const tab of host.querySelectorAll("[data-steel-pane]"))
        tab.setAttribute("aria-pressed", String(tab === b));
      for (const view of host.querySelectorAll("[data-steel-view]"))
        view.hidden = view.dataset.steelView !== b.dataset.steelPane;
      if (b.dataset.steelPane === "details") detail();
    };
}

export function steelDesignWorkspace({
  gateway,
  getContext,
  command,
  onDirty,
  onRun,
  onRunning,
  onError,
  showResults,
  onCatalogue,
}) {
  let generation = 0;
  let cataloguePromise;
  async function render() {
    const token = ++generation;
    const host = document.querySelector("#steel-design-inspector");
    const ctx = getContext();
    const m = ctx.project?.members.find((m) => m.id === ctx.memberId);
    if (!m) {
      host.innerHTML = "<p>Select one member to inspect its steel design.</p>";
      return;
    }
    host.innerHTML = '<p role="status">Reading design inputs…</p>';
    try {
      cataloguePromise ||= gateway.send("steelCatalogue").catch((e) => {
        cataloguePromise = null;
        throw e;
      });
      const [cat, ready] = await Promise.all([
        cataloguePromise,
        gateway.send("steelReadiness", { memberId: m.id }),
      ]);
      if (token !== generation || getContext().modelHash !== ctx.modelHash)
        return;
      const d = m.steelDesign;
      const current =
        ctx.result &&
        ctx.result.analysisType !== "envelope" &&
        ctx.result.modelHash === ctx.modelHash &&
        !ctx.failed;
      const run = ctx.run?.memberId === m.id ? ctx.run : null;
      const state = designState(run, ctx.modelHash, ctx.result, ctx.dirty);
      onCatalogue?.(cat);
      const shape =
        cat.shapes.find(
          (s) => d?.sectionRef === `${cat.id}:${s.designation}`,
        ) || cat.shapes[0];
      const valueField = (key, label, unit = "") =>
        `<label class="design-field"><span>${label}</span><span class="design-field-control"><input id="design-${key}" name="${key}" type="number" step="any" ${key === "lb" ? 'min="0"' : 'min="0.000001"'} value="${d?.[key]?.value ?? ""}" placeholder="Not provided"><span class="unit">${unit}</span></span><abbr class="input-origin" title="${esc(d?.[key]?.source || "Not provided")}">${d?.[key]?.source === "user" ? "U" : "?"}</abbr></label>`;
      host.innerHTML = `<div class="design-object-title"><small>SELECTED MEMBER</small><h2>${esc(m.id)} <span class="badge ${esc(state)}" data-testid="native-design-state">${esc(state.toUpperCase())}</span></h2><small>Steel member · AISC 360-22 LRFD</small></div>
      <section class="design-section"><h3>1. Section and material</h3><label class="design-field"><span>Section</span><select id="design-section">${cat.shapes.map((s) => `<option value="${cat.id}:${s.designation}" ${shape === s ? "selected" : ""}>${s.designation}</option>`).join("")}</select></label>
      <div class="steel-section-card"><svg viewBox="0 0 100 110" role="img" aria-label="W section schematic"><path d="M20 10H80V22H57V86H80V98H20V86H43V22H20Z" fill="#aab7c4" stroke="#405369"/><path d="M25 15H75M48 27V82M25 92H75" stroke="#dce5ee" stroke-width="3"/></svg><div><strong>${esc(shape.designation)}</strong><small>AISC Shapes Database v16</small><dl><dt>Depth</dt><dd>${(shape.d * 25.4).toFixed(1)} mm</dd><dt>Flange width</dt><dd>${(shape.bf * 25.4).toFixed(1)} mm</dd><dt>Material</dt><dd>ASTM A992</dd></dl></div></div><div class="design-inline"><span>Fy 50 ksi · Fu 65 ksi</span><button id="design-assign">Assign section and material</button></div>
      <details class="catalogue-browser"><summary>Browse section catalogue · 5 verified records</summary><table><thead><tr><th>Section</th><th>d mm</th><th>bf mm</th></tr></thead><tbody>${cat.shapes.map((s) => `<tr><td><button data-catalogue-choice="${cat.id}:${s.designation}">${esc(s.designation)}</button></td><td>${(s.d * 25.4).toFixed(1)}</td><td>${(s.bf * 25.4).toFixed(1)}</td></tr>`).join("")}</tbody></table><small>${esc(cat.source)}</small></details></section>
      <form id="design-inputs"><section class="design-section"><h3>2. Design inputs</h3>${valueField("ky", "Effective length, Kᵧ")}${valueField("kz", "Effective length, K𝓏")}${valueField("lb", "Unbraced length, Lᵦ", "m")}${valueField("cb", "Moment gradient, Cᵦ")}<label class="design-field"><span>Bracing</span><select id="design-bracing"><option value="notProvided">Not provided</option><option value="continuous">Continuous lateral bracing</option><option value="unbraced">Unbraced length supplied</option></select></label><small>U · user specified. Missing assumptions are never defaulted.</small></section>
      <section class="design-section"><h3>3. Design settings</h3><label class="design-field"><span>Code profile</span><select disabled aria-label="Steel code profile"><option>AISC 360-22 LRFD · bounded S2</option></select></label><label class="design-basis-check"><input id="design-basis" type="checkbox" ${d?.stabilityBasis === "firstOrderUserEffectiveLength" ? "checked" : ""}>First-order analysis with user Kᵧ / K𝓏</label><div class="design-form-actions"><button id="design-save" ${!d ? "disabled" : ""}>Save design inputs</button><button type="button" id="design-cancel">Cancel changes</button></div></section></form>
      <section class="design-section"><h3>4. Design readiness <span class="status-text" data-testid="design-readiness">${esc(ready.status.toUpperCase())}</span></h3><div class="readiness-grid"><span>${current ? "✓" : "△"} Analysis ${current ? "current" : "required"}</span><span>${d ? "✓" : "△"} Section ${d ? "recognised" : "not bound"}</span><span>${d ? "✓" : "△"} Material ${d ? "recognised" : "not bound"}</span><span>${ready.status === "ready" ? "✓" : "△"} Design inputs ${ready.status === "ready" ? "complete" : "incomplete"}</span></div><ul class="readiness-issues">${[...ready.missing, ...ready.unsupported].map((v) => `<li>${esc(v)}</li>`).join("")}</ul><small data-testid="design-analysis-state">${!ctx.result ? "Analyse the model first." : !current ? "Analysis is stale, failed, or an envelope." : `Current analysis · ${esc(ctx.result.caseId)} · ${esc(ctx.result.resultId)}`}</small><div class="design-form-actions"><button class="primary" id="design-run" ${ready.status !== "ready" || !current || ctx.dirty || getContext().locked ? "disabled" : ""}>Run member design</button>${run ? '<button id="design-details">Calculation details</button>' : ""}</div><p id="design-message" role="status"></p></section>
      <p class="design-note">Continuous lateral restraint is required for validated flexure. LTB, second-order stability and serviceability remain unsupported. Assigning a section changes stiffness and requires reanalysis.</p>`;
      const $ = (s) => host.querySelector(s);
      for (const b of host.querySelectorAll("[data-catalogue-choice]"))
        b.onclick = () => {
          $("#design-section").value = b.dataset.catalogueChoice;
          $("#design-section").dispatchEvent(new Event("change"));
        };
      $("#design-bracing").value = d?.bracing || "notProvided";
      const fail = (e) => {
        const el = $("#design-message");
        if (el) el.textContent = e.message;
        onError(e.message);
      };
      $("#design-section").onchange = () => {
        const chosen = cat.shapes.find(
          (s) => `${cat.id}:${s.designation}` === $("#design-section").value,
        );
        const card = host.querySelector(".steel-section-card > div");
        card.innerHTML = `<strong>${esc(chosen.designation)}</strong><small>Catalogue selection · not assigned yet</small><dl><dt>Depth</dt><dd>${(chosen.d * 25.4).toFixed(1)} mm</dd><dt>Flange width</dt><dd>${(chosen.bf * 25.4).toFixed(1)} mm</dd><dt>Material</dt><dd>ASTM A992</dd></dl>`;
      };
      $("#design-assign").onclick = async () => {
        try {
          await command("AssignSteelCatalogue", {
            id: m.id,
            sectionRef: $("#design-section").value,
            materialRef: cat.material.id,
          });
        } catch (e) {
          fail(e);
        }
      };
      $("#design-inputs").oninput = () => {
        onDirty();
        if (run) $("[data-testid='native-design-state']").textContent = "STALE";
        $("#design-run").disabled = true;
        $("#design-assign").disabled = true;
      };
      $("#design-inputs").onsubmit = async (e) => {
        e.preventDefault();
        if (!d) return;
        const val = (key) => ({
          value:
            $("#design-" + key).value === ""
              ? null
              : Number($("#design-" + key).value),
          source: $("#design-" + key).value === "" ? "notProvided" : "user",
        });
        try {
          await command("SetSteelDesign", {
            id: m.id,
            design: {
              ...d,
              ky: val("ky"),
              kz: val("kz"),
              lb: val("lb"),
              cb: val("cb"),
              bracing: $("#design-bracing").value,
              stabilityBasis: $("#design-basis").checked
                ? "firstOrderUserEffectiveLength"
                : "notProvided",
            },
          });
        } catch (e) {
          fail(e);
        }
      };
      $("#design-cancel").onclick = () => {
        onDirty(false);
        void render();
      };
      $("#design-details")?.addEventListener("click", () => {
        showResults();
        document.querySelector("[data-steel-pane=details]")?.click();
      });
      $("#design-run").onclick = async () => {
        $("#design-run").disabled = true;
        onRunning(true);
        for (const control of host.querySelectorAll("input,select,button"))
          control.disabled = true;
        try {
          const now = getContext();
          if (
            now.dirty ||
            now.modelHash !== ctx.modelHash ||
            now.result?.resultId !== ctx.result?.resultId
          )
            throw Error("Inputs changed; refresh design readiness first");
          const run = await gateway.send("evaluateModelDesign", {
            memberId: m.id,
            caseId: ctx.result.caseId,
            resultId: ctx.result.resultId,
            modelHash: ctx.modelHash,
          });
          onRun(run);
          showResults();
        } catch (e) {
          fail(e);
        } finally {
          onRunning(false);
          void render();
        }
      };
      if (getContext().locked)
        for (const e of host.querySelectorAll("input,select,button"))
          e.disabled = true;
    } catch (e) {
      if (token === generation)
        host.innerHTML = `<p role="alert">${esc(e.message)}</p>`;
    }
  }
  return { render };
}
