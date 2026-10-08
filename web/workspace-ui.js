import { commandMenu } from "./command-menu.js";
import { structuralIcon } from "./structural-icons.js";
import { icon as lucideIcon } from "./icons.js";
import { entityLabel } from "./entity-labels.js";
import { escape as esc } from "./reports/report.js";
import { disclosure } from "./ui/disclosure.js";
import { enhanceTabStrip } from "./ui/tab-strip.js";
import { fitToolbar } from "./ui/toolbar-fit.js";
import { splitter } from "./ui/splitter.js";
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
  info: "info",
};
export const icon = (name) =>
  ["node", "member", "support", "load", "frame"].includes(name)
    ? structuralIcon(name)
    : lucideIcon(iconNames[name] || name);
/** Puts each `[data-icon]` button's icon before its label (once). */
export function hydrateIcons(root) {
  for (const el of root.querySelectorAll("[data-icon]")) {
    if (el.querySelector(":scope > svg")) continue;
    el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon));
    if (!el.title) el.title = el.textContent.trim();
  }
}
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
  // The shell is declared in app.html (ADR 0033); this module adds behaviour.
  const ribbon = $(".command-ribbon");
  hydrateIcons(document.querySelector("#workspace"));
  $("#concrete-previews").onclick = () =>
    $("[data-inspector-tab=concrete]").click();
  disclosure($("#view-scope"));
  disclosure($("#view-options"));
  enhanceTabStrip($(".results-tabs .tab-scroll"), "result views");
  enhanceTabStrip($(".inspector-tabs .tab-scroll"), "selection views");
  // Lowest priority last: these groups drop their labels first.
  const groups = (...labels) =>
    labels.map((l) => ribbon.querySelector(`.ribbon-group[aria-label="${l}"]`));
  fitToolbar(
    $("#ribbon-content"),
    groups("Create", "Design", "Selection", "Inspect", "Canvas edits"),
  );
  // Panel sizes are a per-viewer preference, kept apart from visibility.
  const sizesKey = "workbench-layout-sizes-v1";
  let sizes = {};
  try {
    sizes = JSON.parse(localStorage.getItem(sizesKey)) || {};
  } catch {
    /* Sizes are optional. */
  }
  const remember = (key) => (px) => {
    if (px == null) delete sizes[key];
    else sizes[key] = px;
    try {
      localStorage.setItem(sizesKey, JSON.stringify(sizes));
    } catch {
      /* Continue without persistence. */
    }
  };
  const grid = $(".work-grid");
  for (const [name, panel, edge, property, min, max, label] of [
    [
      "explorer",
      ".model-panel",
      "right",
      "--explorer-w",
      160,
      520,
      "Model explorer width",
    ],
    [
      "inspector",
      ".inspector",
      "left",
      "--inspector-w",
      260,
      640,
      "Inspector width",
    ],
    [
      "dock",
      ".results-panel",
      "top",
      "--dock-h",
      120,
      900,
      "Results panel height",
    ],
  ])
    splitter({
      panel: $(panel),
      edge,
      target: document.documentElement,
      property,
      min,
      max,
      initial: typeof sizes[name] === "number" ? sizes[name] : null,
      label,
      name,
      host: grid,
      onChange: remember(name),
    });
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
  collapse.setAttribute("aria-label", "Collapse results");
  collapse.title = "Collapse results";
  collapse.setAttribute("aria-expanded", "true");
  collapse.setAttribute("aria-controls", "results-content");
  $(".results-trailing").append(collapse);
  collapse.onclick = () => {
    const hidden = !$("#results-content").hidden;
    $("#results-content").hidden = hidden;
    collapse.setAttribute("aria-expanded", String(!hidden));
    const label = hidden ? "Expand results" : "Collapse results";
    collapse.setAttribute("aria-label", label);
    collapse.title = label;
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
