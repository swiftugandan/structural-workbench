import { designStatusPalette } from "./design-status.js";
import { steelOverview } from "./steel-overview.js";
import { modelVisibility } from "./model-visibility.js";
import { previewIdentity, structureSelectionIds } from "./selection-context.js";
import { renderStructureEditor } from "./structure-workspace.js";
import { renderForceInspector } from "./force-inspector.js";
import { bindResultPicker } from "./result-picker.js";
import { actionComponents } from "./render/action-diagrams.js";
import { heatComponent } from "./render/heatmap.js";
import { bindTemplates } from "./model-templates.js";
import { structuralIcon } from "./structural-icons.js";
import {
  entityGuides,
  entityFields,
  readEntityFields,
  bindEntityFields,
  bindSectionCalculator,
  guideDiagram,
} from "./entity-forms.js";
import { entityLabel } from "./entity-labels.js";
import { canvasTools } from "./canvas-tools.js";
import { workspaceUI } from "./workspace-ui.js";
import { cad } from "./cad.js";
import { topology } from "./topology.js";
import { modeling } from "./modeling.js";
import { lineageSummary } from "./hierarchy.js";
import { renderExplorer, filterExplorer } from "./model-explorer.js";
import { Gateway } from "./state/transport.js";
import { duplicateAsVariant, buildComparison } from "./variants.js";
import {
  save,
  recent,
  listRevisions,
  loadRevision,
  retainOriginal,
  isVerifiedSnapshot,
  resolveRecoverableProject,
} from "./state/storage.js";
import { Viewport } from "./render/viewport.js";
import { download, report, csv, escape as esc } from "./reports/report.js";
import { reportSections } from "./design/registry.js";
import { createAppState, locked } from "./app/state.js";
import { statusBar } from "./app/status-bar.js";
import { initOffline, afterSaved } from "./offline.js";
import {
  loadCapabilitiesLedger,
  renderCapabilitiesModalHtml,
} from "./capabilities-ledger.js";
import { openSteelCheckDialog } from "./steel-check.js";
import {
  steelDesignWorkspace,
  designResultsHtml,
  designState,
  bindSteelResultViews,
} from "./steel-design.js";
import { concreteWorkspace } from "./design-previews.js";
import { stabilityWorkspace } from "./stability.js";
import { modalWorkspace, describeSource } from "./modal.js";
import { responseWorkspace } from "./response.js";
import { studyWorkspace } from "./study.js";
import { exchangeWorkspace } from "./exchange.js";
import { resultsDock } from "./app/results-dock.js";
import { inspectorPanel } from "./app/inspector-panel.js";
import { entityEditor } from "./app/entity-editor.js";
import { explorerPanel } from "./app/explorer-panel.js";
import { projectSession } from "./app/project-session.js";
const label = (id) => entityLabel(state.project, id);
const $ = (s) => document.querySelector(s),
  gateway = new Gateway();
/** Session state (ADR 0033): one observable store; see app/state.js. */
const { store, state } = createAppState();
const { entityList, editEntity } = entityEditor({
  $,
  bindEntityFields,
  bindSectionCalculator,
  bindTemplates,
  command,
  describeSource,
  entityFields,
  entityGuides,
  esc,
  gateway,
  guideDiagram,
  label,
  lineageSummary,
  message,
  modal,
  readEntityFields,
  setModalContent,
  state,
});

/** Linear-static result for diagrams; envelopes never enter the force pipeline. */
const diagramResult = () =>
  state.result && state.result.analysisType !== "envelope"
    ? state.result
    : null;
// Module-private bookkeeping, not session state.
let viewControls;

const viewport = new Viewport($("#viewport"), async (query) => {
  try {
    const cameraKey = JSON.stringify(query.camera),
      revision = state.project.revision,
      visibilityRevision = viewport.visibilityRevision;
    const v = await gateway.send("queryGeometry", {
      kind: "screenPick",
      query: {
        camera: query.camera,
        point: query.point,
        excludedIds: viewport.excludedIds(),
        // Canvas selection alone picks slab surfaces, as drawn (ADR 0035).
        surfaces:
          viewport.modelSolids || viewport.solidDesign
            ? "physical"
            : "analytical",
      },
      viewRevision: query.viewRevision,
    });
    $("#viewport").dataset.lastCpuPick = v.entityId || "";
    if (
      state.project.revision !== revision ||
      visibilityRevision !== viewport.visibilityRevision ||
      JSON.stringify(viewport.camera()) !== cameraKey
    )
      return;
    if (v.kind === "designObject") openDesignObject(v.entityId);
    else selectEntities(v.entityId ? [v.entityId] : [], query.toggle);
  } catch (e) {
    message(e.message);
  }
});
const memberDesignRuns = new Map();
const overview = steelOverview({
  gateway,
  command,
  download,
  context: () => ({
    project: state.project,
    modelHash: state.modelHash,
    result: state.result,
    dirty: state.formDirty,
    failed: state.failed,
    memberId: state.selected,
    active: state.tab === "steel-overview",
    locked: locked(state),
  }),
  onOverlay: (data) => {
    viewport.designStatuses = data?.states || null;
    const legend = $("#steel-review-legend");
    legend.hidden = !data;
    legend.replaceChildren();
    if (data) {
      legend.append(`Design · ${data.caseId} · `);
      for (const [status, palette] of Object.entries(designStatusPalette)) {
        const count = Object.values(data.states).filter(
          (x) => x === status,
        ).length;
        if (!count) continue;
        const span = document.createElement("span");
        span.textContent = `${palette.label} ${count}`;
        span.style.borderColor = palette.css;
        legend.append(span);
      }
    }
    viewport.draw();
  },
  onRuns: (runs) => {
    for (const run of runs) memberDesignRuns.set(run.memberId, run);
  },
  onRunning: (value) => {
    setAnalysing(value);
    setBusy(value);
    if (!value && !$("#steel-design-inspector").hidden)
      void nativeSteel.render();
  },
  onError: message,
  onSelect: (id) => {
    if (state.formDirty) return message("Apply or cancel changes first.");
    selectEntities([id]);
    $("[data-inspector-tab=steel]").click();
    $("[data-tab=steel-design]").click();
  },
});
const nativeSteel = steelDesignWorkspace({
  onCatalogue: (cat) => {
    viewport.designCatalogue = cat;
    viewport.draw();
  },
  gateway,
  command,
  getContext: () => ({
    project: state.project,
    modelHash: state.modelHash,
    result: state.result,
    memberId: viewport.selection.size === 1 ? state.selected : null,
    run: memberDesignRuns.get(state.selected) || null,
    dirty: state.formDirty,
    failed: state.failed,
    locked: locked(state),
  }),
  onDirty: (dirty = true) => {
    state.formDirty = dirty;
    viewport.designMarker = null;
    viewport.draw();
    setBusy(state.busy);
    renderResults();
  },
  onRunning: (value) => {
    setAnalysing(value);
    setBusy(value);
  },
  onError: message,
  onRun: (run) => {
    state.lastDesignRun = run;
    memberDesignRuns.set(run.memberId, run);
    renderResults();
  },
  showResults: () => {
    $("[data-tab='steel-design']").click();
    $("#show-results").click();
  },
});
const concrete = concreteWorkspace({
  // Idempotent: the scene re-asserts its draft on every render, but only a
  // change of draft or target touches the explorer. The caller draws.
  onSelection: (draft) => {
    const target = draft.targetId || null;
    if (
      state.selectionContext?.kind === "preview" &&
      state.selectionContext.id === draft.id &&
      state.selected === target &&
      viewport.selection.size === (target ? 1 : 0) &&
      (!target || viewport.selection.has(target))
    )
      return;
    state.selectionContext = { kind: "preview", id: draft.id };
    viewport.selection = new Set(target ? [target] : []);
    state.selected = target;
    viewport.selected = target;
    renderNav();
    renderSelectionStatus();
  },
  viewport,
  gateway,
  command,
  getContext: () => ({
    project: state.project,
    selected: state.selected,
    modelHash: state.modelHash,
    result: state.result,
    dirty: state.formDirty,
    locked: locked(state),
    failed: state.failed,
  }),
  onDirty: (v) => {
    state.formDirty = v;
    setBusy(state.busy);
    renderResults();
  },
  onError: message,
  onRunning: (v) => {
    setAnalysing(v);
    setBusy(v);
  },
  showResults: () => {
    $("[data-tab=design-preview]").click();
    $("#show-results").click();
  },
  download,
});
const stability = stabilityWorkspace({
  gateway,
  viewport,
  download,
  onError: message,
  onRunning: (v) => {
    setAnalysing(v);
    setBusy(v);
  },
  getContext: () => {
    const eng = state.project?.displayUnits === "engineeringMetric";
    return {
      modelHash: state.modelHash,
      caseId: $("#result-case").value,
      casePayload: analysisPayload(),
      dirty: state.formDirty,
      locked: locked(state) || !state.project,
      label: (id) => label(id),
      length: (v) => `${format(eng ? v * 1000 : v)} ${eng ? "mm" : "m"}`,
      moment: (v) => `${format(eng ? v / 1000 : v)} ${eng ? "kN·m" : "N·m"}`,
    };
  },
});
const modalView = modalWorkspace({
  gateway,
  viewport,
  download,
  onError: message,
  onRunning: (v) => {
    setAnalysing(v);
    setBusy(v);
  },
  onEditSources: () => {
    if (state.formDirty)
      return message(
        "Apply or cancel property changes before editing mass sources.",
      );
    entityList("massSources");
  },
  getContext: () => ({
    project: state.project,
    modelHash: state.modelHash,
    dirty: state.formDirty,
    locked: locked(state) || !state.project,
    label: (id) => label(id),
  }),
});
const responseView = responseWorkspace({
  gateway,
  command,
  download,
  onError: message,
  onRunning: (v) => {
    setAnalysing(v);
    setBusy(v);
  },
  getContext: () => ({
    project: state.project,
    modelHash: state.modelHash,
    dirty: state.formDirty,
    locked: locked(state) || !state.project,
    label: (id) => label(id),
  }),
});
const studies = studyWorkspace({
  gateway,
  download,
  message,
  onRunning: (v) => {
    setAnalysing(v);
    setBusy(v);
  },
  show: () => $("[data-tab=study]").click(),
  getContext: () => ({
    project: state.project,
    modelHash: state.modelHash,
    label: (id) => label(id),
  }),
});
const { renderResults, format } = resultsDock({
  $,
  bindSteelResultViews,
  concrete,
  designResultsHtml,
  designState,
  download,
  esc,
  label,
  memberDesignRuns,
  modalView,
  overview,
  responseView,
  selectEntities,
  stability,
  state,
  studies,
  viewport,
});

const modelTools = modeling({
  getProject: () => state.project,
  open: (...args) => open(...args),
  command,
  gateway,
  viewport,
  modal,
  message,
  canEdit: () =>
    !!state.project && !state.busy && !state.readOnly && !state.formDirty,
});
const { showRecent, claimLease, persist, recoverRevision, open, example } =
  projectSession({
    $,
    afterSaved,
    download,
    esc,
    gateway,
    listRevisions,
    loadRevision,
    memberDesignRuns,
    message,
    modal,
    modelTools,
    overview,
    portable,
    recent,
    refresh,
    resolveRecoverableProject,
    retainOriginal,
    save,
    setBusy,
    state,
    viewport,
  });

function message(text) {
  $("#message-text").textContent = text;
  $("#message").hidden = !text;
}
$("#dismiss-message").onclick = () => message("");
statusBar({ store, exportProject: () => $("#export-project").click() });
const topologyTools = topology({
  getProject: () => state.project,
  command,
  gateway,
  viewport,
  modal,
  message,
  canEdit: () =>
    !!state.project && !state.busy && !state.readOnly && !state.formDirty,
  // Rust display geometry of this revision arrived (slab outlines, ADR 0035).
  onGeometry: () => concrete.geometryChanged(),
});
/** Opens a design object in the Design objects tab: the explorer entry and a
 * click on its surface in the canvas (ADR 0035). */
function openDesignObject(id) {
  if (state.formDirty) return message("Apply or cancel changes first.");
  concrete.select(id);
  $("[data-inspector-tab=concrete]").click();
}
function selectEntities(ids, toggle = false) {
  if (state.formDirty) {
    message("Apply or cancel property changes before changing selection.");
    return;
  }
  const available = new Set(
    [
      ...state.project.nodes,
      ...state.project.members,
      ...state.project.supports,
      ...state.project.loads,
    ].map((x) => x.id),
  );
  state.selectionContext = null;
  if (!toggle) viewport.selection.clear();
  for (const id of ids)
    if (available.has(id)) {
      if (toggle && viewport.selection.has(id)) viewport.selection.delete(id);
      else viewport.selection.add(id);
    }
  state.selected = [...viewport.selection].at(-1) || null;
  if (!$("#concrete-inspector").hidden)
    concrete.followSelection(state.selected);
  renderInspector();
  renderNav();
  viewport.update(state.project, diagramResult(), state.selected);
  renderSelectionStatus();
  renderResults();
}
function renderSelectionStatus() {
  if (
    state.selectionContext?.kind === "preview" &&
    !$("#concrete-inspector").hidden
  ) {
    const draft = state.project.designPreviews.find(
      (d) => d.id === state.selectionContext.id,
    );
    if (draft) {
      const text = previewIdentity(state.project, draft).text;
      $("#selection-tag").textContent = text;
      $("#selected-status").textContent = `${text} · design draft selected`;
      return;
    }
  }
  if (state.selectionContext?.kind === "structure") {
    const entity = state.project.structure[
      state.selectionContext.collection
    ]?.find((x) => x.id === state.selectionContext.id);
    if (entity) {
      $("#selection-tag").textContent = entity.name;
      $("#selected-status").textContent =
        `${entity.name} · ${viewport.selection.size} linked analytical entities`;
      return;
    }
  }
  if (!viewport.selection.size)
    $("#selected-status").textContent = "No entities selected";
  else if (viewport.selection.size === 1) {
    const only = [...viewport.selection][0];
    const member = state.project.members.find((m) => m.id === only);
    const lineage = member
      ? lineageSummary(state.project, member, label)
      : null;
    $("#selected-status").textContent = lineage
      ? `Analytical ${label(member.id)} · physical ${lineage.physicalLabel}${lineage.stations ? ` · ${lineage.stations}` : ""}`
      : `1 selected · ${label(only)}`;
  } else
    $("#selected-status").textContent =
      `${viewport.selection.size} selected · ${[...viewport.selection].slice(0, 3).map(label).join(", ")}`;
}
const cadTools = cad({
  getProject: () => state.project,
  command,
  gateway,
  viewport,
  modal,
  message,
  canEdit: () =>
    !!state.project && !state.busy && !state.readOnly && !state.formDirty,
  selectEntities,
});
/**
 * Replace the dialog body. Consumers holding state tied to the previous
 * content listen for "replace". Keyboard focus that was in the replaced
 * content (or dropped to the body while it was busy) stays in the dialog:
 * on the first form field, otherwise on the close button.
 */
function setModalContent(html) {
  const dialog = $("#modal"),
    content = $("#modal-content"),
    active = document.activeElement,
    hadFocus = content.contains(active) || !active || active === document.body;
  content.innerHTML = html;
  dialog.dispatchEvent(new Event("replace"));
  if (dialog.open && hadFocus)
    (
      content.querySelector(
        "form :is(input:not([type=hidden]),select,textarea):not(:disabled)",
      ) || $("#close-modal")
    ).focus();
}
// The control that opened the dialog, and a selector for its replacement:
// explorer and toolbar controls are rebuilt by commands run in the dialog.
let modalOpener = null;
function openerSelector(el) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  for (const key of ["group", "member", "preview", "branch"])
    if (el.dataset?.[key] != null)
      return `[data-${key}="${CSS.escape(el.dataset[key])}"]`;
  return null;
}
function modal(title, html) {
  const blocking = [
    "Create a planar portal",
    "Worked examples",
    "Capabilities & assumptions",
    "Steel member check",
    "Unable to open project",
    "Invalid project",
    "Project too large",
    "Kernel unavailable",
    "Conversion review",
    "Unable to import",
  ].includes(title);
  const dialog = $("#modal");
  const opener = document.activeElement;
  if (!dialog.open)
    modalOpener =
      opener && opener !== document.body
        ? { element: opener, selector: openerSelector(opener) }
        : null;
  // An open dialog of the same kind only swaps its content; closing it would
  // tell listeners the dialog was dismissed.
  const reuse = dialog.open && dialog.matches(":modal") === blocking;
  if (dialog.open && !reuse) dialog.close();
  $("#modal-title").textContent = title;
  setModalContent(html);
  dialog.classList.toggle("steel-dialog", title === "Steel member check");
  dialog.classList.toggle("command-dock", !blocking);
  document.body.classList.toggle("command-dock-open", !blocking);
  if (!blocking)
    dialog.style.top =
      Math.max(0, $(".work-grid").getBoundingClientRect().top) + "px";
  if (reuse) return;
  if (blocking) dialog.showModal();
  else dialog.show();
}
$("#close-modal").onclick = () => $("#modal").close();
window.addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" &&
    $("#modal").open &&
    $("#modal").classList.contains("command-dock")
  ) {
    e.preventDefault();
    $("#modal").close();
  }
});
$("#modal").addEventListener("close", () => {
  const dialog = $("#modal");
  if (dialog.open) return;
  document.body.classList.remove("command-dock-open");
  const opener = modalOpener;
  modalOpener = null;
  // Return focus to the opener unless something already took it deliberately
  // (the browser's own restore fails when the opener was re-rendered).
  const active = document.activeElement;
  if (
    !opener ||
    (active && active !== document.body && !dialog.contains(active))
  )
    return;
  const target = opener.element.isConnected
    ? opener.element
    : opener.selector && document.querySelector(opener.selector);
  target?.focus();
});
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) $("#modal").close();
});
const scope = async () => {
  try {
    const ledger = await loadCapabilitiesLedger();
    modal(
      "Capabilities & assumptions",
      renderCapabilitiesModalHtml(ledger, esc),
    );
  } catch (e) {
    modal(
      "Capabilities & assumptions",
      `<p>Unable to load the capability ledger (${esc(e.message)}).</p><p class="notice-small" data-testid="parity-unknown">Numerical parity with commercial solvers is UNKNOWN. Excluded domains include shells, solids, plasticity, second-order response, code-certified member sizing, connections and DWG/proprietary commercial formats.</p>`,
    );
  }
};
$("#help").onclick = () => void scope();
$("#scope").onclick = () => void scope();
$("#footer-scope").onclick = () => void scope();
$("#model-steel-design").onclick = () => {
  $("[data-inspector-tab='steel']").click();
  workspace.panel("properties");
};
$("#steel-check").onclick = () =>
  void openSteelCheckDialog({
    gateway,
    openModal: (title, html) => modal(title, html),
    getCapabilities: async () => {
      // Prefer live WASM capabilities (includes enabled designProfiles).
      try {
        return await gateway.send("capabilities");
      } catch {
        return loadCapabilitiesLedger();
      }
    },
    getAnalysisContext: () => ({
      result: diagramResult(),
      modelHash: state.modelHash,
      selectedMemberId:
        state.selected &&
        state.project?.members?.some((m) => m.id === state.selected)
          ? state.selected
          : state.project?.members?.[0]?.id,
    }),
    onDesignRun: (run) => {
      state.lastDesignRun = run;
    },
  });

$("#recover-revision").onclick = () => recoverRevision();

$("#new-project").onclick = () => example("B02", "Untitled cantilever");
$("#worked-examples").onclick = () => {
  const examples = [
    [
      "UKR01",
      "UK residential · four storeys",
      "12 × 12 m · concrete slabs + stairs + 12 pads · preliminary strip/frame model",
    ],
    [
      "W01",
      "3D warehouse frame",
      "12 × 18 m · 3 bays · pitched roof · gravity + lateral loads",
    ],
    [
      "SL01",
      "Flat slab on a two-bay frame",
      "8 × 6 m · 250 mm slab with opening on 9 columns · plate analysis + column loads",
    ],
    ["B02", "Cantilever", "3 m · tip force · bending about local y"],
    ["B01", "Axial extension", "2 m · axial force"],
    ["B03", "Saint Venant torsion", "2 m · applied torque"],
    ["B04", "Other bending axis", "3 m · force in local y"],
    ["B05", "Simply supported beam", "6 m · central nodal point load"],
    ["B06", "Rotated cantilever", "3 m · vertical member"],
    ["B07", "Uniformly loaded beam", "6 m · simply supported"],
    ["B08", "Fixed-ended beam", "6 m · loaded interior recovery"],
    ["B09", "Support movement", "Prescribed axial displacement"],
    ["B10", "Self weight", "Density × area × gravity"],
    ["B11", "Load combination", "1.2 LC1 + 1.5 LC2"],
    ["V01", "Envelope provenance", "LC1 + LC2 + C_uls · governing My/uz"],
    ["P01", "Interior point load", "6 m · midspan concentrated action"],
    ["R01", "My end releases", "Fixed ends · My released · UDL"],
  ];
  modal(
    "Worked examples",
    `<p>Original synthetic models with editable inputs. Run an analysis to calculate their response.</p><div class="example-grid">${examples.map(([id, name, desc]) => `<button data-example="${id}"><strong>${name}</strong><small>${id} · ${desc}</small></button>`).join("")}</div>`,
  );
  for (const b of document.querySelectorAll("[data-example]"))
    b.onclick = () =>
      example(b.dataset.example, b.querySelector("strong").textContent);
};
$("#open-project").onclick = () => $("#import-file").click();
const exchange = exchangeWorkspace({
  gateway,
  modal,
  download,
  message,
  setBusy,
  getProject: () => state.project,
  adopt: (s) => open(s.project, { snapshot: s }),
});
$("#import-exchange").onclick = () => exchange.pick();
$("#export-ifc").onclick = () => exchange.exportIfc();
$("#export-dxf").onclick = () => exchange.exportDxf();
$("#import-file").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) {
    modal(
      "Project too large",
      "<p>The maximum portable project size is 50 MiB.</p>",
    );
    return;
  }
  try {
    const originalUtf8 = await file.text();
    await open(JSON.parse(originalUtf8), { originalUtf8 });
  } catch (e) {
    modal("Invalid project", `<p>${esc(e.message)}</p>`);
  }
};
$("#home").onclick = () => {
  if (state.busy) return;
  if (state.formDirty) {
    message("Apply or cancel property changes before leaving the model.");
    return;
  }
  modelTools.cancel();
  $("#workspace").hidden = true;
  $("#landing").hidden = false;
  $("#top-context").textContent = "Your engineering workspace";
  showRecent();
};
function setBusy(value) {
  state.busy = value;
  // Announces running commands to assistive technology; tests wait on it.
  $("#workspace").setAttribute("aria-busy", String(value));
  for (const id of [
    "analyse",
    "undo",
    "redo",
    "new-project",
    "new-portal",
    "draw-toggle",
    "open-project",
    "import-exchange",
    "worked-examples",
    "analysis-mode",
  ])
    $("#" + id).disabled =
      value ||
      (id === "analyse" && state.analysing) ||
      (state.readOnly &&
        ["undo", "redo", "analysis-mode", "draw-toggle"].includes(id));
  if (state.project) {
    $("#undo").disabled =
      value || state.readOnly || state.formDirty || !state.project.canUndo;
    $("#redo").disabled =
      value || state.readOnly || state.formDirty || !state.project.canRedo;
  }
  for (const b of document.querySelectorAll(
    "#inspector-content input,#inspector-content select,#inspector-content textarea,#inspector-content button,#modal-content form button",
  ))
    b.disabled = value || state.readOnly;
  $("#analysis-mode").disabled = value || state.formDirty || state.readOnly;
  $("#copy-bay").disabled = value || state.formDirty || state.readOnly;
  $("#units").disabled = value || state.formDirty;
  $("#result-case").disabled = value || state.formDirty;
  $("#analyse").disabled = value || state.analysing || state.formDirty;
  $("#cancel").hidden = !state.analysing;
}
function setAnalysing(value) {
  state.analysing = value;
  $("#analyse").disabled =
    value || state.busy || state.formDirty || !state.project;
  $("#cancel").hidden = !value;
  if (state.project && state.tab === "steel-overview") renderResults();
}
function refresh(snapshot) {
  state.project.canUndo = snapshot?.canUndo ?? state.project.canUndo;
  state.project.canRedo = snapshot?.canRedo ?? state.project.canRedo;
  $("#project-name").value = state.project.name;
  $("#revision").textContent = "r" + state.project.revision;
  $("#model-count").textContent =
    `${state.project.nodes.length} nodes · ${state.project.members.length} members`;
  $("#analysis-mode").value = state.project.analysisMode;
  const previousCase = $("#result-case").value;
  $("#result-case").replaceChildren(
    ...[...state.project.loadCases, ...state.project.combinations].map((c) => {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = label(c.id) + " · " + c.name;
      return o;
    }),
  );
  if (state.project.loadCases.length + state.project.combinations.length >= 2) {
    const o = document.createElement("option");
    o.value = "__envelope__";
    o.textContent = "Envelope · all cases & combinations";
    $("#result-case").append(o);
  }
  $("#result-case").value = [
    ...state.project.loadCases,
    ...state.project.combinations,
    { id: "__envelope__" },
  ].some((c) => c.id === previousCase)
    ? previousCase
    : state.project.combinations[0]?.id || state.project.loadCases[0]?.id;
  $("#units").value = state.project.displayUnits;
  $("#view-title").textContent = state.project.name;
  $("#hash-status").textContent = state.modelHash.slice(0, 12) + " · f64";
  $("#kernel-status").textContent = "● Rust / WASM ready";
  viewport.selection = new Set(
    [...viewport.selection].filter(
      (id) =>
        state.project.nodes.some((n) => n.id === id) ||
        state.project.members.some((m) => m.id === id) ||
        state.project.supports.some((s) => s.id === id) ||
        state.project.loads.some((l) => l.id === id),
    ),
  );
  if (state.selected && !viewport.selection.has(state.selected))
    state.selected = [...viewport.selection].at(-1) || null;
  renderNav();
  renderInspector();
  renderResults();
  viewControls?.refresh();
  viewport.currentModelHash = state.modelHash;
  viewport.update(state.project, diagramResult(), state.selected);
  topologyTools.refresh();
  setBusy(state.busy);
}
function portable() {
  const { canUndo, canRedo, ...p } = state.project;
  return p;
}
async function command(type, args, commandId) {
  if (state.readOnly)
    throw Error("Read-only: this project is being edited in another tab");
  setBusy(true);
  try {
    const name = state.project.name,
      units = state.project.displayUnits;
    const s = await gateway.send("applyCommand", {
      command: {
        id: commandId || "c" + crypto.randomUUID().replaceAll("-", ""),
        type,
        args,
      },
    });
    state.project = s.project;
    state.project.name = name;
    state.project.displayUnits = units;
    state.modelHash = s.modelHash;
    state.failed = false;
    message(
      state.result && state.result.modelHash !== state.modelHash
        ? "Results are stale. The engineering model changed; analyse again before exporting a report."
        : "",
    );
    await persist();
    setBusy(false);
    refresh(s);
  } finally {
    setBusy(false);
  }
}
for (const id of ["undo", "redo"])
  $("#" + id).onclick = async () => {
    try {
      setBusy(true);
      const name = state.project.name,
        units = state.project.displayUnits;
      const s = await gateway.send(id);
      state.project = s.project;
      state.project.name = name;
      state.project.displayUnits = units;
      state.modelHash = s.modelHash;
      state.failed = false;
      message(
        state.result && state.result.modelHash !== state.modelHash
          ? "Results are stale. Analyse the restored model."
          : "",
      );
      await persist();
      setBusy(false);
      refresh(s);
    } catch (e) {
      message(e.message);
    } finally {
      setBusy(false);
    }
  };
$("#analysis-mode").onchange = () =>
  command("SetAnalysisMode", { mode: $("#analysis-mode").value }).catch((e) => {
    message(e.message);
    $("#analysis-mode").value = state.project.analysisMode;
  });
$("#project-name").onchange = () => {
  state.project.name = $("#project-name").value;
  $("#view-title").textContent = state.project.name;
  persist();
};
$("#units").onchange = () => {
  state.project.displayUnits = $("#units").value;
  renderResults();
  renderInspector();
  viewport.draw();
  persist();
};
const explorerOpenState = new Map();
const explorerLazyBranches = new Map();

$("#model-search").oninput = () => renderNav();
$("#explorer-expand").onclick = () => {
  // Expand all includes every deferred descendant, never just the mounted rows.
  while ($("#model-nav details[data-lazy]"))
    for (const d of $("#model-nav").querySelectorAll("details[data-lazy]"))
      hydrateExplorerBranch(d);
  bindExplorer();
  for (const d of $("#model-nav").querySelectorAll("details")) {
    explorerOpenState.set(d.dataset.branch, true);
    d.open = true;
  }
};
$("#explorer-collapse").onclick = () => {
  for (const d of $("#model-nav").querySelectorAll("details")) {
    explorerOpenState.set(d.dataset.branch, false);
    d.open = false;
  }
};
const input = (id, label, value, attrs = "") =>
  `<label>${label}<input id="${id}" name="${id}" type="text" inputmode="decimal" value="${value}" ${attrs}></label>`;
const {
  renderDirectProperties,
  renderSelectionForces,
  renderStructureSelection,
  renderInspector,
} = inspectorPanel({
  $,
  bindEntityFields,
  cadTools,
  command,
  concrete,
  entityFields,
  entityGuides,
  esc,
  format,
  guideDiagram,
  input,
  label,
  lineageSummary,
  message,
  nativeSteel,
  readEntityFields,
  renderForceInspector,
  renderResults,
  renderSelectionStatus,
  renderStructureEditor,
  setBusy,
  state,
  structuralIcon,
  viewport,
});
const {
  renderNav,
  hydrateExplorerBranch,
  selectStructureObject,
  bindExplorer,
} = explorerPanel({
  $,
  editEntity,
  entityGuides,
  entityList,
  esc,
  explorerLazyBranches,
  explorerOpenState,
  filterExplorer,
  label,
  message,
  modal,
  openDesignObject,
  renderExplorer,
  renderInspector,
  renderSelectionStatus,
  selectEntities,
  state,
  structuralIcon,
  structureSelectionIds,
});

for (const button of document.querySelectorAll("[data-inspector-tab]"))
  button.onclick = () => {
    if (state.formDirty) {
      message("Apply or cancel changes before switching inspector tabs.");
      return;
    }
    const kind = button.dataset.inspectorTab;
    $("#inspector-content").hidden = kind !== "properties";
    $("#force-inspector").hidden = kind !== "forces";
    $("#steel-design-inspector").hidden = kind !== "steel";
    $("#concrete-inspector").hidden = kind !== "concrete";
    $("#design-preview-scene").hidden = kind !== "concrete";
    if (kind !== "concrete") {
      concrete.hide();
      if (state.selectionContext?.kind === "preview")
        state.selectionContext = null;
      renderSelectionStatus();
    }
    if (kind === "properties") renderInspector();
    viewport.draw();
    if (kind === "concrete") void concrete.render();
    for (const tab of document.querySelectorAll("[data-inspector-tab]"))
      tab.setAttribute("aria-pressed", String(tab === button));
    if (kind === "forces") renderSelectionForces();
    if (kind === "steel") void nativeSteel.render();
  };

for (const b of document.querySelectorAll("[data-tab]"))
  b.onclick = () => {
    state.tab = b.dataset.tab;
    if (state.tab !== "stability") stability.hide();
    if (state.tab !== "modal") modalView.hide();
    if ($("#results-content").hidden) $("#toggle-results")?.click();
    document
      .querySelectorAll("[data-tab]")
      .forEach((x) => x.classList.toggle("active", x === b));
    renderResults();
  };
$("#analyse").onclick = async () => {
  if (!state.project || state.analysing) return;
  try {
    setAnalysing(true);
    message("Analysing the current model…");
    const response = await gateway.send("analyse", analysisPayload());
    state.result = response;
    if ($("#results-content").hidden) $("#toggle-results")?.click();
    state.failed = false;
    if (state.result.modelHash !== state.modelHash) {
      message(
        "Analysis finished for an earlier model revision. Results are stale; analyse again for current results.",
      );
    } else {
      message("");
    }
    if (state.result.analysisType === "envelope") {
      viewport.resultView = "model";
      syncResultPicker("model");
      $("#deformation-legend").hidden = true;
    } else {
      if (
        !actionComponents[viewport.resultView] &&
        !heatComponent(viewport.resultView)
      )
        viewport.resultView = "deformed";
      syncResultPicker(viewport.resultView);
      $("#deformation-legend").hidden = viewport.resultView !== "deformed";
    }
    renderResults();
    renderInspector();
    viewport.update(state.project, diagramResult(), state.selected);
  } catch (e) {
    if (!/CANCELLED|TIMEOUT/.test(e.message)) {
      state.result = null;
      state.failed = true;
      renderSelectionForces();
      renderResults();
      if (!$("#steel-design-inspector").hidden) void nativeSteel.render();
      viewport.update(state.project, null, state.selected);
    }
    message(e.message);
  } finally {
    setAnalysing(false);
    if (!$("#concrete-inspector").hidden) void concrete.render();
  }
};
$("#cancel").onclick = () => {
  gateway.cancelAnalysis();
  message("CANCELLED: Analysis stopped. The model was not disturbed.");
  setAnalysing(false);
};
let restoringModelWorker = false;
gateway.onCrash = async () => {
  if (restoringModelWorker) return;
  restoringModelWorker = true;
  message("Model Worker stopped. Restoring the last confirmed model.");
  const p = state.project && portable();
  gateway.respawnModel("Worker stopped");
  try {
    if (p) {
      const s = await gateway.importFresh({
        jsonUtf8: JSON.stringify(p),
        replaceCurrent: false,
      });
      state.project = s.project;
      state.project.name = p.name;
      state.project.displayUnits = p.displayUnits;
      state.modelHash = s.modelHash;
      state.result = null;
      state.lastDesignRun = null;
      state.failed = false;
      refresh(s);
      message(
        "Model Worker stopped. Restored the last confirmed in-memory model. Download a backup if saves may have failed.",
      );
    }
  } catch (e) {
    message("Model Worker stopped. Automatic restore failed: " + e.message);
  } finally {
    setBusy(false);
    restoringModelWorker = false;
  }
};
gateway.onAnalysisCrash = () => {
  message("Analysis Worker stopped. The model is unchanged.");
  setAnalysing(false);
};
gateway.onTimeout = () => {
  message(
    "TIMEOUT: Analysis stopped. The model Worker kept the last confirmed project.",
  );
  setAnalysing(false);
};
$("#export-project").onclick = () =>
  download(state.project.id + ".json", JSON.stringify(portable(), null, 2));

function analysisPayload() {
  const chosen = $("#result-case").value || state.project.loadCases[0]?.id;
  const envelopeAll = chosen === "__envelope__";
  return {
    caseIds: envelopeAll
      ? state.project.loadCases.map((c) => c.id)
      : state.project.loadCases.some((c) => c.id === chosen)
        ? [chosen]
        : [],
    combinationIds: envelopeAll
      ? state.project.combinations.map((c) => c.id)
      : state.project.combinations.some((c) => c.id === chosen)
        ? [chosen]
        : [],
  };
}

function captureBaselineFrom(snapshot) {
  const record = {
    project: snapshot.project,
    modelHash: snapshot.modelHash,
    jsonUtf8: JSON.stringify(snapshot.project),
  };
  sessionStorage.setItem("workbench-compare-baseline", JSON.stringify(record));
  return record;
}

$("#duplicate-variant").onclick = async () => {
  if (!state.project || state.formDirty) {
    message(
      state.formDirty
        ? "Apply or cancel property changes before duplicating."
        : "Open a project first.",
    );
    return;
  }
  try {
    setBusy(true);
    const snap = await gateway.send("exportProject", { includeResults: false });
    captureBaselineFrom(snap);
    const variant = duplicateAsVariant(snap.project);
    await open(variant);
    message(
      `Duplicated as “${variant.name}”. Baseline “${snap.project.name}” retained for comparison.`,
    );
  } catch (e) {
    message(e.message);
  } finally {
    setBusy(false);
  }
};

$("#compare-variants").onclick = async () => {
  if (!state.project || state.formDirty) {
    message(
      state.formDirty
        ? "Apply or cancel property changes before comparing."
        : "Open a project first.",
    );
    return;
  }
  const raw = sessionStorage.getItem("workbench-compare-baseline");
  if (!raw) {
    message("Duplicate as variant first to capture a baseline.");
    return;
  }
  try {
    setBusy(true);
    setAnalysing(true);
    message("Solving baseline and variant for comparison…");
    const baseline = JSON.parse(raw);
    const snap = await gateway.send("exportProject", { includeResults: false });
    const payload = analysisPayload();
    gateway.analysing = true;
    let baselineResult;
    let variantResult;
    try {
      baselineResult = await gateway.analyseJson(baseline.jsonUtf8, payload);
      variantResult = await gateway.analyseJson(
        JSON.stringify(snap.project),
        payload,
      );
    } finally {
      gateway.analysing = false;
    }
    const comparison = buildComparison({
      baseline: { project: baseline.project, modelHash: baseline.modelHash },
      baselineResult,
      variant: { project: snap.project, modelHash: snap.modelHash },
      variantResult,
    });
    state.result = variantResult;
    state.failed = false;
    state.modelHash = snap.modelHash;
    renderResults();
    renderInspector();
    viewport.update(state.project, diagramResult(), state.selected);
    const fmt = (v) =>
      v == null || !Number.isFinite(v)
        ? "—"
        : `${(v * 1000).toPrecision(4)} mm`;
    const hash = (h) =>
      `<code style="overflow-wrap:anywhere;font-size:12px">${esc(h)}</code>`;
    $("#modal-content").innerHTML =
      `<div class="variant-compare"><h2>Variant comparison</h2><p>Both rows are from independent solves of the captured baseline and the current project. Model hashes identify each stiffness variant.</p><table><thead><tr><th scope="col"></th><th scope="col">Baseline</th><th scope="col">Variant</th></tr></thead><tbody><tr><th scope="row">Name</th><td>${esc(comparison.baseline.name)}</td><td>${esc(comparison.variant.name)}</td></tr><tr><th scope="row">Model hash</th><td>${hash(comparison.baseline.modelHash)}</td><td>${hash(comparison.variant.modelHash)}</td></tr><tr><th scope="row">Section Iy</th><td>${comparison.baseline.Iy?.toExponential?.(4) ?? "—"}</td><td>${comparison.variant.Iy?.toExponential?.(4) ?? "—"}</td></tr><tr><th scope="row">Tip uz (${esc(comparison.tipNode || "—")})</th><td>${fmt(comparison.baseline.tipUz)}</td><td>${fmt(comparison.variant.tipUz)}</td></tr></tbody></table><div class="dialog-actions"><button type="button" id="download-baseline-report">Download baseline report</button><button type="button" id="download-variant-report" class="primary">Download variant report</button></div></div>`;
    $("#modal").showModal();
    $("#download-baseline-report").onclick = () =>
      download(
        `${comparison.baseline.id}-report.html`,
        report(baseline.project, baselineResult),
        "text/html",
      );
    $("#download-variant-report").onclick = () =>
      download(
        `${comparison.variant.id}-report.html`,
        report(snap.project, variantResult),
        "text/html",
      );
    message("");
  } catch (e) {
    message(e.message);
  } finally {
    setAnalysing(false);
    setBusy(false);
  }
};

$("#export-report").onclick = () => {
  if (
    state.result &&
    state.result.modelHash === state.modelHash &&
    !state.failed
  )
    download(
      state.project.id + "-report.html",
      report(portable(), state.result, {
        designRuns: [
          ...memberDesignRuns.values(),
          ...(state.lastDesignRun &&
          state.lastDesignRun.source !== "modelNative"
            ? [state.lastDesignRun]
            : []),
        ].filter(
          (run) =>
            run.modelHash === state.modelHash &&
            (run.source !== "modelNative" ||
              run.resultId === state.result.resultId),
        ),
        // Every design object's current run, per its kind's report rule.
        designObjectsHtml: reportSections(
          portable(),
          concrete.records(),
          { modelHash: state.modelHash, result: state.result },
          esc,
        ),
        // A stability run of the current model, whichever case it analysed.
        stabilityRun: stability.current(state.modelHash),
      }),
      "text/html",
    );
};

window.__studyReady = () => !!state.project && !state.analysing && !state.busy;
$("#study-file").onchange = async () => {
  const file = $("#study-file").files?.[0];
  $("#study-file").value = "";
  if (!file || !state.project) return;
  let study;
  try {
    study = JSON.parse(await file.text());
  } catch (e) {
    message(`INVALID_SCHEMA: Study JSON parse failed: ${e.message}`);
    return;
  }
  await studies.run(study);
  if (!$("#concrete-inspector").hidden) void concrete.render();
};

$("#export-csv").onclick = () => {
  if (
    state.result &&
    state.result.modelHash === state.modelHash &&
    !state.failed
  )
    download(
      state.project.id + "-results.csv",
      csv(state.result, state.project),
      "text/csv",
    );
};
$("#result-case").onchange = () => {
  state.result = null;
  state.lastDesignRun = null;
  state.failed = false;
  renderResults();
  renderInspector();
  viewport.update(state.project, null, state.selected);
  message("Selected analysis case changed. Analyse to calculate this case.");
};
const syncResultPicker = bindResultPicker((value) => {
  viewport.resultView = value;
  $("#deformation-legend").hidden = viewport.resultView !== "deformed";
  viewport.draw();
});
$("#deformation-scale").oninput = () => {
  viewport.scale = Math.max(
    0,
    Math.min(10000, Number($("#deformation-scale").value) || 0),
  );
  viewport.draw();
};
$("#diagram-scale").oninput = () => {
  const value = Number($("#diagram-scale").value);
  if ($("#diagram-scale").value === "" || !Number.isFinite(value)) return;
  viewport.diagramScale = Math.max(0, Math.min(100, value));
  viewport.draw();
};
for (const [id, field] of [
  ["deformation-scale", "scale"],
  ["diagram-scale", "diagramScale"],
])
  $("#" + id).onchange = () => {
    $("#" + id).value = viewport[field];
  };
$("#fit").onclick = () => viewport.fit();
$("#reset-viewport").onclick = () => {
  if (viewport.device && viewport.ready) {
    viewport.device.destroy();
  } else viewport.init();
};
for (const mode of ["plan", "elevation", "3d"])
  $("#view-" + mode).onclick = () => {
    modelTools.cancel();
    viewport.mode = mode;
    $("#view-subtitle").textContent =
      mode === "3d"
        ? "3D orthographic · Orbit tool or Alt-drag"
        : mode === "plan"
          ? "Global XY · metres"
          : "Global XZ · metres";
    $("#view-plan").classList.toggle("active", mode === "plan");
    $("#view-elevation").classList.toggle("active", mode === "elevation");
    $("#view-3d").classList.toggle("active", mode === "3d");
    $("#view-side")?.classList.remove("active");
    viewport.fit();
  };
for (const [id, key] of [
  ["add-node-tool", "nodes"],
  ["add-support-tool", "supports"],
  ["add-load-tool", "loads"],
])
  $("#" + id).onclick = () => {
    if (!state.project || state.busy || state.readOnly) return;
    modal("Add " + key, "");
    editEntity(key, null);
  };

window.addEventListener("keydown", (e) => {
  if (
    e.defaultPrevented ||
    !state.project ||
    $("#workspace").hidden ||
    $("#modal").open ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
  )
    return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    $(e.shiftKey ? "#redo" : "#undo").click();
  }
});
let directTools;
const workspace = workspaceUI({
  viewport,
  gateway,
  getProject: () => state.project,
  selectEntities,
  canAct: () => !state.busy && !state.readOnly,
  editSelection: (type) =>
    directTools.activate(
      { MoveNodes: "move", CopySelection: "copy", DeleteGeometry: "delete" }[
        type
      ],
    ),
  hasDraft: () => state.formDirty,
  finishTools: () => {
    modelTools.cancel();
    directTools?.finish();
  },
  message,
});
directTools = canvasTools({
  viewport,
  gateway,
  getProject: () => state.project,
  command,
  selectEntities,
  cancelDrawing: () => modelTools.cancel(),
  canEdit: () =>
    !!state.project && !state.busy && !state.readOnly && !state.formDirty,
  message,
  inspect: () => {
    $("#modal").close();
    workspace.panel("properties");
  },
  deleteAssignment: async (id) => {
    if (!state.busy && !state.readOnly && !state.formDirty)
      try {
        await command("DeleteEntities", { ids: [id], cascade: false });
      } catch (e) {
        message(e.message);
      }
  },
});
showRecent();
initOffline().catch(() => {});
window.__workbenchTest = {
  crashModelWorker: async () => {
    // Drive the app crash path once; respawnModel terminates the Worker.
    await gateway.onCrash?.();
  },
  isVerifiedSnapshot,
};
gateway.ready.catch((e) =>
  modal("Kernel unavailable", `<p>${esc(e.message)}</p>`),
);

function setModelDisplay(solid) {
  viewport.modelSolids = solid;
  viewport.visibilityRevision = (viewport.visibilityRevision || 0) + 1;
  $("#model-solids").setAttribute("aria-pressed", String(solid));
  $("#model-lines").setAttribute("aria-pressed", String(!solid));
  viewport.draw();
}
$("#model-solids").onclick = () => setModelDisplay(true);
$("#model-lines").onclick = () => setModelDisplay(false);
$("#model-assumptions").onclick = () =>
  modal(
    "Model assumptions",
    `<p>${esc(state.project.metadata.description || "No assumptions recorded.")}</p><p>Solid shapes show assigned dimensions. Concrete resistance and ground contact require separate verified design checks.</p>`,
  );

$("#model-loads").onclick = () => {
  viewport.showLoads = viewport.showLoads === false;
  $("#model-loads").setAttribute("aria-pressed", String(viewport.showLoads));
  viewport.draw();
};
$("#model-slabs").onclick = () => {
  viewport.showSlabs = viewport.showSlabs === false;
  $("#model-slabs").setAttribute("aria-pressed", String(viewport.showSlabs));
  // A pick already in flight must not land on a slab that was just hidden.
  viewport.visibilityRevision = (viewport.visibilityRevision || 0) + 1;
  viewport.draw();
};
$("#model-crossings").onclick = () => {
  viewport.showCrossings = viewport.showCrossings === false;
  $("#model-crossings").setAttribute(
    "aria-pressed",
    String(viewport.showCrossings),
  );
  $("#geometry-status").hidden = !viewport.showCrossings;
  viewport.draw();
};

$("#support-labels").onclick = () => {
  viewport.showSupportLabels = viewport.showSupportLabels === false;
  $("#support-labels").setAttribute(
    "aria-pressed",
    String(viewport.showSupportLabels),
  );
  viewport.draw();
};

$("#member-labels").onchange = (event) => {
  viewport.memberLabels = event.target.value;
  viewport.draw();
};

viewControls = modelVisibility({
  viewport,
  getProject: () => state.project,
  canChange: () => {
    if (state.formDirty) {
      message("Apply or cancel edits before changing the view.");
      return false;
    }
    return !!state.project;
  },
  onChange: () => {
    modelTools.cancel();
    directTools?.finish();
    if (viewport.designPreview && !viewport.designPreview.context)
      $("#preview-focus")?.click();
  },
});
