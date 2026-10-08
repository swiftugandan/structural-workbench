/** RC beam–column joint clashes (M16, ADR 0032): the Rust report for the
 * joints the active draft belongs to. Rust sends geometry and ids; the page
 * names members by their labels and writes the sentences (ADR 0033). */
import { html } from "./core/html.js";
import { entityLabel } from "./entity-labels.js";

const mm = (v) => `${(v * 1000).toFixed(1)} mm`;

/** What the engineer should change, in words, for one clash. */
export function clashAdvice(c, label) {
  if (c.kind === "beamBeam")
    return `${label(c.beamMember)} and ${label(c.otherMember)} ${c.face} bars cross ${mm(c.distance)} apart: move one layer by ${mm(c.shortfall)}.`;
  return `${label(c.beamMember)} ${c.face} bar ${c.beamBar} passes ${mm(c.distance)} from column ${label(c.columnMember)} bar ${c.columnBar}: ${mm(c.required)} needed (${c.clause}).`;
}

const STATUS_CLASS = { clear: "pass", clash: "fail" };

export function jointsPane(report, d, project) {
  if (!report) return html`<p>Checking the joints…</p>`;
  const label = (id) => entityLabel(project, id);
  const draftLabel = (id) => {
    const draft = project.designPreviews.find((x) => x.id === id);
    return draft?.targetId ? label(draft.targetId) : id;
  };
  const mine = report.joints.filter(
    (j) => j.column === d.id || j.beams.includes(d.id),
  );
  if (!mine.length)
    return html`<p data-testid="joint-none">This draft meets no other bound RC draft at a node. Bind the beams and columns that frame together to check their bars.</p>`;
  const joint = (j) =>
    html`<section data-testid="joint" data-node="${j.node}" data-status="${j.status}"><h4>Node ${label(j.node)} · <span class="status-text ${STATUS_CLASS[j.status] || "indeterminate"}">${j.status.toUpperCase()}</span></h4><p>${j.column && `Column ${draftLabel(j.column)}; `}beams ${j.beams.map(draftLabel).join(", ")} · ${j.pairsChecked} bar pairs checked</p>${
      j.clashes.length
        ? html`<table><thead><tr><th>Kind</th><th>Face</th><th>Distance</th><th>Needed</th><th>Short by</th><th>What to change</th></tr></thead><tbody>${j.clashes.map(
            (c) =>
              html`<tr data-testid="joint-clash" data-kind="${c.kind}" data-face="${c.face}"><td>${c.kind === "beamBeam" ? "Crossing beams" : "Beam vs column bar"}</td><td>${c.face}</td><td data-si="${c.distance}">${mm(c.distance)}</td><td>${mm(c.required)}</td><td data-si="${c.shortfall}">${mm(c.shortfall)}</td><td>${clashAdvice(c, label)}</td></tr>`,
          )}</tbody></table>`
        : html`<p>No bar clashes at this node.</p>`
    }${j.notes.map((n) => html`<p class="notice-small">${n}</p>`)}</section>`;
  return html`<h4>Joint bar clashes <span class="design-tag">EN 1992-1-1 8.2 · geometry</span></h4>${mine.map(joint)}<ul class="design-note">${report.assumptions.map((a) => html`<li>${a}</li>`)}</ul>`;
}
