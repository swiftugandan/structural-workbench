import { previewIdentity } from "./selection-context.js";
import { mechanicsRows } from "./design-presentation.js";
/** Workflow orchestration only. Validation, units and action provenance belong to Rust. */
import { escape as esc } from "./reports/report.js";
import { addColumnRow, plateArgs } from "./slab-plate.js";
import { render as place } from "./core/html.js";
import { designKind } from "./design/registry.js";
import { designInspector } from "./design/inspector.js";
import { designPane } from "./design/panes.js";
import { scheduleCsv } from "./design/kinds/shared.js";
import { enhanceTabStrip } from "./ui/tab-strip.js";
const $ = (s) => document.querySelector(s);
// Attach the displayed unit only to bare numbers; Rust parses all quantities.
function fieldInput(value, unit) {
  const text = value.trim();
  return !["N/m³", "kg/m³"].includes(unit) &&
    /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)
    ? text + unit
    : text;
}
// An untouched input returns its stored SI value bit-exactly, so saving never
// perturbs values or provenance through display rounding.
function submittedValue(input, unit) {
  return input.value === input.defaultValue && input.dataset.si !== undefined
    ? Number(input.dataset.si)
    : fieldInput(input.value, unit);
}
/** The action source a draft opens with, from its kind (slabs: own panel). */
const defaultSource = (d) =>
  d ? designKind(d.kind).defaultSource(d) : "synthetic";
/** The code-input fields present for the draft kind; blanks are null. */
function readCodeInputs() {
  const value = (id) => document.getElementById(id)?.value.trim() || null;
  const yesNo = (id) => {
    const v = value(id);
    return v == null ? null : v === "yes";
  };
  // Two-value inputs: both or neither. Restraints are numbers; lengths keep
  // their units for Rust to parse.
  const pair = (id, label = "k1 and k2", numeric = true) => {
    const a = value(`${id}-1`),
      b = value(`${id}-2`);
    if (a == null && b == null) return null;
    if (a == null || b == null)
      throw new Error(`Enter both ${label}, or leave both blank`);
    return numeric ? [Number(a), Number(b)] : [a, b];
  };
  const out = {
    exposureClass: value("code-exposure"),
    minimumCoverDurability: value("code-cover"),
    aggregateSize: value("code-aggregate"),
  };
  if (document.getElementById("code-system")) {
    out.structuralSystem = value("code-system");
    out.partitionsSensitive = yesNo("code-partitions");
  }
  if (document.getElementById("code-qp"))
    out.quasiPermanentCombinationId = value("code-qp");
  if (document.getElementById("code-colsize-1"))
    out.columnSize = pair("code-colsize", "column dimensions", false);
  if (document.getElementById("code-blinding")) {
    out.castOnBlinding = yesNo("code-blinding");
    out.bearingCombinationId = value("code-bearing");
  }
  if (document.getElementById("code-braced")) {
    out.braced = yesNo("code-braced");
    out.restraintY = pair("code-ky");
    out.restraintZ = pair("code-kz");
    out.effectiveCreepRatio = value("code-creep");
  }
  return out;
}
export function previewState(run, ctx) {
  if (!run) return "NOT CHECKED";
  return ctx.dirty ||
    run.modelHash !== ctx.modelHash ||
    (run.sourceProvenance.kind === "modelAnalysis" &&
      (ctx.failed || run.sourceProvenance.resultId !== ctx.result?.resultId))
    ? "STALE"
    : String(run.overall || "unsupported").toUpperCase();
}
export function concreteWorkspace({
  gateway,
  viewport,
  command,
  getContext,
  onDirty,
  onError,
  onRunning,
  showResults,
  download,
  onSelection,
}) {
  let active,
    templates,
    generation = 0,
    face = "Top X",
    plateField = "mx",
    plateRecovery = "elementCentre",
    // Data a pane loaded on activation (the joint report), keyed by pane.
    paneData = new Map(),
    // A refused run's reason, kept across the re-render that follows it.
    runError = null,
    sourceMode = "synthetic",
    mechanicsLaw;
  let projectId;
  let pane = "summary",
    checkIndex = 0,
    displayMode = "both",
    focusObject = true,
    savedCamera = null;
  viewport.onDesignNotice = onError;
  const runs = new Map();
  const draft = () =>
    getContext().project?.designPreviews?.find((d) => d.id === active);
  // The Rust outline of a slab draft (ADR 0035), once this revision's
  // geometry query has answered.
  const panelOf = (d) => viewport.slabPanels().find((s) => s.id === d?.id);
  function hide() {
    viewport.designPreview = null;
    viewport.activeDesignObjectId = null;
    document.body.classList.remove("design-object-open");
    document.querySelector("#design-geometry-labels").hidden = true;
    document.body.classList.remove("concrete-focus");
    if (savedCamera) {
      document.querySelector(`#view-${savedCamera.mode}`)?.click();
      Object.assign(viewport, savedCamera);
      savedCamera = null;
      viewport.draw();
    }
  }
  function scene() {
    const host = $("#design-preview-scene"),
      d = draft();
    host.hidden = $("#concrete-inspector").hidden || !d;
    for (const b of document.querySelectorAll("#model-nav [data-preview]")) {
      const current = !host.hidden && b.dataset.preview === d?.id;
      b.classList.toggle("active", current);
      if (current) b.setAttribute("aria-current", "true");
      else b.removeAttribute("aria-current");
    }
    if (host.hidden) {
      hide();
      return;
    }
    if (!savedCamera) {
      savedCamera = {
        mode: viewport.mode,
        zoom: viewport.zoom,
        pan: [...viewport.pan],
        yaw: viewport.yaw,
        pitch: viewport.pitch,
      };
      document.querySelector("#view-3d").click();
      viewport.zoom = 1.1;
      viewport.pan = [0, 0];
    }
    document.body.classList.toggle("concrete-focus", focusObject);
    document.body.classList.add("design-object-open");
    viewport.activeDesignObjectId = d.id;
    const kind = designKind(d.kind),
      run = runs.get(active);
    viewport.designPreview = kind.solid(d, focusObject)
      ? { draft: d, mode: displayMode, face, context: !focusObject }
      : null;
    $("#design-geometry-labels").hidden = !viewport.designPreview;
    onSelection(d);
    const identity = previewIdentity(getContext().project, d);
    // The profile the draft runs under; a synthetic run applies none.
    const tag =
      run && !run.codeProfile
        ? "SYNTHETIC ACTIONS · NO CODE CHECK"
        : kind.profile.tag;
    host.innerHTML = `<div class="design-scene-heading"><strong>${esc(identity.text)}</strong><span class="design-tag">${tag}</span><span class="status-text">${previewState(run, getContext())}</span></div><div class="design-view-switch" role="group" aria-label="Design object display">${[
      ["concrete", "Concrete"],
      ["reinforcement", "Reinforcement"],
      ["both", "Both"],
    ]
      .map(
        ([id, label]) =>
          `<button data-object-display="${id}" aria-pressed="${displayMode === id}">${label}</button>`,
      )
      .join(
        "",
      )}<button id="preview-focus" aria-pressed="${focusObject}">${focusObject ? "Show model context" : "Focus design object"}</button></div><small id="design-scene-caption">${esc(kind.caption(d, { face, panel: panelOf(d), context: !focusObject }))}</small>`;
    for (const b of host.querySelectorAll("[data-object-display]"))
      b.onclick = () => {
        displayMode = b.dataset.objectDisplay;
        scene();
      };
    $("#preview-focus").onclick = () => {
      focusObject = !focusObject;
      scene();
    };
    viewport.draw();
  }
  /** The active pane: the kind's own, else the shared one (ADR 0033). */
  function paneHtml(run, state, d) {
    const kind = designKind(d.kind),
      project = getContext().project;
    return designPane(pane, {
      run,
      state,
      d,
      kind,
      project,
      checkIndex,
      plateField,
      plateRecovery,
      data: paneData.get(pane),
      sketch: kind.sketch(d, { face, panel: panelOf(d) }),
    });
  }
  function results(host) {
    const run = runs.get(active),
      state = previewState(run, getContext());
    const d = draft();
    if (!d) {
      host.innerHTML =
        '<div class="empty-results"><strong>No concrete design object selected</strong><p>Create or select a draft in the Selection Inspector.</p></div>';
      return;
    }
    const kind = designKind(d.kind);
    if (!kind.panes.some((p) => p.id === pane)) pane = "summary";
    host.innerHTML = `<section data-testid="preview-result" class="design-result-workspace"><div class="design-result-tabs"><div class="tab-scroll" role="group" aria-label="Design result views">${kind.panes.map(({ id, label }) => `<button data-preview-pane="${id}" aria-pressed="${pane === id}">${label}</button>`).join("")}</div><div class="design-result-trailing">${run?.schedule.length ? '<button id="preview-schedule">Schedule CSV ↓</button>' : ""}${run ? '<button id="preview-record">Record ↓</button>' : ""}</div></div>${state === "STALE" ? '<p class="notice-small" data-testid="preview-stale">Stale results — these values belong to the previous draft inputs or model. Run the preview again.</p>' : ""}<div class="design-pane">${paneHtml(run, state, d)}</div></section>`;
    enhanceTabStrip(
      host.querySelector(".design-result-tabs .tab-scroll"),
      "design result views",
    );
    for (const b of host.querySelectorAll("[data-preview-pane]"))
      b.onclick = async () => {
        pane = b.dataset.previewPane;
        const load = kind.panes.find((p) => p.id === pane)?.load;
        if (load) {
          // Loaded data belongs to the current model: fetch it afresh.
          paneData.delete(pane);
          results(host);
          try {
            paneData.set(pane, await load(gateway));
          } catch (e) {
            onError(e.message);
          }
        }
        results(host);
      };
    const apply = host.querySelector("#slab-apply-loads");
    if (apply)
      apply.onclick = async () => {
        onRunning(true);
        try {
          await command("ApplySlabColumnLoads", {
            id: d.id,
            caseId: host.querySelector("#slab-apply-case").value,
          });
          onError(
            "Column loads applied to the frame. Analyse the case to see their effect.",
          );
        } catch (e) {
          onError(e.message);
        } finally {
          onRunning(false);
        }
      };
    const adopt = host.querySelector("#preview-apply-proposal");
    if (adopt)
      adopt.onclick = async () => {
        // One undoable command: the draft's inputs with the proposed bars and
        // links; code inputs, anchorage and binding are kept as drafted.
        try {
          await command("SetDesignPreview", {
            id: d.id,
            inputs: { ...d.inputs, ...run.reinforcementProposal.inputs },
            targetId: d.targetId,
            soilReference: d.soilReference,
            tensionAnchorageConfirmed: d.tensionAnchorageConfirmed,
          });
          await render();
        } catch (e) {
          onError(e.message);
        }
      };
    for (const b of host.querySelectorAll("[data-plate-field]"))
      b.onclick = () => {
        plateField = b.dataset.plateField;
        results(host);
      };
    for (const b of host.querySelectorAll("[data-plate-recovery]"))
      b.onclick = () => {
        plateRecovery = b.dataset.plateRecovery;
        results(host);
      };
    for (const b of host.querySelectorAll("[data-preview-check]"))
      b.onclick = () => {
        pane = "details";
        checkIndex = Number(b.dataset.previewCheck);
        results(host);
      };
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
            kind.schedule.file(),
            scheduleCsv(kind.schedule, run, state),
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
      if (projectId !== ctx.project?.id) {
        projectId = ctx.project?.id;
        active = ds.find((d) => d.targetId === ctx.selected)?.id || ds[0]?.id;
        sourceMode = defaultSource(ds.find((d) => d.id === active));
      }
      if (!ds.some((d) => d.id === active)) active = undefined;
      const d = draft(),
        t = templates.find((t) => t.kind === d?.kind);
      if (!getContext().dirty)
        mechanicsLaw = d?.mechanics?.law || t?.mechanics?.defaultLaw;
      const kind = d && designKind(d.kind);
      place(
        host,
        designInspector({
          d,
          templates,
          ds,
          active,
          ctx,
          view: { face, panel: panelOf(d) },
          mechanicsLaw,
        }),
      );
      kind?.inspector.bind?.(host, ctx.project, d);
      if (runError && runError.draft === active)
        $("#preview-error").textContent = runError.message;
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
          sourceMode = defaultSource(draft());
          await render();
        } catch (e) {
          fail(e);
        }
      };
      if ($("#preview-active"))
        $("#preview-active").onchange = () => {
          active = $("#preview-active").value;
          pane = "summary";
          sourceMode = defaultSource(draft());
          void render().then(showResults);
        };
      if (d) {
        // A mode the kind does not offer falls back to its default.
        const offered = [...$("#preview-source").options].map((o) => o.value);
        $("#preview-source").value = offered.includes(sourceMode)
          ? sourceMode
          : defaultSource(d);
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
          if ($("#preview-propose"))
            $("#preview-propose").disabled =
              $("#preview-run").disabled ||
              $("#preview-source").value !== "model";
          $("#preview-readiness").textContent = !ready
            ? "Bind a target, save, then analyse a single current case/combination."
            : kind.readiness($("#preview-source").value);
        };
        $("#preview-source").onchange = () => {
          sourceMode = $("#preview-source").value;
          readiness();
        };
        $("#preview-form").oninput = (e) => {
          // Command parameters (the slab's model origin) are not draft inputs.
          if (e?.target?.closest?.(".slab-derive")) return;
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
            const plate = plateArgs(host, d, t, submittedValue);
            const inputs = Object.fromEntries(
              t.fields.map((f) => [
                f.key,
                submittedValue(host.querySelector(`[name="${f.key}"]`), f.unit),
              ]),
            );
            await command("SetDesignPreview", {
              id: d.id,
              inputs,
              targetId: $("#preview-target")?.value,
              soilReference: d.soilReference,
              ...($("#code-exposure") && { codeInputs: readCodeInputs() }),
              ...kind.read?.(host, d),
              ...(plate && { plate }),
              ...(t.mechanics && {
                mechanics: {
                  law: mechanicsLaw,
                  inputs: Object.fromEntries(
                    t.mechanics.fields
                      .filter((f) => f.law === "all" || f.law === mechanicsLaw)
                      .map((f) => [
                        f.key,
                        submittedValue(
                          host.querySelector(`[name="mech-${f.key}"]`),
                          f.unit,
                        ),
                      ]),
                  ),
                },
              }),
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
        if ($("#preview-mech-law"))
          $("#preview-mech-law").onchange = () => {
            mechanicsLaw = $("#preview-mech-law").value;
            $("#preview-mech-fields").innerHTML = mechanicsRows(
              d,
              t,
              mechanicsLaw,
            );
          };
        if ($("#slab-add-column"))
          $("#slab-add-column").onclick = () => {
            addColumnRow(host);
            $("#preview-form").oninput();
          };
        for (const b of host.querySelectorAll("[data-remove-column]"))
          b.onclick = () => {
            b.closest("[data-column-row]").remove();
            $("#preview-form").oninput();
          };
        if ($("#slab-derive-columns"))
          $("#slab-derive-columns").onclick = async () => {
            if (getContext().dirty)
              return fail(
                new Error(
                  "Save or cancel the draft inputs before taking columns from the model.",
                ),
              );
            try {
              // Columns meet the slab at its saved placement (ADR 0035).
              await command("DeriveSlabColumns", {
                id: d.id,
                origin: d.plate.placement,
              });
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
        const evaluate = async (propose) => {
          onRunning(true);
          runError = null;
          try {
            const c = getContext(),
              run = await gateway.send("evaluateDesignPreview", {
                draftId: d.id,
                modelHash: c.modelHash,
                sourceMode: $("#preview-source").value,
                caseId: c.result?.caseId,
                resultId: c.result?.resultId,
                propose,
              });
            runs.set(d.id, run);
            pane = "summary";
            showResults();
          } catch (e) {
            runError = { draft: d.id, message: e.message };
            fail(e);
          } finally {
            onRunning(false);
            await render();
          }
        };
        $("#preview-run").onclick = () => evaluate(false);
        if ($("#preview-propose"))
          $("#preview-propose").onclick = () => evaluate(true);
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
    hide,
    results,
    /** Recorded preview runs, one per draft; callers filter by model/result. */
    records: () => [...runs.values()],
    select: (id) => {
      projectId = getContext().project?.id;
      active = id;
      pane = "summary";
      sourceMode = defaultSource(draft());
    },
    /** Rust geometry for the current revision arrived: redraw what shows
     * the slab outline (the sketch and the scene caption). */
    geometryChanged: () => {
      const d = draft(),
        host = $("#design-preview-scene");
      if (!d || host.hidden) return;
      const kind = designKind(d.kind),
        panel = panelOf(d),
        sketch = document.querySelector(
          "#concrete-inspector .design-section-sketch svg",
        );
      if (sketch) sketch.innerHTML = String(kind.sketch(d, { face, panel }));
      const caption = $("#design-scene-caption");
      if (caption)
        caption.textContent = kind.caption(d, {
          face,
          panel,
          context: !focusObject,
        });
    },
    followSelection: (id) => {
      projectId = getContext().project?.id;
      active = getContext().project?.designPreviews?.find(
        (d) => d.targetId === id,
      )?.id;
      sourceMode = defaultSource(draft());
    },
  };
}
