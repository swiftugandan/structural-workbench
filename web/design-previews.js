/** Workflow illustrations only. Validation, units and action provenance belong to Rust. */
import { escape as esc } from "./reports/report.js";
const names = { rcBeam: "RC beam", slab: "Slab", padFooting: "Pad footing" };
const sourceName = (value) =>
  ({
    syntheticFixture: "Synthetic fixture",
    user: "User input",
    mixed: "Mixed sources",
  })[value] || value;
const $ = (s) => document.querySelector(s);
// Attach the displayed unit only to bare numbers; Rust parses all quantities.
function fieldInput(value, unit) {
  const text = value.trim();
  return unit !== "N/m³" &&
    /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)
    ? text + unit
    : text;
}
export function previewState(run, ctx) {
  if (!run) return "NOT CHECKED";
  return ctx.dirty ||
    run.modelHash !== ctx.modelHash ||
    (run.sourceProvenance.kind === "modelAnalysis" &&
      (ctx.failed || run.sourceProvenance.resultId !== ctx.result?.resultId))
    ? "STALE"
    : "UNSUPPORTED";
}
function illustration(d, face) {
  const v = d.inputs;
  if (d.kind === "rcBeam") {
    const w = (180 * v.width) / Math.max(v.width, v.depth),
      h = (180 * v.depth) / Math.max(v.width, v.depth),
      x = (300 - w) / 2,
      y = (220 - h) / 2;
    const bars = Array.from(
      { length: v.barCount },
      (_, i) => x + 12 + ((w - 24) * i) / Math.max(1, v.barCount - 1),
    );
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#dce6ef" stroke="#516b82"/><rect x="${x + 8}" y="${y + 8}" width="${w - 16}" height="${h - 16}" rx="6" fill="none" stroke="#62798a"/>${bars.flatMap((cx) => [y + 14, y + h - 14].map((cy) => `<circle cx="${cx}" cy="${cy}" r="4" fill="#1167a2"/>`)).join("")}<text x="150" y="218" text-anchor="middle">Bar preference illustration · fit unverified</text>`;
  }
  const w = (230 * v.length) / Math.max(v.length, v.width),
    h = (160 * v.width) / Math.max(v.length, v.width),
    x = (300 - w) / 2,
    y = (200 - h) / 2;
  if (d.kind === "slab") {
    const vertical = face.endsWith("Y");
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e1edf5" stroke="#516b82"/>${Array.from({ length: 11 }, (_, i) => (vertical ? `<path d="M${x + (i * w) / 10},${y}v${h}" stroke="#85a8be"/>` : `<path d="M${x},${y + (i * h) / 10}h${w}" stroke="#85a8be"/>`)).join("")}<rect x="${150 - (w * v.openingLength) / v.length / 2}" y="${100 - (h * v.openingWidth) / v.width / 2}" width="${(w * v.openingLength) / v.length}" height="${(h * v.openingWidth) / v.width}" fill="white" stroke="#c17f26"/><text x="150" y="215" text-anchor="middle">${esc(face)} · direction illustration</text>`;
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e4dfd4" stroke="#796f58"/><rect x="${150 - (w * v.columnWidth) / v.length / 2}" y="${100 - (h * v.columnDepth) / v.width / 2}" width="${(w * v.columnWidth) / v.length}" height="${(h * v.columnDepth) / v.width}" fill="#8499aa"/><text x="150" y="215" text-anchor="middle">Contact INDETERMINATE · no pressure field</text>`;
}
export function concreteWorkspace({
  gateway,
  command,
  getContext,
  onDirty,
  onError,
  onRunning,
  showResults,
  download,
}) {
  let active,
    templates,
    generation = 0,
    face = "Top X",
    sourceMode = "synthetic";
  const runs = new Map();
  const draft = () =>
    getContext().project?.designPreviews?.find((d) => d.id === active);
  function scene() {
    const host = $("#design-preview-scene"),
      d = draft();
    host.hidden = $("#concrete-inspector").hidden || !d;
    if (!d) return;
    host.innerHTML = `<strong>${esc(names[d.kind])} · MOCK WORKFLOW</strong><span class="badge">${previewState(runs.get(active), getContext())}</span><svg viewBox="0 0 300 230" role="img" aria-label="${esc(names[d.kind])} illustrative geometry, not construction details">${illustration(d, face)}</svg><p>Illustration only · no verified reinforcement or code compliance</p>`;
  }
  function results(host) {
    const run = runs.get(active),
      state = previewState(run, getContext());
    host.innerHTML = run
      ? `<section data-testid="preview-result"><h3>${esc(names[run.kind])} · <span data-testid="preview-state">${state}</span></h3><p class="notice-small">MOCK WORKFLOW — no code-compliance claim. ${state === "STALE" ? "Recorded inputs or upstream result have changed." : ""}</p><p>Actions: ${run.sourceProvenance.mock ? "SYNTHETIC FIXTURE" : "Actual model analysis"} · Code profile: unavailable</p><table><thead><tr><th>Check</th><th>Status</th><th>Utilisation</th></tr></thead><tbody>${run.checks.map((c) => `<tr><td>${esc(c.name)}</td><td>UNSUPPORTED</td><td>—</td></tr>`).join("")}</tbody></table><p>${esc(run.checks[0].reason)}</p>${run.kind === "padFooting" ? `<p>Contact: INDETERMINATE. Soil bearing input: ${esc(run.soilProvenance.source)}; never computed by Workbench.</p><p>${esc(run.soilProvenance.reference)}</p>` : ""}${run.schedule.length ? `<h4>Illustrative bar preference · not a fabrication schedule</h4><pre>${esc(JSON.stringify(run.schedule, null, 2))}</pre><button id="preview-schedule">Download illustrative schedule CSV</button>` : ""}<button id="preview-record">Download preview record</button><details open><summary>Exact provenance and limitations</summary><pre>${esc(JSON.stringify(run, null, 2))}</pre></details></section>`
      : '<div class="empty-results"><strong>Concrete workflow · NOT CHECKED</strong><p>Create a draft in Concrete previews, choose its action source, then run the preview.</p></div>';
    if (run) {
      $("#preview-record").onclick = () =>
        download(
          `preview-${run.draftId}.json`,
          JSON.stringify({ ...run, currentState: state }, null, 2),
          "application/json",
        );
      if ($("#preview-schedule"))
        $("#preview-schedule").onclick = () =>
          download(
            "illustrative-schedule.csv",
            "previewRunId,currentState,mark,diameter_m,quantityPerFace,cutLength,source,status\n" +
              run.schedule
                .map((r) =>
                  [
                    run.previewRunId,
                    state,
                    r.mark,
                    r.diameter,
                    r.quantityPerFace,
                    "",
                    r.source,
                    r.status,
                  ].join(","),
                )
                .join("\n"),
            "text/csv",
          );
    }
    scene();
  }
  async function render() {
    const token = ++generation,
      host = $("#concrete-inspector");
    try {
      templates ||= (await gateway.send("designPreviewTemplates")).templates;
      if (token !== generation) return;
      const ctx = getContext(),
        ds = ctx.project?.designPreviews || [];
      if (!ds.some((d) => d.id === active)) active = ds[0]?.id;
      const d = draft(),
        t = templates.find((t) => t.kind === d?.kind);
      host.innerHTML = `<h3>Concrete workflow previews</h3><p class="notice-small">MOCK WORKFLOW · numerical design unavailable. Draft inputs do not change frame stiffness.</p><label>New draft<select id="preview-kind">${templates.map((t) => `<option value="${t.kind}">${t.name}</option>`).join("")}</select></label><button id="preview-create">Create draft</button>${d ? `<label>Active draft<select id="preview-active">${ds.map((d) => `<option value="${d.id}" ${d.id === active ? "selected" : ""}>${names[d.kind]} · ${d.id.slice(-6)}</option>`).join("")}</select></label><h4>${names[d.kind]} inputs</h4><p>Input provenance: ${esc(sourceName(d.inputSource))}</p><form id="preview-form">${t.fields.map((f) => `<label>${esc(f.label)} ${esc(f.unit)}<small>${esc(sourceName(d.inputSources?.[f.key] || d.inputSource))}</small><input name="${f.key}" id="preview-${f.key}" value="${d.inputs[f.key] * f.displayScale}" inputmode="decimal" required></label>`).join("")}${d.kind !== "slab" ? `<label>Model ${d.kind === "rcBeam" ? "member" : "support"}<select id="preview-target"><option value="">No model binding</option>${ctx.project[d.kind === "rcBeam" ? "members" : "supports"].map((e) => `<option value="${e.id}" ${d.targetId === e.id ? "selected" : ""}>${esc(e.id)}</option>`).join("")}</select></label>` : ""}${d.kind === "padFooting" ? `<label>Geotechnical input reference<textarea id="preview-soil" maxlength="512">${esc(d.soilReference)}</textarea></label><p>Bearing pressure is an external input. No soil capacity is computed.</p>` : ""}<button id="preview-save">Save draft inputs</button><button type="button" id="preview-cancel">Cancel edits</button></form><button id="preview-delete">Delete draft</button><label>Upstream actions<select id="preview-source"><option value="synthetic">Synthetic fixture · MOCK</option>${d.kind !== "slab" ? '<option value="model">Current model case / combination</option>' : ""}</select></label>${d.kind === "slab" ? `<label>Reinforcement view<select id="preview-face">${["Top X", "Top Y", "Bottom X", "Bottom Y"].map((f) => `<option ${f === face ? "selected" : ""}>${f}</option>`).join("")}</select></label><p>Raw Mx/My/Mxy fixture only; design transformation and mesh convergence unavailable.</p>` : ""}<button id="preview-run">Run workflow preview</button><p id="preview-readiness"></p>` : ""}<p id="preview-error" role="alert"></p>`;
      const fail = (e) => {
        $("#preview-error").textContent = e.message;
        onError(e.message);
      };
      $("#preview-create").onclick = async () => {
        try {
          const previous = new Set(ds.map((d) => d.id));
          await command("CreateDesignPreview", {
            kind: $("#preview-kind").value,
          });
          active = getContext().project.designPreviews.find(
            (d) => !previous.has(d.id),
          )?.id;
          sourceMode = "synthetic";
          await render();
        } catch (e) {
          fail(e);
        }
      };
      if (d) {
        $("#preview-active").onchange = () => {
          active = $("#preview-active").value;
          sourceMode = "synthetic";
          void render();
        };
        $("#preview-source").value =
          d.kind === "slab" ? "synthetic" : sourceMode;
        const readiness = () => {
          const c = getContext(),
            model = $("#preview-source").value === "model",
            ready =
              !model ||
              (d.targetId &&
                c.result?.modelHash === c.modelHash &&
                c.result?.analysisType !== "envelope" &&
                !c.failed);
          $("#preview-run").disabled = c.locked || c.dirty || !ready;
          $("#preview-readiness").textContent = ready
            ? "Workflow available · every design check remains UNSUPPORTED"
            : "Bind a target, save, then analyse a single current case/combination.";
        };
        $("#preview-source").onchange = () => {
          sourceMode = $("#preview-source").value;
          readiness();
        };
        $("#preview-form").oninput = () => {
          onDirty(true);
          $("#preview-active").disabled = true;
          $("#preview-create").disabled = true;
          $("#preview-delete").disabled = true;
          readiness();
          scene();
        };
        $("#preview-form").onsubmit = async (e) => {
          e.preventDefault();
          try {
            const inputs = Object.fromEntries(
              t.fields.map((f) => [
                f.key,
                fieldInput(
                  host.querySelector(`[name="${f.key}"]`).value,
                  f.unit,
                ),
              ]),
            );
            await command("SetDesignPreview", {
              id: d.id,
              inputs,
              targetId: $("#preview-target")?.value,
              soilReference: $("#preview-soil")?.value ?? d.soilReference,
            });
            onDirty(false);
            await render();
          } catch (e) {
            fail(e);
          }
        };
        $("#preview-cancel").onclick = () => {
          onDirty(false);
          void render();
        };
        $("#preview-delete").onclick = async () => {
          try {
            await command("DeleteDesignPreview", { id: d.id });
            await render();
          } catch (e) {
            fail(e);
          }
        };
        if ($("#preview-face"))
          $("#preview-face").onchange = () => {
            face = $("#preview-face").value;
            scene();
          };
        $("#preview-run").onclick = async () => {
          onRunning(true);
          try {
            const c = getContext(),
              run = await gateway.send("evaluateDesignPreview", {
                draftId: d.id,
                modelHash: c.modelHash,
                sourceMode: $("#preview-source").value,
                caseId: c.result?.caseId,
                resultId: c.result?.resultId,
              });
            runs.set(d.id, run);
            showResults();
          } catch (e) {
            fail(e);
          } finally {
            onRunning(false);
            await render();
          }
        };
        readiness();
      }
      if (getContext().locked)
        for (const e of host.querySelectorAll("input,select,button,textarea"))
          e.disabled = true;
      if (!getContext().dirty) onDirty(false);
      scene();
    } catch (e) {
      if (token === generation)
        host.innerHTML = `<p role="alert">${esc(e.message)}</p>`;
    }
  }
  return {
    render,
    results,
    select: (id) => {
      active = id;
      sourceMode = "synthetic";
    },
  };
}
