import { entityLabel } from "../entity-labels.js";
import { reportExcludedSection } from "../capabilities-ledger.js";
export const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function download(name, content, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csv(result, project) {
  if (result.analysisType === "envelope") {
    const rows = [
      [
        "Entity",
        "Component",
        "Extreme",
        "Value",
        "Governing",
        "Station",
        "Side",
        "Node",
        "Support",
      ],
    ];
    const push = (entity, c) => {
      for (const [kind, ex] of [
        ["max", c.max],
        ["min", c.min],
      ])
        rows.push([
          entity,
          c.component,
          kind,
          ex.value,
          ex.caseOrCombinationId,
          ex.station ?? "",
          ex.side ?? "",
          ex.nodeId ?? "",
          ex.supportId ?? "",
        ]);
    };
    for (const m of result.members || []) {
      for (const a of m.actions || []) push(entityLabel(project, m.id), a);
      for (const d of m.displacements || []) push(entityLabel(project, m.id), d);
    }
    for (const n of result.nodes || [])
      for (const d of n.displacements || [])
        push(entityLabel(project, n.id), d);
    for (const s of result.supports || [])
      for (const r of s.reactions || []) push(entityLabel(project, s.id), r);
    return rows
      .map((row) =>
        row
          .map(
            (v) =>
              '"' +
              String(
                typeof v === "string" && /^[=+@-]/.test(v) ? "'" + v : v,
              ).replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n");
  }
  const rows = [
    ["Node", "ux [m]", "uy [m]", "uz [m]", "rx [rad]", "ry [rad]", "rz [rad]"],
    ...result.nodeIds.map((id, i) => [
      entityLabel(project, id),
      ...result.nodeDisplacements.slice(i * 6, i * 6 + 6),
    ]),
    [],
    [
      "Support",
      "Fx [N]",
      "Fy [N]",
      "Fz [N]",
      "Mx [N m]",
      "My [N m]",
      "Mz [N m]",
    ],
    ...result.reactionSupportIds.map((id, i) => [
      entityLabel(project, id),
      ...result.reactions.slice(i * 6, i * 6 + 6),
    ]),
    [],
    [
      "Member",
      "Position [fraction]",
      "Axial N [N]",
      "Shear Vy [N]",
      "Shear Vz [N]",
      "Torsion T [N m]",
      "Moment My [N m]",
      "Moment Mz [N m]",
    ],
    ...(result.members ?? []).flatMap((m) =>
      m.samples.map((sample) => [
        entityLabel(project, m.id),
        sample.station,
        ...sample.actions,
      ]),
    ),
  ];
  return rows
    .map((row) =>
      row
        .map(
          (v) =>
            '"' +
            String(
              typeof v === "string" && /^[=+@-]/.test(v) ? "'" + v : v,
            ).replaceAll('"', '""') +
            '"',
        )
        .join(","),
    )
    .join("\r\n");
}
export function report(project, result) {
  const e = escape;
  if (result.analysisType === "envelope") {
    const ids = (result.caseOrCombinationIds || []).join(", ");
    const rows = [];
    const push = (entity, c) => {
      for (const [kind, ex] of [
        ["max", c.max],
        ["min", c.min],
      ])
        rows.push(
          `<tr><th scope="row">${e(entity)}</th><td>${e(c.component)}</td><td>${kind}</td><td>${ex.value}</td><td>${e(ex.caseOrCombinationId)}</td><td>${ex.station ?? ""}</td></tr>`,
        );
    };
    for (const m of result.members || []) {
      for (const a of m.actions || []) push(entityLabel(project, m.id), a);
      for (const d of m.displacements || []) push(entityLabel(project, m.id), d);
    }
    for (const n of result.nodes || [])
      for (const d of n.displacements || [])
        push(entityLabel(project, n.id), d);
    for (const s of result.supports || [])
      for (const r of s.reactions || []) push(entityLabel(project, s.id), r);
    return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${e(project.name)} — envelope record</title><style>body{font:15px system-ui;color:#182d43;max-width:1100px;margin:50px auto;padding:24px}h1{font-size:32px}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:right;border-bottom:1px solid #ddd;padding:10px}th:first-child{text-align:left}.banner{padding:20px;background:#fff3d6}small{overflow-wrap:anywhere}@media print{body{margin:0;padding:0}tr{break-inside:avoid}}</style><header><p>STRUCTURAL WORKBENCH / ENVELOPE RECORD</p><h1>${e(project.name)}</h1><p>Independent scalar extrema · ${e(ids)}</p><small>Model SHA-256: ${e(result.modelHash)}<br>Solver source: ${e(result.solverBuildHash)}<br>Settings: ${e(result.settingsHash)}<br>Created ${e(new Date().toISOString())}</small></header><div class="banner"><strong>Not a simultaneous force set.</strong> ${e((result.diagnostics || []).map((d) => d.message).join(" "))}</div><table><thead><tr><th>Entity</th><th>Component</th><th>Extreme</th><th>Value</th><th>Governing</th><th>Station</th></tr></thead><tbody>${rows.join("")}</tbody></table><p>Design checks must use one real case or combination, not mixed envelope extrema.</p></html>`;
  }
  const points = result.members.flatMap((m) =>
    m.samples.map((s) => s.position),
  );
  const xmin = Math.min(...points.map((p) => p[0])),
    xmax = Math.max(...points.map((p) => p[0])),
    zmin = Math.min(...points.map((p) => p[2])),
    zmax = Math.max(...points.map((p) => p[2]));
  const factor = Math.min(
    900 / Math.max(xmax - xmin, 1),
    130 / Math.max(zmax - zmin, 1),
  );
  const projectPoint = (p, d = [0, 0, 0]) =>
    [
      50 + (p[0] + d[0] * 10 - xmin) * factor,
      150 - (p[2] + d[2] * 10 - zmin) * factor,
    ].join(",");
  const plot =
    '<svg viewBox="0 0 1000 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Global XZ elevation with deformation amplified ten times">' +
    result.members
      .map(
        (m) =>
          '<polyline points="' +
          m.samples.map((s) => projectPoint(s.position)).join(" ") +
          '" fill="none" stroke="#43536b" stroke-width="2"/><polyline points="' +
          m.samples
            .map((s) => projectPoint(s.position, s.displacement))
            .join(" ") +
          '" fill="none" stroke="#225dc7" stroke-width="2"/>',
      )
      .join("") +
    "</svg>";
  const row = (id, v) =>
    `<tr><th>${e(entityLabel(project, id))}</th>${Array.from(v, (x) => `<td>${e(x.toPrecision(9))}</td>`).join("")}</tr>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${e(project.name)} — calculation record</title><style>body{font:15px system-ui;color:#182d43;max-width:1100px;margin:50px auto;padding:24px}h1{font-size:32px}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:right;border-bottom:1px solid #ddd;padding:10px}th:first-child{text-align:left}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f8;padding:20px;font-size:12px}.banner{padding:20px;background:#fff3d6}small{overflow-wrap:anywhere}svg{width:100%;height:220px}@media print{body{margin:0;padding:0}tr{break-inside:avoid}}</style><header><p>STRUCTURAL WORKBENCH / CALCULATION RECORD</p><h1>${e(project.name)}</h1><p>Linear elastic frame analysis · ${e(result.caseId)} · SI units</p><small>Model SHA-256: ${e(result.modelHash)}<br>Solver source: ${e(result.solverBuildHash)}<br>Settings: ${e(result.settingsHash)}<br>Created ${e(new Date().toISOString())}</small></header><p class="banner">Mechanics preview. Prismatic Euler–Bernoulli members, small displacement, isotropic material, principal axes and Saint Venant torsion. No shear deformation, buckling, material nonlinearity, connection design or building-code compliance. Commercial numerical parity is UNKNOWN.</p>${reportExcludedSection(e)}<h2>Model</h2><p>${project.nodes.length} nodes · ${project.members.length} members · ${e(project.analysisMode)}. Global Z up; right-hand rotations. ${project.analysisMode === "planarXZ" ? "Generated constraints fix uy, rx and rz at every node." : ""}</p><h2>Global XZ elevation</h2><p>Grey: undeformed. Blue: deformation ×10. Projection may hide out-of-plane members.</p>${plot}<h2>Nodal displacements</h2><table><tr><th>Node</th>${["ux (m)", "uy (m)", "uz (m)", "rx (rad)", "ry (rad)", "rz (rad)"].map((x) => `<th>${x}</th>`).join("")}</tr>${result.nodeIds.map((id, i) => row(id, result.nodeDisplacements.slice(i * 6, i * 6 + 6))).join("")}</table><h2>Physical support reactions</h2><table><tr><th>Support</th>${["Fx (N)", "Fy (N)", "Fz (N)", "Mx (N m)", "My (N m)", "Mz (N m)"].map((x) => `<th>${x}</th>`).join("")}</tr>${result.reactionSupportIds.map((id, i) => row(id, result.reactions.slice(i * 6, i * 6 + 6))).join("")}</table><h2>Member end actions</h2><p>Actions applied by nodes to the element, in local axes. These differ from cut-face section actions.</p>${result.members.map((m) => `<h3>${e(entityLabel(project, m.id))} · ${m.length} m</h3><table><tr><th>End</th>${["Fx (N)", "Fy (N)", "Fz (N)", "Mx (N m)", "My (N m)", "Mz (N m)"].map((x) => `<th>${x}</th>`).join("")}</tr>${row("i", m.endActions.slice(0, 6))}${row("j", m.endActions.slice(6))}</table>`).join("")}<h2>Equilibrium and diagnostics</h2><pre>${e(JSON.stringify({ checks: result.numericalChecks, diagnostics: result.diagnostics, generatedConstraints: result.generatedConstraintReactions }, null, 2))}</pre><h2>Reproducible project input</h2><pre>${e(JSON.stringify(project, null, 2))}</pre></html>`;
}
