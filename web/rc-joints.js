/** RC beam–column joint clashes (M16, ADR 0032): the Rust report for the
 * joints the active draft belongs to. Presentation only. */
import { escape as esc } from "./reports/report.js";
import { entityLabel } from "./entity-labels.js";

const mm = (v) => `${(v * 1000).toFixed(1)} mm`;

export function jointsPane(report, d, project) {
  if (!report) return "<p>Checking the joints…</p>";
  const label = (id) => {
    const draft = project.designPreviews.find((x) => x.id === id);
    return draft?.targetId ? entityLabel(project, draft.targetId) : id;
  };
  const mine = report.joints.filter(
    (j) => j.column === d.id || j.beams.includes(d.id),
  );
  if (!mine.length)
    return `<p data-testid="joint-none">This draft meets no other bound RC draft at a node. Bind the beams and columns that frame together to check their bars.</p>`;
  const body = mine
    .map(
      (j) =>
        `<section data-testid="joint" data-node="${esc(j.node)}" data-status="${esc(j.status)}"><h4>Node ${esc(entityLabel(project, j.node))} · <span class="status-text ${j.status === "clear" ? "pass" : j.status === "clash" ? "fail" : "indeterminate"}">${esc(j.status.toUpperCase())}</span></h4><p>${j.column ? `Column ${esc(label(j.column))}; ` : ""}beams ${j.beams.map((b) => esc(label(b))).join(", ")} · ${j.pairsChecked} bar pairs checked</p>${
          j.clashes.length
            ? `<table><thead><tr><th>Kind</th><th>Face</th><th>Distance</th><th>Needed</th><th>Short by</th><th>What to change</th></tr></thead><tbody>${j.clashes
                .map(
                  (c) =>
                    `<tr data-testid="joint-clash" data-kind="${esc(c.kind)}" data-face="${esc(c.face)}"><td>${c.kind === "beamBeam" ? "Crossing beams" : "Beam vs column bar"}</td><td>${esc(c.face)}</td><td data-si="${c.distance}">${mm(c.distance)}</td><td>${mm(c.required)}</td><td data-si="${c.shortfall}">${mm(c.shortfall)}</td><td>${esc(c.message)}</td></tr>`,
                )
                .join("")}</tbody></table>`
            : "<p>No bar clashes at this node.</p>"
        }${j.notes.map((n) => `<p class="notice-small">${esc(n)}</p>`).join("")}</section>`,
    )
    .join("");
  return `<h4>Joint bar clashes <span class="design-tag">EN 1992-1-1 8.2 · geometry</span></h4>${body}<ul class="design-note">${report.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>`;
}
