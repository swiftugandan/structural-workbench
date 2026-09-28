import { previewIdentity } from "./selection-context.js";
import {
  mechanicsRows,
  previewInspector,
  previewPane,
} from "./design-presentation.js";
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
// An untouched input returns its stored SI value bit-exactly, so saving never
// perturbs values or provenance through display rounding.
function submittedValue(input, unit) {
  return input.value === input.defaultValue && input.dataset.si !== undefined
    ? Number(input.dataset.si)
    : fieldInput(input.value, unit);
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
    const row = (n, cy) =>
      Array.from(
        { length: n },
        (_, i) =>
          `<circle cx="${n === 1 ? x + w / 2 : x + 12 + ((w - 24) * i) / (n - 1)}" cy="${cy}" r="4" fill="#1167a2"/>`,
      ).join("");
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#dce6ef" stroke="#516b82"/><rect x="${x + 8}" y="${y + 8}" width="${w - 16}" height="${h - 16}" rx="6" fill="none" stroke="#62798a"/>${row(v.topBarCount, y + 14)}${row(v.bottomBarCount, y + h - 14)}<text x="150" y="218" text-anchor="middle">Bar preference illustration · fit unverified</text>`;
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
  function hide() {
    viewport.designPreview = null;
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
    viewport.designPreview =
      focusObject || (d.kind === "rcBeam" && d.targetId)
        ? { draft: d, mode: displayMode, face, context: !focusObject }
        : null;
    $("#design-geometry-labels").hidden = !viewport.designPreview;
    onSelection(d);
    const identity = previewIdentity(getContext().project, d);
    host.innerHTML = `<div class="design-scene-heading"><strong>${esc(identity.text)}</strong><span class="design-tag">MOCK WORKFLOW</span><span class="status-text">${previewState(runs.get(active), getContext())}</span></div><div class="design-view-switch" role="group" aria-label="Design object display">${[
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
      )}<button id="preview-focus" aria-pressed="${focusObject}">${focusObject ? "Show model context" : "Focus design object"}</button></div><small>${d.kind === "slab" ? esc(face) + " · illustrative grid, not FE mesh" : d.kind === "padFooting" ? "Contact INDETERMINATE · no pressure field" : "Illustrative reinforcement · fit and anchorage unverified"}</small>`;
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
  function results(host) {
    const run = runs.get(active),
      state = previewState(run, getContext());
    const d = draft();
    if (!d) {
      host.innerHTML =
        '<div class="empty-results"><strong>No concrete design object selected</strong><p>Create or select a draft in the Selection Inspector.</p></div>';
      return;
    }
    const panes = [
      ["summary", "Design summary"],
      ["actions", d.kind === "slab" ? "Plate actions" : "Design actions"],
      ["details", "Calculation details"],
      ["reinforcement", "Reinforcement"],
      ...(d.kind === "rcBeam"
        ? [
            ["mechanics", "Section mechanics"],
            ["ec2", "EC2 checks · disabled"],
          ]
        : []),
      ["schedule", "Schedule"],
      ...(d.kind === "padFooting" ? [["soil", "Soil / contact"]] : []),
    ];
    host.innerHTML = `<section data-testid="preview-result" class="design-result-workspace"><div class="design-result-tabs" role="group" aria-label="Concrete result views">${panes.map(([id, label]) => `<button data-preview-pane="${id}" aria-pressed="${pane === id}">${label}</button>`).join("")}<span class="spacer"></span>${run?.schedule.length ? '<button id="preview-schedule">Schedule CSV ↓</button>' : ""}${run ? '<button id="preview-record">Record ↓</button>' : ""}</div><div class="design-pane">${previewPane({ run, state, d, pane, checkIndex, sketch: illustration(d, face) })}</div></section>`;
    for (const b of host.querySelectorAll("[data-preview-pane]"))
      b.onclick = () => {
        pane = b.dataset.previewPane;
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
            "illustrative-schedule.csv",
            "previewRunId,currentState,mark,region,diameter_m,quantity,cutLength,source,status\n" +
              run.schedule
                .map((r) =>
                  [
                    run.previewRunId,
                    state,
                    r.mark,
                    r.region,
                    r.diameter,
                    r.quantity,
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
      if (projectId !== ctx.project?.id) {
        projectId = ctx.project?.id;
        active = ds.find((d) => d.targetId === ctx.selected)?.id || ds[0]?.id;
        sourceMode = ds.find((d) => d.id === active)?.targetId
          ? "model"
          : "synthetic";
      }
      if (!ds.some((d) => d.id === active)) active = undefined;
      const d = draft(),
        t = templates.find((t) => t.kind === d?.kind);
      if (!getContext().dirty)
        mechanicsLaw = d?.mechanics?.law || t?.mechanics?.defaultLaw;
      host.innerHTML = previewInspector({
        mechanicsLaw,
        d,
        templates,
        ds,
        active,
        ctx,
        face,
        sketch: d ? illustration(d, face) : "",
      });
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
      if ($("#preview-active"))
        $("#preview-active").onchange = () => {
          active = $("#preview-active").value;
          pane = "summary";
          sourceMode = draft()?.targetId ? "model" : "synthetic";
          void render().then(showResults);
        };
      if (d) {
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
                submittedValue(host.querySelector(`[name="${f.key}"]`), f.unit),
              ]),
            );
            await command("SetDesignPreview", {
              id: d.id,
              inputs,
              targetId: $("#preview-target")?.value,
              soilReference: $("#preview-soil")?.value ?? d.soilReference,
              ...(d.kind === "rcBeam" && {
                tensionAnchorageConfirmed: $("#preview-anchorage").checked,
              }),
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
            pane = "summary";
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
    hide,
    results,
    /** Recorded preview runs, one per draft; callers filter by model/result. */
    records: () => [...runs.values()],
    select: (id) => {
      projectId = getContext().project?.id;
      active = id;
      pane = "summary";
      sourceMode = draft()?.targetId ? "model" : "synthetic";
    },
    followSelection: (id) => {
      projectId = getContext().project?.id;
      active = getContext().project?.designPreviews?.find(
        (d) => d.targetId === id,
      )?.id;
      sourceMode = draft()?.targetId ? "model" : "synthetic";
    },
  };
}
