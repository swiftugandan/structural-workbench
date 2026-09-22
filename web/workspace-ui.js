import { commandMenu } from "./command-menu.js";
import { structuralIcon } from "./structural-icons.js";
import { icon as lucideIcon } from "./icons.js";
import { entityLabel } from "./entity-labels.js";
import { escape as esc } from "./reports/report.js";
const $ = (s) => document.querySelector(s);
const iconNames = {
  select: "mouse-pointer-2",
  member: "move-up-right",
  node: "circle-dot",
  support: "triangle",
  load: "arrow-down-to-line",
  move: "move",
  copy: "copy",
  edit: "pencil",
  split: "git-fork",
  delete: "trash-2",
  view: "eye",
  fit: "scan",
  measure: "ruler",
  undo: "undo-2",
  redo: "redo-2",
  save: "save",
  play: "play",
  settings: "sliders-horizontal",
  orbit: "orbit",
  axes: "axis-3d",
};
export const icon = (name) =>
  ["node", "member", "support", "load", "frame"].includes(name)
    ? structuralIcon(name)
    : lucideIcon(iconNames[name] || name);
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
  $(".project-symbol").innerHTML = icon("frame");
  const projectbar = $(".projectbar");
  projectbar.firstElementChild.classList.add("project-identity");
  const home = $("#home"),
    help = $("#help");
  const homePosition = document.createComment("Home position");
  const helpPosition = document.createComment("Help position");
  home.before(homePosition);
  help.before(helpPosition);
  home.title = "Projects home";
  function syncHeader() {
    const modelling = !$("#workspace").hidden;
    home.classList.toggle("workspace-home", modelling);
    help.classList.toggle("dark-button", !modelling);
    if (modelling) {
      projectbar.prepend(home);
      $(".project-actions").append(help);
    } else {
      homePosition.after(home);
      helpPosition.after(help);
    }
  }
  const headerObserver = new MutationObserver(syncHeader);
  headerObserver.observe($("#workspace"), {
    attributes: true,
    attributeFilter: ["hidden"],
  });
  syncHeader();
  const ribbon = document.createElement("section");
  ribbon.className = "command-ribbon";
  ribbon.setAttribute("aria-label", "Modelling commands");
  ribbon.innerHTML = '<div class="ribbon-content" id="ribbon-content"></div>';
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
        ["orbit-tool", "orbit", "Orbit"],
        ["axes-toggle", "axes", "Local axes"],
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
  panels.hidden = true;
  ribbon.after(panels);
  const layoutKey = "workbench-layout-v1";
  const defaults = {
    model: true,
    properties: true,
    results: true,
    ribbon: true,
    toolbar: true,
  };
  let layout = { ...defaults },
    focused = false;
  let previousPanel = "canvas";
  try {
    const saved = JSON.parse(localStorage.getItem(layoutKey));
    for (const key of Object.keys(defaults))
      if (typeof saved?.[key] === "boolean") layout[key] = saved[key];
  } catch {
    /* Layout preferences are optional. */
  }
  const targets = {
    model: $(".model-panel"),
    properties: $(".inspector"),
    results: $(".results-panel"),
    ribbon,
    toolbar: $(".viewport-toolbar"),
  };
  for (const [key, label] of [
    ["ribbon", "Ribbon"],
    ["toolbar", "Canvas toolbar"],
  ]) {
    const button = document.createElement("button");
    button.dataset.layout = key;
    button.textContent = label;
    panels.append(button);
  }
  const focus = document.createElement("button");
  focus.id = "focus-canvas";
  panels.append(focus);
  const narrow = matchMedia("(max-width: 900px)");
  function renderLayout() {
    for (const [key, target] of Object.entries(targets)) {
      const visible = !focused && layout[key];
      target.classList.toggle(
        "layout-hidden",
        !visible && (!narrow.matches || ["ribbon", "toolbar"].includes(key)),
      );
      $(".work-grid").classList.toggle("hide-" + key, !visible);
      const button = panels.querySelector(
        `[data-panel="${key}"], [data-layout="${key}"]`,
      );
      button?.setAttribute(
        "aria-pressed",
        String(
          narrow.matches && ["model", "properties", "results"].includes(key)
            ? $(".work-grid").dataset.panel === key
            : visible,
        ),
      );
    }
    panels.querySelector('[data-panel="canvas"]').hidden = !narrow.matches;
    panels
      .querySelector('[data-panel="canvas"]')
      .setAttribute(
        "aria-pressed",
        String($(".work-grid").dataset.panel === "canvas"),
      );
    focus.textContent = focused ? "Restore layout" : "Focus canvas";
    focus.setAttribute("aria-pressed", String(focused));
  }
  function saveLayout() {
    try {
      localStorage.setItem(layoutKey, JSON.stringify(layout));
    } catch {
      /* Continue without persistence. */
    }
  }
  function panel(name) {
    focused = false;
    if (name !== "canvas") layout[name] = true;
    $(".work-grid").dataset.panel = name;
    panels
      .querySelector('[data-panel="canvas"]')
      .setAttribute("aria-pressed", String(name === "canvas"));
    renderLayout();
    saveLayout();
  }
  panels.onclick = (e) => {
    const button = e.target.closest("button");
    if (!button) return;
    if (button === focus) {
      if (!focused) previousPanel = $(".work-grid").dataset.panel;
      focused = !focused;
      $(".work-grid").dataset.panel = focused ? "canvas" : previousPanel;
    } else {
      const key = button.dataset.layout || button.dataset.panel;
      if (key === "canvas" || (narrow.matches && button.dataset.panel)) {
        panel(key);
        return;
      }
      layout[key] = focused || !layout[key];
      focused = false;
      saveLayout();
    }
    renderLayout();
  };
  narrow.addEventListener("change", renderLayout);
  $(".work-grid").dataset.panel = "canvas";
  renderLayout();
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
  commandMenu({
    host: projectbar,
    layoutControls: panels,
    panel,
    getProject,
    canAct,
    hasDraft,
    selectEntities,
    viewport,
    activateCanvas: () => {
      $(".work-grid").dataset.panel = "canvas";
      renderLayout();
    },
    resetLayout: () => {
      layout = { ...defaults };
      focused = false;
      $(".work-grid").dataset.panel = "canvas";
      renderLayout();
      saveLayout();
    },
  });
  return { panel };
}
