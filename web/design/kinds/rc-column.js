/** RC column design object (EC2 UK demonstration, ADR 0022/0027). */
import { raw } from "../../core/html.js";
import { ec2ColumnPane } from "../../design-presentation.js";
import { columnRunsHtml } from "../../reports/report.js";
import { columnPane, columnSketch } from "../../rc-column.js";
import { jointsPane } from "../../rc-joints.js";
import { concreteSchedule, memberSources, modelReadiness } from "./shared.js";

export default {
  kind: "rcColumn",
  defaultSource: (d) => (d?.targetId ? "model" : "synthetic"),
  sources: memberSources,
  readiness: modelReadiness(
    "EC2 checks run on the model actions (demonstration)",
    "EC2 checks need model actions",
  ),
  solid: (d, focus) => focus || !!d.targetId,
  caption: () => "Illustrative reinforcement · fit and anchorage unverified",
  sketch: (d) => raw(columnSketch(d)),
  inspector: {
    geometry: ["width", "depth", "cover"],
    special: {
      title: "Reinforcement preferences",
      keys: [
        "barDiameter",
        "barsAlongWidth",
        "barsAlongDepth",
        "linkDiameter",
        "linkSpacing",
      ],
    },
    mechanics: true,
    proposal: true,
    code: { column: true },
    checklist: ["Resistance on model actions only"],
  },
  panes: [
    { id: "summary", label: "Design summary" },
    { id: "actions", label: "Design actions" },
    { id: "details", label: "Calculation details" },
    { id: "reinforcement", label: "Reinforcement" },
    {
      id: "mechanics",
      label: "Section mechanics",
      render: ({ run }) => raw(columnPane(run)),
    },
    {
      id: "ec2",
      label: "EC2 checks",
      render: ({ run }) => raw(ec2ColumnPane(run)),
    },
    {
      id: "joints",
      label: "Joints",
      load: (gateway) => gateway.send("detailJoints", {}),
      render: ({ data, d, project }) => jointsPane(data, d, project),
    },
    { id: "schedule", label: "Schedule" },
  ],
  schedule: concreteSchedule,
  report: { order: 2, html: columnRunsHtml },
};
