const $ = (selector) => document.querySelector(selector);

// Every entry uses the same controls and guards as the ribbon and property UI.
export function commandMenu({
  host,
  layoutControls,
  resetLayout,
  activateCanvas,
  panel,
  getProject,
  canAct,
  hasDraft,
  selectEntities,
  viewport,
}) {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = mac ? "⌘" : "Ctrl+";
  const shortcutLabel = (key) =>
    (key || "")
      .replace("Mod+", mod)
      .replaceAll("Alt+", mac ? "⌥" : "Alt+")
      .replaceAll("Shift+", mac ? "⇧" : "Shift+")
      .replace("Enter", mac ? "↵" : "Enter");
  const selected = () => viewport.selection.size > 0;
  const editingBlocked = () => !canAct() || hasDraft();
  const cmd = (label, source, shortcut, options = {}) => ({
    label,
    source,
    shortcut,
    ...options,
  });
  const layout = (label, selector, shortcut) =>
    cmd(label, selector, shortcut, {
      check: () => $(selector)?.getAttribute("aria-pressed") === "true",
    });
  const group = (name) => `[data-group="${name}"]`;
  function resultFamily(value) {
    // Expose the component and scale controls when selecting a result family.
    if (
      layoutControls
        .querySelector('[data-layout="toolbar"]')
        .getAttribute("aria-pressed") !== "true"
    )
      layoutControls.querySelector('[data-layout="toolbar"]').click();
    const select = $("#result-family");
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    panel("canvas");
  }
  const menus = [
    [
      "File",
      [
        cmd("New frame", "#new-project", "Mod+Alt+N", { blocked: hasDraft }),
        cmd("New planar portal…", "#new-portal", "Mod+Alt+P", {
          blocked: hasDraft,
        }),
        cmd("Open project…", "#open-project", "Mod+O", { blocked: hasDraft }),
        cmd("Worked examples…", "#worked-examples", null, {
          blocked: hasDraft,
        }),
        null,
        cmd("Download project", "#export-project", "Mod+S"),
        cmd("Export calculation report", "#export-report", "Mod+Shift+E"),
        cmd("Export results CSV", "#export-csv"),
        null,
        cmd("Projects home", "#home", null, {
          blocked: () => hasDraft() || $("#new-project").disabled,
        }),
      ],
    ],
    [
      "Edit",
      [
        cmd("Undo", "#undo", "Mod+Z"),
        cmd("Redo", "#redo", "Mod+Shift+Z"),
        null,
        {
          label: "Select all geometry",
          shortcut: "Mod+A",
          blocked: editingBlocked,
          action: () =>
            selectEntities(
              [...getProject().nodes, ...getProject().members].map((x) => x.id),
            ),
        },
        {
          label: "Clear selection",
          blocked: () => editingBlocked() || !selected(),
          action: () => selectEntities([]),
        },
        {
          label: "Selection properties",
          shortcut: "Alt+Enter",
          action: () => {
            panel("properties");
            $('[data-inspector-tab="properties"]').click();
            $("#inspector-content").tabIndex = -1;
            $("#inspector-content").focus();
          },
        },
        null,
        cmd("Move selection", "#canvas-move", "M", {
          blocked: () => editingBlocked() || !selected(),
          canvas: true,
        }),
        cmd("Copy selection", "#canvas-copy", "C", {
          blocked: () => editingBlocked() || !selected(),
          canvas: true,
        }),
        cmd("Delete selection…", "#canvas-delete", "Delete", {
          blocked: () => editingBlocked() || !selected(),
          canvas: true,
        }),
        cmd("Precision edit…", "#cad-tools", null, { blocked: editingBlocked }),
      ],
    ],
    [
      "View",
      [
        layout("Canvas", '[data-panel="canvas"]'),
        layout("Model tree", '[data-panel="model"]', "Mod+Alt+1"),
        layout("Properties", '[data-panel="properties"]', "Mod+Alt+2"),
        layout("Results panel", '[data-panel="results"]', "Mod+Alt+3"),
        null,
        layout("Ribbon", '[data-layout="ribbon"]'),
        layout("Canvas toolbar", '[data-layout="toolbar"]'),
        layout("Focus canvas", "#focus-canvas", "Mod+Shift+F"),
        { label: "Reset layout", action: resetLayout },
        null,
        cmd("Fit model", "#fit", "Home", { canvas: true }),
        cmd("Plan", "#view-plan", "1", { canvas: true }),
        cmd("Elevation", "#view-elevation", "2", { canvas: true }),
        cmd("3D view", "#view-3d", "3", { canvas: true }),
        cmd("Pan", "#pan-tool", "H", { canvas: true }),
        cmd("Orbit", "#orbit-tool", "O", { canvas: true }),
        null,
        layout("Local axes", "#axes-toggle"),
        layout("Dimensions", "#dimensions-toggle"),
        cmd("Recreate viewport", "#reset-viewport"),
      ],
    ],
    [
      "Model",
      [
        cmd("Select", "#select-tool", "V", { canvas: true }),
        cmd("Draw member", "#draw-toggle", "D", {
          blocked: editingBlocked,
          canvas: true,
        }),
        cmd("Place node", "#add-node-tool", "N", {
          blocked: editingBlocked,
          canvas: true,
        }),
        cmd("Place support", "#add-support-tool", "S", {
          blocked: editingBlocked,
          canvas: true,
        }),
        cmd("Place load", "#add-load-tool", "L", {
          blocked: editingBlocked,
          canvas: true,
        }),
        cmd("Measure", "#measure-tool", "Q", { canvas: true }),
        null,
        cmd("Split member", "#canvas-split", null, {
          blocked: editingBlocked,
          canvas: true,
        }),
        cmd("Connect / split / merge…", "#topology", null, {
          blocked: editingBlocked,
        }),
        null,
        ...[
          ["Nodes…", "nodes"],
          ["Members…", "members"],
          ["Supports…", "supports"],
          ["Materials…", "materials"],
          ["Sections…", "sections"],
          ["Loads…", "loads"],
          ["Load cases…", "loadCases"],
          ["Combinations…", "combinations"],
        ].map(([label, key]) =>
          cmd(label, group(key), null, { blocked: editingBlocked }),
        ),
      ],
    ],
    [
      "Analysis",
      [
        cmd("Analyse", "#analyse", "Mod+Enter"),
        cmd("Cancel analysis", "#cancel", null, {
          blocked: () => $("#cancel").hidden,
        }),
        null,
        cmd("Results table", "#show-results"),
        {
          label: "Member results",
          action: () => {
            panel("properties");
            $('[data-inspector-tab="forces"]').click();
          },
        },
        null,
        { label: "Model & deformation", action: () => resultFamily("shape") },
        { label: "Member forces", action: () => resultFamily("forces") },
        { label: "Member moments", action: () => resultFamily("moments") },
        null,
        cmd("Export calculation report", "#export-report"),
        cmd("Export results CSV", "#export-csv"),
      ],
    ],
    [
      "Help",
      [
        {
          label: "Keyboard shortcuts",
          shortcut: "F1",
          action: () => {
            shortcutDialog.showModal();
            title.focus();
          },
        },
        cmd("Capabilities & assumptions", "#help"),
      ],
    ],
  ];
  const bar = document.createElement("nav");
  bar.className = "application-menubar";
  bar.setAttribute("role", "menubar");
  bar.setAttribute("aria-label", "Application menu");
  host.prepend(bar);
  const popup = document.createElement("div");
  popup.className = "application-menu";
  popup.id = "application-menu";
  popup.setAttribute("role", "menu");
  popup.hidden = true;
  document.body.append(popup);
  let openIndex = -1,
    returnFocus;
  let activeEntries = [];
  let switchedByHover = false;
  const headings = [];
  const disabled = (entry) =>
    !!entry.blocked?.() ||
    (entry.source && (!$(entry.source) || $(entry.source).disabled));
  function close(restore = true) {
    const wasOpen = openIndex >= 0;
    popup.hidden = true;
    headings.forEach((b) => b.setAttribute("aria-expanded", "false"));
    openIndex = -1;
    switchedByHover = false;
    if (restore && wasOpen && returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }
  function position() {
    const rect = headings[openIndex].getBoundingClientRect();
    popup.style.left =
      Math.max(4, Math.min(rect.left, innerWidth - popup.offsetWidth - 4)) +
      "px";
    popup.style.top = rect.bottom + 2 + "px";
    popup.style.maxHeight =
      Math.max(100, innerHeight - rect.bottom - 10) + "px";
  }
  function execute(entry) {
    if (disabled(entry)) return;
    close();
    if (entry.canvas) {
      activateCanvas();
      viewport.canvas.focus();
    }
    if (entry.action) entry.action();
    else $(entry.source).click();
  }
  function open(index, last = false) {
    if (openIndex < 0) returnFocus = document.activeElement;
    openIndex = index;
    headings.forEach((b, i) => {
      b.tabIndex = i === index ? 0 : -1;
      b.setAttribute("aria-expanded", String(i === index));
    });
    popup.setAttribute("aria-labelledby", headings[index].id);
    popup.replaceChildren();
    activeEntries = [];
    for (const entry of menus[index][1]) {
      if (!entry) {
        const separator = document.createElement("div");
        separator.setAttribute("role", "separator");
        popup.append(separator);
        continue;
      }
      // Canvas is the narrow-screen way back from a panel; always useful on desktop too.
      const button = document.createElement("button");
      button.type = "button";
      button.tabIndex = -1;
      button.setAttribute(
        "role",
        entry.check ? "menuitemcheckbox" : "menuitem",
      );
      button.setAttribute("aria-disabled", String(!!disabled(entry)));
      if (entry.check)
        button.setAttribute("aria-checked", String(entry.check()));
      const mark = document.createElement("span");
      mark.className = "menu-check";
      mark.setAttribute("aria-hidden", "true");
      mark.textContent = entry.check?.() ? "✓" : "";
      const label = document.createElement("span");
      label.textContent =
        entry.source === "#focus-canvas" && entry.check()
          ? "Restore layout"
          : entry.label;
      const key = document.createElement("kbd");
      key.textContent = shortcutLabel(entry.shortcut);
      key.setAttribute("aria-hidden", "true");
      button.append(mark, label, key);
      if (entry.shortcut)
        button.setAttribute(
          "aria-keyshortcuts",
          entry.shortcut.replace("Mod", mac ? "Meta" : "Control"),
        );
      button.onclick = () => execute(entry);
      popup.append(button);
      activeEntries.push([button, entry]);
    }
    popup.hidden = false;
    position();
    const items = popup.querySelectorAll("button");
    (last ? items[items.length - 1] : items[0]).focus();
  }
  menus.forEach(([name], index) => {
    const heading = document.createElement("button");
    heading.type = "button";
    heading.id = "menu-" + name.toLowerCase();
    heading.textContent = name;
    heading.setAttribute("role", "menuitem");
    heading.setAttribute("aria-haspopup", "menu");
    heading.setAttribute("aria-controls", popup.id);
    heading.setAttribute("aria-expanded", "false");
    heading.tabIndex = index === 0 ? 0 : -1;
    heading.onclick = () => {
      const toggleClosed = openIndex === index && !switchedByHover;
      switchedByHover = false;
      if (toggleClosed) close();
      else open(index);
    };
    heading.onpointerenter = () => {
      if (openIndex >= 0 && openIndex !== index) {
        open(index);
        switchedByHover = true;
      }
    };
    heading.onpointerleave = () => {
      switchedByHover = false;
    };
    heading.onkeydown = (event) => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % menus.length;
      else if (event.key === "ArrowLeft")
        next = (index + menus.length - 1) % menus.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = menus.length - 1;
      else if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        open(index, event.key === "ArrowUp");
        return;
      } else return;
      event.preventDefault();
      headings.forEach((b, i) => (b.tabIndex = i === next ? 0 : -1));
      headings[next].focus();
    };
    headings.push(heading);
    bar.append(heading);
  });
  popup.onkeydown = (event) => {
    const items = [...popup.querySelectorAll("button")];
    const index = items.indexOf(document.activeElement);
    let next;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      const heading = headings[openIndex];
      close(false);
      heading.focus();
      return;
    }
    if (event.key === "Tab") {
      const heading = headings[openIndex];
      close(false);
      heading.focus();
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      open(
        (openIndex + (event.key === "ArrowRight" ? 1 : menus.length - 1)) %
          menus.length,
      );
      return;
    }
    if (event.key === "ArrowDown") next = (index + 1) % items.length;
    else if (event.key === "ArrowUp")
      next = (index + items.length - 1) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      event.key !== " "
    ) {
      next = items.findIndex(
        (b, i) =>
          i > index &&
          b.children[1].textContent
            .toLowerCase()
            .startsWith(event.key.toLowerCase()),
      );
      if (next < 0)
        next = items.findIndex((b) =>
          b.children[1].textContent
            .toLowerCase()
            .startsWith(event.key.toLowerCase()),
        );
      if (next < 0) return;
    } else return;
    event.preventDefault();
    items[next].focus();
  };
  document.addEventListener("pointerdown", (event) => {
    if (
      !popup.hidden &&
      !popup.contains(event.target) &&
      !bar.contains(event.target)
    )
      close(false);
  });
  document.addEventListener("focusin", (event) => {
    if (
      !popup.hidden &&
      !popup.contains(event.target) &&
      !bar.contains(event.target)
    )
      close(false);
  });
  window.addEventListener("resize", () => {
    if (!popup.hidden) position();
  });
  const shortcutDialog = document.createElement("dialog");
  shortcutDialog.id = "shortcut-help";
  shortcutDialog.setAttribute("aria-labelledby", "shortcut-title");
  const title = document.createElement("h2");
  title.id = "shortcut-title";
  title.tabIndex = -1;
  title.textContent = "Keyboard shortcuts";
  const introduction = document.createElement("p");
  introduction.textContent =
    "F10 focuses the menu bar. Use arrow keys to navigate, Enter to activate, and Escape to close. Modelling shortcuts apply outside text fields and dialogs. Projects save locally automatically; Download project creates a portable backup.";
  const list = document.createElement("dl");
  for (const [name, entries] of menus)
    for (const entry of entries) {
      if (!entry?.shortcut) continue;
      const term = document.createElement("dt"),
        description = document.createElement("dd");
      term.textContent = `${name} · ${entry.label}`;
      description.textContent = shortcutLabel(entry.shortcut);
      list.append(term, description);
    }
  const dismiss = document.createElement("button");
  dismiss.textContent = "Close";
  dismiss.onclick = () => shortcutDialog.close();
  shortcutDialog.append(title, introduction, list, dismiss);
  document.body.append(shortcutDialog);
  const shortcuts = menus.flatMap(([, entries]) =>
    entries.filter((entry) => entry?.shortcut),
  );
  for (const entry of shortcuts)
    if (
      entry.source &&
      $(entry.source) &&
      !$(entry.source).closest("#landing")
    ) {
      $(entry.source).title =
        `${entry.label} (${shortcutLabel(entry.shortcut)})`;
    }
  window.addEventListener(
    "keydown",
    (event) => {
      if ($("#workspace").hidden || document.querySelector("dialog[open]"))
        return;
      if (
        event.key === "F10" &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        close(false);
        headings.forEach(
          (button, index) => (button.tabIndex = index === 0 ? 0 : -1),
        );
        headings[0].focus();
        return;
      }
      if (
        !popup.hidden ||
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.target.closest(
          'input, textarea, select, [contenteditable="true"]',
        )
      )
        return;
      const key = /^Key[A-Z]$/.test(event.code)
        ? event.code.slice(3)
        : /^Digit[0-9]$/.test(event.code)
          ? event.code.slice(5)
          : event.key;
      const entry = shortcuts.find((command) => {
        const parts = command.shortcut.split("+");
        return (
          parts.at(-1).toLowerCase() === key.toLowerCase() &&
          parts.includes("Mod") === (mac ? event.metaKey : event.ctrlKey) &&
          !(mac ? event.ctrlKey : event.metaKey) &&
          parts.includes("Alt") === event.altKey &&
          parts.includes("Shift") === event.shiftKey
        );
      });
      if (!entry) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      execute(entry);
    },
    { capture: true },
  );
  const stateObserver = new MutationObserver(() => {
    if ($("#workspace").hidden) {
      close(false);
      return;
    }
    for (const [button, entry] of activeEntries) {
      button.setAttribute("aria-disabled", String(!!disabled(entry)));
      if (entry.check) {
        button.setAttribute("aria-checked", String(entry.check()));
        button.firstElementChild.textContent = entry.check() ? "✓" : "";
      }
    }
  });
  stateObserver.observe($("#workspace"), {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["disabled", "aria-pressed", "hidden"],
  });
  return { close };
}
