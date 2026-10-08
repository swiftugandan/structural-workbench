/**
 * A transient menu anchored to a button (ADR 0033): arrow keys, Home/End,
 * Escape and Tab close it and return focus; a click outside closes it. One
 * menu is open at a time.
 *
 *     popupMenu(button, [{ label, run, checked?, disabled? }], "Result views");
 */
let open = null;

export function closeMenu(restoreFocus = true) {
  if (!open) return;
  const { menu, anchor, cleanup } = open;
  open = null;
  cleanup();
  menu.remove();
  anchor.setAttribute("aria-expanded", "false");
  if (restoreFocus && anchor.isConnected) anchor.focus();
}

export function popupMenu(anchor, items, label) {
  const reopening = open?.anchor === anchor;
  closeMenu(false);
  if (reopening) return; // a second click on the anchor closes it
  const menu = document.createElement("div");
  menu.className = "popup-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", label);
  for (const item of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute(
      "role",
      item.checked === undefined ? "menuitem" : "menuitemradio",
    );
    if (item.checked !== undefined)
      b.setAttribute("aria-checked", String(!!item.checked));
    b.disabled = !!item.disabled;
    b.tabIndex = -1;
    b.textContent = item.label;
    b.onclick = () => {
      closeMenu();
      item.run();
    };
    menu.append(b);
  }
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = `${Math.min(r.bottom + 4, innerHeight - menu.offsetHeight - 8)}px`;
  menu.style.left = `${Math.max(8, Math.min(r.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8))}px`;
  anchor.setAttribute("aria-expanded", "true");
  const buttons = () => [...menu.querySelectorAll("button:not(:disabled)")];
  menu.onkeydown = (e) => {
    const list = buttons();
    let i = list.indexOf(document.activeElement);
    if (e.key === "Escape") return (e.preventDefault(), closeMenu());
    if (e.key === "Tab") return closeMenu(false);
    if (e.key === "ArrowDown") i = (i + 1) % list.length;
    else if (e.key === "ArrowUp") i = (i - 1 + list.length) % list.length;
    else if (e.key === "Home") i = 0;
    else if (e.key === "End") i = list.length - 1;
    else return;
    e.preventDefault();
    list[i]?.focus();
  };
  const outside = (e) => {
    if (!menu.contains(e.target) && !anchor.contains(e.target))
      closeMenu(false);
  };
  const dismiss = () => closeMenu(false);
  document.addEventListener("pointerdown", outside, true);
  addEventListener("resize", dismiss);
  open = {
    menu,
    anchor,
    cleanup: () => {
      document.removeEventListener("pointerdown", outside, true);
      removeEventListener("resize", dismiss);
    },
  };
  (menu.querySelector('[aria-checked="true"]') || buttons()[0])?.focus();
  return menu;
}
