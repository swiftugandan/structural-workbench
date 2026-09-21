import { entityLabel } from "./entity-labels.js";
import { escape as esc } from "./reports/report.js";
const $ = (s) => document.querySelector(s);
const paths = {
  select: "m4 3 16 10-8 2-4 7Z",
  member: "M4 20 20 4M2 18l4 4M18 2l4 4",
  node: "M12 3v6m0 6v6M3 12h6m6 0h6M9 9h6v6H9Z",
  support: "m12 5 9 14H3ZM2 22h20",
  load: "M12 2v17m-6-6 6 6 6-6M3 22h18",
  move: "M12 2v20M2 12h20m-14-6 4-4 4 4m-10 2-4 4 4 4m12-8 4 4-4 4m-10 2 4 4 4-4",
  copy: "M8 8h13v13H8ZM3 16V3h13",
  edit: "m4 16 12-12 4 4L8 20H4Z",
  split: "M3 21 21 3M7 3l14 14M3 7l14 14",
  delete: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
  view: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm7 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
  fit: "M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6",
  measure: "m3 17 14-14 4 4L7 21Zm5-5 4 4m0-8 4 4",
  undo: "M9 4 3 10l6 6M3 10h11a6 6 0 0 1 0 12",
  redo: "m15 4 6 6-6 6m6-6H10a6 6 0 0 0 0 12",
  save: "M5 3h12l4 4v14H3V3h2m2 0v7h10V3M7 21v-7h10v7",
  play: "m7 4 14 8-14 8Z",
  settings: "M3 6h18M3 12h18M3 18h18M7 3v6m10 0v6m-7 0v6",
};
export const icon = (name) =>
  `<svg class="command-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.settings}"/></svg>`;
export function workspaceUI({
  viewport,
  getProject,
  gateway,
  selectEntities,
  canAct,
  editSelection,
  hasDraft,
  finishTools,
  message,
}) {
  const ribbon = document.createElement("section");
  ribbon.className = "command-ribbon";
  ribbon.setAttribute("aria-label", "Modelling commands");
  ribbon.innerHTML =
    '<div class="ribbon-tabs" role="tablist" aria-label="Command categories"></div><div class="ribbon-content" id="ribbon-content" role="tabpanel" aria-labelledby="ribbon-All"></div>';
  $(".projectbar").after(ribbon);
  const groups = [
    [
      "Model",
      "Create",
      [
        ["draw-toggle", "member", "Draw member"],
        ["add-node-tool", "node", "Node"],
        ["add-support-tool", "support", "Support"],
        ["add-load-tool", "load", "Load"],
      ],
    ],
    [
      "Modify",
      "Selection",
      [
        ["select-tool", "select", "Select"],
        ["cad-tools", "edit", "Edit selection"],
        ["topology", "split", "Topology"],
        ["measure-tool", "measure", "Measure"],
      ],
    ],
    [
      "View",
      "Navigate",
      [
        ["pan-tool", "move", "Pan"],
        ["orbit-tool", "view", "Orbit"],
        ["axes-toggle", "view", "Local axes"],
        ["dimensions-toggle", "measure", "Dimensions"],
        ["fit", "fit", "Fit"],
      ],
    ],
  ];
  for (const [category, label, commands] of groups) {
    const group = document.createElement("div");
    group.className = "ribbon-group";
    group.dataset.category = category;
    const row = document.createElement("div");
    row.className = "ribbon-commands";
    for (const [id, img, text] of commands) {
      const b = $("#" + id);
      b.innerHTML = icon(img) + `<span>${text}</span>`;
      b.title = text;
      row.append(b);
    }
    group.append(row);
    const caption = document.createElement("span");
    caption.className = "ribbon-caption";
    caption.textContent = label;
    group.append(caption);
    $("#ribbon-content").append(group);
  }
  const resultGroup = document.createElement("div");
  resultGroup.className = "ribbon-group";
  resultGroup.dataset.category = "Results";
  resultGroup.innerHTML =
    '<div class="ribbon-commands"><button id="show-results">' +
    icon("view") +
    '<span>Results table</span></button><button id="selection-actions">' +
    icon("settings") +
    '<span>Actions</span></button></div><span class="ribbon-caption">Inspect</span>';
  $("#ribbon-content").append(resultGroup);
  function category(name) {
    document.querySelectorAll("[data-ribbon]").forEach((b) => {
      const active = b.dataset.ribbon === name;
      b.setAttribute("aria-selected", String(active));
      b.tabIndex = active ? 0 : -1;
    });
    $("#ribbon-content").setAttribute("aria-labelledby", "ribbon-" + name);
    document
      .querySelectorAll(".ribbon-group")
      .forEach(
        (g) => (g.hidden = name !== "All" && g.dataset.category !== name),
      );
  }
  for (const name of ["All", "Model", "Modify", "View", "Results"]) {
    const b = document.createElement("button");
    b.id = "ribbon-" + name;
    b.dataset.ribbon = name;
    b.textContent = name === "All" ? "All tools" : name;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-controls", "ribbon-content");
    b.onclick = () => category(name);
    b.onkeydown = (e) => {
      const tabs = [...document.querySelectorAll("[data-ribbon]")];
      let i = tabs.indexOf(b);
      if (e.key === "ArrowRight") i = (i + 1) % tabs.length;
      else if (e.key === "ArrowLeft") i = (i + tabs.length - 1) % tabs.length;
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = tabs.length - 1;
      else return;
      e.preventDefault();
      tabs[i].click();
      tabs[i].focus();
    };
    $(".ribbon-tabs").append(b);
  }
  category("All");
  for (const [id, img, text] of [
    ["undo", "undo", "Undo"],
    ["redo", "redo", "Redo"],
    ["export-project", "save", "Project"],
    ["export-report", "save", "Report"],
    ["analyse", "play", "Analyse"],
    ["export-csv", "save", "CSV"],
  ])
    $("#" + id).innerHTML = icon(img) + `<span>${text}</span>`;
  const panels = document.createElement("nav");
  panels.className = "workspace-panels";
  panels.setAttribute("aria-label", "Workspace panels");
  panels.innerHTML =
    '<button data-panel="canvas" aria-pressed="true">Canvas</button><button data-panel="model" aria-pressed="false">Model tree</button><button data-panel="properties" aria-pressed="false">Properties</button><button data-panel="results" aria-pressed="false">Results</button>';
  ribbon.after(panels);
  function panel(name) {
    $(".work-grid").dataset.panel = name;
    document
      .querySelectorAll("button[data-panel]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.panel === name)),
      );
  }
  panels.onclick = (e) => {
    const b = e.target.closest("[data-panel]");
    if (b) panel(b.dataset.panel);
  };
  panel("canvas");
  $("#show-results").onclick = () => {
    panel("results");
    $("#results-content").focus();
    $(".results-panel").scrollIntoView({ block: "nearest" });
  };
  $("#results-content").tabIndex = 0;
  $("#results-content").setAttribute("role", "region");
  $("#results-content").setAttribute("aria-label", "Analysis results");
  const collapse = document.createElement("button");
  collapse.id = "toggle-results";
  collapse.textContent = "Collapse results";
  collapse.setAttribute("aria-expanded", "true");
  collapse.setAttribute("aria-controls", "results-content");
  $(".results-tabs").append(collapse);
  collapse.onclick = () => {
    const hidden = !$("#results-content").hidden;
    $("#results-content").hidden = hidden;
    collapse.setAttribute("aria-expanded", String(!hidden));
    collapse.textContent = hidden ? "Expand results" : "Collapse results";
    $(".work-grid").classList.toggle("results-collapsed", hidden);
  };
  $("#show-results").addEventListener("click", () => {
    if ($("#results-content").hidden) collapse.click();
  });
  const status = document.createElement("span");
  status.id = "active-tool";
  $(".viewport-status").prepend(status);
  function toolStatus() {
    const b =
      document.querySelector('[data-canvas-tool][aria-pressed="true"]') ||
      ($("#draw-toggle").getAttribute("aria-pressed") === "true"
        ? $("#draw-toggle")
        : ["select-tool", "pan-tool", "orbit-tool"]
            .map((id) => $("#" + id))
            .find((b) => b.getAttribute("aria-pressed") === "true"));
    status.textContent =
      (b?.textContent.trim() || "Select") +
      " · Plane " +
      $("#working-plane").value;
  }
  const observer = new MutationObserver(toolStatus);
  for (const id of ["draw-toggle", "select-tool", "pan-tool", "orbit-tool"])
    observer.observe($("#" + id), {
      attributes: true,
      attributeFilter: ["aria-pressed"],
    });
  $("#working-plane").addEventListener("change", toolStatus);
  toolStatus();
  const menu = document.createElement("div");
  menu.id = "canvas-context-menu";
  menu.className = "canvas-context-menu";
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Selection actions");
  document.body.append(menu);
  let returnFocus,
    request = 0;
  function close(focus = true) {
    request++;
    menu.hidden = true;
    if (focus && returnFocus?.isConnected) returnFocus.focus();
  }
  function show(x, y, selection) {
    returnFocus = document.activeElement;
    menu.replaceChildren();
    const heading = document.createElement("div");
    heading.className = "context-heading";
    heading.textContent = selection
      ? `${viewport.selection.size} selected · ${[...viewport.selection]
          .slice(0, 3)
          .map((id) => entityLabel(getProject(), id))
          .join(", ")}`
      : "Canvas actions";
    menu.append(heading);
    const entries = selection
      ? [
          [
            "Properties",
            "settings",
            () => {
              if ($("#modal").classList.contains("command-dock"))
                $("#modal").close();
              panel("properties");
              $("#inspector-content").tabIndex = -1;
              $("#inspector-content").focus();
            },
          ],
          ["Move…", "move", () => editSelection("MoveNodes")],
          ["Copy…", "copy", () => editSelection("CopySelection")],
          ["Topology…", "split", () => $("#topology").click()],
          ["Delete preview…", "delete", () => editSelection("DeleteGeometry")],
        ]
      : [
          ["Draw member", "member", () => $("#draw-toggle").click()],
          ["Add node", "node", () => $("#add-node-tool").click()],
          ["Fit model", "fit", () => $("#fit").click()],
        ];
    const assignmentsOnly =
      selection &&
      [...viewport.selection].every(
        (id) =>
          getProject().supports.some((s) => s.id === id) ||
          getProject().loads.some((l) => l.id === id),
      );
    for (const [label, img, action] of assignmentsOnly
      ? entries.slice(0, 1)
      : entries) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "menuitem");
      b.tabIndex = -1;
      b.innerHTML = icon(img) + esc(label);
      b.onclick = () => {
        close();
        finishTools?.();
        action();
      };
      menu.append(b);
    }
    menu.hidden = false;
    menu.style.left =
      Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8)) + "px";
    menu.style.top =
      Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8)) + "px";
    menu.querySelector("button").focus();
  }
  async function context(e, keyboard = false) {
    e.preventDefault();
    if (!getProject() || !canAct()) return;
    if (hasDraft()) {
      message(
        "Apply or cancel property changes before changing selection or opening actions.",
      );
      return;
    }
    const token = ++request;
    const r = viewport.canvas.getBoundingClientRect();
    if (!keyboard) {
      const p = getProject(),
        revision = p.revision,
        camera = viewport.camera(),
        key = JSON.stringify(camera);
      try {
        const hit = await gateway.send("queryGeometry", {
          kind: "screenPick",
          query: { camera, point: [e.clientX - r.left, e.clientY - r.top] },
          viewRevision: viewport.viewRevision,
        });
        if (
          token !== request ||
          getProject() !== p ||
          getProject().revision !== revision ||
          JSON.stringify(viewport.camera()) !== key
        )
          return;
        if (hit.entityId && !viewport.selection.has(hit.entityId))
          selectEntities([hit.entityId]);
        if (!hit.entityId) {
          show(e.clientX, e.clientY, false);
          return;
        }
      } catch (error) {
        message(error.message);
        return;
      }
    }
    show(
      keyboard ? r.left + 24 : e.clientX,
      keyboard ? r.top + 55 : e.clientY,
      viewport.selection.size > 0,
    );
  }
  viewport.canvas.addEventListener("contextmenu", (e) => context(e));
  viewport.canvas.addEventListener("keydown", (e) => {
    if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10"))
      context(e, true);
  });
  $("#selection-actions").onclick = (e) => context(e, true);
  menu.onkeydown = (e) => {
    const items = [...menu.querySelectorAll("button")];
    let i = items.indexOf(document.activeElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Tab") {
      close(false);
      return;
    }
    if (e.key === "ArrowDown") i = (i + 1) % items.length;
    else if (e.key === "ArrowUp") i = (i + items.length - 1) % items.length;
    else if (e.key === "Home") i = 0;
    else if (e.key === "End") i = items.length - 1;
    else return;
    e.preventDefault();
    items[i].focus();
  };
  document.addEventListener("pointerdown", (e) => {
    if (!menu.hidden && !menu.contains(e.target)) close(false);
  });
  window.addEventListener("resize", () => close(false));
  return { panel, category };
}
