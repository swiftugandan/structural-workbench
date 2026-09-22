import { escape as esc } from "./reports/report.js";
import { entityLabel } from "./entity-labels.js";
import { actionComponents, actionText } from "./render/action-diagrams.js";
const keys = ["axial", "shearY", "shearZ", "torsion", "moment", "momentZ"];
const names = ["N / Fx", "Vy", "Vz", "T / Mx", "My", "Mz"];
const displacementComponents = {
  ux: { name: "Ux", index: 0 },
  uy: { name: "Uy", index: 1 },
  uz: { name: "Uz", index: 2 },
  displacement: { name: "Total displacement" },
};
const displacementText = (v, engineering) =>
  `${Number((v * (engineering ? 1000 : 1)).toPrecision(6))} ${engineering ? "mm" : "m"}`;
let component = "moment",
  station = 0;
export function renderForceInspector({
  project,
  result,
  modelHash,
  selected,
  count,
}) {
  const host = document.querySelector("#force-inspector");
  if (!project || !selected || count !== 1) {
    host.innerHTML =
      "<p>Select one member to inspect its forces, moments and deformation.</p>";
    return;
  }
  const m = project.members.find((m) => m.id === selected);
  if (!m) {
    host.innerHTML =
      "<p>Select a member to view its forces, moments and deformation. Node properties are available in Properties.</p>";
    return;
  }
  const label = (id) => esc(entityLabel(project, id));
  const heading = `<h3>Member ${label(selected)}</h3>`;
  if (!result || result.modelHash !== modelHash) {
    host.innerHTML =
      heading +
      `<p role="status">${result ? "Results are stale. Analyse again." : "Analyse the model to show forces, moments and deformation."}</p>`;
    return;
  }
  const engineering = project.displayUnits === "engineeringMetric";
  const text = (v, i) =>
    esc(
      actionText(
        Math.abs(v) < 1e-9 ? 0 : v,
        actionComponents[keys[i]],
        engineering,
      ),
    );
  const table = (values) =>
    `<table class="force-values"><thead><tr><th>Component</th><th>Value</th></tr></thead><tbody>${Array.from(
      values,
    )
      .map((v, i) => `<tr><th>${names[i]}</th><td>${text(v, i)}</td></tr>`)
      .join("")}</tbody></table>`;
  const r = result.members.find((r) => r.id === m.id);
  if (!r) {
    host.innerHTML = heading + "<p>No member results.</p>";
    return;
  }
  const draw = () => {
    const deformation = displacementComponents[component];
    const c = deformation || actionComponents[component],
      values = r.samples.map((s) =>
        deformation
          ? component === "displacement"
            ? Math.hypot(...s.displacement.slice(0, 3))
            : s.displacement[c.index]
          : s.actions[c.index],
      ),
      peak = Math.max(...values.map(Math.abs), 1e-30);
    const valueText = (v) =>
      deformation
        ? displacementText(v, engineering)
        : text(v, keys.indexOf(component));
    const a = project.nodes.find((n) => n.id === m.start).position,
      b = project.nodes.find((n) => n.id === m.end).position,
      length = Math.hypot(...a.map((v, i) => b[i] - v));
    const index = Math.round(station * (r.samples.length - 1)),
      s = r.samples[index];
    const points = r.samples.map((s, i) => [
      24 + s.station * 252,
      115 - (values[i] / peak) * 60,
    ]);
    host.innerHTML =
      heading +
      `<p>${label(m.start)} → ${label(m.end)} · ${Number(length.toPrecision(6))} m · ${deformation ? "Global displacements" : "Local section actions"}</p><label>Component<select id="member-force-component"><optgroup label="Forces & moments">${keys.map((k, i) => `<option value="${k}" ${component === k ? "selected" : ""}>${names[i]}</option>`).join("")}</optgroup><optgroup label="Deformation · global axes">${Object.entries(
        displacementComponents,
      )
        .map(
          ([key, d]) =>
            `<option value="${key}" ${component === key ? "selected" : ""}>${d.name}</option>`,
        )
        .join(
          "",
        )}</optgroup></select></label><svg viewBox="0 0 300 210" role="img" aria-label="${c.name} diagram along member length"><path d="M24 115 H276" stroke="#52657b" stroke-width="3"/><text x="24" y="202">Start · x = 0</text><text x="205" y="202">End · x = L</text><text x="24" y="16">+ above / − below · local x →</text>${points
        .slice(1)
        .map(
          (p, i) =>
            `<path d="M${points[i].join(" ")} L${p.join(" ")}" fill="none" stroke="${values[i] + values[i + 1] >= 0 ? "#225dc7" : "#b65320"}" stroke-width="2"/>`,
        )
        .join(
          "",
        )}<path d="M${points[index][0]} 30 V180" stroke="#52657b" stroke-dasharray="3 3"/><circle cx="${points[index][0]}" cy="${points[index][1]}" r="4" fill="#225dc7"/></svg><p class="form-help">${deformation ? "Displacement versus distance along the member; signed global components or total magnitude. Auto-scaled ordinate, not a 3D shape." : "Unfolded local diagram, auto-scaled. This detail view is independent of the camera. y/z are the member’s section axes."}</p><label>Station along member<input id="member-force-station" type="range" min="0" max="${r.samples.length - 1}" value="${index}"></label><output id="member-force-readout">x = ${Number((s.station * length).toPrecision(6))} m · ${c.name} ${valueText(values[index])}</output><p>Start ${valueText(values[0])} · End ${valueText(values.at(-1))}</p><p>Min ${valueText(Math.min(...values))} · Max ${valueText(Math.max(...values))}</p><details><summary>All components at this station</summary>${deformation ? `<table class="force-values"><tbody>${[...s.displacement.slice(0, 3), Math.hypot(...s.displacement.slice(0, 3))].map((v, i) => `<tr><th>${["Ux", "Uy", "Uz", "Total"][i]}</th><td>${displacementText(v, engineering)}</td></tr>`).join("")}</tbody></table>` : table(s.actions)}</details><details><summary>Member-end actions</summary><p>Node-on-member actions in local axes; these use a different end-face convention from section diagrams.</p><h4>Start ${label(m.start)}</h4>${table(r.endActions.slice(0, 6))}<h4>End ${label(m.end)}</h4>${table(r.endActions.slice(6, 12))}</details>`;
    host.querySelector("#member-force-component").onchange = (e) => {
      component = e.target.value;
      draw();
    };
    host.querySelector("#member-force-station").onchange = (e) => {
      station = Number(e.target.value) / (r.samples.length - 1);
      draw();
      host.querySelector("#member-force-station").focus();
    };
  };
  draw();
}
