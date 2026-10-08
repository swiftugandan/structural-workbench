/** Pad footing design object (EC2 UK demonstration, ADR 0028). */
import { html, raw } from "../../core/html.js";
import {
  contactDrawing,
  ec2FootingPane,
  pretty,
  sourceLabel,
} from "../../design-presentation.js";
import { footingRunsHtml } from "../../reports/report.js";
import { concreteSchedule, memberSources, modelReadiness } from "./shared.js";

/** Plan of the base and the column, 300 × 230. */
function sketch(d) {
  const v = d.inputs;
  const w = (230 * v.length) / Math.max(v.length, v.width),
    h = (160 * v.width) / Math.max(v.length, v.width),
    x = (300 - w) / 2,
    y = (200 - h) / 2;
  return html`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e4dfd4" stroke="#796f58"/><rect x="${150 - (w * v.columnWidth) / v.length / 2}" y="${100 - (h * v.columnDepth) / v.width / 2}" width="${(w * v.columnWidth) / v.length}" height="${(h * v.columnDepth) / v.width}" fill="#8499aa"/><text x="150" y="215" text-anchor="middle">Contact INDETERMINATE · no pressure field</text>`;
}

function soilPane({ run, d, sketch }) {
  const k = run?.codeProfilePreview?.design?.uls?.contact;
  const contact = contactDrawing(run, d);
  return html`<div class="reinforcement-layout"><article><h4>Soil / contact</h4>${
    contact
      ? raw(contact)
      : html`<svg class="section-drawing" viewBox="0 0 300 230">${sketch}</svg><p class="design-note">Contact INDETERMINATE · run on model actions to solve the ground contact.</p>`
  }</article><article><h4>External soil inputs</h4><dl class="design-provenance-grid"><dt>Allowable bearing input</dt><dd>${pretty(d.inputs.bearingPressure / 1000)} kPa</dd><dt>Origin</dt><dd>${sourceLabel(d.inputSources?.bearingPressure || d.inputSource)}</dd><dt>Reference</dt><dd>${d.soilReference}</dd><dt>Workbench soil capacity</dt><dd>Not calculated</dd>${
    k
      ? html`<dt>q<sub>min</sub> / q<sub>max</sub> (ULS, column only)</dt><dd data-testid="footing-qmax">${pretty(k.qMin / 1000, 4)} / ${pretty(k.qMax / 1000, 4)} kPa</dd><dt>Contact area</dt><dd>${pretty(k.contactArea, 4)} m² (${pretty(100 * k.contactFraction, 3)} %)</dd>`
      : html`<dt>q<sub>min</sub> / q<sub>max</sub></dt><dd>Unavailable</dd><dt>Contact area</dt><dd>Unavailable</dd>`
  }</dl></article></div>`;
}

export default {
  kind: "padFooting",
  defaultSource: (d) => (d?.targetId ? "model" : "synthetic"),
  sources: memberSources,
  readiness: modelReadiness(
    "EC2 checks run on the model actions (demonstration)",
    "EC2 checks need model actions",
  ),
  solid: (d, focus) => focus,
  caption: () => "Contact INDETERMINATE · no pressure field",
  sketch,
  inspector: {
    geometry: [
      "length",
      "width",
      "thickness",
      "columnWidth",
      "columnDepth",
      "cover",
    ],
    special: {
      title: "Soil parameters",
      keys: ["bearingPressure", "embedment", "soilUnitWeight"],
    },
    soilReference: true,
    code: { footing: true },
    checklist: ["Contact indeterminate"],
  },
  read: (host, d) => ({
    soilReference:
      host.querySelector("#preview-soil")?.value ?? d.soilReference,
  }),
  summaryBasis: (run, d) =>
    html`<p>Contact: <b data-testid="footing-contact-state">${String(run?.contactState || "indeterminate").toUpperCase()}</b></p><p>Soil bearing input: ${run?.soilProvenance?.source || d.inputSources?.bearingPressure || d.inputSource}; never computed by Workbench.</p>`,
  panes: [
    { id: "summary", label: "Design summary" },
    { id: "actions", label: "Design actions" },
    { id: "details", label: "Calculation details" },
    { id: "reinforcement", label: "Reinforcement" },
    { id: "schedule", label: "Schedule" },
    { id: "soil", label: "Soil / contact", render: soilPane },
    {
      id: "ec2",
      label: "EC2 checks",
      render: ({ run }) => raw(ec2FootingPane(run)),
    },
  ],
  schedule: concreteSchedule,
  report: { order: 3, html: footingRunsHtml },
};
