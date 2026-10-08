/** RC beam design object (EC2 UK demonstration, ADR 0016/0026). */
import { html, raw } from "../../core/html.js";
import {
  beamElevation,
  ec2Pane,
  mechanicsPane,
  pretty,
} from "../../design-presentation.js";
import { concretePreviewsHtml } from "../../reports/report.js";
import { jointsPane } from "../../rc-joints.js";
import { concreteSchedule, memberSources, modelReadiness } from "./shared.js";

/** Cross-section with the bar preferences, in a 300 × 230 view box. */
function sketch(d) {
  const v = d.inputs;
  const w = (180 * v.width) / Math.max(v.width, v.depth),
    h = (180 * v.depth) / Math.max(v.width, v.depth),
    x = (300 - w) / 2,
    y = (220 - h) / 2;
  const row = (n, cy) =>
    Array.from(
      { length: n },
      (_, i) =>
        html`<circle cx="${n === 1 ? x + w / 2 : x + 12 + ((w - 24) * i) / (n - 1)}" cy="${cy}" r="4" fill="#1167a2"/>`,
    );
  return html`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#dce6ef" stroke="#516b82"/><rect x="${x + 8}" y="${y + 8}" width="${w - 16}" height="${h - 16}" rx="6" fill="none" stroke="#62798a"/>${row(v.topBarCount, y + 14)}${row(v.bottomBarCount, y + h - 14)}<text x="150" y="218" text-anchor="middle">Bar preference illustration · fit unverified</text>`;
}

export default {
  kind: "rcBeam",
  defaultSource: (d) => (d?.targetId ? "model" : "synthetic"),
  sources: memberSources,
  readiness: modelReadiness(
    "EC2 checks run on the model actions (demonstration)",
    "EC2 checks need model actions",
  ),
  solid: (d, focus) => focus || !!d.targetId,
  caption: () => "Illustrative reinforcement · fit and anchorage unverified",
  sketch,
  inspector: {
    geometry: ["width", "depth", "cover"],
    special: {
      title: "Reinforcement preferences",
      keys: [
        "topBarCount",
        "topBarDiameter",
        "bottomBarCount",
        "bottomBarDiameter",
        "linkDiameter",
        "linkSpacing",
        "linkLegs",
      ],
    },
    anchorage: true,
    mechanics: true,
    proposal: true,
    code: { bySpan: true, quasiPermanent: true },
    checklist: ["Resistance on model actions only"],
  },
  read: (host) => ({
    tensionAnchorageConfirmed: host.querySelector("#preview-anchorage").checked,
  }),
  panes: [
    { id: "summary", label: "Design summary" },
    { id: "actions", label: "Design actions" },
    { id: "details", label: "Calculation details" },
    {
      id: "reinforcement",
      label: "Reinforcement",
      render: ({ d, sketch }) =>
        html`<div class="reinforcement-layout"><article><h4>Longitudinal reinforcement layout <small>· illustration only</small></h4>${raw(beamElevation(d))}<p class="design-note">Preference illustration · not a verified arrangement or construction drawing.</p></article><article><h4>Cross-section</h4><svg class="section-drawing" viewBox="0 0 300 230">${sketch}</svg><p>Cover ${pretty(d.inputs.cover * 1000)} mm · fit, spacing and anchorage unverified.</p></article></div>`,
    },
    {
      id: "mechanics",
      label: "Section mechanics",
      render: ({ run }) => raw(mechanicsPane(run)),
    },
    { id: "ec2", label: "EC2 checks", render: ({ run }) => raw(ec2Pane(run)) },
    {
      id: "joints",
      label: "Joints",
      load: (gateway) => gateway.send("detailJoints", {}),
      render: ({ data, d, project }) => jointsPane(data, d, project),
    },
    { id: "schedule", label: "Schedule" },
  ],
  schedule: concreteSchedule,
  report: { order: 1, html: concretePreviewsHtml },
};
