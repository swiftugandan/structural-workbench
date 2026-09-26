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
    <p>${esc(run.stabilityBasis || "")}</p><pre>${esc(JSON.stringify(run.inputs, null, 2))}</pre></details>`;
}

export function designResultsHtml(run, state) {
  if (!run)
    return '<div class="empty-results"><strong>Steel design · NOT CHECKED</strong><p>Select a member, open Steel design in the Selection Inspector, and supply its inputs.</p></div>';
  return `<section data-testid="native-design-result"><p class="notice-small">${state === "stale" ? "STALE — inputs or the selected analysis changed. These checks belong to the recorded model." : "Model-native strength checks · selected case/combination only"}</p>
    ${renderResult({ ...run, overall: state })}
    <p>${esc(run.stabilityBasis)}. Serviceability: NOT CHECKED.</p>
    <button type="button" id="design-why">Show governing location</button>
    <button type="button" id="design-download">Download design record</button>
    ${provenanceHtml(run)}
    <details><summary>All station checks (${run.stationChecks?.length || 0})</summary><pre>${esc(JSON.stringify(run.stationChecks, null, 2))}</pre></details></section>`;
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
      const valueField = (key, label) =>
        `<label>${label}<input id="design-${key}" name="${key}" type="number" step="any" ${key === "lb" ? 'min="0"' : 'min="0.000001"'} value="${d?.[key]?.value ?? ""}" placeholder="Not provided"><small>${esc(d?.[key]?.source || "notProvided")}</small></label>`;
      host.innerHTML = `<div class="inspector-heading"><div><strong>Steel design · ${esc(m.id)}</strong><small>AISC 360-22 · LRFD · bounded S2</small></div><span class="badge ${esc(state)}" data-testid="native-design-state">${esc(state.toUpperCase())}</span></div>
        <section class="form-section"><h3>Section and material</h3>
        <label>Catalogue W section<select id="design-section">${cat.shapes.map((s) => `<option value="${cat.id}:${s.designation}" ${d?.sectionRef === `${cat.id}:${s.designation}` ? "selected" : ""}>${s.designation}</option>`).join("")}</select></label>
        <p>ASTM A992 · Fy 50 ksi / Fu 65 ksi</p><small>${esc(cat.source)}</small>
        <button id="design-assign" type="button">Assign section and material</button>
        <p class="form-help">Assignment updates this member’s analysis stiffness and self weight. Reanalyse afterwards. Strong bending: local Mz; web shear: local Vy.</p></section>
        <form id="design-inputs"><section class="form-section"><h3>Design assumptions</h3>
        <div class="fields">${valueField("ky", "Ky · local y")}${valueField("kz", "Kz · local z")}${valueField("lb", "Unbraced length Lb [m]")}${valueField("cb", "Cb")}</div>
        <label>Bracing over the full member<select id="design-bracing"><option value="notProvided">Not provided</option><option value="continuous">Continuous lateral bracing</option><option value="unbraced">Unbraced length supplied</option></select></label>
        <label class="check-label"><input id="design-basis" type="checkbox" ${d?.stabilityBasis === "firstOrderUserEffectiveLength" ? "checked" : ""}>Confirm first-order analysis with user Ky/Kz</label>
        <p class="form-help">Restraints are user assumptions. Second-order stability and serviceability are not checked. Lb &gt; 0 is outside the validated flexure path.</p>
        <button type="submit" id="design-save" ${!d ? "disabled" : ""}>Save design inputs</button><button type="button" id="design-cancel">Cancel changes</button></section></form>
        <section class="form-section"><h3>Readiness · <span data-testid="design-readiness">${esc(ready.status.toUpperCase())}</span></h3>
        <ul>${[...ready.missing, ...ready.unsupported].map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
        <p data-testid="design-analysis-state">${!ctx.result ? "Analyse the model first." : !current ? "Analysis is stale, failed, or an envelope. Select and analyse a real case/combination." : `Current analysis · ${esc(ctx.result.caseId)} · ${esc(ctx.result.resultId)}`}</p>
        <button type="button" class="primary" id="design-run" ${ready.status !== "ready" || !current || ctx.dirty || getContext().locked ? "disabled" : ""}>Run member design</button>
        ${run ? '<button type="button" id="design-details">Calculation details</button>' : ""}
        <p id="design-message" role="status"></p></section>`;
      const $ = (s) => host.querySelector(s);
      $("#design-bracing").value = d?.bracing || "notProvided";
      const fail = (e) => {
        const el = $("#design-message");
        if (el) el.textContent = e.message;
        onError(e.message);
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
      $("#design-details")?.addEventListener("click", showResults);
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
