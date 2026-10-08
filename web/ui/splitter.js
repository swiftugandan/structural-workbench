/**
 * Resizable region edges (ADR 0033). A splitter measures one edge of a
 * panel and writes the panel's size to a CSS custom property on `target`.
 * It is appended to `host` (by default the panel; the workbench puts it in
 * the grid so it never scrolls with a panel's content). Pointer
 * drag, arrow keys (Shift for larger steps), Home/End for the limits, and
 * double-click or Enter to restore the stylesheet default. `role="separator"` carries
 * the value for assistive technology.
 *
 *     splitter({ panel, edge: "right", target: grid, property: "--explorer-w",
 *                min: 160, max: 480, initial: saved ?? null,
 *                label: "Model explorer width", onChange: (px) => save(px) });
 *
 * `onChange(null)` means the default was restored.
 */
export function splitter({
  panel,
  edge,
  target,
  property,
  min,
  max,
  initial = null,
  label,
  name = edge,
  host = panel,
  onChange = () => {},
}) {
  const vertical = edge === "top" || edge === "bottom";
  const handle = document.createElement("div");
  handle.className = `splitter splitter-${name}`;
  handle.tabIndex = 0;
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-label", label);
  handle.setAttribute("aria-orientation", vertical ? "horizontal" : "vertical");
  handle.setAttribute("aria-valuemin", String(min));
  handle.title = `${label} · drag, or use the arrow keys; double-click restores the default`;
  host.append(handle);

  // null: the stylesheet's default (it differs by breakpoint) applies.
  let chosen = null;
  const limit = () =>
    vertical ? Math.max(min, Math.min(max, innerHeight * 0.7)) : max;
  const current = () => {
    const r = panel.getBoundingClientRect();
    return Math.round(vertical ? r.height : r.width);
  };
  function describe() {
    handle.setAttribute("aria-valuemax", String(Math.round(limit())));
    handle.setAttribute("aria-valuenow", String(chosen ?? current()));
  }
  function set(px, commit = true) {
    chosen = Math.round(Math.min(limit(), Math.max(min, px)));
    target.style.setProperty(property, `${chosen}px`);
    describe();
    if (commit) onChange(chosen);
  }
  function reset() {
    chosen = null;
    target.style.removeProperty(property);
    describe();
    onChange(null);
  }
  if (initial != null) set(initial, false);
  else requestAnimationFrame(describe);

  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add("dragging");
    const r = panel.getBoundingClientRect();
    const move = (ev) => {
      const px =
        edge === "right"
          ? ev.clientX - r.left
          : edge === "left"
            ? r.right - ev.clientX
            : edge === "top"
              ? r.bottom - ev.clientY
              : ev.clientY - r.top;
      set(px, false);
    };
    const up = () => {
      handle.classList.remove("dragging");
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      if (chosen != null) onChange(chosen);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  });
  // Arrow keys move the edge in its own direction.
  const grow = {
    right: ["ArrowRight", "ArrowLeft"],
    left: ["ArrowLeft", "ArrowRight"],
    top: ["ArrowUp", "ArrowDown"],
    bottom: ["ArrowDown", "ArrowUp"],
  }[edge];
  handle.addEventListener("keydown", (e) => {
    const stepPx = e.shiftKey ? 64 : 16;
    const now = chosen ?? current();
    if (e.key === grow[0]) set(now + stepPx);
    else if (e.key === grow[1]) set(now - stepPx);
    else if (e.key === "Home") set(min);
    else if (e.key === "End") set(limit());
    else if (e.key === "Enter") reset();
    else return;
    e.preventDefault();
  });
  handle.addEventListener("dblclick", reset);
  addEventListener("resize", () =>
    chosen != null ? set(chosen, false) : describe(),
  );
  return { set, reset, get: () => chosen ?? current(), handle };
}
