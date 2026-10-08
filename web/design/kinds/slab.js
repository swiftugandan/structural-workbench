/** Slab design object: its own plate analysis, then EC2 design (ADR 0021/0029). */
import { html, raw } from "../../core/html.js";
import { ec2SlabPane } from "../../design-presentation.js";
import { plateRunsHtml } from "../../reports/report.js";
import { platePane, plateSection } from "../../slab-plate.js";
import { concreteSchedule } from "./shared.js";

/** Plan of the panel with the chosen layer's direction, 300 × 230. */
function sketch(d, { face }) {
  const v = d.inputs;
  const w = (230 * v.length) / Math.max(v.length, v.width),
    h = (160 * v.width) / Math.max(v.length, v.width),
    x = (300 - w) / 2,
    y = (200 - h) / 2;
  const vertical = face.endsWith("Y");
  const lines = Array.from({ length: 11 }, (_, i) =>
    vertical
      ? html`<path d="M${x + (i * w) / 10},${y}v${h}" stroke="#85a8be"/>`
      : html`<path d="M${x},${y + (i * h) / 10}h${w}" stroke="#85a8be"/>`,
  );
  return html`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e1edf5" stroke="#516b82"/>${lines}<rect x="${150 - (w * v.openingLength) / v.length / 2}" y="${100 - (h * v.openingWidth) / v.width / 2}" width="${(w * v.openingLength) / v.length}" height="${(h * v.openingWidth) / v.width}" fill="white" stroke="#c17f26"/><text x="150" y="215" text-anchor="middle">${face} · direction illustration</text>`;
}

export default {
  kind: "slab",
  defaultSource: () => "plate",
  sources: [
    ["plate", "Plate analysis of this panel"],
    ["synthetic", "Synthetic actions · illustration"],
  ],
  readiness: (source) =>
    source === "plate"
      ? "EC2 slab design runs on this panel's plate analysis (demonstration)"
      : "Synthetic actions · EC2 slab design needs the plate analysis",
  solid: (d, focus) => focus,
  caption: (d, { face }) => `${face} · illustrative grid, not FE mesh`,
  sketch,
  inspector: {
    geometry: [
      "length",
      "width",
      "thickness",
      "cover",
      "openingLength",
      "openingWidth",
    ],
    special: { title: "Mesh settings", keys: ["meshSize"] },
    code: { bySpan: true, flatSlab: true, columnSize: true },
    plate: (d, template) => raw(plateSection(d, template)),
    face: true,
    checklist: ["Resistance from the plate analysis"],
  },
  panes: [
    { id: "summary", label: "Design summary" },
    {
      id: "actions",
      label: "Plate actions",
      render: ({ run, project, plateField, plateRecovery }) =>
        run?.plateAnalysis?.status === "evaluated"
          ? raw(
              platePane(
                run,
                plateField,
                {
                  loadCases: (project?.loadCases || []).map((c) => ({
                    id: c.id,
                    label: `${c.id} · ${c.name}`,
                  })),
                },
                plateRecovery,
              ),
            )
          : undefined,
    },
    { id: "details", label: "Calculation details" },
    { id: "reinforcement", label: "Reinforcement" },
    { id: "schedule", label: "Schedule" },
    {
      id: "ec2",
      label: "EC2 checks",
      render: ({ run }) => raw(ec2SlabPane(run)),
    },
  ],
  schedule: concreteSchedule,
  report: {
    order: 6,
    html: (project, runs, e) => plateRunsHtml(runs, e),
    // A plate analysis is the panel's own; it binds to the model, not a result.
    accepts: (run, { modelHash }) =>
      run.modelHash === modelHash && run.plateAnalysis?.status === "evaluated",
  },
};
