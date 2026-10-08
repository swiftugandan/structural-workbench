/** Composite beam through its stages (AISC 360-22 demonstration, ADR 0031). */
import { html, raw } from "../../core/html.js";
import {
  compositeChecksPane,
  compositeDeflections,
  compositeInspector,
  compositeSection,
  compositeSketch,
  compositeStages,
  readComposite,
} from "../../composite-beam.js";
import { compositeRunsHtml } from "../../reports/report.js";
import { connectionBill } from "../../steel-connection.js";
import { modelReadiness, steelBill } from "./shared.js";

export default {
  kind: "compositeBeam",
  defaultSource: (d) => (d?.targetId ? "model" : "synthetic"),
  readiness: modelReadiness(
    "AISC 360-22 Chapter I checks run on the stage cases (demonstration)",
    "composite checks need the model stage cases",
  ),
  solid: () => false,
  caption: () => "Section and stage diagrams in the result views",
  sketch: (d) => raw(compositeSketch(d)),
  inspector: { render: (args) => raw(compositeInspector(args)) },
  read: (host) => ({ composite: readComposite(host) }),
  panes: [
    { id: "summary", label: "Design summary" },
    {
      id: "actions",
      label: "Stages",
      render: ({ run }) =>
        html`<h4>Stage moment diagrams</h4>${raw(compositeStages(run?.codeProfilePreview))}`,
    },
    {
      id: "checks",
      label: "AISC checks",
      render: ({ run }) => raw(compositeChecksPane(run)),
    },
    {
      id: "section",
      label: "Section",
      render: ({ run }) =>
        html`<h4>Composite section at the governing station</h4>${raw(compositeSection(run?.codeProfilePreview))}`,
    },
    {
      id: "deflections",
      label: "Deflections",
      render: ({ run }) => raw(compositeDeflections(run)),
    },
    {
      id: "schedule",
      label: "Bill of materials",
      render: ({ run }) => raw(connectionBill(run)),
    },
    { id: "details", label: "Calculation details" },
  ],
  schedule: steelBill("composite"),
  report: { order: 5, html: compositeRunsHtml },
};
