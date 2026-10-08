/**
 * Fit a toolbar to its width without clipping (ADR 0033). When the content
 * overflows, groups drop their visible labels one at a time, lowest priority
 * first (the last group in `groups` goes first). Buttons keep their text for
 * assistive technology and a tooltip, and stay visible and clickable.
 *
 *     fitToolbar(ribbon, [...ribbon.querySelectorAll(".ribbon-group")]);
 */
export function fitToolbar(container, groups) {
  let scheduled = false;
  function fit() {
    scheduled = false;
    for (const g of groups) g.classList.remove("icons-only");
    for (let i = groups.length - 1; i >= 0; i--) {
      if (container.scrollWidth <= container.clientWidth + 1) break;
      groups[i].classList.add("icons-only");
    }
    container.toggleAttribute(
      "data-overflowing",
      container.scrollWidth > container.clientWidth + 1,
    );
  }
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(fit);
  };
  new ResizeObserver(schedule).observe(container);
  for (const g of groups)
    new MutationObserver(schedule).observe(g, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden"],
    });
  fit();
  return { fit };
}
