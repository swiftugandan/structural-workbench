import { structureSelectionIds } from "./selection-context.js";
import { escape as esc } from "./reports/report.js";

// View membership only: neither geometry nor model properties are modified.
export function visibleEntities(
  project,
  { storey = "", layer = "", isolated = null, hidden = new Set() } = {},
) {
  let allowed = null;
  for (const [collection, id] of [
    ["storeys", storey],
    ["layers", layer],
  ]) {
    if (!id) continue;
    const scope = new Set(structureSelectionIds(project, collection, id));
    allowed = allowed
      ? new Set([...allowed].filter((x) => scope.has(x)))
      : scope;
  }
  if (isolated)
    allowed = allowed
      ? new Set([...allowed].filter((x) => isolated.has(x)))
      : new Set(isolated);
  const members = project.members.filter(
    (m) => !hidden.has(m.id) && (!allowed || allowed.has(m.id)),
  );
  const nodes = new Set(members.flatMap((m) => [m.start, m.end]));
  const connected = new Set(project.members.flatMap((m) => [m.start, m.end]));
  for (const n of project.nodes)
    if (
      !hidden.has(n.id) &&
      (allowed ? allowed.has(n.id) : !connected.has(n.id))
    )
      nodes.add(n.id);
  for (const s of project.supports)
    if (allowed?.has(s.id) && !hidden.has(s.id)) nodes.add(s.node);
  for (const id of hidden) nodes.delete(id);
  return new Set([
    ...members.map((m) => m.id),
    ...nodes,
    ...project.supports
      .filter((s) => nodes.has(s.node) && !hidden.has(s.id))
      .map((s) => s.id),
  ]);
}

export function modelVisibility({ viewport, getProject, canChange, onChange }) {
  const $ = (s) => document.querySelector(s);
  const state = { storey: "", layer: "", isolated: null, hidden: new Set() };
  let projectId;
  // The controls are declared in app.html (ADR 0033): the Visibility and
  // Overlays disclosures of the canvas toolbar.
  $("#model-nodes").onclick = () => {
    viewport.showNodes =
      viewport.showNodes === undefined
        ? false
        : viewport.showNodes === false
          ? true
          : undefined;
    $("#model-nodes").textContent =
      `Analytical nodes: ${viewport.showNodes === undefined ? "Auto" : viewport.showNodes ? "Show" : "Hide"}`;
    viewport.visibilityRevision = (viewport.visibilityRevision || 0) + 1;
    viewport.draw();
  };
  // A side elevation is essential for return stairs; the renderer already supports it.
  const side = $("#view-side");
  side.onclick = () => {
    viewport.mode = "side";
    for (const b of document.querySelectorAll(
      ".viewport-toolbar .segmented button",
    ))
      b.classList.toggle("active", b === side);
    $("#view-subtitle").textContent = "Global YZ · metres";
    viewport.fit();
  };
  function apply(fit = true, notify = true) {
    const project = getProject();
    if (!project) return;
    viewport.visibleIds = visibleEntities(project, state);
    viewport.fitIds = null;
    viewport.hovered = null;
    viewport.crossingData = null;
    const shown = project.members.filter((m) =>
      viewport.visibleIds.has(m.id),
    ).length;
    $("#view-scope-status").textContent =
      `${shown} / ${project.members.length} members visible${state.isolated ? " · isolated" : ""}${state.hidden.size ? " · hidden selection" : ""}`;
    // The toolbar shows when the view is filtered without opening the panel.
    const filtered = shown < project.members.length;
    $("#view-scope-badge").textContent = filtered
      ? `${shown}/${project.members.length}`
      : "";
    $("#view-scope").toggleAttribute("data-filtered", filtered);
    $("#view-scope-status").title =
      "View filter only; analysis always uses the complete model.";
    viewport.visibilityRevision = (viewport.visibilityRevision || 0) + 1;
    if (notify) onChange?.();
    if (fit) viewport.fit();
    else viewport.draw();
  }
  function change(fn) {
    if (!canChange()) return;
    fn();
    apply();
  }
  $("#view-storey").onchange = (e) =>
    change(() => {
      state.storey = e.target.value;
    });
  $("#view-layer").onchange = (e) =>
    change(() => {
      state.layer = e.target.value;
    });
  $("#isolate-selection").onclick = () =>
    change(() => {
      if (viewport.selection.size) {
        state.storey = "";
        state.layer = "";
        state.hidden.clear();
        state.isolated = new Set(viewport.selection);
        $("#view-storey").value = "";
        $("#view-layer").value = "";
      }
    });
  $("#hide-selection").onclick = () =>
    change(() => {
      for (const id of viewport.selection) state.hidden.add(id);
    });
  $("#fit-selection").onclick = () => {
    if (!canChange() || !viewport.selection.size) return;
    viewport.fitIds = new Set(viewport.selection);
    viewport.zoom = 1;
    viewport.pan = [0, 0];
    viewport.draw();
  };
  $("#show-all-model").onclick = () =>
    change(() => {
      state.storey = "";
      state.layer = "";
      state.isolated = null;
      state.hidden.clear();
      $("#view-storey").value = "";
      $("#view-layer").value = "";
    });
  function refresh() {
    const project = getProject();
    if (!project) return;
    if (projectId !== project.id) {
      projectId = project.id;
      state.storey = "";
      state.layer = "";
      state.isolated = null;
      state.hidden.clear();
    }
    for (const [key, collection, caption] of [
      ["storey", "storeys", "All storeys"],
      ["layer", "layers", "All layers"],
    ]) {
      if (!project.structure[collection].some((x) => x.id === state[key]))
        state[key] = "";
      $("#view-" + key).innerHTML =
        `<option value="">${caption}</option>` +
        project.structure[collection]
          .map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`)
          .join("");
      $("#view-" + key).value = state[key];
    }
    apply(false, false);
  }
  return { refresh };
}
