/**
 * A tab strip that never clips (ADR 0033). The tabs scroll horizontally; step
 * buttons appear at an overflowing edge, a "More" menu lists every tab
 * without moving it, and the active tab is kept in view. The tabs stay the
 * same elements, so their ids, data attributes and handlers are untouched.
 *
 *     enhanceTabStrip(container.querySelector(".tab-scroll"), "Result views");
 *
 * Idempotent: enhancing an enhanced strip only refreshes it.
 */
import { popupMenu } from "./menu.js";

const ACTIVE =
  '[aria-pressed="true"], [aria-selected="true"], .active, [aria-current="true"]';

function activeTab(scroll) {
  return [...scroll.children].find((el) => el.matches(ACTIVE));
}

export function enhanceTabStrip(scroll, label) {
  if (scroll.__tabStrip) {
    scroll.__tabStrip.refresh();
    return scroll.__tabStrip;
  }
  scroll.classList.add("tab-scroll");
  const strip = document.createElement("div");
  strip.className = "tab-strip";
  scroll.replaceWith(strip);
  const button = (cls, text, aria) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `tab-step ${cls}`;
    b.textContent = text;
    b.setAttribute("aria-label", aria);
    b.tabIndex = -1; // keyboard users reach every tab directly
    return b;
  };
  const prev = button("tab-step-prev", "‹", `Scroll ${label} left`);
  const next = button("tab-step-next", "›", `Scroll ${label} right`);
  const more = button("tab-more", "⋯", `All ${label}`);
  more.tabIndex = 0;
  more.setAttribute("aria-haspopup", "menu");
  strip.append(prev, scroll, next, more);

  function refresh() {
    const max = scroll.scrollWidth - scroll.clientWidth;
    const overflowing = max > 1;
    strip.toggleAttribute("data-overflowing", overflowing);
    strip.toggleAttribute("data-at-start", scroll.scrollLeft <= 1);
    strip.toggleAttribute("data-at-end", scroll.scrollLeft >= max - 1);
  }
  function reveal() {
    const tab = activeTab(scroll);
    if (!tab) return;
    const t = tab.offsetLeft - scroll.offsetLeft,
      end = t + tab.offsetWidth;
    if (t < scroll.scrollLeft) scroll.scrollLeft = t - 8;
    else if (end > scroll.scrollLeft + scroll.clientWidth)
      scroll.scrollLeft = end - scroll.clientWidth + 8;
    refresh();
  }
  const step = (dir) =>
    scroll.scrollBy({
      left: dir * scroll.clientWidth * 0.8,
      behavior: "smooth",
    });
  prev.onclick = () => step(-1);
  next.onclick = () => step(1);
  more.onclick = () =>
    popupMenu(
      more,
      [...scroll.children]
        .filter((el) => el.matches("button") && !el.hidden)
        .map((tab) => ({
          label: tab.textContent.trim(),
          checked: tab.matches(ACTIVE),
          disabled: tab.disabled,
          run: () => {
            tab.click();
            reveal();
          },
        })),
      label,
    );
  scroll.addEventListener("scroll", refresh, { passive: true });
  // A vertical wheel scrolls an overflowing strip sideways.
  scroll.addEventListener(
    "wheel",
    (e) => {
      if (!strip.hasAttribute("data-overflowing") || e.deltaX) return;
      scroll.scrollLeft += e.deltaY;
      e.preventDefault();
    },
    { passive: false },
  );
  new ResizeObserver(refresh).observe(scroll);
  new MutationObserver(reveal).observe(scroll, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-pressed", "aria-selected", "class", "hidden"],
  });
  refresh();
  reveal();
  scroll.__tabStrip = { refresh: reveal, strip };
  return scroll.__tabStrip;
}
