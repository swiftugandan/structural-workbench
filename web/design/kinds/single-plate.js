/** Single-plate shear connection (AISC 360-22 demonstration, ADR 0030). */
import { html, raw } from "../../core/html.js";
import { connectionRunsHtml } from "../../reports/report.js";
import {
  bindConnectionInspector,
  connectionActions,
  connectionBill,
  connectionChecksPane,
  connectionDrawing,
  connectionInspector,
  connectionSketch,
  readConnection,
} from "../../steel-connection.js";
import { modelReadiness, steelBill } from "./shared.js";

export default {
  kind: "singlePlate",
  defaultSource: (d) => (d?.targetId ? "model" : "synthetic"),
  readiness: modelReadiness(
    "AISC 360-22 checks run on the beam's end actions (demonstration)",
    "connection checks need model actions",
  ),
  // A connection has no draft solid: the model context shows its beam.
  solid: () => false,
  caption: () => "Dimensioned elevation in the Drawing view",
  sketch: (d) => raw(connectionSketch(d)),
  inspector: {
    render: (args) => raw(connectionInspector(args)),
    bind: bindConnectionInspector,
  },
  read: (host) => ({ connection: readConnection(host) }),
  panes: [
    { id: "summary", label: "Design summary" },
    {
      id: "actions",
      label: "End actions",
      render: ({ run }) => raw(connectionActions(run)),
    },
    {
      id: "checks",
      label: "AISC checks",
      render: ({ run }) => raw(connectionChecksPane(run)),
    },
    {
      id: "drawing",
      label: "Drawing",
      render: ({ run }) =>
        html`<h4>Connection elevation · dimensions from the run</h4>${raw(connectionDrawing(run?.codeProfilePreview))}`,
    },
    {
      id: "schedule",
      label: "Bill of materials",
      render: ({ run }) => raw(connectionBill(run)),
    },
    { id: "details", label: "Calculation details" },
  ],
  schedule: steelBill("connection"),
  report: { order: 4, html: connectionRunsHtml },
};
