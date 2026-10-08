/**
 * Toolbar disclosures (ADR 0033): a `<details>` whose panel floats over the
 * canvas. One is open at a time; Escape or a click outside closes it and
 * focus returns to its summary. The panel's controls keep their ids.
 *
 *     disclosure(document.querySelector("#view-scope"));
 */
const all = new Set();

export function disclosure(details) {
  all.add(details);
  const summary = details.querySelector(":scope > summary");
  details.addEventListener("toggle", () => {
    summary.setAttribute("aria-expanded", String(details.open));
    if (details.open) for (const d of all) if (d !== details) d.open = false;
  });
  document.addEventListener("pointerdown", (e) => {
    if (details.open && !details.contains(e.target)) details.open = false;
  });
  details.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !details.open) return;
    e.stopPropagation();
    details.open = false;
    summary.focus();
  });
  summary.setAttribute("aria-expanded", String(details.open));
  return details;
}
