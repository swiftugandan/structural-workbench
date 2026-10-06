import { previewIdentity } from "./selection-context.js";
import {
  mechanicsRows,
  previewInspector,
  previewPane,
} from "./design-presentation.js";
/** Workflow illustrations only. Validation, units and action provenance belong to Rust. */
import { escape as esc } from "./reports/report.js";
import {
  addColumnRow,
  plateArgs,
  plateSection,
  platePane,
} from "./slab-plate.js";
import { columnPane, columnSketch } from "./rc-column.js";
import {
  bindConnectionInspector,
  connectionActions,
  connectionBill,
  connectionChecksPane,
  connectionDrawing,
  connectionInspector,
  connectionSketch,
  readConnection,
} from "./steel-connection.js";
import {
  compositeChecksPane,
  compositeDeflections,
  compositeInspector,
  compositeSection,
  compositeSketch,
  compositeStages,
  readComposite,
} from "./composite-beam.js";
const names = {
  rcBeam: "RC beam",
  rcColumn: "RC column",
  slab: "Slab",
  padFooting: "Pad footing",
  singlePlate: "Steel connection",
  compositeBeam: "Composite beam",
};
/** Steel families designed under the AISC profile. */
const steelKinds = ["singlePlate", "compositeBeam"];
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
/** The action source a draft opens with: slabs solve their own panel. */
const defaultSource = (d) =>
  d?.kind === "slab" ? "plate" : d?.targetId ? "model" : "synthetic";
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
function illustration(d, face) {
  const v = d.inputs;
  if (d.kind === "singlePlate") return connectionSketch(d);
  if (d.kind === "compositeBeam") return compositeSketch(d);
  if (d.kind === "rcColumn") return columnSketch(d);
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
    plateField = "mx",
    plateRecovery = "elementCentre",
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
    // A connection has no draft solid: the model context shows its beam.
    viewport.designPreview =
      !steelKinds.includes(d.kind) &&
      (focusObject || (["rcBeam", "rcColumn"].includes(d.kind) && d.targetId))
        ? { draft: d, mode: displayMode, face, context: !focusObject }
        : null;
    $("#design-geometry-labels").hidden = !viewport.designPreview;
    onSelection(d);
    const identity = previewIdentity(getContext().project, d);
    host.innerHTML = `<div class="design-scene-heading"><strong>${esc(identity.text)}</strong><span class="design-tag">${runs.get(active)?.codeProfile ? (steelKinds.includes(d.kind) ? "AISC 360-22 · DEMONSTRATION" : "EC2 UK · DEMONSTRATION") : "MOCK WORKFLOW"}</span><span class="status-text">${previewState(runs.get(active), getContext())}</span></div><div class="design-view-switch" role="group" aria-label="Design object display">${[
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
      )}<button id="preview-focus" aria-pressed="${focusObject}">${focusObject ? "Show model context" : "Focus design object"}</button></div><small>${d.kind === "slab" ? esc(face) + " · illustrative grid, not FE mesh" : d.kind === "padFooting" ? "Contact INDETERMINATE · no pressure field" : d.kind === "singlePlate" ? "Dimensioned elevation in the Drawing view" : d.kind === "compositeBeam" ? "Section and stage diagrams in the result views" : "Illustrative reinforcement · fit and anchorage unverified"}</small>`;
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
  /** Kind-specific panes, else the shared preview panes. */
  function paneHtml(run, state, d) {
    if (d.kind === "slab" && pane === "actions")
      if (run?.plateAnalysis?.status === "evaluated")
        return platePane(
          run,
          plateField,
          {
            loadCases: (getContext().project?.loadCases || []).map((c) => ({
              id: c.id,
              label: `${c.id} · ${c.name}`,
            })),
          },
          plateRecovery,
        );
    if (d.kind === "rcColumn" && pane === "mechanics") return columnPane(run);
    if (d.kind === "compositeBeam") {
      if (pane === "section")
        return `<h4>Composite section at the governing station</h4>${compositeSection(run?.codeProfilePreview)}`;
      if (pane === "actions")
        return `<h4>Stage moment diagrams</h4>${compositeStages(run?.codeProfilePreview)}`;
      if (pane === "checks") return compositeChecksPane(run);
      if (pane === "deflections") return compositeDeflections(run);
      if (pane === "schedule") return connectionBill(run);
    }
    if (d.kind === "singlePlate") {
      if (pane === "drawing")
        return `<h4>Connection elevation · dimensions from the run</h4>${connectionDrawing(run?.codeProfilePreview)}`;
      if (pane === "checks") return connectionChecksPane(run);
      if (pane === "schedule") return connectionBill(run);
      if (pane === "actions") return connectionActions(run);
    }
    return previewPane({
      run,
      state,
      d,
      pane,
      checkIndex,
      sketch: illustration(d, face),
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
    const panes =
      d.kind === "compositeBeam"
        ? [
            ["summary", "Design summary"],
            ["actions", "Stages"],
            ["checks", "AISC checks"],
            ["section", "Section"],
            ["deflections", "Deflections"],
            ["schedule", "Bill of materials"],
            ["details", "Calculation details"],
          ]
        : d.kind === "singlePlate"
          ? [
              ["summary", "Design summary"],
              ["actions", "End actions"],
              ["checks", "AISC checks"],
              ["drawing", "Drawing"],
              ["schedule", "Bill of materials"],
              ["details", "Calculation details"],
            ]
          : [
              ["summary", "Design summary"],
              [
                "actions",
                d.kind === "slab" ? "Plate actions" : "Design actions",
              ],
              ["details", "Calculation details"],
              ["reinforcement", "Reinforcement"],
              ...(d.kind === "rcBeam"
                ? [
                    ["mechanics", "Section mechanics"],
                    ["ec2", "EC2 checks"],
                  ]
                : []),
              ...(d.kind === "rcColumn"
                ? [
                    ["mechanics", "Section mechanics"],
                    ["ec2", "EC2 checks"],
                  ]
                : []),
              ["schedule", "Schedule"],
              ...(d.kind === "padFooting"
                ? [
                    ["soil", "Soil / contact"],
                    ["ec2", "EC2 checks"],
                  ]
                : []),
              ...(d.kind === "slab" ? [["ec2", "EC2 checks"]] : []),
            ];
    host.innerHTML = `<section data-testid="preview-result" class="design-result-workspace"><div class="design-result-tabs" role="group" aria-label="Concrete result views">${panes.map(([id, label]) => `<button data-preview-pane="${id}" aria-pressed="${pane === id}">${label}</button>`).join("")}<span class="spacer"></span>${run?.schedule.length ? '<button id="preview-schedule">Schedule CSV ↓</button>' : ""}${run ? '<button id="preview-record">Record ↓</button>' : ""}</div>${state === "STALE" ? '<p class="notice-small" data-testid="preview-stale">Stale results — these values belong to the previous draft inputs or model. Run the preview again.</p>' : ""}<div class="design-pane">${paneHtml(run, state, d)}</div></section>`;
    for (const b of host.querySelectorAll("[data-preview-pane]"))
      b.onclick = () => {
        pane = b.dataset.previewPane;
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
      if ($("#preview-schedule") && steelKinds.includes(d.kind))
        $("#preview-schedule").onclick = () =>
          download(
            `${d.kind === "compositeBeam" ? "composite" : "connection"}-bill-of-materials.csv`,
            "previewRunId,currentState,item,description,quantity,mass_kg\n" +
              run.schedule
                .map((r) =>
                  [
                    run.previewRunId,
                    state,
                    r.item,
                    `"${String(r.description).replaceAll('"', '""')}"`,
                    r.quantity,
                    r.massKg ?? "",
                  ].join(","),
                )
                .join("\n"),
            "text/csv",
          );
      else if ($("#preview-schedule"))
        $("#preview-schedule").onclick = () =>
          download(
            "indicative-schedule.csv",
            "previewRunId,currentState,mark,region,shape,diameter_m,quantity,cutLength_m,mass_kg,source,status\n" +
              run.schedule
                .map((r) =>
                  [
                    run.previewRunId,
                    state,
                    r.mark,
                    r.region,
                    `"${r.shape || ""}"`,
                    r.diameter,
                    r.quantity ?? "",
                    r.cutLength ?? "",
                    r.massKg ?? "",
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
        sourceMode = defaultSource(ds.find((d) => d.id === active));
      }
      if (!ds.some((d) => d.id === active)) active = undefined;
      const d = draft(),
        t = templates.find((t) => t.kind === d?.kind);
      if (!getContext().dirty)
        mechanicsLaw = d?.mechanics?.law || t?.mechanics?.defaultLaw;
      host.innerHTML =
        d?.kind === "singlePlate"
          ? connectionInspector({ d, templates, ds, active, ctx })
          : d?.kind === "compositeBeam"
            ? compositeInspector({ d, templates, ds, active, ctx })
            : previewInspector({
                mechanicsLaw,
                d,
                templates,
                ds,
                active,
                ctx,
                face,
                sketch: d ? illustration(d, face) : "",
                plateHtml: d ? plateSection(d, t) : "",
              });
      if (d?.kind === "singlePlate")
        bindConnectionInspector(host, ctx.project, d);
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
        $("#preview-source").value =
          d.kind === "slab" && sourceMode === "model" ? "plate" : sourceMode;
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
            : $("#preview-source").value === "plate"
              ? "Plate analysis available · code checks remain UNSUPPORTED"
              : d.kind === "compositeBeam"
                ? $("#preview-source").value === "model"
                  ? "AISC 360-22 Chapter I checks run on the stage cases (demonstration)"
                  : "Synthetic actions · composite checks need the model stage cases"
                : d.kind === "singlePlate"
                  ? $("#preview-source").value === "model"
                    ? "AISC 360-22 checks run on the beam's end actions (demonstration)"
                    : "Synthetic actions · connection checks need model actions"
                  : ["rcBeam", "rcColumn", "padFooting"].includes(d.kind)
                    ? $("#preview-source").value === "model"
                      ? "Workflow available · EC2 checks run on the model actions (demonstration)"
                      : "Synthetic actions · EC2 checks need model actions"
                    : "Workflow available · every design check remains UNSUPPORTED";
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
              soilReference: $("#preview-soil")?.value ?? d.soilReference,
              ...(d.kind === "rcBeam" && {
                tensionAnchorageConfirmed: $("#preview-anchorage").checked,
              }),
              ...($("#code-exposure") && { codeInputs: readCodeInputs() }),
              ...(d.kind === "singlePlate" && {
                connection: readConnection(host),
              }),
              ...(d.kind === "compositeBeam" && {
                composite: readComposite(host),
              }),
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
              await command("DeriveSlabColumns", {
                id: d.id,
                origin: ["x", "y", "z"].map((a) =>
                  Number($(`#slab-origin-${a}`).value),
                ),
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
    followSelection: (id) => {
      projectId = getContext().project?.id;
      active = getContext().project?.designPreviews?.find(
        (d) => d.targetId === id,
      )?.id;
      sourceMode = defaultSource(draft());
    },
  };
}
