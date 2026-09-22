import { escape as esc } from "./reports/report.js";
import { entityLabel } from "./entity-labels.js";
import { actionComponents, actionText } from "./render/action-diagrams.js";
const keys = ["axial", "shearY", "shearZ", "torsion", "moment", "momentZ"];
const names = ["N / Fx", "Vy", "Vz", "T / Mx", "My", "Mz"];
let component = "moment",
  station = 0;
export function nodeContributions(project, result, nodeId, frames) {
  const combination = project.combinations.find((c) => c.id === result.caseId);
  const factors = combination
    ? Object.fromEntries(combination.terms.map((t) => [t.case, t.factor]))
    : { [result.caseId]: 1 };
  const applied = Array(6).fill(0);
  for (const l of project.loads)
    if (l.type === "nodal" && l.node === nodeId)
      l.values.forEach((v, i) => (applied[i] += v * (factors[l.case] || 0)));
  const groups = [{ name: "Applied nodal loads", values: applied }];
  for (const s of project.supports.filter((s) => s.node === nodeId)) {
    const index = result.reactionSupportIds.indexOf(s.id);
    if (index >= 0)
      groups.push({
        name: `Support ${entityLabel(project, s.id)} reaction`,
        values: result.reactions.slice(index * 6, index * 6 + 6),
      });
  }
  for (const m of project.members.filter(
    (m) => m.start === nodeId || m.end === nodeId,
  )) {
    const frame = frames?.find((f) => f.id === m.id),
      r = result.members.find((r) => r.id === m.id);
    if (!frame || !r) {
      groups.push({
        name: `Member ${entityLabel(project, m.id)}`,
        values: null,
      });
      continue;
    }
    const q = r.endActions.slice(
      m.start === nodeId ? 0 : 6,
      m.start === nodeId ? 6 : 12,
    );
    const values = Array.from(
      { length: 6 },
      (_, i) =>
        -frame.axes.reduce(
          (sum, axis, j) => sum + axis[i % 3] * q[j + (i < 3 ? 0 : 3)],
          0,
        ),
    );
    groups.push({
      name: `Member ${entityLabel(project, m.id)} on node`,
      values,
    });
  }
  return groups;
}
export function renderForceInspector({
  project,
  result,
  modelHash,
  selected,
  count,
  frames,
}) {
  const host = document.querySelector("#force-inspector");
  if (!project || !selected || count !== 1) {
    host.innerHTML =
      "<p>Select one member or node to inspect its forces and moments.</p>";
    return;
  }
  const m = project.members.find((m) => m.id === selected),
    n = project.nodes.find((n) => n.id === selected);
  if (!m && !n) {
    host.innerHTML = "<p>Select a member or node in the canvas.</p>";
    return;
  }
  const label = (id) => esc(entityLabel(project, id));
  const heading = `<h3>${m ? "Member" : "Node"} ${label(selected)}</h3>`;
  if (!result || result.modelHash !== modelHash) {
    host.innerHTML =
      heading +
      `<p role="status">${result ? "Results are stale. Analyse again." : "Analyse the model to show forces and moments."}</p>`;
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
  const table = (values, global = false) =>
    `<table class="force-values"><thead><tr><th>Component</th><th>Value</th></tr></thead><tbody>${values.map((v, i) => `<tr><th>${global ? ["Fx", "Fy", "Fz", "Mx", "My", "Mz"][i] : names[i]}</th><td>${text(v, i)}</td></tr>`).join("")}</tbody></table>`;
  if (n) {
    const groups = nodeContributions(project, result, n.id, frames);
    host.innerHTML =
      heading +
      `<p>Global axes · ${label(result.caseId)}. Arrows show signed components; their lengths are schematic. Curved arrows denote moments.</p>` +
      groups
        .map((g) => {
          if (!g.values)
            return `<section><h4>${esc(g.name)}</h4><p>Local axes unavailable; reselect after geometry loads.</p></section>`;
          const dirs = [
            [65, 0],
            [-42, 32],
            [0, -48],
          ];
          const glyph = g.values
            .map((v, i) => {
              if (Math.abs(v) < 1e-9) return "";
              const [dx, dy] = dirs[i % 3],
                sign = Math.sign(v),
                x = 105 + dx * sign,
                y = 76 + dy * sign;
              if (i < 3)
                return `<path d="M105 76 L${x} ${y}" stroke="#225dc7" marker-end="url(#f${groups.indexOf(g)})"/><text x="${x}" y="${y - 7}" text-anchor="middle">${["Fx", "Fy", "Fz"][i]}</text>`;
              const cx = 42 + (i - 3) * 65;
              return `<path d="M${cx - 13} 145 A16 16 0 1 ${v > 0 ? 1 : 0} ${cx + 13} 145" stroke="#a64b12" marker-end="url(#f${groups.indexOf(g)})"/><text x="${cx}" y="169" text-anchor="middle">${["Mx", "My", "Mz"][i - 3]} ${v > 0 ? "+" : "−"}</text>`;
            })
            .join("");
          return `<section><h4>${esc(g.name)}</h4><svg viewBox="0 0 240 180" role="img" aria-label="${esc(g.name)} force and moment directions"><defs><marker id="f${groups.indexOf(g)}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="#225dc7"/></marker></defs><g fill="none" stroke-width="2">${glyph}</g><circle cx="105" cy="76" r="5" fill="#52657b"/></svg>${table(g.values, true)}</section>`;
        })
        .join("");
    return;
  }
  const r = result.members.find((r) => r.id === m.id);
  if (!r) {
    host.innerHTML = heading + "<p>No member results.</p>";
    return;
  }
  const draw = () => {
    const c = actionComponents[component],
      values = r.samples.map((s) => s.actions[c.index]),
      peak = Math.max(...values.map(Math.abs), 1e-30);
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
      `<p>${label(m.start)} → ${label(m.end)} · ${Number(length.toPrecision(6))} m · Local section actions</p><label>Component<select id="member-force-component">${keys.map((k, i) => `<option value="${k}" ${component === k ? "selected" : ""}>${names[i]}</option>`).join("")}</select></label><svg viewBox="0 0 300 210" role="img" aria-label="${c.name} diagram along member length"><path d="M24 115 H276" stroke="#52657b" stroke-width="3"/><text x="24" y="202">Start · x = 0</text><text x="205" y="202">End · x = L</text><text x="24" y="16">+ above / − below · local x →</text>${points
        .slice(1)
        .map(
          (p, i) =>
            `<path d="M${points[i].join(" ")} L${p.join(" ")}" fill="none" stroke="${values[i] + values[i + 1] >= 0 ? "#225dc7" : "#b65320"}" stroke-width="2"/>`,
        )
        .join(
          "",
        )}<path d="M${points[index][0]} 30 V180" stroke="#52657b" stroke-dasharray="3 3"/><circle cx="${points[index][0]}" cy="${points[index][1]}" r="4" fill="#225dc7"/></svg><p class="form-help">Unfolded local diagram, auto-scaled. This detail view is independent of the camera. y/z are the member’s section axes.</p><label>Station along member<input id="member-force-station" type="range" min="0" max="${r.samples.length - 1}" value="${index}"></label><output id="member-force-readout">x = ${Number((s.station * length).toPrecision(6))} m · ${c.name} ${text(values[index], keys.indexOf(component))}</output><p>Start ${text(values[0], keys.indexOf(component))} · End ${text(values.at(-1), keys.indexOf(component))}</p><p>Min ${text(Math.min(...values), keys.indexOf(component))} · Max ${text(Math.max(...values), keys.indexOf(component))}</p><details><summary>All components at this station</summary>${table(s.actions)}</details><details><summary>Member-end actions</summary><p>Node-on-member actions in local axes; these use a different end-face convention from section diagrams.</p><h4>Start ${label(m.start)}</h4>${table(r.endActions.slice(0, 6))}<h4>End ${label(m.end)}</h4>${table(r.endActions.slice(6, 12))}</details>`;
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
