/**
 * Status bar indicators that reflect session state (ADR 0033). Storage:
 * best-effort browser storage may be evicted, so the indicator says so and
 * offers the project download; a failed save is shown as an error.
 */
import { popupMenu } from "../ui/menu.js";

const STORAGE = {
  bestEffort: {
    text: "Storage not persistent",
    title:
      "Browser persistence was not granted. Local snapshots may be evicted; download a project backup.",
    tone: "warn",
  },
  failed: {
    text: "Local save failed",
    title: "The last local save failed. Download the project to preserve it.",
    tone: "fail",
  },
};

export function statusBar({ session, exportProject }) {
  const chip = document.querySelector("#storage-status");
  chip.onclick = () =>
    popupMenu(
      chip,
      [{ label: "Download a project backup", run: exportProject }],
      "Storage",
    );
  session.subscribe(["storage"], ({ storage }) => {
    const s = STORAGE[storage];
    chip.hidden = !s;
    if (!s) return;
    chip.textContent = s.text;
    chip.title = s.title;
    chip.setAttribute("aria-label", `${s.text}. ${s.title}`);
    chip.dataset.tone = s.tone;
  });
}
